using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Solarzed.Api.Application;

namespace Solarzed.Api.Controllers;

// Scanning the warranty card opens /activate. Reading the card is public; registering the warranty requires the
// customer to be signed in with their SMS-verified mobile (see PortalController).
[ApiController, Route("api/activation"), EnableRateLimiting("activation"), RequestSizeLimit(16384)]
public class ActivationController(BoxLabelService labels) : ControllerBase
{
    [HttpPost("inspect")]
    public async Task<IActionResult> Inspect(TokenRequest request)
    {
        Response.Headers.CacheControl = "no-store";
        var session = await HttpContext.AuthenticateAsync(PortalAuth.Scheme);
        try { return Ok(await labels.Info(request.Token, PortalAuth.Phone(session.Principal))); }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    [HttpPost("complete"), Authorize(Policy = "PortalPolicy")]
    public async Task<IActionResult> Complete(ActivateBoxRequest request)
    {
        Response.Headers.CacheControl = "no-store";
        var phone = PortalAuth.Phone(User);
        if (phone == null) return Unauthorized(new { error = "Sign in with your mobile number first." });
        try { return Ok(await labels.Activate(request, phone)); }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
        catch (Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException) { return Conflict(new { error = "This box was just changed. Please retry." }); }
    }
}

public record TokenRequest(string Token);
