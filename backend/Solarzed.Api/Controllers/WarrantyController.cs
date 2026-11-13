using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

[ApiController]
[Route("api/warranty")]
public class WarrantyController(AppDbContext db) : ControllerBase
{
    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        var setting = await db.CoverageSettings.AsNoTracking().FirstOrDefaultAsync();
        var (err, entity) = WarrantyService.Validate(req, setting?.WarrantyCodeLength ?? 16);
        if (err != null) return BadRequest(new { error = err });

        // Duplicate check: same FilmSerial + InvoiceNumber
        var duplicate = await db.WarrantyRegistrations.AnyAsync(w =>
            w.FilmSerial == entity!.FilmSerial && w.InvoiceNumber == entity.InvoiceNumber);
        if (duplicate) return Conflict(new { error = "duplicate registration" });

        var flags = await WarrantyService.AssessFlags(entity!, db);
        entity!.FlagsJson = JsonSerializer.Serialize(flags);

        db.WarrantyRegistrations.Add(entity);
        await db.SaveChangesAsync();

        return Ok(new { code = entity.Code, flags });
    }

    [HttpGet]
    public async Task<IActionResult> Lookup([FromQuery] string? by, [FromQuery] string? q)
    {
        if (string.IsNullOrWhiteSpace(q)) return BadRequest(new { error = "q required" });
        q = q.Trim();

        var query = db.WarrantyRegistrations.AsNoTracking();

        if (by == "code")
        {
            var r = await query.FirstOrDefaultAsync(w => w.Code == q);
            return Ok(new { records = r == null ? [] : new[] { WarrantyService.ToPublic(r) } });
        }
        else if (by == "vin")
        {
            var vin = q.ToUpperInvariant();
            var list = await query.Where(w => w.Vin == vin).ToListAsync();
            return Ok(new { records = list.Select(WarrantyService.ToPublic) });
        }
        else if (by == "phone")
        {
            var phone = WarrantyService.NormalizePhone(q);
            var list = await query.Where(w => w.Phone == phone).ToListAsync();
            return Ok(new { records = list.Select(WarrantyService.ToPublic) });
        }
        else
        {
            // Auto-detect: SZ- prefix = code, 17 chars = vin, else phone
            string mode;
            if (q.StartsWith("SZ-", StringComparison.OrdinalIgnoreCase)) mode = "code";
            else if (q.Length == 17) mode = "vin";
            else mode = "phone";

            return await Lookup(mode, q);
        }
    }
}
