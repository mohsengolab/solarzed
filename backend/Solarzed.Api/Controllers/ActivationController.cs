using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

// Scanning the warranty card opens /activate. Reading the card is public; registering the warranty requires the
// customer to be signed in with their SMS-verified mobile (see PortalController).
[ApiController, Route("api/activation"), EnableRateLimiting("activation"), RequestSizeLimit(16384)]
public class ActivationController(BoxLabelService labels, AppDbContext db, WarrantyCards cards) : ControllerBase
{
    [HttpPost("inspect")]
    public async Task<IActionResult> Inspect(TokenRequest request)
    {
        Response.Headers.CacheControl = "no-store";
        var session = await HttpContext.AuthenticateAsync(PortalAuth.Scheme);
        // Approved installers open a carton by its Serial Number alone (the QR on new cards holds only that).
        var id = PortalAuth.Id(session.Principal);
        var installer = id != null && await db.PortalUsers.AnyAsync(u => u.Id == id && u.Active && u.Partner == PartnerStatus.Approved);
        try { return Ok(await labels.Info(request.Token, PortalAuth.Phone(session.Principal), installer)); }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    [HttpPost("complete"), Authorize(Policy = "PortalPolicy")]
    public async Task<IActionResult> Complete(ActivateBoxRequest request)
    {
        Response.Headers.CacheControl = "no-store";
        var phone = PortalAuth.Phone(User);
        if (phone == null) return Unauthorized(new { error = "Sign in with your mobile number first." });
        try
        {
            var result = await labels.Activate(request, phone);
            if (await db.WarrantyRegistrations.FirstOrDefaultAsync(w => w.Code == result.Code) is { } saved) await cards.Notify(saved);
            return Ok(result);
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
        catch (Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException) { return Conflict(new { error = "This box was just changed. Please retry." }); }
    }

    const long UploadLimit = PhotoRules.MaxPhotos * PhotoRules.MaxBytes + 65536;

    /// <summary>
    /// An approved installer registers the installation for the customer's mobile: multipart form with "data" (the
    /// ActivateBoxRequest JSON, including customerPhone and country) and one image per photo, each named by its kind
    /// (vehicle, film, vin, invoice, other). The warranty waits for the counter to review the photos.
    /// </summary>
    [HttpPost("installer"), Authorize(Policy = "PortalPolicy"), RequestSizeLimit(UploadLimit), RequestFormLimits(MultipartBodyLengthLimit = UploadLimit)]
    public async Task<IActionResult> CompleteByInstaller(CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store";
        var id = PortalAuth.Id(User);
        var partner = id == null ? null : await db.PortalUsers.FirstOrDefaultAsync(u => u.Id == id && u.Active, ct);
        if (partner?.Phone is not { } phone) return Unauthorized(new { error = "Sign in with your mobile number first." });
        if (partner.Partner != PartnerStatus.Approved) return StatusCode(403, new { error = "Your installer account is not approved yet." });
        if (!Request.HasFormContentType) return BadRequest(new { error = "Send the form with the photos." });
        try
        {
            var form = await Request.ReadFormAsync(ct);
            ActivateBoxRequest? request;
            try { request = JsonSerializer.Deserialize<ActivateBoxRequest>(form["data"].ToString(), new JsonSerializerOptions(JsonSerializerDefaults.Web)); }
            catch (JsonException) { request = null; }
            if (request?.Registration == null || string.IsNullOrEmpty(request.Token)) return BadRequest(new { error = "The registration form is incomplete." });
            var files = new List<(string, byte[])>();
            foreach (var file in form.Files)
            {
                if (file.Length > PhotoRules.MaxBytes) throw new ActivationError(400, "Each photo must be smaller than 4 MB.");
                using var buffer = new MemoryStream();
                await file.CopyToAsync(buffer, ct);
                files.Add((file.Name.ToLowerInvariant(), buffer.ToArray()));
            }
            return Ok(await labels.Activate(request, phone, partner, PhotoRules.Validate(files)));
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
        catch (InvalidDataException) { return BadRequest(new { error = "The photos are too large." }); }
        catch (DbUpdateConcurrencyException) { return Conflict(new { error = "This box was just changed. Please retry." }); }
    }

    /// <summary>Replaces the photos of a registration the installer made that is still pending or was sent back; it returns to the counter.</summary>
    [HttpPost("installer/{reference}/photos"), Authorize(Policy = "PortalPolicy"), RequestSizeLimit(UploadLimit), RequestFormLimits(MultipartBodyLengthLimit = UploadLimit)]
    public async Task<IActionResult> ResendPhotos(string reference, CancellationToken ct)
    {
        var code = Confidential.Unref(reference);
        var id = PortalAuth.Id(User);
        var partner = id == null ? null : await db.PortalUsers.FirstOrDefaultAsync(u => u.Id == id && u.Active, ct);
        if (partner?.Phone is not { } phone || partner.Partner != PartnerStatus.Approved)
            return StatusCode(403, new { error = "Your installer account is not approved." });
        var w = await db.WarrantyRegistrations.FirstOrDefaultAsync(x => code != null && x.Code == code && x.InstallerPhone == phone, ct);
        if (w == null) return NotFound(new { error = "Registration not found." });
        if (w.Status == WarrantyStatus.Active) return Conflict(new { error = "This warranty is already approved." });
        if (!Request.HasFormContentType) return BadRequest(new { error = "Send the photos." });
        try
        {
            var form = await Request.ReadFormAsync(ct);
            var files = new List<(string, byte[])>();
            foreach (var file in form.Files)
            {
                if (file.Length > PhotoRules.MaxBytes) throw new ActivationError(400, "Each photo must be smaller than 4 MB.");
                using var buffer = new MemoryStream();
                await file.CopyToAsync(buffer, ct);
                files.Add((file.Name.ToLowerInvariant(), buffer.ToArray()));
            }
            var photos = PhotoRules.Validate(files);
            db.WarrantyPhotos.RemoveRange(db.WarrantyPhotos.Where(p => p.WarrantyCode == w.Code));
            var now = DateTime.UtcNow;
            foreach (var photo in photos)
                db.WarrantyPhotos.Add(new WarrantyPhoto { WarrantyCode = w.Code, Kind = photo.Kind, ContentType = photo.ContentType,
                    Data = photo.Data, SizeBytes = photo.Data.Length, UploadedBy = phone, CreatedAt = now });
            var before = w.Status;
            w.Status = WarrantyStatus.Pending;
            w.ReviewedAt = null;
            w.ReviewNote = "New installation photos sent by the installer; awaiting counter review.";
            AuditLog.Add(db, "installer:" + phone, "warranty", w.Code, "photosResent", AuditLog.Diff(("status", before, w.Status), ("photos", null, photos.Length)));
            await db.SaveChangesAsync(ct);
            return Ok(new { status = "pending" });
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
        catch (InvalidDataException) { return BadRequest(new { error = "The photos are too large." }); }
    }
}

public record TokenRequest(string Token);
