using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

[ApiController]
[Route("api/warranty")]
public class WarrantyController(AppDbContext db) : ControllerBase
{
    static readonly Regex CardToken = new(@"\A[A-Za-z0-9]{1,40}-(\d{7})\z", RegexOptions.Compiled);
    static readonly Regex SevenDigits = new(@"\A\d{7}\z", RegexOptions.Compiled);

    /// <summary>
    /// Public warranty check by warranty number (also the number on the card, alone or as RollNo-1234567) or VIN.
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
}
