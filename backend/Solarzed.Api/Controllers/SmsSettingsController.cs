using System.Security.Cryptography;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Solarzed.Api.Application;

namespace Solarzed.Api.Controllers;

[ApiController, Route("api/admin/sms"), Authorize(Policy = "AdminPolicy")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class SmsSettingsController(IConfiguration config, IWebHostEnvironment env, IDataProtectionProvider protection,
    IHttpClientFactory clients, IActivationSmsSender sender, SmsLog log) : ControllerBase
{
    static readonly SemaphoreSlim Gate = new(1, 1);
    const string Protector = "Solarzed.Faraz.Token.v1";
    const string ProviderBase = "https://api.iranpayamak.com/ws/v1/";

    string? StoredKey()
    {
        var encrypted = config["Faraz:ProtectedToken"];
        if (string.IsNullOrEmpty(encrypted)) return null;
        try { return protection.CreateProtector(Protector).Unprotect(encrypted); }
        catch (CryptographicException) { return null; }
    }

    [HttpGet]
    public IActionResult Get()
    {
        var policy = SmsPolicy.From(config);
        var connected = sender is ActivationSmsSender real ? real.Connected : sender.Configured;
        return Ok(new
        {
            configured = sender.Configured, connected, keyStored = StoredKey() != null,
            mode = config["Faraz:Mode"] ?? "unconfigured",
            pattern = config["Faraz:OtpPattern"] ?? "2675", codeVariable = config["Faraz:CodeVariable"] ?? "code1",
            line = config["Faraz:Sender"] ?? "", updatedAt = config["Faraz:UpdatedAt"],
            policy = new { policy.Enabled, policy.OtpMinutes, policy.ResendSeconds, policy.DailyLimit },
        });
    }

    // Connection: verifies the account and pattern with read-only provider calls. The API key may be
    // left empty to keep the stored key (for example when only the pattern or line changes).
    [HttpPost]
    [RequestSizeLimit(8192)]
    public async Task<IActionResult> Save(SmsRequest req, CancellationToken ct)
    {
        var key = string.IsNullOrWhiteSpace(req.Token) ? StoredKey() : req.Token.Trim();
        if (string.IsNullOrWhiteSpace(key) || key.Length > 2048 || key.Contains('\r') || key.Contains('\n') ||
            !Regex.IsMatch(req.Pattern ?? "", "^[a-zA-Z0-9_-]{1,100}$") ||
            !Regex.IsMatch(req.Line ?? "", "^[0-9]{3,24}$") ||
            !Regex.IsMatch(req.CodeVariable ?? "", "^[a-zA-Z][a-zA-Z0-9_]{0,49}$"))
            return BadRequest(new { error = "Enter the API key, pattern ID, sender line and code variable." });
        // Read-only provider checks: do not send messages, display balances or expose provider bodies.
        using var http = clients.CreateClient(); http.Timeout = TimeSpan.FromSeconds(15);
        try {
            foreach (var path in new[] { "account/balance", "patterns/" + Uri.EscapeDataString(req.Pattern!) }) {
                using var request = new HttpRequestMessage(HttpMethod.Get, ProviderBase + path);
                request.Headers.Add("Api-Key", key);
                using var response = await http.SendAsync(request, ct);
                if (!response.IsSuccessStatusCode || !ActivationSmsSender.RestAccepted(await response.Content.ReadAsStringAsync(ct)))
                    return BadRequest(new { error = path == "account/balance" ? "Faraz rejected the API key or the account is unavailable. Existing settings were preserved." : "Faraz could not verify this pattern. Check its ID and account approval. Existing settings were preserved." });
            }
        } catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException) {
            return StatusCode(503, new { error = "Could not reach Faraz over HTTPS. Existing settings were preserved." });
        }
        await Update(root => root["Faraz"] = new JsonObject { ["Mode"] = "rest", ["Endpoint"] = ProviderBase + "sms/pattern",
            ["ProtectedToken"] = protection.CreateProtector(Protector).Protect(key),
            ["OtpPattern"] = req.Pattern, ["Sender"] = req.Line, ["CodeVariable"] = req.CodeVariable,
            ["UpdatedAt"] = DateTime.UtcNow.ToString("O") }, ct);
        return Ok(new { ok = true, message = "Faraz account and pattern verified. Settings saved. No SMS was sent." });
    }

    [HttpPost("policy")]
    [RequestSizeLimit(4096)]
    public async Task<IActionResult> SavePolicy(SmsPolicyRequest req, CancellationToken ct)
    {
        if (req.OtpMinutes is < 2 or > 15 || req.ResendSeconds is < 30 or > 600 || req.DailyLimit is < 1 or > 50)
            return BadRequest(new { error = "Code validity must be 2–15 minutes, resend wait 30–600 seconds and daily limit 1–50." });
        await Update(root => root["Sms"] = new JsonObject { ["Enabled"] = req.Enabled ? "true" : "false",
            ["OtpMinutes"] = req.OtpMinutes.ToString(), ["ResendSeconds"] = req.ResendSeconds.ToString(), ["DailyLimit"] = req.DailyLimit.ToString() }, ct);
        return Ok(new { ok = true, message = req.Enabled ? "SMS rules saved." : "SMS rules saved. Sending is paused; customer activation is unavailable until it is resumed." });
    }

    // Sends one real pattern SMS with a random code to a number the administrator enters.
    [HttpPost("test")]
    [RequestSizeLimit(1024)]
    [EnableRateLimiting("sms-test")]
    public async Task<IActionResult> Test(SmsTestRequest req, CancellationToken ct)
    {
        var phone = (req.Phone ?? "").Trim();
        if (!Regex.IsMatch(phone, @"^(?:09\d{9}|\+?989\d{9})$")) return BadRequest(new { error = "Enter an Iranian mobile number, for example 09123456789." });
        if (!sender.Configured) return BadRequest(new { error = "SMS is not connected or is paused." });
        var code = RandomNumberGenerator.GetInt32(0, 1000000).ToString("D6");
        try
        {
            await sender.Send(phone, code, "admin-test", ct);
            log.Add(phone, "test", true);
            return Ok(new { ok = true, message = $"Test message submitted to {SmsLog.Mask(phone)}." });
        }
        catch (ActivationError ex) { log.Add(phone, "test", false, ex.Message); return StatusCode(ex.Status, new { error = ex.Message }); }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        { log.Add(phone, "test", false, "Provider unreachable"); return StatusCode(503, new { error = "Could not reach the SMS provider." }); }
    }

    [HttpGet("log")]
    public IActionResult Log() => Ok(log.Recent());

    [HttpDelete]
    public async Task<IActionResult> Disconnect(CancellationToken ct)
    {
        await Update(root => root.Remove("Faraz"), ct);
        return Ok(new { ok = true, message = "SMS disconnected. The stored key was deleted." });
    }

    async Task Update(Action<JsonObject> change, CancellationToken ct)
    {
        await Gate.WaitAsync(ct);
        try {
            var file = Path.Combine(env.ContentRootPath, ".local-sms.json");
            var root = System.IO.File.Exists(file) ? JsonNode.Parse(await System.IO.File.ReadAllTextAsync(file, ct))?.AsObject() ?? new JsonObject() : new JsonObject();
            change(root);
            await System.IO.File.WriteAllTextAsync(file + ".tmp", root.ToJsonString(), ct);
            System.IO.File.Move(file + ".tmp", file, overwrite: true);
            if (config is IConfigurationRoot reloadable) reloadable.Reload();
        } finally { Gate.Release(); }
    }
}
public record SmsRequest(string? Token, string Pattern, string Line, string CodeVariable);
public record SmsPolicyRequest(bool Enabled, int OtpMinutes, int ResendSeconds, int DailyLimit);
public record SmsTestRequest(string Phone);
