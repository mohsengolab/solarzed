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
    static readonly Regex CardToken = new(@"\A[A-Za-z0-9]{1,40}-(\d{7})(?:-[A-Za-z]{3})?\z", RegexOptions.Compiled);
    static readonly Regex SevenDigits = new(@"\A\d{7}\z", RegexOptions.Compiled);

    /// <summary>
    /// Public warranty check by warranty number (also the number on the card, alone or as RollNo-1234567[-ABC]) or VIN.
    /// It returns only what a certificate check needs: no plate, VIN, invoice, installer or seller. Owners see the
    /// full record in their account after SMS sign-in, so lookup by mobile number is not offered here.
    /// </summary>
    [HttpGet, EnableRateLimiting("warranty-lookup")]
    public async Task<IActionResult> Lookup([FromQuery] string? by, [FromQuery] string? q)
    {
        if (string.IsNullOrWhiteSpace(q)) return BadRequest(new { error = "q required" });
        q = q.Trim();
        if (q.Length > 60) return BadRequest(new { error = "Enter a warranty number or a 17-character VIN." });

        var mode = by switch
        {
            "code" or "vin" => by,
            "phone" => "phone",
            _ => q.StartsWith("SZ-", StringComparison.OrdinalIgnoreCase) || SevenDigits.IsMatch(q) || CardToken.IsMatch(q) ? "code"
                : q.Length == 17 ? "vin" : "phone",
        };
        var query = db.WarrantyRegistrations.AsNoTracking();

        if (mode == "code")
        {
            var code = CardToken.Match(q) is { Success: true } m && !q.StartsWith("SZ-", StringComparison.OrdinalIgnoreCase) ? m.Groups[1].Value : q;
            var r = await query.FirstOrDefaultAsync(w => w.Code == code);
            return Ok(new { records = r == null ? [] : new[] { WarrantyService.ToCheck(r) } });
        }
        if (mode == "vin")
        {
            var vin = q.ToUpperInvariant();
            var list = await query.Where(w => w.Vin == vin).OrderByDescending(w => w.Installed).Take(20).ToListAsync();
            return Ok(new { records = list.Select(WarrantyService.ToCheck) });
        }
        return BadRequest(new { error = "Search by warranty number or VIN. To see every warranty on your mobile number, sign in to your account." });
    }

    static readonly Regex RollNoPattern = new(@"\A[A-Z0-9][A-Z0-9-]{2,31}\z", RegexOptions.Compiled);

    /// <summary>
    /// Public authenticity check by ROLL NO: is this carton one we made? Accepts the bare ROLL NO, the card QR text,
    /// or an old card link ({site}/activate#ROLLNO-1234567-ABC). It returns only the product and whether the card was
    /// activated — never the supplier, holder, installer or owner.
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
            return Ok(new
            {
                genuine = true,
                rollNo = c,
                product = product?.Name ?? code,
                series = product?.Series,
                type = type == WarrantyType.Ppf ? "ppf" : "tint",
                activated = label?.ActivatedAt != null,
                activatedOn = label?.ActivatedAt?.ToString("yyyy-MM"),
            });
        }
        return Ok(new { genuine = false, rollNo = candidates[0] });
    }

    WarrantyCards cards => warrantyCards ??= new WarrantyCards(db);

    static readonly Regex VinPattern = new(@"\A[A-HJ-NPR-Z0-9]{17}\z", RegexOptions.Compiled);

    /// <summary>
    /// Owner inquiry: the VIN and the mobile the installer registered the warranty to. Both must match, so the full
    /// gold card (owner name, plate, installer, coverage and its card link) is shown only to the owner.
    /// </summary>
    [HttpGet("owner"), EnableRateLimiting("warranty-lookup")]
    public async Task<IActionResult> Owner([FromQuery] string? vin, [FromQuery] string? phone)
    {
        Response.Headers.CacheControl = "no-store";
        var v = WarrantyService.NormalizePhone(vin ?? "").Trim().ToUpperInvariant().Replace(" ", "");
        if (!VinPattern.IsMatch(v)) return BadRequest(new { error = "Enter the 17-character VIN." });
        string mobile;
        try { mobile = PortalService.CanonicalPhone(phone); }
        catch (ActivationError ex) { return BadRequest(new { error = ex.Message }); }
        var variants = PortalService.PhoneVariants(mobile);
        var rows = await db.WarrantyRegistrations.Where(w => w.Vin == v && variants.Contains(w.Phone))
            .OrderByDescending(w => w.Installed).Take(20).ToListAsync();
        var list = new List<WarrantyCardView>();
        foreach (var w in rows) list.Add(await cards.View(w));
        if (db.ChangeTracker.HasChanges()) await db.SaveChangesAsync();
        return Ok(new { cards = list });
    }

    /// <summary>The gold card behind the SMS link: {site}/card#{code}.{key}.</summary>
    [HttpGet("card"), EnableRateLimiting("warranty-lookup")]
    public async Task<IActionResult> Card([FromQuery] string? code, [FromQuery] string? key)
    {
        Response.Headers.CacheControl = "no-store";
        if (string.IsNullOrWhiteSpace(code) || code.Length > 32 || string.IsNullOrWhiteSpace(key) || key.Length > 16)
            return NotFound(new { error = "This warranty card link is not valid." });
        var w = await db.WarrantyRegistrations.AsNoTracking().FirstOrDefaultAsync(x => x.Code == code.Trim());
        if (w == null || !WarrantyCards.KeyMatches(w, key)) return NotFound(new { error = "This warranty card link is not valid." });
        return Ok(await cards.View(w));
    }
}
