using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Application;

public record RegisterRequest(
    string Type,
    string Make, string Model, string Owner, string Phone, string Plate, string Vin,
    string FilmSerial, string InvoiceNumber, string Installed,
    string SellerName, string SellerPhone, string Installer,
    string[]? Windows, string[]? Panels);

public record WarrantyPublic(
    string Code, string Type, string Make, string Model, string VinMasked,
    string Plate, string FilmSerial, string InvoiceNumber, DateOnly Installed,
    string SellerName, string SellerPhoneMasked, string Installer,
    string[] Areas, string Status, string StatusLabel,
    string? StatusNote, CoveragePublic? Coverage, string[] Flags);

public record CoveragePublic(DateOnly? FilmEnds, DateOnly? InstallEnds);

public static class WarrantyService
{
    static readonly string[] ValidWindows = ["left-front", "right-front", "left-rear", "right-rear", "rear"];
    static readonly string[] ValidPanels = [
        "hood", "front-bumper", "roof", "trunk", "rear-bumper",
        "left-front-fender", "right-front-fender", "left-doors", "right-doors",
        "left-rear-quarter", "right-rear-quarter", "mirrors"];

    static readonly Regex VinRx = new(@"^[A-HJ-NPR-Z0-9]{17}$", RegexOptions.Compiled);
    static readonly Regex PhoneRx = new(@"^\+?\d{7,15}$", RegexOptions.Compiled);

    public static string NormalizePhone(string raw)
    {
        var s = raw
            .Replace('۰', '0').Replace('۱', '1').Replace('۲', '2').Replace('۳', '3')
            .Replace('۴', '4').Replace('۵', '5').Replace('۶', '6').Replace('۷', '7')
            .Replace('۸', '8').Replace('۹', '9')
            .Replace('٠', '0').Replace('١', '1').Replace('٢', '2').Replace('٣', '3')
            .Replace('٤', '4').Replace('٥', '5').Replace('٦', '6').Replace('٧', '7')
            .Replace('٨', '8').Replace('٩', '9');
        return Regex.Replace(s, @"[\s()\-]", "");
    }

    public static string GenerateCode()
    {
        var hex = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLower();
        return $"SZ-{hex[..4]}-{hex[4..8]}-{hex[8..12]}-{hex[12..16]}";
    }

    static string GenerateCode16()
    {
        return "SZ-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLower();
    }

    public static (string? Error, WarrantyRegistration? Entity) Validate(RegisterRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Make)) return ("make required", null);
        if (string.IsNullOrWhiteSpace(req.Model)) return ("model required", null);
        if (string.IsNullOrWhiteSpace(req.Owner)) return ("owner required", null);
        if (string.IsNullOrWhiteSpace(req.Phone)) return ("phone required", null);
        if (string.IsNullOrWhiteSpace(req.Plate)) return ("plate required", null);
        if (string.IsNullOrWhiteSpace(req.Vin)) return ("vin required", null);
        if (string.IsNullOrWhiteSpace(req.FilmSerial)) return ("filmSerial required", null);
        if (string.IsNullOrWhiteSpace(req.InvoiceNumber)) return ("invoiceNumber required", null);
        if (string.IsNullOrWhiteSpace(req.Installed)) return ("installed required", null);
        if (string.IsNullOrWhiteSpace(req.SellerName)) return ("sellerName required", null);
        if (string.IsNullOrWhiteSpace(req.SellerPhone)) return ("sellerPhone required", null);
        if (string.IsNullOrWhiteSpace(req.Installer)) return ("installer required", null);

        if (req.Type is not null && req.Type.ToLowerInvariant() is not ("tint" or "ppf"))
            return ("type invalid", null);

        var vin = Regex.Replace(req.Vin.ToUpperInvariant(), @"[\s-]", "");
        if (!VinRx.IsMatch(vin)) return ("vin invalid (17 chars A-Z 0-9, no I O Q)", null);

        var phone = NormalizePhone(req.Phone.Trim());
        if (!PhoneRx.IsMatch(phone)) return ("phone invalid", null);

        var sellerPhone = NormalizePhone(req.SellerPhone.Trim());
        if (!PhoneRx.IsMatch(sellerPhone)) return ("sellerPhone invalid", null);

        if (!DateOnly.TryParseExact(req.Installed, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var installed))
            return ("installed date invalid (YYYY-MM-DD)", null);
        if (installed > DateOnly.FromDateTime(DateTime.UtcNow))
            return ("installed date cannot be in the future", null);

        var type = req.Type?.ToLower() == "ppf" ? WarrantyType.Ppf : WarrantyType.Tint;

        string[] areas;
        if (type == WarrantyType.Tint)
        {
            areas = req.Windows ?? [];
            var invalid = areas.Except(ValidWindows).ToArray();
            if (invalid.Length > 0) return ($"unknown windows: {string.Join(", ", invalid)}", null);
        }
        else
        {
            areas = req.Panels ?? [];
            var invalid = areas.Except(ValidPanels).ToArray();
            if (invalid.Length > 0) return ($"unknown panels: {string.Join(", ", invalid)}", null);
        }

        if (areas.Length == 0 || areas.Distinct().Count() != areas.Length)
            return ("select at least one area without duplicates", null);

        var code = GenerateCode16();
        var entity = new WarrantyRegistration
        {
            Code = code,
            Type = type,
            Make = req.Make.Trim(),
            Model = req.Model.Trim(),
            Owner = req.Owner.Trim(),
            Phone = phone,
            Plate = req.Plate.Trim().ToUpperInvariant(),
            Vin = vin,
            FilmSerial = req.FilmSerial.Trim(),
            InvoiceNumber = req.InvoiceNumber.Trim(),
            Installed = installed,
            SellerName = req.SellerName.Trim(),
            SellerPhone = sellerPhone,
            Installer = req.Installer.Trim(),
            AreasJson = JsonSerializer.Serialize(areas),
            FlagsJson = "[]"
        };
        return (null, entity);
    }

    public static async Task<string[]> AssessFlags(WarrantyRegistration reg, AppDbContext db)
    {
        var flags = new List<string>();
        var roll = await db.Rolls.FirstOrDefaultAsync(r => r.Id == reg.FilmSerial);
        if (roll == null)
        {
            flags.Add("roll_unknown");
        }
        else
        {
            if (roll.Qc != RollQc.Approved) flags.Add("roll_not_approved");
            if (roll.Status == RollStatus.InStock) flags.Add("roll_not_distributed");
            if (roll.Status == RollStatus.Void) flags.Add("roll_void");
            if ((reg.Type == WarrantyType.Tint) != (roll.Type == WarrantyType.Tint))
                flags.Add("type_mismatch");
        }
        var vinRepeat = await db.WarrantyRegistrations.AnyAsync(w =>
            w.Vin == reg.Vin && w.Type == reg.Type && w.Code != reg.Code && w.Status != WarrantyStatus.Rejected);
        if (vinRepeat) flags.Add("vin_repeat");

        return [.. flags];
    }

    public static WarrantyPublic ToPublic(WarrantyRegistration w)
    {
        var vin = w.Vin;
        var vinMasked = vin.Length >= 9 ? vin[..3] + "••••" + vin[^6..] : vin;
        var sp = w.SellerPhone;
        var spMasked = sp.Length > 4 ? sp[..2] + "****" + sp[^2..] : sp;

        var areas = JsonSerializer.Deserialize<string[]>(w.AreasJson) ?? [];

        var statusLabel = w.Status switch
        {
            WarrantyStatus.Pending => "Pending review",
            WarrantyStatus.Active => "Active warranty",
            WarrantyStatus.Rejected => "Not covered",
            _ => "Unknown"
        };

        CoveragePublic? coverage = null;
        if (w.Status == WarrantyStatus.Active)
            coverage = new CoveragePublic(w.FilmEnds, w.InstallEnds);

        string? statusNote = null;
        if (w.Status == WarrantyStatus.Rejected && !string.IsNullOrWhiteSpace(w.ReviewNote))
            statusNote = w.ReviewNote;

        return new WarrantyPublic(
            Code: w.Code, Type: w.Type.ToString().ToLower(),
            Make: w.Make, Model: w.Model, VinMasked: vinMasked, Plate: w.Plate,
            FilmSerial: w.FilmSerial, InvoiceNumber: w.InvoiceNumber, Installed: w.Installed,
            SellerName: w.SellerName, SellerPhoneMasked: spMasked, Installer: w.Installer,
            Areas: areas, Status: w.Status.ToString().ToLower(), StatusLabel: statusLabel,
            StatusNote: statusNote, Coverage: coverage, Flags: []);
    }

    public static DateOnly AddYears(DateOnly date, int years) =>
        date.AddYears(years).AddDays(-1);  // N years − 1 day
}
