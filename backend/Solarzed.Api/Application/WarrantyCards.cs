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
    /// Sends the "warranty active" SMS with the gold card link, once per warranty. Best effort: a provider failure is
    /// logged and never undoes the activation or the review.
    /// </summary>
    public async Task Notify(WarrantyRegistration w, CancellationToken ct = default)
    {
        if (sms == null || w.Status != WarrantyStatus.Active || w.CardSentAt != null) return;
        EnsureKey(w);
        var link = $"{await Site()}/card#{w.Code}.{w.CardKey}";
        var phone = w.Phone;
        try { phone = PortalService.CanonicalPhone(w.Phone); } catch (ActivationError) { }
        try
        {
            if (!sms.WarrantyConfigured) { log?.Add(phone, "warranty-card", false, "Warranty SMS pattern is not set"); await db.SaveChangesAsync(ct); return; }
            await sms.SendWarranty(phone, w.Code, link, ct);
            w.CardSentAt = DateTime.UtcNow;
            log?.Add(phone, "warranty-card", true);
        }
        catch (ActivationError ex) { log?.Add(phone, "warranty-card", false, ex.Message); }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            log?.Add(phone, "warranty-card", false, "Provider unreachable");
            logger?.LogWarning("Warranty card SMS for {Code} could not reach the provider", w.Code);
        }
        await db.SaveChangesAsync(CancellationToken.None);
    }
}
