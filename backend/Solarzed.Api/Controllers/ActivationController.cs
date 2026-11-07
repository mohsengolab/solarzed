using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Solarzed.Api.Application;

namespace Solarzed.Api.Controllers;

[ApiController, Route("api/activation"), EnableRateLimiting("activation"), RequestSizeLimit(16384)]
public class ActivationController(BoxLabelService labels) : ControllerBase
{
    [HttpPost("inspect")]
    public async Task<IActionResult> Inspect(TokenRequest request)
    {
        Response.Headers.CacheControl = "no-store";
        try { return Ok(await labels.Info(request.Token)); }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    [HttpPost("otp")]
    public async Task<IActionResult> SendCode(OtpRequest request, CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";
        try
        {
            var challenge = await labels.SendCode(request.Token, request.Phone, cancellationToken);
            return Ok(new { challengeId = challenge.Id, expiresAt = challenge.ExpiresAt, retryAfterSeconds = labels.Policy.ResendSeconds });
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
        catch (Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException) { return Conflict(new { error = "Please retry the verification request." }); }
    }

    [HttpPost("complete")]
    public async Task<IActionResult> Complete(ActivateBoxRequest request)
    {
        Response.Headers.CacheControl = "no-store";
        try { return Ok(await labels.Activate(request)); }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
        catch (Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException) { return Conflict(new { error = "The verification state changed. Please retry." }); }
    }
}

public record TokenRequest(string Token);
public record OtpRequest(string Token, string Phone);
