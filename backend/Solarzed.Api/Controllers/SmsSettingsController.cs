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
    IHttpClientFactory clients, IActivationSmsSender sender, SmsLog log, IEmailSender email) : ControllerBase
{
    static readonly SemaphoreSlim Gate = new(1, 1);
    const string Protector = "Solarzed.Faraz.Token.v1";
    const string EmailProtector = "Solarzed.Email.Password.v1";
    const string ProviderBase = "https://api.iranpayamak.com/ws/v1/";
    const string SoapDefault = "http://185.112.33.61/wbs/send.php";

    string? StoredKey()
    {
        var encrypted = config["Faraz:ProtectedToken"];
        // A token written by hand into .local-sms.json counts as stored too, as the sender already uses it.
        if (string.IsNullOrEmpty(encrypted)) return string.IsNullOrWhiteSpace(config["Faraz:Token"]) ? null : config["Faraz:Token"];
        try { return protection.CreateProtector(Protector).Unprotect(encrypted); }
        catch (CryptographicException) { return null; }
    }

    string? StoredEmailPassword()
    {
        var encrypted = config["Email:ProtectedPassword"];
        if (string.IsNullOrEmpty(encrypted)) return null;
        try { return protection.CreateProtector(EmailProtector).Unprotect(encrypted); }
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
            line = config["Faraz:Sender"] ?? "",
            warranty = new { pattern = config["Faraz:WarrantyPattern"] ?? "", codeVariable = config["Faraz:WarrantyCodeVariable"] ?? "code",
                linkVariable = config["Faraz:WarrantyLinkVariable"] ?? "link", configured = sender.WarrantyConfigured },
            endpoint = config["Faraz:Mode"] == "soap" ? config["Faraz:Endpoint"] : null, updatedAt = config["Faraz:UpdatedAt"],
            policy = new { policy.Enabled, policy.OtpMinutes, policy.ResendSeconds, policy.DailyLimit },
            email = new
            {
                configured = email.Configured,
                host = config["Email:Host"] ?? "", port = int.TryParse(config["Email:Port"], out var p) ? p : 587,
                from = config["Email:From"] ?? "", senderName = config["Email:Name"] ?? "",
                user = config["Email:User"] ?? "", passwordStored = StoredEmailPassword() != null,
            },
        });
    }

    // Connection: verifies the account and pattern with read-only provider calls. The API key may be
    // left empty to keep the stored key (for example when only the pattern or line changes).
    [HttpPost]
    [RequestSizeLimit(8192)]
    public async Task<IActionResult> Save(SmsRequest req, CancellationToken ct)
    {
        // A REST API key and a SOAP token are different credentials: switching mode needs a new one.
        var sameMode = (req.Mode == "soap") == (config["Faraz:Mode"] == "soap");
        var key = string.IsNullOrWhiteSpace(req.Token) ? (sameMode ? StoredKey() : null) : req.Token.Trim();
        if (string.IsNullOrWhiteSpace(key) || key.Length > 2048 || key.Contains('\r') || key.Contains('\n') ||
            !Regex.IsMatch(req.Pattern ?? "", "^[a-zA-Z0-9_-]{1,100}$") ||
            !Regex.IsMatch(req.Line ?? "", "^[0-9]{3,24}$") ||
            !Regex.IsMatch(req.CodeVariable ?? "", "^[a-zA-Z][a-zA-Z0-9_]{0,49}$"))
            return BadRequest(new { error = "Enter the API key, pattern ID, sender line and code variable." });
        if (req.Mode == "soap")
        {
            // SOAP pattern service (token login). It has no read-only check, so verify with a test message after saving.
            var endpoint = string.IsNullOrWhiteSpace(req.Endpoint) ? SoapDefault : req.Endpoint.Trim();
            if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https") || endpoint.Length > 300)
                return BadRequest(new { error = "Enter a valid SOAP endpoint URL." });
            await Update(root => root["Faraz"] = new JsonObject { ["Mode"] = "soap", ["Endpoint"] = endpoint,
                ["ProtectedToken"] = protection.CreateProtector(Protector).Protect(key),
                ["OtpPattern"] = req.Pattern, ["Sender"] = req.Line, ["CodeVariable"] = req.CodeVariable,
                ["UpdatedAt"] = DateTime.UtcNow.ToString("O") }.Keep(root, "WarrantyPattern", "WarrantyCodeVariable", "WarrantyLinkVariable"), ct);
            return Ok(new { ok = true, message = "SOAP settings saved. Send a test message to confirm the token and pattern." });
        }
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
            ["UpdatedAt"] = DateTime.UtcNow.ToString("O") }.Keep(root, "WarrantyPattern", "WarrantyCodeVariable", "WarrantyLinkVariable"), ct);
        return Ok(new { ok = true, message = "Faraz account and pattern verified. Settings saved. No SMS was sent." });
    }

    // The "warranty active" pattern: the owner's SMS with the warranty number and the gold card link.
    [HttpPost("warranty")]
    [RequestSizeLimit(2048)]
    public async Task<IActionResult> SaveWarranty(SmsWarrantyRequest req, CancellationToken ct)
    {
        var pattern = (req.Pattern ?? "").Trim();
        if (pattern.Length > 0 && !Regex.IsMatch(pattern, "^[a-zA-Z0-9_-]{1,100}$") ||
            !Regex.IsMatch(req.CodeVariable ?? "", "^[a-zA-Z][a-zA-Z0-9_]{0,49}$") ||
            !Regex.IsMatch(req.LinkVariable ?? "", "^[a-zA-Z][a-zA-Z0-9_]{0,49}$") || req.CodeVariable == req.LinkVariable)
            return BadRequest(new { error = "Enter the pattern ID and two different variable names (English letters, digits, _)." });
        await Update(root =>
        {
            var faraz = root["Faraz"] as JsonObject ?? new JsonObject();
            if (pattern.Length > 0) faraz["WarrantyPattern"] = pattern; else faraz.Remove("WarrantyPattern");
            faraz["WarrantyCodeVariable"] = req.CodeVariable;
            faraz["WarrantyLinkVariable"] = req.LinkVariable;
            root["Faraz"] = faraz;
        }, ct);
        return Ok(new { ok = true, message = pattern.Length > 0 ? "Warranty SMS pattern saved." : "Warranty SMS pattern removed; owners will not get the card SMS." });
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

    // Saves SMTP settings for the email verification channel. An empty password keeps the stored one.
    [HttpPost("email")]
    [RequestSizeLimit(4096)]
    public async Task<IActionResult> SaveEmail(EmailRequest req, CancellationToken ct)
    {
        var host = (req.Host ?? "").Trim();
        var from = (req.From ?? "").Trim();
        if (host.Length == 0 || host.Length > 253 ||
            !System.Text.RegularExpressions.Regex.IsMatch(host, @"^[A-Za-z0-9.](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d+)?$") ||
            !System.Text.RegularExpressions.Regex.IsMatch(from, @"^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,63}$"))
            return BadRequest(new { error = "Enter the SMTP host and a valid sender address." });
        var port = req.Port is < 1 or > 65535 ? 587 : req.Port;
        var user = (req.User ?? "").Trim();
        var password = string.IsNullOrWhiteSpace(req.Password) ? StoredEmailPassword() : req.Password;
        if (user.Length > 0 && (password == null || password.Length > 512))
            return BadRequest(new { error = "Enter the SMTP password for the user account, or leave the user empty." });

        var body = new JsonObject {
            ["Host"] = host, ["Port"] = port.ToString(), ["From"] = from,
            ["Name"] = (req.Name ?? "").Trim(), ["User"] = user,
            ["EnableSsl"] = req.EnableSsl ? "true" : "false",
        };
        if (!string.IsNullOrWhiteSpace(req.Password))
            body["ProtectedPassword"] = protection.CreateProtector(EmailProtector).Protect(req.Password);
        await Update(root => root["Email"] = body, ct);
        return Ok(new { ok = true, message = "Email settings saved." + (user.Length == 0 ? " No SMTP user set; the server must accept anonymous sending." : "") });
    }

    // Sends one real verification email to an address the administrator enters.
    [HttpPost("email/test")]
    [RequestSizeLimit(1024)]
    [EnableRateLimiting("sms-test")]
    public async Task<IActionResult> TestEmail(EmailTestRequest req, CancellationToken ct)
    {
        var to = (req.To ?? "").Trim();
        if (!System.Text.RegularExpressions.Regex.IsMatch(to, @"^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,63}$"))
            return BadRequest(new { error = "Enter a valid email address." });
        if (!email.Configured) return BadRequest(new { error = "Email sending is not configured." });
        var code = RandomNumberGenerator.GetInt32(0, 1000000).ToString("D6");
        try
        {
            await email.Send(to, code, "admin-test", ct);
            log.Add(to, "email-test", true);
            return Ok(new { ok = true, message = $"Test email submitted to {SmsLog.Mask(to)}." });
        }
        catch (ActivationError ex) { log.Add(to, "email-test", false, ex.Message); return StatusCode(ex.Status, new { error = ex.Message }); }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        { log.Add(to, "email-test", false, "Provider unreachable"); return StatusCode(503, new { error = "Could not reach the SMTP server." }); }
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
            var file = SmsSettingsFile.For(env);
            var root = System.IO.File.Exists(file) ? JsonNode.Parse(await System.IO.File.ReadAllTextAsync(file, ct))?.AsObject() ?? new JsonObject() : new JsonObject();
            change(root);
            await System.IO.File.WriteAllTextAsync(file + ".tmp", root.ToJsonString(), ct);
            System.IO.File.Move(file + ".tmp", file, overwrite: true);
            if (config is IConfigurationRoot reloadable) reloadable.Reload();
        } finally { Gate.Release(); }
    }
}
public record SmsRequest(string? Token, string Pattern, string Line, string CodeVariable, string? Mode = null, string? Endpoint = null);
static class FarazSection
{
    /// <summary>Carries the warranty-pattern keys over when the connection settings are replaced.</summary>
    public static JsonObject Keep(this JsonObject next, JsonObject root, params string[] keys)
    {
        if (root["Faraz"] is JsonObject old)
            foreach (var key in keys) if (old[key] is { } value) next[key] = value.DeepClone();
        return next;
    }
}
public record SmsWarrantyRequest(string? Pattern, string? CodeVariable, string? LinkVariable);
public record SmsPolicyRequest(bool Enabled, int OtpMinutes, int ResendSeconds, int DailyLimit);
public record SmsTestRequest(string Phone);
public record EmailRequest(string? Host, int? Port, string? From, string? Name, string? User, string? Password, bool EnableSsl = true);
public record EmailTestRequest(string? To);
