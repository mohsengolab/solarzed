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
    DateTime CreatedAt, DateTime? ActivatedAt, string? WarrantyCode, string ActivationUrl);
public record ActivationInfo(string Id, string Product, string Type, bool Activated, int FilmYears, int? InstallYears, bool SmsAvailable, bool Released);
public record ActivateBoxRequest(string Token, string ChallengeId, string Otp, RegisterRequest Registration);

public class BoxLabelService(AppDbContext db, IDataProtectionProvider protection, IActivationSmsSender sms, IConfiguration? config = null, SmsLog? log = null)
{
    readonly IDataProtector protector = protection.CreateProtector("Solarzed.BoxLabels.v1");
    static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    static readonly Regex TokenPattern = new("^[a-fA-F0-9]{64}$");

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

    public LabelView View(BoxLabel label, string site) => new(label.Id, label.RollId, label.Product,
        label.Type.ToString().ToLowerInvariant(), label.FilmYears, label.InstallYears, label.CreatedAt,
        label.ActivatedAt, label.WarrantyCode, $"{site}/activate#{protector.Unprotect(label.ProtectedToken)}");

    public async Task<LabelView[]> Issue(string rollId, int quantity)
    {
        if (quantity is < 1 or > 200) throw new ActivationError(400, "Quantity must be 1–200 boxes.");
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
                Product = roll.ModelCode, Type = roll.Type, FilmYears = film.Value, InstallYears = install };
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

    async Task<BoxLabel> Find(string token)
    {
        if (string.IsNullOrEmpty(token) || !TokenPattern.IsMatch(token)) throw new ActivationError(404, "This activation label is invalid.");
        var hash = Hash(token);
        return await db.BoxLabels.SingleOrDefaultAsync(x => x.TokenHash == hash)
            ?? throw new ActivationError(404, "This activation label is invalid.");
    }

    public async Task<ActivationInfo> Info(string token)
    {
        var label = await Find(token);
        var roll = await db.Rolls.FindAsync(label.RollId);
        var released = roll?.Qc == RollQc.Approved && roll.Status is RollStatus.Shipped or RollStatus.Consumed;
        return new(label.Id, label.Product, label.Type.ToString().ToLowerInvariant(), label.ActivatedAt.HasValue,
            label.FilmYears, label.InstallYears, sms.Configured, released);
    }

    static string Phone(string value)
    {
        var phone = WarrantyService.NormalizePhone(value ?? "");
        if (!Regex.IsMatch(phone, @"^\+?\d{7,15}$")) throw new ActivationError(400, "Enter a valid mobile number.");
        return phone;
    }

    public SmsPolicy Policy => SmsPolicy.From(config);

    public async Task<ActivationChallenge> SendCode(string token, string rawPhone, CancellationToken ct)
    {
        var label = await Find(token);
        if (label.ActivatedAt.HasValue) throw new ActivationError(409, "This box warranty has already been activated.");
        var roll = await db.Rolls.FindAsync(label.RollId) ?? throw new ActivationError(409, "Product unavailable.");
        Eligible(roll);
        if (!sms.Configured) throw new ActivationError(503, "SMS verification is not configured. Please contact Solarzed support.");
        var phone = Phone(rawPhone);
        var now = DateTime.UtcNow;
        var policy = Policy;
        if (await db.ActivationChallenges.CountAsync(x => x.LabelId == label.Id && x.CreatedAt > now.AddDays(-1)) >= 10)
            throw new ActivationError(429, "The verification request limit for this box was reached. Please contact support.");
        if (await db.ActivationChallenges.AnyAsync(x => x.Phone == phone && x.CreatedAt > now.AddSeconds(-policy.ResendSeconds)))
            throw new ActivationError(429, $"Please wait {policy.ResendSeconds} seconds before requesting another code.");
        if (await db.ActivationChallenges.CountAsync(x => x.Phone == phone && x.CreatedAt > now.AddDays(-1)) >= policy.DailyLimit)
            throw new ActivationError(429, "The daily verification message limit was reached. Please try tomorrow.");
        var code = RandomNumberGenerator.GetInt32(0, 1000000).ToString("D6");
        var challenge = new ActivationChallenge { Id = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)),
            LabelId = label.Id, Phone = phone, CodeHash = BCrypt.Net.BCrypt.HashPassword(code),
            CreatedAt = now, ExpiresAt = now.AddMinutes(policy.OtpMinutes) };
        // Reserve the send before contacting the provider; failed sends are never verifiable.
        db.ActivationChallenges.Add(challenge);
        await db.SaveChangesAsync(ct);
        try { await sms.Send(phone, code, challenge.Id, ct); log?.Add(phone, "activation", true); }
        catch (ActivationError ex) { log?.Add(phone, "activation", false, ex.Message); throw; }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        { log?.Add(phone, "activation", false, "Provider unreachable"); throw new ActivationError(503, "The SMS provider is unavailable. Please try again later."); }
        challenge.Sent = true;
        challenge.Revision++;
        await db.SaveChangesAsync(ct);
        return challenge;
    }

    public async Task<WarrantyPublic> Activate(ActivateBoxRequest req)
    {
        var label = await Find(req.Token);
        if (label.ActivatedAt.HasValue) throw new ActivationError(409, "This box warranty has already been activated.");
        var roll = await db.Rolls.FindAsync(label.RollId) ?? throw new ActivationError(409, "Product unavailable.");
        Eligible(roll);
        var phone = Phone(req.Registration.Phone);
        // Product type/serial are always server-bound, never trusted from the form.
        var request = req.Registration with { Type = label.Type.ToString().ToLowerInvariant(), FilmSerial = label.Id, Phone = phone };
        var (error, entity) = WarrantyService.Validate(request);
        if (error != null) throw new ActivationError(400, error);
        // Honor the existing database field sizes before touching the one-time code.
        if (request.Make.Length > 100 || request.Model.Length > 100 || request.Owner.Length > 200 ||
            request.Plate.Length > 20 || request.InvoiceNumber.Length > 60 || request.SellerName.Length > 200 || request.Installer.Length > 200)
            throw new ActivationError(400, "One or more fields are too long.");
        var challenge = await db.ActivationChallenges.SingleOrDefaultAsync(x => x.Id == req.ChallengeId && x.LabelId == label.Id && x.Phone == phone);
        if (challenge == null || !challenge.Sent || challenge.Consumed) throw new ActivationError(400, "Request a verification code for this mobile and box first.");
        if (challenge.ExpiresAt <= DateTime.UtcNow) throw new ActivationError(410, "The verification code expired. Request a new code.");
        if (challenge.Attempts >= 5) throw new ActivationError(429, "Too many incorrect codes. Request a new verification code.");
        var latest = await db.ActivationChallenges.Where(x => x.LabelId == label.Id && x.Phone == phone && x.Sent)
            .OrderByDescending(x => x.CreatedAt).Select(x => x.Id).FirstAsync();
        if (latest != challenge.Id) throw new ActivationError(400, "Use the most recent verification code.");
        if (!Regex.IsMatch(req.Otp ?? "", "^[0-9]{6}$") || !BCrypt.Net.BCrypt.Verify(req.Otp, challenge.CodeHash))
        {
            challenge.Attempts++;
            challenge.Revision++;
            await db.SaveChangesAsync();
            throw new ActivationError(400, "The verification code is incorrect.");
        }
        var registration = entity!;
        registration.RollId = roll.Id;
        registration.Status = WarrantyStatus.Active;
        registration.ReviewedAt = DateTime.UtcNow;
        registration.ReviewNote = "Customer activation with verified mobile and issued box label.";
        registration.FilmEnds = WarrantyService.AddYears(registration.Installed, label.FilmYears);
        registration.InstallEnds = label.InstallYears is int years ? WarrantyService.AddYears(registration.Installed, years) : null;
        registration.FlagsJson = JsonSerializer.Serialize(await db.WarrantyRegistrations.AnyAsync(x => x.Vin == registration.Vin && x.Type == registration.Type && x.Status != WarrantyStatus.Rejected) ? new[] { "vin_repeat" } : Array.Empty<string>());
        label.WarrantyCode = registration.Code;
        label.ActivatedAt = DateTime.UtcNow;
        label.Revision++;
        challenge.Consumed = true;
        challenge.Revision++;
        db.WarrantyRegistrations.Add(registration);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateConcurrencyException) { throw new ActivationError(409, "This box was already activated or the verification code was changed. Refresh and try again."); }
        // EF's single SaveChanges transaction commits the label, OTP and warranty atomically.
        return WarrantyService.ToPublic(registration);
    }
}
