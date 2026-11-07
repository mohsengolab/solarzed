using System.Collections.Concurrent;

namespace Solarzed.Api.Application;

// Operational SMS rules editable from the admin SMS panel (stored in .local-sms.json, section "Sms").
public record SmsPolicy(bool Enabled, int OtpMinutes, int ResendSeconds, int DailyLimit)
{
    public static SmsPolicy From(IConfiguration? c) => new(
        !string.Equals(c?["Sms:Enabled"], "false", StringComparison.OrdinalIgnoreCase),
        Clamp(c?["Sms:OtpMinutes"], 5, 2, 15),
        Clamp(c?["Sms:ResendSeconds"], 60, 30, 600),
        Clamp(c?["Sms:DailyLimit"], 10, 1, 50));

    static int Clamp(string? value, int fallback, int min, int max) =>
        int.TryParse(value, out var v) ? Math.Clamp(v, min, max) : fallback;
}

public record SmsLogEntry(DateTime At, string Phone, string Purpose, bool Ok, string? Error);

// In-memory record of recent send attempts (masked numbers, no codes). Cleared on restart.
public class SmsLog
{
    const int Capacity = 100;
    readonly ConcurrentQueue<SmsLogEntry> entries = new();

    public static string Mask(string phone) =>
        phone.Length <= 6 ? new string('•', phone.Length) : phone[..4] + new string('•', phone.Length - 7) + phone[^3..];

    public void Add(string phone, string purpose, bool ok, string? error = null)
    {
        entries.Enqueue(new SmsLogEntry(DateTime.UtcNow, Mask(phone), purpose, ok, error));
        while (entries.Count > Capacity && entries.TryDequeue(out _)) { }
    }

    public IReadOnlyList<SmsLogEntry> Recent() => entries.Reverse().ToList();
}
