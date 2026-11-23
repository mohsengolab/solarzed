using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

/// <summary>
/// Counter (کانتر) review of installer registrations: the counter checks the installation photos against the vehicle
/// details and approves the warranty or sends it back with a reason. Warranty codes stay hidden from everyone but the
/// super administrator; others act through an opaque reference.
/// </summary>
[ApiController, Route("api/admin/review"), Authorize(Policy = "StaffPolicy")]
public class ReviewController(AppDbContext db, IDataProtectionProvider? protection = null, WarrantyCards? cards = null) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, CancellationToken ct)
    {
        var wanted = status switch { "active" => WarrantyStatus.Active, "rejected" => WarrantyStatus.Rejected, _ => WarrantyStatus.Pending };
        var query = db.WarrantyRegistrations.AsNoTracking().Where(w => w.InstallerPhone != null && w.Status == wanted);
        var rows = await (wanted == WarrantyStatus.Pending ? query.OrderBy(w => w.CreatedAt) : query.OrderByDescending(w => w.ReviewedAt))
            .Take(100).ToListAsync(ct);
        var codes = rows.Select(w => w.Code).ToArray();
        var photos = (await db.WarrantyPhotos.AsNoTracking().Where(p => codes.Contains(p.WarrantyCode))
            .Select(p => new { p.Id, p.WarrantyCode, p.Kind, p.CreatedAt }).ToListAsync(ct))
            .GroupBy(p => p.WarrantyCode).ToDictionary(g => g.Key, g => g.OrderBy(p => p.Id).ToArray());
        var rollIds = rows.Where(w => w.RollId != null).Select(w => w.RollId!).Distinct().ToArray();
        var products = await db.Rolls.AsNoTracking().Where(r => rollIds.Contains(r.Id)).ToDictionaryAsync(r => r.Id, r => r.ModelCode, ct);
        var pending = await db.WarrantyRegistrations.CountAsync(w => w.InstallerPhone != null && w.Status == WarrantyStatus.Pending, ct);
        var sees = Confidential.SeesCodes(User);
        return Ok(new
        {
            pending,
            items = rows.Select(w => new
            {
                @ref = Confidential.Ref(w.Code, protection), code = sees ? w.Code : Confidential.Mask(w.Code),
                type = w.Type.ToString().ToLowerInvariant(), status = w.Status.ToString().ToLowerInvariant(),
                w.Make, w.Model, w.Plate, w.Vin, w.Installed, w.Owner, ownerPhone = PortalService.MaskPhone(w.Phone),
                w.Installer, w.InstallerPhone, w.Country, w.UsedLengthM, w.InvoiceNumber, carton = w.FilmSerial,
                product = w.RollId != null ? products.GetValueOrDefault(w.RollId) : null,
                areas = JsonSerializer.Deserialize<string[]>(w.AreasJson) ?? [],
                flags = JsonSerializer.Deserialize<string[]>(w.FlagsJson) ?? [],
                w.ReviewNote, w.CreatedAt, w.ReviewedAt, w.CardSentAt,
                photos = photos.GetValueOrDefault(w.Code)?.Select(p => new { p.Id, p.Kind, p.CreatedAt }) ?? [],
            }),
        });
    }

    [HttpGet("photos/{id:long}")]
    public async Task<IActionResult> Photo(long id, CancellationToken ct)
    {
        var photo = await db.WarrantyPhotos.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, ct);
        if (photo == null) return NotFound();
        Response.Headers.CacheControl = "private, max-age=600";
        return File(photo.Data, photo.ContentType);
    }

    [HttpPost("decision")]
    public async Task<IActionResult> Decide([FromBody] ReviewDecisionRequest req, CancellationToken ct)
    {
        var code = Confidential.Resolve(req.Ref ?? "", User, protection);
        var w = code == null ? null : await db.WarrantyRegistrations.FirstOrDefaultAsync(x => x.Code == code && x.InstallerPhone != null, ct);
        if (w == null) return NotFound(new { error = "Registration not found." });
        if (w.Status != WarrantyStatus.Pending) return Conflict(new { error = "This registration was already reviewed." });
        var note = (req.Note ?? "").Trim();
        if (!req.Approve && note.Length == 0) return BadRequest(new { error = "Write what is wrong, so the installer can fix it." });
        if (note.Length > 500) note = note[..500];
        if (!await db.WarrantyPhotos.AnyAsync(p => p.WarrantyCode == w.Code, ct) && req.Approve)
            return BadRequest(new { error = "There are no photos to approve." });
        var before = w.Status;
        w.Status = req.Approve ? WarrantyStatus.Active : WarrantyStatus.Rejected;
        w.ReviewedAt = DateTime.UtcNow;
        w.ReviewNote = note.Length > 0 ? note : "Installation photos approved by the counter.";
        AuditLog.Add(db, AuditLog.Actor(User), "warranty", w.Code, req.Approve ? "photosApproved" : "photosRejected",
            AuditLog.Diff(("status", before, w.Status)), note.Length > 0 ? note : null);
        await db.SaveChangesAsync(ct);
        // The owner gets the "warranty active" SMS with the gold card link.
        if (req.Approve && cards != null) await cards.Notify(w, ct);
        return Ok(new { status = w.Status.ToString().ToLowerInvariant() });
    }

    /// <summary>Sends the gold card SMS to the owner of an approved warranty again (or for the first time).</summary>
    [HttpPost("card-sms")]
    public async Task<IActionResult> ResendCard([FromBody] ReviewCardRequest req, CancellationToken ct)
    {
        var code = Confidential.Resolve(req.Ref ?? "", User, protection);
        var w = code == null ? null : await db.WarrantyRegistrations.FirstOrDefaultAsync(x => x.Code == code, ct);
        if (w == null) return NotFound(new { error = "Registration not found." });
        if (w.Status != WarrantyStatus.Active) return Conflict(new { error = "Only an approved warranty has a gold card." });
        if (cards == null) return StatusCode(503, new { error = "SMS is not available." });
        var error = await cards.Notify(w, ct, force: true);
        if (error != null) return StatusCode(503, new { error });
        AuditLog.Add(db, AuditLog.Actor(User), "warranty", w.Code, "cardSmsSent", AuditLog.Diff(("cardSentAt", null, w.CardSentAt)));
        await db.SaveChangesAsync(ct);
        return Ok(new { cardSentAt = w.CardSentAt });
    }
}

public record ReviewCardRequest(string? Ref);

public record ReviewDecisionRequest(string? Ref, bool Approve, string? Note);
