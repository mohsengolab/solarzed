using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

[ApiController]
[Route("api/warranty")]
public class WarrantyController(AppDbContext db, WarrantyCards? warrantyCards = null) : ControllerBase
{
    /// <summary>
    /// Public warranty check by VIN only. The warranty number is never searchable by customers or installers.
    /// It returns only what a certificate check needs: no warranty number, plate, VIN, invoice, installer or seller.
    /// </summary>
    [HttpGet, EnableRateLimiting("warranty-lookup")]
    public async Task<IActionResult> Lookup([FromQuery] string? q)
    {
        if (string.IsNullOrWhiteSpace(q)) return BadRequest(new { error = "q required" });
        var vin = WarrantyService.NormalizePhone(q).Trim().ToUpperInvariant().Replace(" ", "");
        if (!VinPattern.IsMatch(vin)) return BadRequest(new { error = "Enter the 17-character VIN." });
        var list = await db.WarrantyRegistrations.AsNoTracking().Where(w => w.Vin == vin)
            .OrderByDescending(w => w.Installed).Take(20).ToListAsync();
        return Ok(new { records = list.Select(WarrantyService.ToCheck) });
    }

    static readonly Regex RollNoPattern = new(@"\A[A-Z0-9][A-Z0-9-]{2,31}\z", RegexOptions.Compiled);

    /// <summary>
    /// Public authenticity check by ROLL NO: is this carton one we made? Accepts the bare ROLL NO, the card QR text,
    /// or an old card link ({site}/activate#ROLLNO-1234567-ABC). It returns the product, its specifications, the roll
    /// details and whether the card was activated — never the Serial Number, supplier, holder, installer or owner.
    /// </summary>
    [HttpGet("verify"), EnableRateLimiting("warranty-lookup")]
    public async Task<IActionResult> Verify([FromQuery] string? rollNo)
    {
        Response.Headers.CacheControl = "no-store";
        var raw = new string((rollNo ?? "").Select(ch => ch is >= '۰' and <= '۹' ? (char)('0' + ch - '۰')
            : ch is >= '٠' and <= '٩' ? (char)('0' + ch - '٠') : ch).ToArray()).Trim();
        if (raw.Contains('#')) raw = raw[(raw.LastIndexOf('#') + 1)..];
        raw = Uri.UnescapeDataString(raw).Trim().ToUpperInvariant().Replace(" ", "");
        if (raw.Length == 0 || raw.Length > 80) return BadRequest(new { error = "Enter the ROLL NO printed on the carton." });

        // Exact first (old SZB-… ROLL NOs contain dashes), then the part before the card's warranty number.
        var candidates = new List<string> { raw };
        if (raw.IndexOf('-') is > 0 and var dash) candidates.Add(raw[..dash]);
        candidates = candidates.Where(c => RollNoPattern.IsMatch(c)).Distinct().ToList();
        if (candidates.Count == 0) return BadRequest(new { error = "Enter the ROLL NO printed on the carton." });

        foreach (var c in candidates)
        {
            var label = await db.BoxLabels.AsNoTracking().FirstOrDefaultAsync(b => b.Id == c);
            var roll = label?.RollId != null
                ? await db.Rolls.AsNoTracking().FirstOrDefaultAsync(r => r.Id == label.RollId)
                : await db.Rolls.AsNoTracking().FirstOrDefaultAsync(r => r.RollNo == c);
            if (label == null && roll == null) continue;
            if (label == null && roll!.Status == RollStatus.Void) continue;   // voided before a card was issued

            var code = label?.Product ?? roll!.ModelCode;
            var product = await db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Code == code);
            var type = label?.Type ?? roll!.Type;
            // Everything about the product and the roll except the Serial Number (Roll.Id), the confidential
            // supplier, who holds the carton, and the card / warranty codes.
            return Ok(new
            {
                genuine = true,
                rollNo = c,
                productCode = code,
                product = product?.Name ?? code,
                series = string.IsNullOrWhiteSpace(product?.Series) ? null : product!.Series,
                description = string.IsNullOrWhiteSpace(product?.Description) ? null : product!.Description,
                type = type == WarrantyType.Ppf ? "ppf" : "tint",
                thicknessMil = product?.ThicknessMil,
                vlt = product?.Vlt,
                irr = product?.Irr,
                uv = product?.Uv,
                tser = product?.Tser,
                widthCm = roll?.WidthCm,
                lengthM = roll?.LengthM ?? label?.RemainingLengthM,
                batch = roll?.Batch,
                receivedOn = roll?.ReceivedAt.ToString("yyyy-MM-dd"),
                filmYears = label?.FilmYears ?? product?.WarrantyYears,
                installYears = label?.InstallYears,
                activated = label?.ActivatedAt != null,
                activatedOn = label?.ActivatedAt?.ToString("yyyy-MM"),
            });
        }
        return Ok(new { genuine = false, rollNo = candidates[0] });
    }

    WarrantyCards cards => warrantyCards ??= new WarrantyCards(db);

    static readonly Regex VinPattern = new(@"\A[A-HJ-NPR-Z0-9]{17}\z", RegexOptions.Compiled);

    /// <summary>
    /// Owner inquiry: the gold cards (owner name, plate, installer, coverage, product specs and card link) found by
    /// any one of the VIN, the mobile the installer registered the warranty to, or the email of the owner's account.
    /// <paramref name="q"/> takes any of the three and is recognised by its shape. When both a VIN and a mobile are
    /// given, both must match.
    /// </summary>
    [HttpGet("owner"), EnableRateLimiting("warranty-lookup")]
    public async Task<IActionResult> Owner([FromQuery] string? vin, [FromQuery] string? phone, [FromQuery] string? email = null, [FromQuery] string? q = null)
    {
        Response.Headers.CacheControl = "no-store";
        if (!string.IsNullOrWhiteSpace(q))
        {
            var t = WarrantyService.NormalizePhone(q).Trim();
            if (t.Contains('@')) email = t;
            else if (VinPattern.IsMatch(t.ToUpperInvariant().Replace(" ", ""))) vin = t;
            else phone = t;
        }
        var query = db.WarrantyRegistrations.AsQueryable();
        var any = false;

        if (!string.IsNullOrWhiteSpace(vin))
        {
            var v = WarrantyService.NormalizePhone(vin).Trim().ToUpperInvariant().Replace(" ", "");
            if (!VinPattern.IsMatch(v)) return BadRequest(new { error = "Enter the 17-character VIN." });
            query = query.Where(w => w.Vin == v);
            any = true;
        }
        if (!string.IsNullOrWhiteSpace(phone))
        {
            string mobile;
            try { mobile = PortalService.CanonicalPhone(phone); }
            catch (ActivationError ex) { return BadRequest(new { error = ex.Message }); }
            var variants = PortalService.PhoneVariants(mobile);
            query = query.Where(w => variants.Contains(w.Phone));
            any = true;
        }
        else if (!string.IsNullOrWhiteSpace(email))
        {
            string address;
            try { address = PortalService.CanonicalEmail(email); }
            catch (ActivationError ex) { return BadRequest(new { error = ex.Message }); }
            // Warranties are registered to a mobile; an email finds them through the account that holds both.
            var phones = await db.PortalUsers.AsNoTracking().Where(u => u.Email == address && u.Phone != null)
                .Select(u => u.Phone!).ToListAsync();
            var variants = phones.SelectMany(PortalService.PhoneVariants).Distinct().ToList();
            if (variants.Count == 0) return Ok(new { cards = Array.Empty<WarrantyCardView>() });
            query = query.Where(w => variants.Contains(w.Phone));
            any = true;
        }
        if (!any) return BadRequest(new { error = "Enter a VIN, mobile number or email." });

        var rows = await query.OrderByDescending(w => w.Installed).Take(40).ToListAsync();
        var list = new List<WarrantyCardView>();
        foreach (var w in rows) list.Add(await cards.View(w));
        if (db.ChangeTracker.HasChanges()) await db.SaveChangesAsync();
        return Ok(new { cards = list });
    }

    /// <summary>The gold card behind the SMS link or printed QR: {site}/card#{key}. The warranty number is never part of a link.</summary>
    [HttpGet("card"), EnableRateLimiting("warranty-lookup")]
    public async Task<IActionResult> Card([FromQuery] string? key)
    {
        Response.Headers.CacheControl = "no-store";
        var invalid = NotFound(new { error = "This warranty card link is not valid." });
        if (string.IsNullOrWhiteSpace(key) || key.Length > 16) return invalid;
        var k = key.Trim().ToLowerInvariant();
        var matches = await db.WarrantyRegistrations.AsNoTracking().Where(x => x.CardKey == k).Take(2).ToListAsync();
        if (matches.Count != 1 || !WarrantyCards.KeyMatches(matches[0], key)) return invalid;
        return Ok(await cards.View(matches[0]));
    }
}
