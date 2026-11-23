using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

/// <summary>
/// Installer partners (همکاران): public-site accounts that may register warranties for customers. Partners apply from
/// their account or are added here by mobile; managers approve or suspend them and see their work.
/// </summary>
[ApiController, Route("api/admin/partners"), Authorize(Policy = "AdminPolicy")]
public class PartnersController(AppDbContext db) : ControllerBase
{
    static readonly Dictionary<string, PartnerStatus> Statuses = new()
    {
        ["pending"] = PartnerStatus.Pending, ["approved"] = PartnerStatus.Approved,
        ["suspended"] = PartnerStatus.Suspended, ["none"] = PartnerStatus.None,
    };

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] string? q, CancellationToken ct)
    {
        var query = db.PortalUsers.AsNoTracking().Where(u => u.Partner != PartnerStatus.None && u.Phone != null);
        if (status != null && Statuses.TryGetValue(status, out var s)) query = query.Where(u => u.Partner == s);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim();
            query = query.Where(u => u.Phone!.Contains(term) || (u.ShopName != null && u.ShopName.Contains(term)) ||
                (u.City != null && u.City.Contains(term)) || (u.Country != null && u.Country.Contains(term)) ||
                (u.FirstName != null && u.FirstName.Contains(term)) || (u.LastName != null && u.LastName.Contains(term)));
        }
        // Applications waiting for a decision come first.
        var users = await query.OrderBy(u => u.Partner == PartnerStatus.Pending ? 0 : 1)
            .ThenByDescending(u => u.PartnerAppliedAt ?? u.CreatedAt).Take(500).ToListAsync(ct);
        var phones = users.Select(u => u.Phone!).ToArray();
        var work = await db.WarrantyRegistrations.AsNoTracking().Where(w => w.InstallerPhone != null && phones.Contains(w.InstallerPhone))
            .GroupBy(w => w.InstallerPhone!)
            .Select(g => new { Phone = g.Key, Total = g.Count(), Pending = g.Count(w => w.Status == WarrantyStatus.Pending),
                Rejected = g.Count(w => w.Status == WarrantyStatus.Rejected), Last = g.Max(w => w.CreatedAt) })
            .ToDictionaryAsync(x => x.Phone, ct);
        var cartons = await db.BoxLabels.AsNoTracking().Where(b => b.HolderPhone != null && phones.Contains(b.HolderPhone))
            .GroupBy(b => b.HolderPhone!).Select(g => new { Phone = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Phone, x => x.Count, ct);
        return Ok(new
        {
            partners = users.Select(u =>
            {
                var w = work.GetValueOrDefault(u.Phone!);
                return new
                {
                    id = u.Id, phone = u.Phone, shopName = u.ShopName, firstName = u.FirstName, lastName = u.LastName,
                    country = u.Country, city = u.City, status = u.Partner.ToString().ToLowerInvariant(), active = u.Active,
                    appliedAt = u.PartnerAppliedAt, reviewedAt = u.PartnerReviewedAt,
                    warranties = w?.Total ?? 0, pendingReview = w?.Pending ?? 0, rejected = w?.Rejected ?? 0, lastInstall = w?.Last,
                    cartons = cartons.GetValueOrDefault(u.Phone!),
                };
            }),
            counts = await db.PortalUsers.Where(u => u.Partner != PartnerStatus.None).GroupBy(u => u.Partner)
                .Select(g => new { Status = g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Status.ToString().ToLowerInvariant(), x => x.Count, ct),
        });
    }

    /// <summary>Adds (or approves) a partner by mobile; the partner then signs in on the site with that mobile.</summary>
    [HttpPost]
    public async Task<IActionResult> Add([FromBody] PartnerSaveRequest req, CancellationToken ct)
    {
        string phone;
        try { phone = PortalService.CanonicalPhone(req.Phone); }
        catch (ActivationError ex) { return BadRequest(new { error = ex.Message }); }
        var shop = Clean(req.ShopName, 200);
        if (shop == null) return BadRequest(new { error = "Enter the shop or workshop name." });
        var user = await db.PortalUsers.FirstOrDefaultAsync(u => u.Phone == phone, ct);
        if (user == null) { user = new PortalUser { Phone = phone }; db.PortalUsers.Add(user); }
        var before = user.Partner;
        user.ShopName = shop;
        user.FirstName = Clean(req.FirstName, 100) ?? user.FirstName;
        user.LastName = Clean(req.LastName, 100) ?? user.LastName;
        user.Country = Clean(req.Country, 100) ?? user.Country;
        user.City = Clean(req.City, 100) ?? user.City;
        user.Partner = PartnerStatus.Approved;
        user.PartnerAppliedAt ??= DateTime.UtcNow;
        user.PartnerReviewedAt = DateTime.UtcNow;
        AuditLog.Add(db, AuditLog.Actor(User), "partner", phone, before == PartnerStatus.None ? "added" : "updated",
            AuditLog.Diff(("status", before, user.Partner), ("shop", null, shop)));
        await db.SaveChangesAsync(ct);
        return Ok(new { id = user.Id });
    }

    [HttpPost("{id:int}/status")]
    public async Task<IActionResult> SetStatus(int id, [FromBody] PartnerStatusRequest req, CancellationToken ct)
    {
        if (req.Status == null || !Statuses.TryGetValue(req.Status, out var next) || next == PartnerStatus.Pending)
            return BadRequest(new { error = "Choose approve, suspend or remove." });
        var user = await db.PortalUsers.FirstOrDefaultAsync(u => u.Id == id, ct);
        if (user == null || user.Partner == PartnerStatus.None) return NotFound(new { error = "Partner not found." });
        var before = user.Partner;
        user.Partner = next;
        user.PartnerReviewedAt = DateTime.UtcNow;
        AuditLog.Add(db, AuditLog.Actor(User), "partner", user.Phone ?? id.ToString(), "status",
            AuditLog.Diff(("status", before, next)), Clean(req.Reason, 1000));
        await db.SaveChangesAsync(ct);
        return Ok(new { status = next.ToString().ToLowerInvariant() });
    }

    static string? Clean(string? value, int max)
    {
        var text = (value ?? "").Trim();
        return text.Length == 0 ? null : text.Length > max ? text[..max] : text;
    }
}

public record PartnerSaveRequest(string? Phone, string? ShopName, string? FirstName, string? LastName, string? Country, string? City);
public record PartnerStatusRequest(string? Status, string? Reason);
