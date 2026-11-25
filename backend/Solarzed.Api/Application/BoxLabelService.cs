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
public record LabelView(string Id, string? RollId, string Product, string Type, int FilmYears, int? InstallYears,
    DateTime CreatedAt, DateTime? ActivatedAt, string? WarrantyCode, string ActivationUrl, string? Holder, string? HolderPhone, DateTime? HeldSince,
    string? FactoryCode, string? CardCode, string? FullCode, decimal? RemainingLengthM);
public record LabelSerialView(string Id, string? RollId, string Product, string Type, DateTime CreatedAt, DateTime? ActivatedAt, string? Holder, string? HolderPhone, DateTime? HeldSince);
public record ActivationInfo(string Id, string Product, string Type, bool Activated, int FilmYears, int? InstallYears, bool SmsAvailable, bool Released,
    string? FactoryCode, string? WarrantyCode, bool CanRegister, decimal? RemainingLengthM);
public record ActivateBoxRequest(string Token, RegisterRequest Registration, decimal? UsedLengthM = null,
    string? CustomerPhone = null, string? Country = null);
public record PhotoUpload(string Kind, string ContentType, byte[] Data);

/// <summary>Installation photos an approved partner must send with a warranty registration.</summary>
public static class PhotoRules
{
    public static readonly string[] Kinds = ["vehicle", "film", "vin", "invoice", "other"];
    public static readonly string[] Required = ["vehicle", "film"];
    public const int MaxPhotos = 6;
    public const int MaxBytes = 4 * 1024 * 1024;

    /// <summary>The real image type from the file's first bytes; the browser-supplied type is never trusted.</summary>
    public static string? Sniff(byte[] d) =>
        d.Length > 3 && d[0] == 0xFF && d[1] == 0xD8 && d[2] == 0xFF ? "image/jpeg"
        : d.Length > 8 && d[0] == 0x89 && d[1] == 0x50 && d[2] == 0x4E && d[3] == 0x47 ? "image/png"
        : d.Length > 12 && d[0] == 'R' && d[1] == 'I' && d[2] == 'F' && d[3] == 'F' && d[8] == 'W' && d[9] == 'E' && d[10] == 'B' && d[11] == 'P' ? "image/webp"
        : null;

    public static PhotoUpload[] Validate(IReadOnlyList<(string Kind, byte[] Data)> files)
    {
        if (files.Count > MaxPhotos) throw new ActivationError(400, $"Upload at most {MaxPhotos} photos.");
        var result = new List<PhotoUpload>();
        foreach (var (kind, data) in files)
        {
            if (!Kinds.Contains(kind)) throw new ActivationError(400, "Unknown photo type.");
            if (data.Length == 0 || data.Length > MaxBytes) throw new ActivationError(400, "Each photo must be smaller than 4 MB.");
            var type = Sniff(data) ?? throw new ActivationError(400, "Photos must be JPEG, PNG or WebP images.");
            result.Add(new(kind, type, data));
        }
        var missing = Required.Where(k => result.All(p => p.Kind != k)).ToArray();
        if (missing.Length > 0) throw new ActivationError(400, "Add a photo of the vehicle (with plate) and of the installed film.");
        return result.ToArray();
    }
}
public record ActivationResult(WarrantyPublic Warranty, decimal? RemainingLengthM);

/// <summary>
/// Every carton is identified by the roll number already printed (with its barcode) on the box, e.g. CPT30614374,
/// which is used to hand the carton from the company to representatives and onward. The warranty card inside the box
/// carries a QR holding only that Serial Number; an approved installer scans or types it to register the warranty.
/// Older cards whose QR holds RollNo-Warranty[-Factory] (7-digit warranty number) still open for anyone.
/// </summary>
public class BoxLabelService(AppDbContext db, IDataProtectionProvider protection, IActivationSmsSender sms, IConfiguration? config = null)
{
    readonly IDataProtector protector = protection.CreateProtector("Solarzed.BoxLabels.v1");
    static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    static readonly Regex TokenPattern = new("^[a-fA-F0-9]{64}$");
    // Cards printed before 7-digit codes: Factory-SZB…-SZ…
    static readonly Regex LegacyCardPattern = new(@"^([A-Z]{1,4})-(SZB-[0-9A-F]{16})-(SZ-[A-Z0-9]{6,29})$");
    // Cards: RollNo-1234567-ABC (current) or RollNo-1234567 (printed before the factory was added).
    // The roll number may itself contain dashes; the 7 digits after it are the warranty, then the optional factory.
    static readonly Regex CardPattern = new(@"^(.+)-([1-9][0-9]{6})(?:-([A-Z]{3}))?$");
    /// <summary>Carton serial: the roll number printed on the box (letters, digits, inner dashes; 4–32 chars), or a legacy SZB-… serial.</summary>
    public static readonly Regex SerialPattern = new(@"^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$");
    public const int MaxBatch = 200;

    static bool Legacy(string cardCode) => cardCode.StartsWith("SZ-", StringComparison.Ordinal);

    public static string? FullCode(BoxLabel label) => label.CardCode == null ? null
        : Legacy(label.CardCode) ? (label.FactoryCode == null ? null : $"{label.FactoryCode}-{label.Id}-{label.CardCode}")
        : label.FactoryCode == null ? $"{label.Id}-{label.CardCode}" : $"{label.Id}-{label.CardCode}-{label.FactoryCode}";

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

    // ActivationUrl is kept for previews of older cards; the printed QR now holds only the Serial Number (label Id).
    public LabelView View(BoxLabel label, string site) => new(label.Id, label.RollId, label.Product,
        label.Type.ToString().ToLowerInvariant(), label.FilmYears, label.InstallYears, label.CreatedAt,
        label.ActivatedAt, label.WarrantyCode, FullCode(label) is { } code ? $"{site}/activate#{code}" : LegacyUrl(label, site),
        label.Holder, label.HolderPhone, label.HeldSince, label.FactoryCode, label.CardCode, FullCode(label), label.RemainingLengthM);

    // A legacy token that can no longer be decrypted (lost Data Protection key ring) cannot be reprinted,
    // but it must not take the whole label list down with it.
    string LegacyUrl(BoxLabel label, string site)
    {
        try { return $"{site}/activate#{protector.Unprotect(label.ProtectedToken)}"; }
        catch (CryptographicException) { return ""; }
    }

    // The counter role may only see the serial printed on the box: no QR, no card code and no warranty code.
    public static LabelSerialView Restricted(BoxLabel label) => new(label.Id, label.RollId, label.Product,
        label.Type.ToString().ToLowerInvariant(), label.CreatedAt, label.ActivatedAt, label.Holder, label.HolderPhone, label.HeldSince);

    /// <summary>Issues labels with generated SZB-… serials (for cartons that carry no printed roll number).</summary>
    public Task<LabelView[]> Issue(string rollId, int quantity)
    {
        if (quantity is < 1 or > MaxBatch) throw new ActivationError(400, $"Quantity must be 1–{MaxBatch} boxes.");
        return Create([(rollId, Enumerable.Range(0, quantity).Select(_ => "SZB-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8))).ToArray())]);
    }

    /// <summary>Normalizes scanned roll numbers and rejects an empty, oversized, repeated or malformed list.</summary>
    public static string[] ParseSerials(IEnumerable<string>? serials)
    {
        var list = (serials ?? []).Select(NormalizeSerial).Where(x => x.Length > 0).ToArray();
        if (list.Length is 0 or > MaxBatch) throw new ActivationError(400, $"Scan 1–{MaxBatch} carton roll numbers.");
        var repeated = list.GroupBy(x => x).Where(g => g.Count() > 1).Select(g => g.Key).ToArray();
        if (repeated.Length > 0) throw new ActivationError(400, $"Roll number entered twice: {string.Join(", ", repeated.Take(10))}");
        var malformed = list.Where(x => !SerialPattern.IsMatch(x)).ToArray();
        if (malformed.Length > 0) throw new ActivationError(400, $"Invalid roll number: {string.Join(", ", malformed.Take(10))}");
        return list;
    }

    /// <summary>Issues one label per carton, keyed by the roll number printed on each box (scanned or typed).</summary>
    public async Task<LabelView[]> Issue(string rollId, IEnumerable<string>? serials)
    {
        var list = ParseSerials(serials);
        await EnsureNoCards(list);
        return await Create([(rollId, list)]);
    }

    /// <summary>Issues the warranty card of each selected roll's carton, using the Roll No recorded on the roll.</summary>
    public async Task<LabelView[]> IssueForRolls(IEnumerable<string>? rollIds)
    {
        var ids = (rollIds ?? []).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().ToArray();
        if (ids.Length is 0 or > MaxBatch) throw new ActivationError(400, $"Select 1–{MaxBatch} rolls.");
        var rolls = await db.Rolls.Where(r => ids.Contains(r.Id)).Select(r => new { r.Id, r.RollNo }).ToListAsync();
        if (rolls.Count != ids.Length) throw new ActivationError(404, "Roll not found.");
        var missing = rolls.Where(r => r.RollNo == null).Select(r => r.Id).ToArray();
        if (missing.Length > 0) throw new ActivationError(400, $"Enter the ROLL NO on these rolls first: {string.Join(", ", missing.Take(10))}");
        await EnsureNoCards(rolls.Select(r => r.RollNo!).ToArray());
        return await Create(rolls.Select(r => (r.Id, new[] { r.RollNo! })).ToArray());
    }

    async Task EnsureNoCards(string[] serials)
    {
        var existing = await db.BoxLabels.Where(x => serials.Contains(x.Id)).Select(x => x.Id).ToListAsync();
        if (existing.Count > 0) throw new ActivationError(409, $"These cartons already have a warranty card: {string.Join(", ", existing.Take(10))}");
    }

    async Task<LabelView[]> Create(IReadOnlyList<(string RollId, string[] Serials)> items)
    {
        var setting = await db.CoverageSettings.FirstOrDefaultAsync() ?? new CoverageSetting();
        var site = await Site();
        var codes = await NewCardCodes(items.Sum(x => x.Serials.Length));
        var labels = new List<BoxLabel>();
        foreach (var (rollId, serials) in items)
        {
            var roll = await db.Rolls.FindAsync(rollId) ?? throw new ActivationError(404, "Roll not found.");
            // Name the roll when several are issued at once, so the error says which one to fix.
            var which = items.Count > 1 ? $" ({roll.Id})" : "";
            if (roll.Qc != RollQc.Approved || roll.Status == RollStatus.Void)
                throw new ActivationError(409, $"Only QC-approved, non-void products can have box labels.{which}");
            // A roll whose carton Roll No is recorded has exactly that one carton.
            if (roll.RollNo != null && serials.Any(s => s != roll.RollNo))
                throw new ActivationError(400, $"This roll's ROLL NO is {roll.RollNo}.{which}");
            var claimed = await db.Rolls.Where(r => r.Id != roll.Id && r.RollNo != null && serials.Contains(r.RollNo))
                .Select(r => r.RollNo!).ToListAsync();
            if (claimed.Count > 0)
                throw new ActivationError(409, $"These ROLL NOs belong to other rolls: {string.Join(", ", claimed.Take(10))}");
            var factory = RollService.SupplierCode(roll.Supplier) ?? throw new ActivationError(400, $"Supplier code must be exactly 3 English letters.{which}");
            if (roll.LengthM is not > 0) throw new ActivationError(400, $"Set the roll length before issuing labels.{which}");
            int? film = roll.Type == WarrantyType.Tint ? setting.TintFilmYears : setting.PpfFilmYears;
            int? install = roll.Type == WarrantyType.Tint ? setting.TintInstallYears : setting.PpfInstallYears;
            if (film is not (3 or 5 or 7 or 10) || install is not (null or 1 or 2 or 3))
                throw new ActivationError(400, "Set the approved film and installation periods in Settings before issuing labels.");
            foreach (var serial in serials)
            {
                var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
                labels.Add(new BoxLabel { Id = serial,
                    TokenHash = Hash(token), ProtectedToken = protector.Protect(token), RollId = roll.Id,
                    Product = roll.ModelCode, Type = roll.Type, FilmYears = film.Value, InstallYears = install,
                    FactoryCode = factory, CardCode = codes[labels.Count], RemainingLengthM = roll.LengthM });
            }
        }
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
    /// The inventory QR holds the roll ID (SZ-{RollNo}-{yyMM}-{7 digits}-{factory}), which looks like a card code.
    /// When it names a roll with exactly one carton, it stands for that carton's Serial Number (installer only).
    /// </summary>
    async Task<string> FromRollId(string? token)
    {
        var value = Regex.Replace(token ?? "", @"\s+", "").ToUpperInvariant();
        if (!value.StartsWith("SZ-", StringComparison.Ordinal) || !await db.Rolls.AnyAsync(r => r.Id == value)) return token ?? "";
        var ids = await db.BoxLabels.Where(x => x.RollId == value).Select(x => x.Id).Take(2).ToListAsync();
        if (ids.Count == 1) return ids[0];
        throw new ActivationError(404, ids.Count == 0
            ? "This is a roll ID and its warranty card has not been issued yet."
            : "This roll has several cartons. Scan the ROLL NO on the warranty card.");
    }

    /// <summary>
    /// Accepts the card code (RollNo-1234567-ABC or RollNo-1234567, scanned or typed), a legacy Factory-Serial-Warranty card code,
    /// or a legacy 64-hex label token.
    /// </summary>
    async Task<BoxLabel> Find(string token, bool serialAllowed = false)
    {
        var value = Regex.Replace(token ?? "", @"\s+", "");
        // New cards carry only the Serial Number (the carton Roll No). Only an approved installer, who is signed in
        // and whose photos the counter reviews, may register a warranty from it.
        var plain = value.ToUpperInvariant();
        if (SerialPattern.IsMatch(plain) && !TokenPattern.IsMatch(value) && !CardPattern.IsMatch(plain) && !LegacyCardPattern.IsMatch(plain))
        {
            var bySerial = await db.BoxLabels.SingleOrDefaultAsync(x => x.Id == plain);
            if (bySerial == null || !serialAllowed)
                throw new ActivationError(serialAllowed ? 404 : 403, serialAllowed
                    ? "No Solarzed roll has this ROLL NO. Check the number on the card."
                    : "Your installer registers this warranty with the ROLL NO. Ask your Solarzed installer to register it for your mobile.");
            return bySerial;
        }
        if (serialAllowed && SerialPattern.IsMatch(plain) && await db.BoxLabels.SingleOrDefaultAsync(x => x.Id == plain) is { } exact) return exact;
        if (TokenPattern.IsMatch(value))
        {
            var hash = Hash(value);
            return await db.BoxLabels.SingleOrDefaultAsync(x => x.TokenHash == hash)
                ?? throw new ActivationError(404, "This activation label is invalid.");
        }
        value = value.ToUpperInvariant();
        string serial, secret; string? factory = null; var old = false;
        var legacy = LegacyCardPattern.Match(value);
        if (legacy.Success) { old = true; factory = legacy.Groups[1].Value; serial = legacy.Groups[2].Value; secret = legacy.Groups[3].Value; }
        else
        {
            var card = CardPattern.Match(value);
            if (!card.Success || !SerialPattern.IsMatch(card.Groups[1].Value)) throw new ActivationError(404, "This activation label is invalid.");
            serial = card.Groups[1].Value; secret = card.Groups[2].Value;
            factory = card.Groups[3].Success ? card.Groups[3].Value : null;
        }
        var label = await db.BoxLabels.SingleOrDefaultAsync(x => x.Id == serial);
        // The warranty part is the secret printed only inside the box; compare it in constant time.
        // A legacy SZ- card must name its factory. A 7-digit card may omit it (printed before it was added),
        // but if it names one, it must be the carton's.
        if (label?.CardCode == null || Legacy(label.CardCode) != old || (factory != null && label.FactoryCode != factory) ||
            !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(label.CardCode), Encoding.UTF8.GetBytes(secret)))
            throw new ActivationError(404, "This activation label is invalid.");
        return label;
    }

    // Unused older cards can start tracking if their roll has a known length. Previously activated cards
    // have no recorded usage, so they keep their original single-use behavior.
    static decimal? Remaining(BoxLabel label, Roll? roll) => label.RemainingLengthM
        ?? (label.ActivatedAt == null && roll?.LengthM is > 0 ? roll.LengthM : null);

    public async Task<ActivationInfo> Info(string token, string? phone = null, bool installer = false)
    {
        token = await FromRollId(token);
        var label = await Find(token, installer);
        // The warranty number is shown only to someone holding the full card code.
        var bySerial = installer && label.Id == Regex.Replace(token ?? "", @"\s+", "").ToUpperInvariant();
        var roll = label.RollId is { } rollId ? await db.Rolls.FindAsync(rollId) : null;
        // A carton whose roll was deleted after activation was released when it was first used.
        var released = roll == null ? label.ActivatedAt.HasValue
            : roll.Qc == RollQc.Approved && roll.Status is RollStatus.Shipped or RollStatus.Consumed;
        var started = label.ActivatedAt.HasValue;
        var remaining = Remaining(label, roll);
        // An installer registers only rolls transferred to their own mobile; later vehicles stay with whoever started it.
        var holds = phone != null && label.HolderPhone == phone;
        // One roll covers an unknown number of vehicles (a 30 m roll may fit 4 cars or 6), so it is never "used up":
        // the holder keeps registering vehicles and unusual patterns are flagged for review instead.
        var canRegister = started ? holds : !installer || holds;
        return new(label.Id, label.Product, label.Type.ToString().ToLowerInvariant(), started,
            label.FilmYears, label.InstallYears, sms.Configured, released, null, bySerial ? null : label.CardCode,
            canRegister, !started || canRegister ? remaining : null);
    }

    public SmsPolicy Policy => SmsPolicy.From(config);

    /// <summary>Least film a vehicle plausibly takes; more vehicles than length / this on one roll is unusual.</summary>
    public const decimal MinMetersPerVehicle = 4m;
    /// <summary>Vehicles allowed on a roll of unknown length before it is flagged.</summary>
    public const int VehiclesWithoutLength = 10;
    /// <summary>Registrations from one roll within 24 hours that count as a burst.</summary>
    public const int BurstPerDay = 6;

    /// <summary>
    /// Review flags for a new vehicle on a roll. Nothing here blocks the registration (a roll has no fixed vehicle
    /// count); the counter sees the flags and the admin can void the roll to stop it.
    /// </summary>
    async Task<List<string>> RollFlags(WarrantyRegistration reg, BoxLabel label, Roll? roll, decimal? remaining, decimal? used)
    {
        var flags = new List<string>();
        if (await db.WarrantyRegistrations.AnyAsync(x => x.Vin == reg.Vin && x.Type == reg.Type && x.Status != WarrantyStatus.Rejected))
            flags.Add("vin_repeat");
        var earlier = db.WarrantyRegistrations.Where(x => x.FilmSerial == label.Id && x.Status != WarrantyStatus.Rejected);
        var vehicles = await earlier.CountAsync() + 1;
        var length = roll?.LengthM;
        var limit = length is > 0 ? (int)Math.Floor(length.Value / MinMetersPerVehicle) : VehiclesWithoutLength;
        if (vehicles > Math.Max(1, limit)) flags.Add("roll_high_count");
        var since = DateTime.UtcNow.AddHours(-24);
        if (await earlier.CountAsync(x => x.CreatedAt >= since) + 1 > BurstPerDay) flags.Add("roll_burst");
        if (remaining is { } left && used is { } u && u > left) flags.Add("roll_overuse");
        return flags;
    }

    /// <summary>
    /// Registers the warranty for the signed-in mobile. The mobile was verified by SMS when the customer signed in,
    /// so the registration phone is always the session's, never the form's.
    /// </summary>
    public async Task<ActivationResult> Activate(ActivateBoxRequest req, string phone) => await Activate(req, phone, null, []);

    /// <summary>
    /// With an approved partner, the partner (signed in as <paramref name="phone"/>) registers the installation for the
    /// customer's mobile, with photos. The warranty stays pending until the counter reviews the photos, and the roll
    /// stays with the partner for the next vehicles.
    /// </summary>
    public async Task<ActivationResult> Activate(ActivateBoxRequest req, string phone, PortalUser? partner, PhotoUpload[] photos)
    {
        if (partner != null && partner.Partner != PartnerStatus.Approved)
            throw new ActivationError(403, "Your installer account is not approved yet.");
        var ownerPhone = phone;
        if (partner != null)
        {
            ownerPhone = PortalService.CanonicalPhone(req.CustomerPhone);
            if (ownerPhone == phone) throw new ActivationError(400, "Enter the customer's own mobile number, not yours.");
            if (photos.Length == 0) throw new ActivationError(400, "Add the installation photos.");
        }
        var label = await Find(await FromRollId(req.Token), partner != null);
        var first = !label.ActivatedAt.HasValue;
        // The roll reaches the installer by transfer (company → seller → installer, by mobile and ROLL NO); only the
        // installer holding it may register the warranty.
        if (first && partner != null && label.HolderPhone != phone)
            throw new ActivationError(403, "This ROLL NO is not in your account. Ask your seller to transfer it to your mobile first.");
        if (!first && label.HolderPhone != phone)
            throw new ActivationError(409, "This card has already been activated. Sign in with the mobile used for the first activation.");
        var roll = label.RollId is { } rollId ? await db.Rolls.FindAsync(rollId) : null;
        // Only activated cartons outlive their roll; they were released when first used.
        if (roll == null && first) throw new ActivationError(409, "Product unavailable.");
        if (roll != null) Eligible(roll);
        // Meters used are optional: nobody measures the film at install time. When given they only feed the
        // roll's running balance and the over-use flag; they never block a registration.
        var remaining = Remaining(label, roll);
        if (req.UsedLengthM is { } given && (given <= 0 || decimal.Round(given, 2) != given))
            throw new ActivationError(400, "Enter a positive used length in meters with up to two decimal places, or leave it empty.");
        // Product type/serial are always server-bound, never trusted from the form.
        var request = req.Registration with { Type = label.Type.ToString().ToLowerInvariant(), FilmSerial = label.Id, Phone = ownerPhone };
        // A partner's registrations always carry the partner's own shop name, never free text.
        if (partner != null) request = request with { Installer = partner.ShopName ?? partner.Name ?? phone };
        // The activation form no longer asks for a seller: the installer who registers it is the seller.
        if (string.IsNullOrWhiteSpace(request.SellerName)) request = request with { SellerName = string.IsNullOrWhiteSpace(request.Installer) ? phone : request.Installer };
        if (string.IsNullOrWhiteSpace(request.SellerPhone)) request = request with { SellerPhone = phone };
        var coverage = await db.CoverageSettings.AsNoTracking().FirstOrDefaultAsync();
        var (error, entity) = WarrantyService.Validate(request, coverage?.WarrantyCodeLength ?? 16);
        if (error != null) throw new ActivationError(400, error);
        // Honor the existing database field sizes.
        if (request.Make.Length > 100 || request.Model.Length > 100 || request.Owner.Length > 200 ||
            request.Plate.Length > 20 || request.InvoiceNumber.Length > 60 || request.SellerName.Length > 200 || request.Installer.Length > 200)
            throw new ActivationError(400, "One or more fields are too long.");
        var registration = entity!;
        if (await db.WarrantyRegistrations.AnyAsync(x =>
            x.FilmSerial == label.Id && x.Vin == registration.Vin))
            throw new ActivationError(409, "This vehicle already has a warranty from this roll.");
        // The printed number remains the first vehicle's warranty code. Later vehicles get their own code.
        if (first && label.CardCode != null && !await db.WarrantyRegistrations.AnyAsync(x => x.Code == label.CardCode))
            registration.Code = label.CardCode;
        registration.RollId = roll?.Id;
        registration.CardKey = WarrantyCards.NewKey();
        registration.UsedLengthM = req.UsedLengthM;
        if (partner != null)
        {
            registration.Status = WarrantyStatus.Pending;
            registration.InstallerPhone = phone;
            var country = (req.Country ?? "").Trim();
            registration.Country = country.Length > 0 ? country[..Math.Min(country.Length, 100)] : partner.Country;
            registration.ReviewNote = "Registered by an approved installer; awaiting counter review of the installation photos.";
        }
        else
        {
            registration.Status = WarrantyStatus.Active;
            registration.ReviewedAt = DateTime.UtcNow;
            registration.ReviewNote = "Customer activation by a signed-in, SMS-verified mobile with the warranty card from the box.";
        }
        registration.FilmEnds = WarrantyService.AddYears(registration.Installed, label.FilmYears);
        registration.InstallEnds = label.InstallYears is int years ? WarrantyService.AddYears(registration.Installed, years) : null;
        registration.FlagsJson = JsonSerializer.Serialize(await RollFlags(registration, label, roll, remaining, req.UsedLengthM));
        var now = DateTime.UtcNow;
        var actor = (partner != null ? "installer:" : "customer:") + phone;
        var holderName = partner != null ? registration.Installer : registration.Owner;
        if (first)
        {
            // The carton's journey ends with the account that first uses it.
            db.BoxTransfers.Add(new BoxTransfer { LabelId = label.Id, BatchId = "ACT-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8)),
                FromHolder = label.Holder, FromPhone = label.HolderPhone, ToHolder = holderName, ToPhone = phone,
                Note = "Warranty activated", Actor = actor, At = now });
            label.WarrantyCode = registration.Code;
            label.ActivatedAt = now;
            label.Holder = holderName;
            label.HolderPhone = phone;
            label.HeldSince = now;
        }
        if (remaining is { } left && req.UsedLengthM is { } used) label.RemainingLengthM = Math.Max(0, left - used);
        else if (first) label.RemainingLengthM = remaining;
        label.Revision++;
        db.WarrantyRegistrations.Add(registration);
        foreach (var photo in photos)
            db.WarrantyPhotos.Add(new WarrantyPhoto { WarrantyCode = registration.Code, Kind = photo.Kind, ContentType = photo.ContentType,
                Data = photo.Data, SizeBytes = photo.Data.Length, UploadedBy = phone, CreatedAt = now });
        AuditLog.Add(db, actor, "warranty", registration.Code, "activated", AuditLog.Diff(
            ("status", null, registration.Status), ("label", null, label.Id), ("roll", null, roll?.Id),
            ("usedLengthM", null, registration.UsedLengthM), ("remainingLengthM", remaining, label.RemainingLengthM),
            ("filmEnds", null, registration.FilmEnds), ("installEnds", null, registration.InstallEnds), ("flags", null, registration.FlagsJson),
            ("customer", null, partner != null ? ownerPhone : null), ("country", null, registration.Country), ("photos", null, photos.Length)));
        try { await db.SaveChangesAsync(); }
        // A concurrent winner trips either the label revision guard or the unique serial/warranty indexes.
        catch (DbUpdateException) { throw new ActivationError(409, "The roll balance or warranty just changed. Refresh and try again."); }
        // EF's single SaveChanges transaction commits the label, transfer and warranty atomically.
        return new(WarrantyService.ToPublic(registration), label.RemainingLengthM);
    }
}
