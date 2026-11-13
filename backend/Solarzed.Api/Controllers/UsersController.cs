using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

// User management is manager-only. The carton role can never reach these routes.
[ApiController, Route("api/admin/users"), Authorize(Policy = "AdminPolicy")]
public class UsersController(AppDbContext db) : ControllerBase
{
    static readonly string[] Roles = ["admin", "carton"];
    static readonly Regex UsernameRx = new("^[A-Za-z0-9._-]{3,50}$", RegexOptions.Compiled);
    const string PasswordRule = "Password must have at least 12 characters and at most 72 UTF-8 bytes.";

    static bool ValidPassword(string? value) =>
        !string.IsNullOrEmpty(value) && value.Length >= 12 && System.Text.Encoding.UTF8.GetByteCount(value) <= 72;

    static object Shape(AdminUser u) => new
    {
        id = u.Id, username = u.Username, role = u.Role, displayName = u.DisplayName, active = u.Active,
    };

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var users = await db.AdminUsers.AsNoTracking().OrderBy(u => u.Id)
            .Select(u => new { id = u.Id, username = u.Username, role = u.Role, displayName = u.DisplayName, active = u.Active })
            .ToListAsync();
        return Ok(new { users });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest req)
    {
        var username = (req.Username ?? "").Trim();
        if (!UsernameRx.IsMatch(username)) return BadRequest(new { error = "Username must be 3–50 letters, numbers, dot, dash or underscore." });
        if (!ValidPassword(req.Password)) return BadRequest(new { error = PasswordRule });
        if (!Roles.Contains(req.Role)) return BadRequest(new { error = "Choose the manager or carton role." });
        if (await db.AdminUsers.AnyAsync(u => u.Username == username)) return Conflict(new { error = "This username already exists." });

        var user = new AdminUser
        {
            Username = username,
            Role = req.Role,
            DisplayName = (req.DisplayName ?? "").Trim() is { Length: > 0 } d ? d[..Math.Min(d.Length, 100)] : null,
            Active = req.Active,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password),
        };
        db.AdminUsers.Add(user);
        await db.SaveChangesAsync();
        return Ok(new { user = Shape(user) });
    }

    [HttpPost("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] UpdateUserRequest req)
    {
        var user = await db.AdminUsers.FirstOrDefaultAsync(u => u.Id == id);
        if (user == null) return NotFound(new { error = "User not found." });
        if (req.Role != null && !Roles.Contains(req.Role)) return BadRequest(new { error = "Unknown role." });

        var nextRole = req.Role ?? user.Role;
        var nextActive = req.Active ?? user.Active;

        // Never lock the system out of its last active manager.
        if (user.Role == "admin" && (nextRole != "admin" || !nextActive))
        {
            var otherAdmins = await db.AdminUsers.CountAsync(u => u.Id != user.Id && u.Role == "admin" && u.Active);
            if (otherAdmins == 0) return BadRequest(new { error = "At least one active manager account must remain." });
        }

        user.Role = nextRole;
        user.Active = nextActive;
        if (req.DisplayName != null)
            user.DisplayName = req.DisplayName.Trim() is { Length: > 0 } d ? d[..Math.Min(d.Length, 100)] : null;
        await db.SaveChangesAsync();
        return Ok(new { user = Shape(user) });
    }

    [HttpPost("{id:int}/password")]
    public async Task<IActionResult> ResetPassword(int id, [FromBody] ResetPasswordRequest req)
    {
        if (!ValidPassword(req.Password)) return BadRequest(new { error = PasswordRule });
        var user = await db.AdminUsers.FirstOrDefaultAsync(u => u.Id == id);
        if (user == null) return NotFound(new { error = "User not found." });
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.Password);
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }
}

public record CreateUserRequest(string? Username, string? Password, string Role, string? DisplayName, bool Active);
public record UpdateUserRequest(string? Role, string? DisplayName, bool? Active);
public record ResetPasswordRequest(string Password);
