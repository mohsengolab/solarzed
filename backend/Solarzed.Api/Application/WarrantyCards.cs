using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Application;

/// <summary>The gold warranty card the owner opens from the SMS link or the VIN + mobile inquiry.</summary>
public record WarrantyCardView(string Code, string Owner, string Type, string? Product, string Make, string Model, string Plate,
    string VinMasked, DateOnly Installed, string Installer, string? Country, string[] Areas, string Status, string StatusLabel,
    CoveragePublic? Coverage, string Link);

/// <summary>
/// Gold cards: each warranty gets a random key, and {site}/card#{Code}.{Key} opens its card without signing in.
/// When a warranty becomes active (customer activation, or the counter approving an installer's photos) the owner
/// gets one SMS with the warranty number and that link.
/// </summary>
public class WarrantyCards(AppDbContext db, IActivationSmsSender? sms = null, SmsLog? log = null, ILogger<WarrantyCards>? logger = null)
{
    const string Alphabet = "abcdefghjkmnpqrstuvwxyz23456789";

    public static string NewKey() => new(Enumerable.Range(0, 10).Select(_ => Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)]).ToArray());

    public static bool KeyMatches(WarrantyRegistration w, string? key) => w.CardKey != null && key != null &&
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(w.CardKey), Encoding.UTF8.GetBytes(key.Trim().ToLowerInvariant()));

    async Task<string> Site()
    {
        var value = await db.CoverageSettings.Select(x => x.PublicSiteUrl).FirstOrDefaultAsync();
        try { return BoxLabelService.ValidateSite(value ?? "https://solarzed.com"); }
        catch (ActivationError) { return "https://solarzed.com"; }
    }

    /// <summary>Gives older warranties a card key the first time their card is needed (the caller saves).</summary>
    public static void EnsureKey(WarrantyRegistration w) => w.CardKey ??= NewKey();

    public async Task<WarrantyCardView> View(WarrantyRegistration w, string? site = null)
    {
        EnsureKey(w);
        site ??= await Site();
        var p = WarrantyService.ToPublic(w);
        var product = await db.BoxLabels.AsNoTracking().Where(b => b.Id == w.FilmSerial).Select(b => b.Product).FirstOrDefaultAsync();
        return new(w.Code, w.Owner, p.Type, product, w.Make, w.Model, w.Plate, p.VinMasked, w.Installed, w.Installer, w.Country,
            JsonSerializer.Deserialize<string[]>(w.AreasJson) ?? [], p.Status, p.StatusLabel, p.Coverage, $"{site}/card#{w.Code}.{w.CardKey}");
    }

    /// <summary>
    /// Sends the "warranty active" SMS with the gold card link, once per warranty (<paramref name="force"/> sends it
    /// again). Best effort: a provider failure is logged and never undoes the activation or the review.
    /// Returns null when the SMS went out (or had already gone out), otherwise why it did not.
    /// </summary>
    public async Task<string?> Notify(WarrantyRegistration w, CancellationToken ct = default, bool force = false)
    {
        if (sms == null) return "SMS is not available.";
        if (w.Status != WarrantyStatus.Active) return "The warranty is not active yet.";
        if (w.CardSentAt != null && !force) return null;
        EnsureKey(w);
        var link = $"{await Site()}/card#{w.Code}.{w.CardKey}";
        var phone = w.Phone;
        try { phone = PortalService.CanonicalPhone(w.Phone); } catch (ActivationError) { }
        string? error = null;
        try
        {
            if (!sms.WarrantyConfigured) error = "The warranty SMS pattern is not set.";
            else
            {
                await sms.SendWarranty(phone, w.Code, link, ct);
                w.CardSentAt = DateTime.UtcNow;
            }
        }
        catch (ActivationError ex) { error = ex.Message; }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            error = "The SMS provider could not be reached.";
            logger?.LogWarning("Warranty card SMS for {Code} could not reach the provider", w.Code);
        }
        log?.Add(phone, "warranty-card", error == null, error);
        await db.SaveChangesAsync(CancellationToken.None);
        return error;
    }

    /// <summary>Sends the card SMS to active warranties that never got it (e.g. approved before the pattern was set).</summary>
    public async Task<(int Sent, int Failed, string? Error)> NotifyUnsent(int limit, CancellationToken ct = default)
    {
        if (sms is not { WarrantyConfigured: true }) return (0, 0, "The warranty SMS pattern is not set.");
        var rows = await db.WarrantyRegistrations.Where(w => w.Status == WarrantyStatus.Active && w.CardSentAt == null)
            .OrderBy(w => w.ReviewedAt).Take(limit).ToListAsync(ct);
        int sent = 0, failed = 0; string? last = null;
        foreach (var w in rows)
        {
            if (ct.IsCancellationRequested) break;
            if (await Notify(w, ct) is { } error) { failed++; last = error; } else sent++;
        }
        return (sent, failed, last);
    }
}
