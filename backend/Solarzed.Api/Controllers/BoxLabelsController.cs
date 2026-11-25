using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Infrastructure;
using Solarzed.Api.Domain;

namespace Solarzed.Api.Controllers;

[ApiController, Route("api/admin/box-labels"), Authorize(Policy = "StaffPolicy")]
public class BoxLabelsController(AppDbContext db, BoxLabelService labels, BoxTransferService transfers, IActivationSmsSender sms) : ControllerBase
{
    // Full label details (activation links, card codes) go with the permission to issue cards.
    bool IsAdmin => Permissions.Has(User, "labels.edit");

    // Staff move rolls to a seller's or installer's mobile by ROLL NO only. A roll whose warranty card was not issued
    // yet gets it here, so the company can hand rolls straight from the roll list.
    [HttpPost("transfers"), Perm("labels.transfer", "rolls.transfer")]
    public async Task<IActionResult> Transfer(TransferRequest request)
    {
        try
        {
            if (!request.ToWarehouse)
            {
                if (string.IsNullOrWhiteSpace(request.ToPhone)) throw new ActivationError(400, "Enter the receiver's mobile number.");
                PortalService.CanonicalPhone(request.ToPhone);   // reject a bad mobile before issuing any card
                var serials = (request.Serials ?? []).Select(BoxLabelService.NormalizeSerial).Where(x => x.Length > 0).Distinct().ToArray();
                var issued = await db.BoxLabels.Where(b => serials.Contains(b.Id)).Select(b => b.Id).ToListAsync();
                var rolls = await db.Rolls.Where(r => r.RollNo != null && serials.Contains(r.RollNo) && !issued.Contains(r.RollNo))
                    .Select(r => r.Id).ToListAsync();
                if (rolls.Count > 0) await labels.IssueForRolls(rolls);
            }
            return Ok(await transfers.Transfer(request, AuditLog.Actor(User)));
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    [HttpGet("{serial}/transfers"), Perm("labels.view", "labels.transfer", "rolls.transfer")]
    public async Task<IActionResult> History(string serial)
    {
        try { return Ok(await transfers.History(serial)); }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    [HttpGet("holders"), Perm("labels.view", "labels.transfer", "rolls.transfer")]
    public async Task<IActionResult> Holders() => Ok(new { holders = await transfers.Holders() });

    [HttpGet, Perm("labels.view", "warranties.view")]
    public async Task<IActionResult> List()
    {
        var site = await labels.Site();
        var rows = await db.BoxLabels.AsNoTracking().OrderByDescending(x => x.CreatedAt).Take(500).ToListAsync();
        if (!IsAdmin)
            return Ok(new { labels = rows.Select(BoxLabelService.Restricted), siteUrl = site, smsConfigured = sms.Configured, role = "counter" });
        return Ok(new { labels = rows.Select(x => labels.View(x, site)), siteUrl = site, smsConfigured = sms.Configured, role = "admin" });
    }

    // Issuing labels is a manager action; the counter role can only read serials.
    [HttpPost, Perm("labels.edit")]
    public async Task<IActionResult> Issue(IssueLabelsRequest request)
    {
        try
        {
            // Cartons normally arrive with the roll number printed on the box; generated serials are the fallback.
            var created = request.Serials is { Length: > 0 }
                ? await labels.Issue(request.RollId, request.Serials)
                : await labels.Issue(request.RollId, request.Quantity);
            return Ok(new { labels = created });
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    // Rolls with a recorded carton Roll No: one warranty card each, issued straight from the roll list.
    [HttpPost("from-rolls"), Perm("labels.edit")]
    public async Task<IActionResult> IssueForRolls(IssueForRollsRequest request)
    {
        try { return Ok(new { labels = await labels.IssueForRolls(request.RollIds) }); }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    [HttpPost("site"), Perm("labels.edit")]
    public async Task<IActionResult> Site(SiteUrlRequest request)
    {
        try
        {
            var site = BoxLabelService.ValidateSite(request.SiteUrl);
            var settings = await db.CoverageSettings.FirstOrDefaultAsync();
            if (settings == null) { settings = new CoverageSetting(); db.CoverageSettings.Add(settings); }
            // A printed code cannot be silently moved to another domain.
            if (settings.PublicSiteUrl.TrimEnd('/') != site && await db.BoxLabels.AnyAsync())
                return Conflict(new { error = "Labels already exist for this domain. Keep their original domain reachable before changing it." });
            settings.PublicSiteUrl = site;
            await db.SaveChangesAsync();
            return Ok(new { siteUrl = site });
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }
}

public record IssueLabelsRequest(string RollId, int Quantity, string[]? Serials = null);
public record IssueForRollsRequest(string[]? RollIds);
public record SiteUrlRequest(string SiteUrl);
