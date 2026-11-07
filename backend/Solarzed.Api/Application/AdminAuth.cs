using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace Solarzed.Api.Application;

public static class AdminAuth
{
    public const string Cookie = "sz_admin";
    public const string Issuer = "solarzed-api";
    public const string Audience = "solarzed-admin";
    public const string StampClaim = "pwv";
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(8);

    // A short fingerprint of the password hash. Changing the password changes the
    // stamp, which revokes every token issued before the change.
    public static string Stamp(string passwordHash) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(passwordHash)))[..16];

    // Verified against unknown usernames so response time does not reveal which usernames exist.
    public static readonly string DummyHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString());
}

// Per-username lockout on top of the per-IP rate limiter, so distributed guessing
// against one account is also slowed down.
public class LoginThrottle(TimeProvider clock)
{
    public const int MaxFailures = 5;
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(15);
    readonly ConcurrentDictionary<string, (int Count, DateTimeOffset First)> failures = new();

    static string Key(string user) => user.Trim().ToLowerInvariant();

    public bool Locked(string user, out TimeSpan retryAfter)
    {
        retryAfter = TimeSpan.Zero;
        if (!failures.TryGetValue(Key(user), out var f)) return false;
        var elapsed = clock.GetUtcNow() - f.First;
        if (elapsed > Window) { failures.TryRemove(Key(user), out _); return false; }
        if (f.Count < MaxFailures) return false;
        retryAfter = Window - elapsed;
        return true;
    }

    public void Fail(string user)
    {
        var now = clock.GetUtcNow();
        failures.AddOrUpdate(Key(user), _ => (1, now), (_, f) => now - f.First > Window ? (1, now) : (f.Count + 1, f.First));
        if (failures.Count > 10_000) // bound memory under username spraying
            foreach (var stale in failures.Where(x => now - x.Value.First > Window).Select(x => x.Key).ToList())
                failures.TryRemove(stale, out _);
    }

    public void Succeed(string user) => failures.TryRemove(Key(user), out _);
}
