using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

[ApiController]
[Route("api/registrations")]
public class RegistrationController(AppDbContext db) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req)
    {
        var setting = await db.CoverageSettings.AsNoTracking().FirstOrDefaultAsync();
        var (err, entity) = WarrantyService.Validate(req, setting?.WarrantyCodeLength ?? 16);
        if (err != null) return BadRequest(new { error = err });

        // Duplicate serial+invoice guard
        var dup = await db.WarrantyRegistrations
            .AnyAsync(w => w.FilmSerial == entity!.FilmSerial && w.InvoiceNumber == entity.InvoiceNumber);
        if (dup) return Conflict(new { error = "duplicate film serial and invoice" });

        // Assess flags
        var flags = await WarrantyService.AssessFlags(entity!, db);
        entity!.FlagsJson = JsonSerializer.Serialize(flags);

        db.WarrantyRegistrations.Add(entity);
        AuditLog.Add(db, "public-form", "warranty", entity.Code, "registered",
            AuditLog.Diff(("status", null, entity.Status), ("filmSerial", null, entity.FilmSerial), ("installer", null, entity.Installer), ("flags", null, entity.FlagsJson)));
        await db.SaveChangesAsync();

        return Ok(new { code = entity.Code, flags });
    }

    [HttpGet("{code}")]
    public async Task<IActionResult> GetByCode(string code)
    {
        var w = await db.WarrantyRegistrations.FirstOrDefaultAsync(x => x.Code == code);
        if (w == null) return NotFound();
        return Ok(WarrantyService.ToPublic(w));
    }
}
