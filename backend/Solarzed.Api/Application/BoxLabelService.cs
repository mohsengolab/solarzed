using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Application;

public class ActivationError(int status, string message) : Exception(message) { public int Status => status; }
public record LabelView(string Id, string RollId, string Product, string Type, int FilmYears, int? InstallYears,
    DateTime CreatedAt, DateTime? ActivatedAt, string? WarrantyCode, string ActivationUrl, string? Holder, string? HolderPhone, DateTime? HeldSince,
    string? FactoryCode, string? CardCode, string? FullCode);
public record LabelSerialView(string Id, string RollId, string Product, string Type, DateTime CreatedAt, DateTime? ActivatedAt, string? Holder, string? HolderPhone, DateTime? HeldSince);
public record ActivationInfo(string Id, string Product, string Type, bool Activated, int FilmYears, int? InstallYears, bool SmsAvailable, bool Released,
    string? FactoryCode, string? WarrantyCode);
public record ActivateBoxRequest(string Token, RegisterRequest Registration);

/// <summary>
/// Every carton gets two printed items: a barcode of the box serial on the outside (used to hand the carton
/// from the company to representatives and onward), and a warranty card inside the box whose QR holds the
/// card code Factory-Serial-Warranty. Only the person who opens the box can activate its warranty.
/// </summary>
public class BoxLabelService(AppDbContext db, IDataProtectionProvider protection, IActivationSmsSender sms, IConfiguration? config = null)
{
    readonly IDataProtector protector = protection.CreateProtector("Solarzed.BoxLabels.v1");
    static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    static readonly Regex TokenPattern = new("^[a-fA-F0-9]{64}$");
    static readonly Regex FactoryPattern = new("^[A-Z]{1,4}$");
    static readonly Regex CardPattern = new(@"^([A-Z]{1,4})-(SZB-[0-9A-F]{16})-(SZ-[A-Z0-9]{6,29})$");

    public static string? FullCode(BoxLabel label) =>
        label.FactoryCode != null && label.CardCode != null ? $"{label.FactoryCode}-{label.Id}-{label.CardCode}" : null;

    public static string NormalizeFactory(string? raw)
    {
        var value = (raw ?? "").Trim().ToUpperInvariant();
        if (!FactoryPattern.IsMatch(value)) throw new ActivationError(400, "Factory code must be 1–4 English letters, for example SA or BF.");
        return value;
    }

    public static string ValidateSite(string value)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != "https" || uri.IsLoopback ||
            !string.IsNullOrEmpty(uri.UserInfo) || uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment) || uri.HostNameType != UriHostNameType.Dns || !uri.Host.Contains('.'))
            throw new ActivationError(400, "Enter the public HTTPS site origin, for example https://solarzed.com.");
        return uri.GetLeftPart(UriPartial.Authority);
    }

    public async Task<string> Site()
    {
        var value = await db.CoverageSettings.Select(x => x.PublicSiteUrl).FirstOrDefaultAsync();
        return ValidateSite(value ?? "https://solarzed.com");
    }

    // New cards encode the card code itself; labels issued before card codes keep their original random token.
    public LabelView View(BoxLabel label, string site) => new(label.Id, label.RollId, label.Product,
        label.Type.ToString().ToLowerInvariant(), label.FilmYears, label.InstallYears, label.CreatedAt,
        label.ActivatedAt, label.WarrantyCode, $"{site}/activate#{FullCode(label) ?? protector.Unprotect(label.ProtectedToken)}",
        label.Holder, label.HolderPhone, label.HeldSince, label.FactoryCode, label.CardCode, FullCode(label));

    // The carton role may only see the serial printed on the box: no QR, no card code and no warranty code.
    public static LabelSerialView Restricted(BoxLabel label) => new(label.Id, label.RollId, label.Product,
        label.Type.ToString().ToLowerInvariant(), label.CreatedAt, label.ActivatedAt, label.Holder, label.HolderPhone, label.HeldSince);

    public async Task<LabelView[]> Issue(string rollId, int quantity, string? factoryCode)
    {
        if (quantity is < 1 or > 200) throw new ActivationError(400, "Quantity must be 1–200 boxes.");
        var factory = NormalizeFactory(factoryCode);
        var roll = await db.Rolls.FindAsync(rollId) ?? throw new ActivationError(404, "Roll not found.");
        if (roll.Qc != RollQc.Approved || roll.Status == RollStatus.Void)
            throw new ActivationError(409, "Only QC-approved, non-void products can have box labels.");
        var setting = await db.CoverageSettings.FirstOrDefaultAsync() ?? new CoverageSetting();
        int? film = roll.Type == WarrantyType.Tint ? setting.TintFilmYears : setting.PpfFilmYears;
        int? install = roll.Type == WarrantyType.Tint ? setting.TintInstallYears : setting.PpfInstallYears;
        if (film is not (3 or 5 or 7 or 10) || install is not (null or 1 or 2 or 3))
            throw new ActivationError(400, "Set the approved film and installation periods in Settings before issuing labels.");
        var site = await Site();
        var labels = Enumerable.Range(0, quantity).Select(_ =>
        {
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
            return new BoxLabel { Id = "SZB-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8)),
                TokenHash = Hash(token), ProtectedToken = protector.Protect(token), RollId = roll.Id,
                Product = roll.ModelCode, Type = roll.Type, FilmYears = film.Value, InstallYears = install,
                FactoryCode = factory, CardCode = WarrantyService.GenerateCode(setting.WarrantyCodeLength) };
        }).ToArray();
        db.BoxLabels.AddRange(labels);
        await db.SaveChangesAsync();
        return labels.Select(x => View(x, site)).ToArray();
    }

    static void Eligible(Roll roll)
    {
        if (roll.Qc != RollQc.Approved || roll.Status is not (RollStatus.Shipped or RollStatus.Consumed))
            throw new ActivationError(409, "The product must pass QC and be released for distribution before customer activation.");
    }

    /// <summary>Accepts the card code (Factory-Serial-Warranty, scanned or typed) or a legacy 64-hex label token.</summary>
    async Task<BoxLabel> Find(string token)
    {
        var value = Regex.Replace(token ?? "", @"\s+", "");
        if (TokenPattern.IsMatch(value))
        {
            var hash = Hash(value);
            return await db.BoxLabels.SingleOrDefaultAsync(x => x.TokenHash == hash)
                ?? throw new ActivationError(404, "This activation label is invalid.");
        }
        var card = CardPattern.Match(value.ToUpperInvariant());
        if (!card.Success) throw new ActivationError(404, "This activation label is invalid.");
        var label = await db.BoxLabels.SingleOrDefaultAsync(x => x.Id == card.Groups[2].Value);
        // The warranty part is the secret printed only inside the box; compare it in constant time.
        if (label?.CardCode == null || label.FactoryCode != card.Groups[1].Value ||
            !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(label.CardCode), Encoding.UTF8.GetBytes(card.Groups[3].Value)))
            throw new ActivationError(404, "This activation label is invalid.");
        return label;
    }

    public async Task<ActivationInfo> Info(string token)
    {
        var label = await Find(token);
        var roll = await db.Rolls.FindAsync(label.RollId);
        var released = roll?.Qc == RollQc.Approved && roll.Status is RollStatus.Shipped or RollStatus.Consumed;
        return new(label.Id, label.Product, label.Type.ToString().ToLowerInvariant(), label.ActivatedAt.HasValue,
            label.FilmYears, label.InstallYears, sms.Configured, released, label.FactoryCode, label.CardCode);
    }

    public SmsPolicy Policy => SmsPolicy.From(config);

    /// <summary>
    /// Registers the warranty for the signed-in mobile. The mobile was verified by SMS when the customer signed in,
    /// so the registration phone is always the session's, never the form's.
    /// </summary>
    public async Task<WarrantyPublic> Activate(ActivateBoxRequest req, string phone)
    {
        var label = await Find(req.Token);
        if (label.ActivatedAt.HasValue) throw new ActivationError(409, "This box warranty has already been activated.");
        var roll = await db.Rolls.FindAsync(label.RollId) ?? throw new ActivationError(409, "Product unavailable.");
        Eligible(roll);
        // Product type/serial are always server-bound, never trusted from the form.
        var request = req.Registration with { Type = label.Type.ToString().ToLowerInvariant(), FilmSerial = label.Id, Phone = phone };
        var coverage = await db.CoverageSettings.AsNoTracking().FirstOrDefaultAsync();
        var (error, entity) = WarrantyService.Validate(request, coverage?.WarrantyCodeLength ?? 16);
        if (error != null) throw new ActivationError(400, error);
        // Honor the existing database field sizes.
        if (request.Make.Length > 100 || request.Model.Length > 100 || request.Owner.Length > 200 ||
            request.Plate.Length > 20 || request.InvoiceNumber.Length > 60 || request.SellerName.Length > 200 || request.Installer.Length > 200)
            throw new ActivationError(400, "One or more fields are too long.");
        var registration = entity!;
        // The warranty number printed on the card becomes the warranty code.
        if (label.CardCode != null && !await db.WarrantyRegistrations.AnyAsync(x => x.Code == label.CardCode))
            registration.Code = label.CardCode;
        registration.RollId = roll.Id;
        registration.Status = WarrantyStatus.Active;
        registration.ReviewedAt = DateTime.UtcNow;
        registration.ReviewNote = "Customer activation by a signed-in, SMS-verified mobile with the warranty card from the box.";
        registration.FilmEnds = WarrantyService.AddYears(registration.Installed, label.FilmYears);
        registration.InstallEnds = label.InstallYears is int years ? WarrantyService.AddYears(registration.Installed, years) : null;
        registration.FlagsJson = JsonSerializer.Serialize(await db.WarrantyRegistrations.AnyAsync(x => x.Vin == registration.Vin && x.Type == registration.Type && x.Status != WarrantyStatus.Rejected) ? new[] { "vin_repeat" } : Array.Empty<string>());
        var now = DateTime.UtcNow;
        // The carton's journey ends with the customer who activated it.
        db.BoxTransfers.Add(new BoxTransfer { LabelId = label.Id, BatchId = "ACT-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8)),
            FromHolder = label.Holder, FromPhone = label.HolderPhone, ToHolder = registration.Owner, ToPhone = phone,
            Note = "Warranty activated", Actor = "customer:" + phone, At = now });
        label.WarrantyCode = registration.Code;
        label.ActivatedAt = now;
        label.Holder = registration.Owner;
        label.HolderPhone = phone;
        label.HeldSince = now;
        label.Revision++;
        db.WarrantyRegistrations.Add(registration);
        AuditLog.Add(db, "customer:" + phone, "warranty", registration.Code, "activated", AuditLog.Diff(
            ("status", null, registration.Status), ("label", null, label.Id), ("roll", null, roll.Id),
            ("filmEnds", null, registration.FilmEnds), ("installEnds", null, registration.InstallEnds), ("flags", null, registration.FlagsJson)));
        try { await db.SaveChangesAsync(); }
        // A concurrent winner trips either the label revision guard or the unique serial/warranty indexes.
        catch (DbUpdateException) { throw new ActivationError(409, "This box was already activated. Refresh and try again."); }
        // EF's single SaveChanges transaction commits the label, transfer and warranty atomically.
        return WarrantyService.ToPublic(registration);
    }
}
