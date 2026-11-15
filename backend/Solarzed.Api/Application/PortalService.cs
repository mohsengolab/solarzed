using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Application;

/// <summary>Sign-in for representatives, shops and customers on the public site: mobile number or email + verification code.</summary>
public static class PortalAuth
{
    public const string Scheme = "Portal";
    public const string Cookie = "sz_portal";
    public const string Audience = "solarzed-portal";
    public const string PhoneClaim = "phone";
    public const string EmailClaim = "email";
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);

    public static string? Phone(ClaimsPrincipal? user) => user?.FindFirst(PhoneClaim)?.Value;
    public static string? Email(ClaimsPrincipal? user) => user?.FindFirst(EmailClaim)?.Value;
    public static int? Id(ClaimsPrincipal? user) =>
        int.TryParse(user?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value ?? user?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    public static string Token(PortalUser user, string key) => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
        issuer: AdminAuth.Issuer, audience: Audience,
        claims: [
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            .. (user.Phone is { } phone ? new[] { new Claim(PhoneClaim, phone) } : Array.Empty<Claim>()),
            .. (user.Email is { } email ? new[] { new Claim(EmailClaim, email) } : Array.Empty<Claim>()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))],
        notBefore: DateTime.UtcNow, expires: DateTime.UtcNow.Add(Lifetime),
        signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256)));
}

public record PortalMe(string? Phone, string? Email, string? Name, string? FirstName, string? LastName, string? Country, string? City, string? Job);

public class PortalService(AppDbContext db, IActivationSmsSender sms, IEmailSender? email = null, IConfiguration? config = null, SmsLog? log = null)
{
    static readonly Regex Iranian = new(@"^(?:\+98|0098|98|0)?(9\d{9})$");
    static readonly Regex EmailRx = new(@"^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,63}$");

    /// <summary>One spelling per mobile, so 0912…, +98912… and ۰۹۱۲… all name the same account.</summary>
    public static string CanonicalPhone(string? raw)
    {
        var phone = WarrantyService.NormalizePhone((raw ?? "").Trim());
        var ir = Iranian.Match(phone);
        if (ir.Success) return "0" + ir.Groups[1].Value;
        if (!Regex.IsMatch(phone, @"^\+?\d{7,15}$")) throw new ActivationError(400, "Enter a valid mobile number.");
        return phone;
    }

    public static string CanonicalEmail(string? raw)
    {
        var email = (raw ?? "").Trim().ToLowerInvariant();
        if (!EmailRx.IsMatch(email) || email.Length > 254) throw new ActivationError(400, "Enter a valid email address.");
        return email;
    }

    /// <summary>Spellings a mobile may have been stored with before canonicalisation.</summary>
    public static string[] PhoneVariants(string canonical) => canonical.StartsWith("09") && canonical.Length == 11
        ? [canonical, "+98" + canonical[1..], "98" + canonical[1..], "0098" + canonical[1..]]
        : [canonical];

    public SmsPolicy Policy => SmsPolicy.From(config);

    public Task<LoginChallenge> SendCode(string rawIdentifier, CancellationToken ct) => SendCode(rawIdentifier, "sms", ct);

    /// <summary>Sends a sign-in code by SMS (mobile) or email.</summary>
    public async Task<LoginChallenge> SendCode(string rawIdentifier, string channel, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var policy = Policy;
        LoginChallenge challenge;
        if (channel == "email")
        {
            var emailTo = CanonicalEmail(rawIdentifier);
            if (await db.PortalUsers.AnyAsync(x => x.Email == emailTo && !x.Active, ct))
                throw new ActivationError(403, "This account is disabled. Please contact Solarzed support.");
            if (email == null || !email.Configured) throw new ActivationError(503, "Email verification is not configured. Please use SMS sign-in or contact Solarzed support.");
            await Limit(emailTo, now, policy, ct);
            var code = RandomNumberGenerator.GetInt32(0, 1000000).ToString("D6");
            challenge = new LoginChallenge { Id = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)), Email = emailTo,
                CodeHash = BCrypt.Net.BCrypt.HashPassword(code), CreatedAt = now, ExpiresAt = now.AddMinutes(policy.OtpMinutes) };
            db.LoginChallenges.Add(challenge);
            await db.SaveChangesAsync(ct);
            try { await email.Send(emailTo, code, challenge.Id, ct); log?.Add(emailTo, "login", true); }
            catch (ActivationError ex) { log?.Add(emailTo, "login", false, ex.Message); throw; }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or InvalidOperationException)
            { log?.Add(emailTo, "login", false, "Provider unreachable"); throw new ActivationError(503, "The email provider is unavailable. Please try again later."); }
            challenge.Sent = true;
            challenge.Revision++;
            await db.SaveChangesAsync(ct);
            return challenge;
        }
        var phone = CanonicalPhone(rawIdentifier);
        var existing = await db.PortalUsers.AsNoTracking().FirstOrDefaultAsync(x => x.Phone == phone, ct);
        if (existing is { Active: false }) throw new ActivationError(403, "This account is disabled. Please contact Solarzed support.");
        if (!sms.Configured) throw new ActivationError(503, "SMS verification is not configured. Please contact Solarzed support.");
        await Limit(phone, now, policy, ct);
        var smsCode = RandomNumberGenerator.GetInt32(0, 1000000).ToString("D6");
        challenge = new LoginChallenge { Id = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)), Phone = phone,
            CodeHash = BCrypt.Net.BCrypt.HashPassword(smsCode), CreatedAt = now, ExpiresAt = now.AddMinutes(policy.OtpMinutes) };
        // Reserve the send before contacting the provider; failed sends are never verifiable.
        db.LoginChallenges.Add(challenge);
        await db.SaveChangesAsync(ct);
        try { await sms.Send(phone, smsCode, challenge.Id, ct); log?.Add(phone, "login", true); }
        catch (ActivationError ex) { log?.Add(phone, "login", false, ex.Message); throw; }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        { log?.Add(phone, "login", false, "Provider unreachable"); throw new ActivationError(503, "The SMS provider is unavailable. Please try again later."); }
        challenge.Sent = true;
        challenge.Revision++;
        await db.SaveChangesAsync(ct);
        return challenge;
    }

    /// <summary>Same code flow as sign-in, but the identifier is then attached to the signed-in account.</summary>
    public async Task<LoginChallenge> SendBindCode(PortalUser me, string rawIdentifier, string channel, CancellationToken ct)
    {
        var identifier = channel == "email" ? CanonicalEmail(rawIdentifier) : CanonicalPhone(rawIdentifier);
        var taken = await db.PortalUsers.AsNoTracking()
            .AnyAsync(x => x.Id != me.Id && (channel == "email" ? x.Email == identifier : x.Phone == identifier), ct);
        if (taken) throw new ActivationError(409, channel == "email"
            ? "This email is already linked to another account."
            : "This mobile number is already linked to another account.");
        return await SendCode(identifier, channel, ct);
    }

    /// <summary>Resend and daily limits, counted per identifier regardless of the channel.</summary>
    async Task Limit(string identifier, DateTime now, SmsPolicy policy, CancellationToken ct)
    {
        if (await db.LoginChallenges.AnyAsync(x => (x.Phone == identifier || x.Email == identifier) && x.CreatedAt > now.AddSeconds(-policy.ResendSeconds), ct))
            throw new ActivationError(429, $"Please wait {policy.ResendSeconds} seconds before requesting another code.");
        if (await db.LoginChallenges.CountAsync(x => (x.Phone == identifier || x.Email == identifier) && x.CreatedAt > now.AddDays(-1), ct) >= policy.DailyLimit)
            throw new ActivationError(429, "The daily verification message limit was reached. Please try tomorrow.");
    }

    public async Task<PortalUser> Verify(string challengeId, string? code)
    {
        var challenge = await db.LoginChallenges.SingleOrDefaultAsync(x => x.Id == challengeId);
        if (challenge == null || !challenge.Sent || challenge.Consumed) throw new ActivationError(400, "Request a verification code first.");
        if (challenge.ExpiresAt <= DateTime.UtcNow) throw new ActivationError(410, "The verification code expired. Request a new code.");
        if (challenge.Attempts >= 5) throw new ActivationError(429, "Too many incorrect codes. Request a new verification code.");
        var latest = await db.LoginChallenges.Where(x => (x.Phone == challenge.Phone || x.Email == challenge.Email) && x.Sent)
            .OrderByDescending(x => x.CreatedAt).Select(x => x.Id).FirstAsync();
        if (latest != challenge.Id) throw new ActivationError(400, "Use the most recent verification code.");
        if (!Regex.IsMatch(code ?? "", "^[0-9]{6}$") || !BCrypt.Net.BCrypt.Verify(code, challenge.CodeHash))
        {
            challenge.Attempts++;
            challenge.Revision++;
            await db.SaveChangesAsync();
            throw new ActivationError(400, "The verification code is incorrect.");
        }
        challenge.Consumed = true;
        challenge.Revision++;
        var user = await Ensure(challenge);
        if (!user.Active) throw new ActivationError(403, "This account is disabled. Please contact Solarzed support.");
        user.LastLoginAt = DateTime.UtcNow;
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateConcurrencyException) { throw new ActivationError(409, "This code was already used. Request a new code."); }
        return user;
    }

    /// <summary>Checks a code without creating an account, then attaches the verified identifier to an existing one.</summary>
    public async Task<PortalUser> VerifyBind(PortalUser me, string challengeId, string? code)
    {
        var challenge = await db.LoginChallenges.SingleOrDefaultAsync(x => x.Id == challengeId);
        if (challenge == null || !challenge.Sent || challenge.Consumed) throw new ActivationError(400, "Request a verification code first.");
        if (challenge.ExpiresAt <= DateTime.UtcNow) throw new ActivationError(410, "The verification code expired. Request a new code.");
        if (challenge.Attempts >= 5) throw new ActivationError(429, "Too many incorrect codes. Request a new verification code.");
        if (!Regex.IsMatch(code ?? "", "^[0-9]{6}$") || !BCrypt.Net.BCrypt.Verify(code, challenge.CodeHash))
        {
            challenge.Attempts++;
            challenge.Revision++;
            await db.SaveChangesAsync();
            throw new ActivationError(400, "The verification code is incorrect.");
        }
        challenge.Consumed = true;
        challenge.Revision++;
        var identifier = challenge.Phone ?? challenge.Email!;
        var taken = await db.PortalUsers.AsNoTracking().AnyAsync(x => x.Id != me.Id && (x.Phone == identifier || x.Email == identifier));
        if (taken) throw new ActivationError(409, "This contact is already linked to another account.");
        if (challenge.Phone != null) me.Phone = challenge.Phone; else me.Email = challenge.Email;
        await db.SaveChangesAsync();
        return me;
    }

    /// <summary>Finds or creates (unsaved) the account for a canonical mobile; a given name fills an empty one.</summary>
    public async Task<PortalUser> Ensure(string phone, string? name)
    {
        var user = db.PortalUsers.Local.FirstOrDefault(x => x.Phone == phone) ?? await db.PortalUsers.FirstOrDefaultAsync(x => x.Phone == phone);
        if (user == null) { user = new PortalUser { Phone = phone }; db.PortalUsers.Add(user); }
        if (!string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(user.Name)) user.Name = name.Trim();
        return user;
    }

    /// <summary>Finds or creates (unsaved) the account a challenge identifies: by mobile or by email.</summary>
    public async Task<PortalUser> Ensure(LoginChallenge challenge)
    {
        var user = challenge.Phone is { } phone
            ? db.PortalUsers.Local.FirstOrDefault(x => x.Phone == phone) ?? await db.PortalUsers.FirstOrDefaultAsync(x => x.Phone == phone)
            : db.PortalUsers.Local.FirstOrDefault(x => x.Email == challenge.Email) ?? await db.PortalUsers.FirstOrDefaultAsync(x => x.Email == challenge.Email);
        if (user == null) { user = new PortalUser { Phone = challenge.Phone, Email = challenge.Email }; db.PortalUsers.Add(user); }
        return user;
    }

    public async Task<PortalUser?> ById(int id) => await db.PortalUsers.FirstOrDefaultAsync(x => x.Id == id);

    public async Task<PortalMe?> Me(string? phone)
    {
        if (phone == null) return null;
        var user = await db.PortalUsers.AsNoTracking().FirstOrDefaultAsync(x => x.Phone == phone && x.Active);
        return user == null ? null : Shape(user);
    }

    public static PortalMe Shape(PortalUser user) =>
        new(user.Phone, user.Email, user.Name, user.FirstName, user.LastName, user.Country, user.City, user.Job);

    /// <summary>Saves the self-service profile; empty strings clear a field.</summary>
    public static void ApplyProfile(PortalUser user, PortalProfileRequest req)
    {
        user.FirstName = Clean(req.FirstName, 100);
        user.LastName = Clean(req.LastName, 100);
        user.Country = Clean(req.Country, 100);
        user.City = Clean(req.City, 100);
        user.Job = Clean(req.Job, 100);
        var name = (req.Name ?? "").Trim();
        if (name.Length > 0) user.Name = name.Length > 200 ? name[..200] : name;
    }

    static string? Clean(string? value, int max)
    {
        var text = (value ?? "").Trim();
        if (text.Length == 0) return null;
        return text.Length > max ? text[..max] : text;
    }

    public async Task<WarrantyPublic[]> Warranties(string phone)
    {
        var variants = PhoneVariants(phone);
        var rows = await db.WarrantyRegistrations.AsNoTracking().Where(x => variants.Contains(x.Phone))
            .OrderByDescending(x => x.CreatedAt).Take(100).ToListAsync();
        return rows.Select(WarrantyService.ToPublic).ToArray();
    }
}

public record PortalProfileRequest(string? FirstName, string? LastName, string? Country, string? City, string? Job, string? Name);
