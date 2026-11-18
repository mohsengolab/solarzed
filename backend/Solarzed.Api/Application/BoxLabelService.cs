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
    string? FactoryCode, string? CardCode, string? FullCode, decimal? RemainingLengthM);
public record LabelSerialView(string Id, string RollId, string Product, string Type, DateTime CreatedAt, DateTime? ActivatedAt, string? Holder, string? HolderPhone, DateTime? HeldSince);
public record ActivationInfo(string Id, string Product, string Type, bool Activated, int FilmYears, int? InstallYears, bool SmsAvailable, bool Released,
    string? FactoryCode, string? WarrantyCode, bool CanRegister, decimal? RemainingLengthM);
public record ActivateBoxRequest(string Token, RegisterRequest Registration, decimal? UsedLengthM = null);
public record ActivationResult(WarrantyPublic Warranty, decimal? RemainingLengthM);

/// <summary>
/// Every carton is identified by the roll number already printed (with its barcode) on the box, e.g. CPT30614374,
/// which is used to hand the carton from the company to representatives and onward. Inside the box is one warranty
/// card whose QR holds Serial-Warranty, where Warranty is a 7-digit number. Only the person who opens the box can
/// activate its warranty. The factory code is kept internally and is never printed on the card.
/// </summary>
public class BoxLabelService(AppDbContext db, IDataProtectionProvider protection, IActivationSmsSender sms, IConfiguration? config = null)
{
    readonly IDataProtector protector = protection.CreateProtector("Solarzed.BoxLabels.v1");
    static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    static readonly Regex TokenPattern = new("^[a-fA-F0-9]{64}$");
    // Cards printed before 7-digit codes: Factory-SZB…-SZ…
    static readonly Regex LegacyCardPattern = new(@"^([A-Z]{1,4})-(SZB-[0-9A-F]{16})-(SZ-[A-Z0-9]{6,29})$");
    // Current cards: CartonSerial-1234567 (the serial may itself contain dashes; the last 7 digits are the warranty).
    static readonly Regex CardPattern = new(@"^(.+)-([1-9][0-9]{6})$");
    /// <summary>Carton serial: the roll number printed on the box (letters, digits, inner dashes; 4–32 chars), or a legacy SZB-… serial.</summary>
    public static readonly Regex SerialPattern = new(@"^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$");
    public const int MaxBatch = 200;

    static bool Legacy(string cardCode) => cardCode.StartsWith("SZ-", StringComparison.Ordinal);

    public static string? FullCode(BoxLabel label) => label.CardCode == null ? null
        : Legacy(label.CardCode) ? (label.FactoryCode == null ? null : $"{label.FactoryCode}-{label.Id}-{label.CardCode}")
        : $"{label.Id}-{label.CardCode}";

    public static string NormalizeSerial(string? raw) => Regex.Replace(raw ?? "", @"\s+", "").ToUpperInvariant();

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
        label.Holder, label.HolderPhone, label.HeldSince, label.FactoryCode, label.CardCode, FullCode(label), label.RemainingLengthM);

    // The carton role may only see the serial printed on the box: no QR, no card code and no warranty code.
    public static LabelSerialView Restricted(BoxLabel label) => new(label.Id, label.RollId, label.Product,
        label.Type.ToString().ToLowerInvariant(), label.CreatedAt, label.ActivatedAt, label.Holder, label.HolderPhone, label.HeldSince);

    /// <summary>Issues labels with generated SZB-… serials (for cartons that carry no printed roll number).</summary>
    public Task<LabelView[]> Issue(string rollId, int quantity)
    {
        if (quantity is < 1 or > MaxBatch) throw new ActivationError(400, $"Quantity must be 1–{MaxBatch} boxes.");
        return Create(rollId, Enumerable.Range(0, quantity).Select(_ => "SZB-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8))).ToArray());
    }

    /// <summary>Issues one label per carton, keyed by the roll number printed on each box (scanned or typed).</summary>
    public async Task<LabelView[]> Issue(string rollId, IEnumerable<string>? serials)
    {
        var list = (serials ?? []).Select(NormalizeSerial).Where(x => x.Length > 0).ToArray();
        if (list.Length is 0 or > MaxBatch) throw new ActivationError(400, $"Scan 1–{MaxBatch} carton roll numbers.");
        var repeated = list.GroupBy(x => x).Where(g => g.Count() > 1).Select(g => g.Key).ToArray();
        if (repeated.Length > 0) throw new ActivationError(400, $"Roll number entered twice: {string.Join(", ", repeated.Take(10))}");
        var malformed = list.Where(x => !SerialPattern.IsMatch(x)).ToArray();
        if (malformed.Length > 0) throw new ActivationError(400, $"Invalid roll number: {string.Join(", ", malformed.Take(10))}");
        var existing = await db.BoxLabels.Where(x => list.Contains(x.Id)).Select(x => x.Id).ToListAsync();
        if (existing.Count > 0) throw new ActivationError(409, $"These cartons already have a warranty card: {string.Join(", ", existing.Take(10))}");
        return await Create(rollId, list);
    }

    async Task<LabelView[]> Create(string rollId, string[] serials)
    {
        var roll = await db.Rolls.FindAsync(rollId) ?? throw new ActivationError(404, "Roll not found.");
        if (roll.Qc != RollQc.Approved || roll.Status == RollStatus.Void)
            throw new ActivationError(409, "Only QC-approved, non-void products can have box labels.");
        var factory = RollService.SupplierCode(roll.Supplier) ?? throw new ActivationError(400, "Supplier code must be exactly 3 English letters.");
        if (roll.LengthM is not > 0) throw new ActivationError(400, "Set the roll length before issuing labels.");
        var setting = await db.CoverageSettings.FirstOrDefaultAsync() ?? new CoverageSetting();
        int? film = roll.Type == WarrantyType.Tint ? setting.TintFilmYears : setting.PpfFilmYears;
        int? install = roll.Type == WarrantyType.Tint ? setting.TintInstallYears : setting.PpfInstallYears;
        if (film is not (3 or 5 or 7 or 10) || install is not (null or 1 or 2 or 3))
            throw new ActivationError(400, "Set the approved film and installation periods in Settings before issuing labels.");
        var site = await Site();
        var codes = await NewCardCodes(serials.Length);
        var labels = serials.Select((serial, i) =>
        {
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
            return new BoxLabel { Id = serial,
                TokenHash = Hash(token), ProtectedToken = protector.Protect(token), RollId = roll.Id,
                Product = roll.ModelCode, Type = roll.Type, FilmYears = film.Value, InstallYears = install,
                FactoryCode = factory, CardCode = codes[i], RemainingLengthM = roll.LengthM };
        }).ToArray();
        db.BoxLabels.AddRange(labels);
        try { await db.SaveChangesAsync(); }
        // A concurrent issue of the same carton or card code trips the unique indexes.
        catch (DbUpdateException) { throw new ActivationError(409, "Some of these cartons were just issued by another request. Refresh and try again."); }
        return labels.Select(x => View(x, site)).ToArray();
    }

    /// <summary>Random 7-digit warranty numbers, unique across cards and existing warranties.</summary>
    async Task<string[]> NewCardCodes(int count)
    {
        var codes = new HashSet<string>();
        while (codes.Count < count)
        {
            var batch = Enumerable.Range(0, (count - codes.Count) * 2)
                .Select(_ => RandomNumberGenerator.GetInt32(1_000_000, 10_000_000).ToString()).Where(x => !codes.Contains(x)).Distinct().ToList();
            var taken = await db.BoxLabels.Where(x => x.CardCode != null && batch.Contains(x.CardCode)).Select(x => x.CardCode!).ToListAsync();
            taken.AddRange(await db.WarrantyRegistrations.Where(x => batch.Contains(x.Code)).Select(x => x.Code).ToListAsync());
            foreach (var code in batch.Except(taken)) if (codes.Count < count) codes.Add(code);
        }
        return codes.ToArray();
    }

    static void Eligible(Roll roll)
    {
        if (roll.Qc != RollQc.Approved || roll.Status is not (RollStatus.Shipped or RollStatus.Consumed))
            throw new ActivationError(409, "The product must pass QC and be released for distribution before customer activation.");
    }

    /// <summary>
    /// Accepts the card code (Serial-1234567, scanned or typed), a legacy Factory-Serial-Warranty card code,
    /// or a legacy 64-hex label token.
    /// </summary>
    async Task<BoxLabel> Find(string token)
    {
        var value = Regex.Replace(token ?? "", @"\s+", "");
        if (TokenPattern.IsMatch(value))
        {
            var hash = Hash(value);
            return await db.BoxLabels.SingleOrDefaultAsync(x => x.TokenHash == hash)
                ?? throw new ActivationError(404, "This activation label is invalid.");
        }
        value = value.ToUpperInvariant();
        string serial, secret; string? factory = null;
        var legacy = LegacyCardPattern.Match(value);
        if (legacy.Success) { factory = legacy.Groups[1].Value; serial = legacy.Groups[2].Value; secret = legacy.Groups[3].Value; }
        else
        {
            var card = CardPattern.Match(value);
            if (!card.Success || !SerialPattern.IsMatch(card.Groups[1].Value)) throw new ActivationError(404, "This activation label is invalid.");
            serial = card.Groups[1].Value; secret = card.Groups[2].Value;
        }
        var label = await db.BoxLabels.SingleOrDefaultAsync(x => x.Id == serial);
        // The warranty part is the secret printed only inside the box; compare it in constant time.
        // A legacy card must name its factory; a 7-digit card never does.
        if (label?.CardCode == null || (factory == null ? Legacy(label.CardCode) : label.FactoryCode != factory) ||
            !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(label.CardCode), Encoding.UTF8.GetBytes(secret)))
            throw new ActivationError(404, "This activation label is invalid.");
        return label;
    }

    // Unused older cards can start tracking if their roll has a known length. Previously activated cards
    // have no recorded usage, so they keep their original single-use behavior.
    static decimal? Remaining(BoxLabel label, Roll? roll) => label.RemainingLengthM
        ?? (label.ActivatedAt == null && roll?.LengthM is > 0 ? roll.LengthM : null);

    public async Task<ActivationInfo> Info(string token, string? phone = null)
    {
        var label = await Find(token);
        var roll = await db.Rolls.FindAsync(label.RollId);
        var released = roll?.Qc == RollQc.Approved && roll.Status is RollStatus.Shipped or RollStatus.Consumed;
        var started = label.ActivatedAt.HasValue;
        var remaining = Remaining(label, roll);
        var canRegister = remaining is > 0 && (!started || (phone != null && label.HolderPhone == phone));
        return new(label.Id, label.Product, label.Type.ToString().ToLowerInvariant(), started,
            label.FilmYears, label.InstallYears, sms.Configured, released, null, label.CardCode,
            canRegister, !started || canRegister ? remaining : null);
    }

    public SmsPolicy Policy => SmsPolicy.From(config);

    /// <summary>
    /// Registers the warranty for the signed-in mobile. The mobile was verified by SMS when the customer signed in,
    /// so the registration phone is always the session's, never the form's.
    /// </summary>
    public async Task<ActivationResult> Activate(ActivateBoxRequest req, string phone)
    {
        var label = await Find(req.Token);
        var first = !label.ActivatedAt.HasValue;
        if (!first && (label.RemainingLengthM == null || label.HolderPhone != phone))
            throw new ActivationError(409, "This card has already been activated. Sign in with the mobile used for the first activation.");
        var roll = await db.Rolls.FindAsync(label.RollId) ?? throw new ActivationError(409, "Product unavailable.");
        Eligible(roll);
        var remaining = Remaining(label, roll) ?? throw new ActivationError(409, "The roll length is unavailable. Contact your seller.");
        if (req.UsedLengthM is not > 0 || decimal.Round(req.UsedLengthM.Value, 2) != req.UsedLengthM.Value)
            throw new ActivationError(400, "Enter a positive used length in meters with up to two decimal places.");
        if (req.UsedLengthM.Value > remaining)
            throw new ActivationError(409, "The used length exceeds the remaining roll length.");
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
        if (await db.WarrantyRegistrations.AnyAsync(x =>
            x.FilmSerial == label.Id && x.Vin == registration.Vin && x.UsedLengthM != null))
            throw new ActivationError(409, "This vehicle already has a warranty from this roll.");
        // The printed number remains the first vehicle's warranty code. Later vehicles get their own code.
        if (first && label.CardCode != null && !await db.WarrantyRegistrations.AnyAsync(x => x.Code == label.CardCode))
            registration.Code = label.CardCode;
        registration.RollId = roll.Id;
        registration.UsedLengthM = req.UsedLengthM;
        registration.Status = WarrantyStatus.Active;
        registration.ReviewedAt = DateTime.UtcNow;
        registration.ReviewNote = "Customer activation by a signed-in, SMS-verified mobile with the warranty card from the box.";
        registration.FilmEnds = WarrantyService.AddYears(registration.Installed, label.FilmYears);
        registration.InstallEnds = label.InstallYears is int years ? WarrantyService.AddYears(registration.Installed, years) : null;
        registration.FlagsJson = JsonSerializer.Serialize(await db.WarrantyRegistrations.AnyAsync(x => x.Vin == registration.Vin && x.Type == registration.Type && x.Status != WarrantyStatus.Rejected) ? new[] { "vin_repeat" } : Array.Empty<string>());
        var now = DateTime.UtcNow;
        if (first)
        {
            // The carton's journey ends with the account that first uses it.
            db.BoxTransfers.Add(new BoxTransfer { LabelId = label.Id, BatchId = "ACT-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8)),
                FromHolder = label.Holder, FromPhone = label.HolderPhone, ToHolder = registration.Owner, ToPhone = phone,
                Note = "Warranty activated", Actor = "customer:" + phone, At = now });
            label.WarrantyCode = registration.Code;
            label.ActivatedAt = now;
            label.Holder = registration.Owner;
            label.HolderPhone = phone;
            label.HeldSince = now;
        }
        label.RemainingLengthM = remaining - req.UsedLengthM.Value;
        label.Revision++;
        db.WarrantyRegistrations.Add(registration);
        AuditLog.Add(db, "customer:" + phone, "warranty", registration.Code, "activated", AuditLog.Diff(
            ("status", null, registration.Status), ("label", null, label.Id), ("roll", null, roll.Id),
            ("usedLengthM", null, registration.UsedLengthM), ("remainingLengthM", remaining, label.RemainingLengthM),
            ("filmEnds", null, registration.FilmEnds), ("installEnds", null, registration.InstallEnds), ("flags", null, registration.FlagsJson)));
        try { await db.SaveChangesAsync(); }
        // A concurrent winner trips either the label revision guard or the unique serial/warranty indexes.
        catch (DbUpdateException) { throw new ActivationError(409, "The roll balance or warranty just changed. Refresh and try again."); }
        // EF's single SaveChanges transaction commits the label, transfer and warranty atomically.
        return new(WarrantyService.ToPublic(registration), label.RemainingLengthM);
    }
}
