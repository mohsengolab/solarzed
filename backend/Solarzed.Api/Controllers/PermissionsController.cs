using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

/// <summary>
/// The super administrator decides which pages the manager (مدیر) and counter (کانتر) roles see, and what they may
/// change on each page. Changes apply to everyone in that role on their next request.
/// </summary>
[ApiController, Route("api/admin/permissions"), Authorize(Policy = "SuperAdminPolicy")]
public class PermissionsController(AppDbContext db, PermissionStore? store = null) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct = default)
    {
        var saved = await db.RolePermissions.AsNoTracking().ToDictionaryAsync(r => r.Role, r => r.PermissionsJson, ct);
        var roles = Permissions.EditableRoles.ToDictionary(r => r, r => Current(r, saved.GetValueOrDefault(r)).OrderBy(k => k).ToArray());
        var defaults = Permissions.EditableRoles.ToDictionary(r => r, r => Permissions.Defaults(r).OrderBy(k => k).ToArray());
        return Ok(new { catalog = Permissions.Catalog, roles, defaults });
    }

    [HttpPost("{role}")]
    public async Task<IActionResult> Save(string role, [FromBody] SavePermissionsRequest req, CancellationToken ct = default)
    {
        if (!Permissions.EditableRoles.Contains(role)) return BadRequest(new { error = "Only the manager and counter roles can be changed." });
        var unknown = (req.Permissions ?? []).Where(k => !Permissions.All.Contains(k)).ToArray();
        if (unknown.Length > 0) return BadRequest(new { error = "Unknown permission: " + string.Join(", ", unknown) });

        var next = Permissions.Normalize(req.Permissions);
        var row = await db.RolePermissions.FirstOrDefaultAsync(r => r.Role == role, ct);
        var before = Current(role, row?.PermissionsJson);
        if (row == null) { row = new RolePermission { Role = role }; db.RolePermissions.Add(row); }
        row.PermissionsJson = JsonSerializer.Serialize(next.OrderBy(k => k));
        row.UpdatedAt = DateTime.UtcNow;

        var added = next.Except(before).OrderBy(k => k).ToArray();
        var removed = before.Except(next).OrderBy(k => k).ToArray();
        if (added.Length + removed.Length > 0)
            AuditLog.Add(db, AuditLog.Actor(HttpContext?.User), "role", role, "permissionsChanged",
                AuditLog.Diff(("granted", null, added.Length > 0 ? string.Join(", ", added) : null),
                              ("revoked", null, removed.Length > 0 ? string.Join(", ", removed) : null)));
        await db.SaveChangesAsync(ct);
        store?.Invalidate();
        return Ok(new { role, permissions = next.OrderBy(k => k).ToArray() });
    }

    static IReadOnlySet<string> Current(string role, string? json) =>
        json == null ? Permissions.Defaults(role) : Permissions.Normalize(JsonSerializer.Deserialize<string[]>(json));
}

public record SavePermissionsRequest(string[]? Permissions);
