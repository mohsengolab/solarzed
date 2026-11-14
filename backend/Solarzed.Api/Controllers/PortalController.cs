using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;

namespace Solarzed.Api.Controllers;

/// <summary>
/// Public-site accounts for representatives, shops and customers: sign in with mobile + SMS code, see the cartons
/// you hold, pass them on by scanning the carton barcode, and see your warranties.
/// </summary>
[ApiController, Route("api/portal"), Authorize(Policy = "PortalPolicy"), RequestSizeLimit(65536)]
public class PortalController(PortalService portal, BoxTransferService transfers, IConfiguration cfg) : ControllerBase
{
    string Me => PortalAuth.Phone(User)!;

    [AllowAnonymous, HttpPost("otp"), EnableRateLimiting("portal-otp")]
    public async Task<IActionResult> SendCode(PortalOtpRequest request, CancellationToken ct)
    {
        try
        {
            var challenge = await portal.SendCode(request.Phone, ct);
            return Ok(new { challengeId = challenge.Id, phone = challenge.Phone, expiresAt = challenge.ExpiresAt, retryAfterSeconds = portal.Policy.ResendSeconds });
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
        catch (DbUpdateConcurrencyException) { return Conflict(new { error = "Please retry the verification request." }); }
    }

    [AllowAnonymous, HttpPost("login"), EnableRateLimiting("portal-otp")]
    public async Task<IActionResult> Login(PortalLoginRequest request)
    {
        try
        {
            var user = await portal.Verify(request.ChallengeId, request.Code);
            var token = PortalAuth.Token(user, cfg["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key missing"));
            Response.Cookies.Append(PortalAuth.Cookie, token, new CookieOptions
            {
                HttpOnly = true, Secure = Request.IsHttps, SameSite = SameSiteMode.Strict,
                Path = "/api", MaxAge = PortalAuth.Lifetime, IsEssential = true,
            });
            return Ok(new PortalMe(user.Phone, user.Name));
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
        catch (DbUpdateException) { return Conflict(new { error = "Please retry signing in." }); }
    }

    [AllowAnonymous, HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete(PortalAuth.Cookie, new CookieOptions { Path = "/api", Secure = Request.IsHttps, SameSite = SameSiteMode.Strict, HttpOnly = true });
        return Ok(new { ok = true });
    }

    [AllowAnonymous, HttpGet("me")]
    public async Task<IActionResult> Session()
    {
        var auth = await HttpContext.AuthenticateAsync(PortalAuth.Scheme);
        var me = auth.Succeeded ? await portal.Me(PortalAuth.Phone(auth.Principal)) : null;
        return Ok(new { user = me });
    }

    [HttpGet("boxes")]
    public async Task<IActionResult> Boxes() => Ok(await transfers.Mine(Me));

    [HttpPost("boxes/transfer")]
    public async Task<IActionResult> Transfer(PortalTransferRequest request)
    {
        try { return Ok(await transfers.TransferAsHolder(request, Me)); }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    [HttpGet("warranties")]
    public async Task<IActionResult> Warranties() => Ok(new { warranties = await portal.Warranties(Me) });
}

public record PortalOtpRequest(string Phone);
public record PortalLoginRequest(string ChallengeId, string Code);
