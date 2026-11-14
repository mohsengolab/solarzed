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

/// <summary>Sign-in for representatives, shops and customers on the public site: mobile number + SMS code.</summary>
public static class PortalAuth
{
    public const string Scheme = "Portal";
    public const string Cookie = "sz_portal";
    public const string Audience = "solarzed-portal";
    public const string PhoneClaim = "phone";
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(30);

    public static string? Phone(ClaimsPrincipal? user) => user?.FindFirst(PhoneClaim)?.Value;

    public static string Token(PortalUser user, string key) => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
        issuer: AdminAuth.Issuer, audience: Audience,
        claims: [new Claim(PhoneClaim, user.Phone), new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))],
        notBefore: DateTime.UtcNow, expires: DateTime.UtcNow.Add(Lifetime),
        signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256)));
}

public record PortalMe(string Phone, string? Name);

public class PortalService(AppDbContext db, IActivationSmsSender sms, IConfiguration? config = null, SmsLog? log = null)
{
    static readonly Regex Iranian = new(@"^(?:\+98|0098|98|0)?(9\d{9})$");

    /// <summary>One spelling per mobile, so 0912…, +98912… and ۰۹۱۲… all name the same account.</summary>
    public static string CanonicalPhone(string? raw)
    {
        var phone = WarrantyService.NormalizePhone((raw ?? "").Trim());
        var ir = Iranian.Match(phone);
        if (ir.Success) return "0" + ir.Groups[1].Value;
        if (!Regex.IsMatch(phone, @"^\+?\d{7,15}$")) throw new ActivationError(400, "Enter a valid mobile number.");
        return phone;
    }

    /// <summary>Spellings a mobile may have been stored with before canonicalisation.</summary>
    public static string[] PhoneVariants(string canonical) => canonical.StartsWith("09") && canonical.Length == 11
        ? [canonical, "+98" + canonical[1..], "98" + canonical[1..], "0098" + canonical[1..]]
        : [canonical];

    public SmsPolicy Policy => SmsPolicy.From(config);

    public async Task<LoginChallenge> SendCode(string rawPhone, CancellationToken ct)
    {
        var phone = CanonicalPhone(rawPhone);
        var existing = await db.PortalUsers.AsNoTracking().FirstOrDefaultAsync(x => x.Phone == phone, ct);
        if (existing is { Active: false }) throw new ActivationError(403, "This account is disabled. Please contact Solarzed support.");
        if (!sms.Configured) throw new ActivationError(503, "SMS verification is not configured. Please contact Solarzed support.");
        var now = DateTime.UtcNow;
        var policy = Policy;
        if (await db.LoginChallenges.AnyAsync(x => x.Phone == phone && x.CreatedAt > now.AddSeconds(-policy.ResendSeconds), ct))
            throw new ActivationError(429, $"Please wait {policy.ResendSeconds} seconds before requesting another code.");
        if (await db.LoginChallenges.CountAsync(x => x.Phone == phone && x.CreatedAt > now.AddDays(-1), ct) >= policy.DailyLimit)
            throw new ActivationError(429, "The daily verification message limit was reached. Please try tomorrow.");
        var code = RandomNumberGenerator.GetInt32(0, 1000000).ToString("D6");
        var challenge = new LoginChallenge { Id = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)), Phone = phone,
            CodeHash = BCrypt.Net.BCrypt.HashPassword(code), CreatedAt = now, ExpiresAt = now.AddMinutes(policy.OtpMinutes) };
        // Reserve the send before contacting the provider; failed sends are never verifiable.
        db.LoginChallenges.Add(challenge);
        await db.SaveChangesAsync(ct);
        try { await sms.Send(phone, code, challenge.Id, ct); log?.Add(phone, "login", true); }
        catch (ActivationError ex) { log?.Add(phone, "login", false, ex.Message); throw; }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        { log?.Add(phone, "login", false, "Provider unreachable"); throw new ActivationError(503, "The SMS provider is unavailable. Please try again later."); }
        challenge.Sent = true;
        challenge.Revision++;
        await db.SaveChangesAsync(ct);
        return challenge;
    }

    public async Task<PortalUser> Verify(string challengeId, string? code)
    {
        var challenge = await db.LoginChallenges.SingleOrDefaultAsync(x => x.Id == challengeId);
        if (challenge == null || !challenge.Sent || challenge.Consumed) throw new ActivationError(400, "Request a verification code first.");
        if (challenge.ExpiresAt <= DateTime.UtcNow) throw new ActivationError(410, "The verification code expired. Request a new code.");
        if (challenge.Attempts >= 5) throw new ActivationError(429, "Too many incorrect codes. Request a new verification code.");
        var latest = await db.LoginChallenges.Where(x => x.Phone == challenge.Phone && x.Sent)
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
        var user = await Ensure(challenge.Phone, null);
        if (!user.Active) throw new ActivationError(403, "This account is disabled. Please contact Solarzed support.");
        user.LastLoginAt = DateTime.UtcNow;
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateConcurrencyException) { throw new ActivationError(409, "This code was already used. Request a new code."); }
        return user;
    }

    /// <summary>Finds or creates (unsaved) the account for a canonical mobile; a given name fills an empty one.</summary>
    public async Task<PortalUser> Ensure(string phone, string? name)
    {
        var user = db.PortalUsers.Local.FirstOrDefault(x => x.Phone == phone) ?? await db.PortalUsers.FirstOrDefaultAsync(x => x.Phone == phone);
        if (user == null) { user = new PortalUser { Phone = phone }; db.PortalUsers.Add(user); }
        if (!string.IsNullOrWhiteSpace(name) && string.IsNullOrWhiteSpace(user.Name)) user.Name = name.Trim();
        return user;
    }

    public async Task<PortalMe?> Me(string? phone)
    {
        if (phone == null) return null;
        var user = await db.PortalUsers.AsNoTracking().FirstOrDefaultAsync(x => x.Phone == phone && x.Active);
        return user == null ? null : new(user.Phone, user.Name);
    }

    public async Task<WarrantyPublic[]> Warranties(string phone)
    {
        var variants = PhoneVariants(phone);
        var rows = await db.WarrantyRegistrations.AsNoTracking().Where(x => variants.Contains(x.Phone))
            .OrderByDescending(x => x.CreatedAt).Take(100).ToListAsync();
        return rows.Select(WarrantyService.ToPublic).ToArray();
    }
}
