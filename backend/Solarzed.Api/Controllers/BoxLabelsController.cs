using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Infrastructure;
using Solarzed.Api.Domain;

namespace Solarzed.Api.Controllers;

[ApiController, Route("api/admin/box-labels"), Authorize(Policy = "StaffPolicy")]
public class BoxLabelsController(AppDbContext db, BoxLabelService labels, IActivationSmsSender sms) : ControllerBase
{
    bool IsAdmin => User.IsInRole("admin");

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var site = await labels.Site();
        var rows = await db.BoxLabels.AsNoTracking().OrderByDescending(x => x.CreatedAt).Take(500).ToListAsync();
        if (!IsAdmin)
            return Ok(new { labels = rows.Select(BoxLabelService.Restricted), siteUrl = site, smsConfigured = sms.Configured, role = "carton" });
        return Ok(new { labels = rows.Select(x => labels.View(x, site)), siteUrl = site, smsConfigured = sms.Configured, role = "admin" });
    }

    // Issuing labels is a manager action; the carton role can only read serials.
    [HttpPost, Authorize(Policy = "AdminPolicy")]
    public async Task<IActionResult> Issue(IssueLabelsRequest request)
    {
        try
        {
            var created = await labels.Issue(request.RollId, request.Quantity);
            return Ok(new { labels = created });
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    [HttpPost("site"), Authorize(Policy = "AdminPolicy")]
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

public record IssueLabelsRequest(string RollId, int Quantity);
public record SiteUrlRequest(string SiteUrl);
