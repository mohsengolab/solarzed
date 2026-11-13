using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

// Every signed-in account, manager or carton operator, may change its own password.
[ApiController, Route("api/admin/account"), Authorize(Policy = "StaffPolicy")]
public class AccountController(AppDbContext db) : ControllerBase
{
    [HttpPost("password")]
    public async Task<IActionResult> Password(ChangePasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrEmpty(req.CurrentPassword) || req.NewPassword is null ||
            req.NewPassword.Length < 12 || System.Text.Encoding.UTF8.GetByteCount(req.NewPassword) > 72)
            return BadRequest(new { error = "رمز عبور جدید باید حداقل ۱۲ کاراکتر و حداکثر ۷۲ بایت باشد." });
        // A signed-in account can only change its own password.
        var current = HttpContext?.User.Identity?.Name;
        if (!string.IsNullOrEmpty(current) && !string.Equals(current, req.Username, StringComparison.Ordinal))
            return BadRequest(new { error = "اطلاعات ورود فعلی درست نیست." });
        var admin = await db.AdminUsers.FirstOrDefaultAsync(a => a.Username == req.Username);
        if (admin == null || !BCrypt.Net.BCrypt.Verify(req.CurrentPassword, admin.PasswordHash))
            return BadRequest(new { error = "اطلاعات ورود فعلی درست نیست." });
        admin.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        await db.SaveChangesAsync();
        return Ok(new { ok = true, message = "رمز عبور تغییر کرد. همه نشست‌ها خارج شدند؛ با رمز جدید وارد شوید." });
    }
}
