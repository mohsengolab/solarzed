using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Solarzed.Api.Application;
using Solarzed.Api.Controllers;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Tests;

public class WarrantyTests
{
    static RegisterRequest Request() => new("tint", "Toyota", "Camry", "Sample Customer",
        "09121111111", "DEMO123", "JTDBE32K123456789", "UNKNOWN-ROLL", "INV1", "2026-01-15",
        "Sample Seller", "09123456789", "Sample Shop", ["left-front", "right-front", "rear"], null);

    static AppDbContext Database() => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    static AdminController Admin(AppDbContext db) => new(db, new ConfigurationBuilder().Build());

    [Theory]
    [InlineData("۰۹۱۲۲ ۲۲۲ ۲۲۲", "09122222222")]
    [InlineData("٠٩١٢-٢٢٢٢-٢٢٢", "09122222222")]
    [InlineData("+98 (912) 222-2222", "+989122222222")]
    public void NormalizesPhones(string input, string expected) =>
        Assert.Equal(expected, WarrantyService.NormalizePhone(input));

    [Fact]
    public void ValidatesGlassAndNormalizesRegistration()
    {
        var (error, registration) = WarrantyService.Validate(Request());
        Assert.Null(error);
        Assert.Equal("09123456789", registration!.SellerPhone);
        Assert.Equal(Request().Windows, JsonSerializer.Deserialize<string[]>(registration.AreasJson));
        Assert.Matches("^SZ-[A-Z0-9]{16}$", registration.Code);
    }

    [Theory]
    [InlineData("SHORT")]
    [InlineData("JTDBE32K12345678O")]
    public void RejectsInvalidVin(string vin) =>
        Assert.NotNull(WarrantyService.Validate(Request() with { Vin = vin }).Error);

    [Fact]
    public void ValidatesTintAndPpfAreas()
    {
        Assert.NotNull(WarrantyService.Validate(Request() with { Windows = ["front-windshield"] }).Error);
        Assert.NotNull(WarrantyService.Validate(Request() with { Type = "ppf", Panels = ["rear"] }).Error);
        var result = WarrantyService.Validate(Request() with { Type = "ppf", Panels = ["hood", "mirrors"] });
        Assert.Null(result.Error);
        Assert.Equal(WarrantyType.Ppf, result.Entity!.Type);
    }

    [Theory]
    [InlineData("2026-02-31")]
    [InlineData("2099-01-01")]
    public void RejectsInvalidOrFutureInstallationDate(string date) =>
        Assert.NotNull(WarrantyService.Validate(Request() with { Installed = date }).Error);

    [Theory]
    [InlineData("2026-01-15", 5, "2031-01-14")]
    [InlineData("2023-03-01", 1, "2024-02-29")]
    [InlineData("2024-02-29", 1, "2025-02-27")]
    public void CoverageEndsOneDayBeforeAnniversary(string installed, int years, string expected) =>
        Assert.Equal(DateOnly.Parse(expected), WarrantyService.AddYears(DateOnly.Parse(installed), years));

    [Fact]
    public async Task RegistrationPersistsAndRejectsDuplicateSerialInvoice()
    {
        using var db = Database();
        var controller = new RegistrationController(db);
        Assert.IsType<OkObjectResult>(await controller.Register(Request()));
        Assert.IsType<ConflictObjectResult>(await controller.Register(Request()));
        var row = Assert.Single(await db.WarrantyRegistrations.ToListAsync());
        Assert.IsType<OkObjectResult>(await controller.GetByCode(row.Code));
        Assert.IsType<NotFoundResult>(await controller.GetByCode("missing"));
    }

    [Fact]
    public async Task RollsAreNumberedAndRegistrationFlagsReflectInventory()
    {
        using var db = Database();
        var request = new CreateRollsRequest("pir", "tint", "LOT-TEST", "SUP-TEST", "pending", 3);
        var rolls = await RollService.CreateRolls(request, db);
        var prefix = $"SZ-PIR-{DateTime.UtcNow:yy}-";
        Assert.Equal(new[] { 1, 2, 3 }.Select(n => prefix + n.ToString("D6")), rolls.Select(r => r.Id));
        Assert.Equal(prefix + "000004", Assert.Single(await RollService.CreateRolls(request with { Quantity = 1 }, db)).Id);
        var row = WarrantyService.Validate(Request() with { FilmSerial = rolls[0].Id }).Entity!;
        Assert.Equal(new[] { "roll_not_approved", "roll_not_distributed" }, await WarrantyService.AssessFlags(row, db));
        rolls[0].Qc = RollQc.Approved;
        rolls[0].Status = RollStatus.Shipped;
        await db.SaveChangesAsync();
        Assert.Empty(await WarrantyService.AssessFlags(row, db));
        row.Type = WarrantyType.Ppf;
        Assert.Contains("type_mismatch", await WarrantyService.AssessFlags(row, db));
        row.FilmSerial = "UNKNOWN";
        Assert.Contains("roll_unknown", await WarrantyService.AssessFlags(row, db));
    }

    [Theory]
    [InlineData(4, 2)]
    [InlineData(0, 1)]
    [InlineData(-1, 1)]
    [InlineData(5, 5)]
    [InlineData(10000, 1)]
    public async Task InvalidPeriodsDoNotChangeSettings(int film, int install)
    {
        using var db = Database();
        db.CoverageSettings.Add(new CoverageSetting { TintFilmYears = 5, TintInstallYears = 2 });
        await db.SaveChangesAsync();
        Assert.IsType<BadRequestObjectResult>(await Admin(db).SaveSettings(
            new(new(new(film, install), new(null, null)), null)));
        Assert.Equal(5, (await db.CoverageSettings.SingleAsync()).TintFilmYears);
    }

    [Theory]
    [InlineData("tint")]
    [InlineData("ppf")]
    public async Task SettingsPersistAndActivationUsesMatchingPeriods(string type)
    {
        using var db = Database();
        var admin = Admin(db);
        Assert.IsType<OkObjectResult>(await admin.SaveSettings(new(new(new(5, 2), new(7, 3)), null)));
        var row = WarrantyService.Validate(Request() with { Type = type, Panels = ["hood"] }).Entity!;
        db.WarrantyRegistrations.Add(row);
        await db.SaveChangesAsync();
        Assert.IsType<OkObjectResult>(await admin.Decision(row.Code, new("active", null)));
        Assert.Equal(DateOnly.Parse(type == "tint" ? "2031-01-14" : "2033-01-14"), row.FilmEnds);
        Assert.Equal(DateOnly.Parse(type == "tint" ? "2028-01-14" : "2029-01-14"), row.InstallEnds);
        Assert.NotNull(WarrantyService.ToPublic(row).Coverage);
        Assert.IsType<BadRequestObjectResult>(await admin.Decision(row.Code, new("REJECTED", "")));
        Assert.IsType<BadRequestObjectResult>(await admin.Decision(row.Code, new("99", null)));
        Assert.IsType<OkObjectResult>(await admin.Decision(row.Code, new("rejected", "Incorrect serial")));
        Assert.Null(row.FilmEnds);
        Assert.Null(WarrantyService.ToPublic(row).Coverage);
        Assert.IsType<OkObjectResult>(await admin.SaveSettings(new(new(new(null, null), new(null, null)), null)));
        await admin.Decision(row.Code, new("active", null));
        Assert.Null(row.FilmEnds);
        Assert.Null(row.InstallEnds);
    }

    [Fact]
    public void PublicRecordMasksIdentityAndHidesInternalFlags()
    {
        var row = WarrantyService.Validate(Request()).Entity!;
        row.FlagsJson = "[\"roll_unknown\"]";
        var publicRecord = WarrantyService.ToPublic(row);
        var json = JsonSerializer.Serialize(publicRecord);
        Assert.DoesNotContain(row.Owner, json);
        Assert.DoesNotContain(row.Phone, json);
        Assert.DoesNotContain(row.SellerPhone, json);
        Assert.DoesNotContain(row.Vin, json);
        Assert.DoesNotContain("roll_unknown", json);
        Assert.Null(publicRecord.Coverage);
    }

    [Fact]
    public void RejectsEmptyDuplicateAreasAndUnknownType()
    {
        Assert.NotNull(WarrantyService.Validate(Request() with { Windows = [] }).Error);
        Assert.NotNull(WarrantyService.Validate(Request() with { Windows = ["rear", "rear"] }).Error);
        Assert.NotNull(WarrantyService.Validate(Request() with { Type = "vinyl" }).Error);
        Assert.Equal("JTDBE32K123456789", WarrantyService.Validate(Request() with { Vin = "jtdbe32k-1234 56789" }).Entity!.Vin);
    }

    [Fact]
    public async Task LookupByCodeVinAndPhoneReturnsMaskedRecords()
    {
        using var db = Database();
        var row = WarrantyService.Validate(Request()).Entity!;
        db.WarrantyRegistrations.Add(row);
        await db.SaveChangesAsync();
        var controller = new WarrantyController(db);
        foreach (var (by, query) in new[] { ("code", row.Code), ("vin", row.Vin.ToLowerInvariant()), ("phone", row.Phone) })
        {
            var response = Assert.IsType<OkObjectResult>(await controller.Lookup(by, query));
            using var json = JsonDocument.Parse(JsonSerializer.Serialize(response.Value));
            var record = Assert.Single(json.RootElement.GetProperty("records").EnumerateArray());
            Assert.Equal(row.Code, record.GetProperty("Code").GetString());
            Assert.False(record.TryGetProperty("Owner", out _));
        }
    }

    [Fact]
    public async Task AdminLoginRejectsWrongPasswordAndIssuesTokenForCorrectPassword()
    {
        using var db = Database();
        db.AdminUsers.Add(new AdminUser { PasswordHash = BCrypt.Net.BCrypt.HashPassword("test-only-password") });
        await db.SaveChangesAsync();
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Jwt:Key"] = new string('a', 64) }).Build();
        var controller = new AdminController(db, cfg);
        Assert.IsType<UnauthorizedObjectResult>(await controller.Login(new("wrong", "admin")));
        Assert.IsType<UnauthorizedObjectResult>(await controller.Login(new("test-only-password", "unknown-user")));
        Assert.IsType<OkObjectResult>(await controller.Login(new("test-only-password", "admin")));
    }

    [Fact]
    public async Task CartonRoleSignsInWithRoleAndLockedAccountsAreRejected()
    {
        using var db = Database();
        db.AdminUsers.AddRange(
            new AdminUser { Username = "manager", Role = "admin", PasswordHash = BCrypt.Net.BCrypt.HashPassword("manager-password") },
            new AdminUser { Username = "carton-operator", Role = "carton", PasswordHash = BCrypt.Net.BCrypt.HashPassword("operator-password") });
        await db.SaveChangesAsync();
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Jwt:Key"] = new string('a', 64) }).Build();
        var controller = new AdminController(db, cfg);

        var manager = Assert.IsType<OkObjectResult>(await controller.Login(new("manager-password", "manager")));
        var managerValue = JsonSerializer.SerializeToElement(manager.Value);
        Assert.Equal("admin", managerValue.GetProperty("role").GetString());
        var operatorLogin = Assert.IsType<OkObjectResult>(await controller.Login(new("operator-password", "carton-operator")));
        var operatorValue = JsonSerializer.SerializeToElement(operatorLogin.Value);
        Assert.Equal("carton", operatorValue.GetProperty("role").GetString());

        // A locked account cannot sign in even with the right password.
        var user = await db.AdminUsers.SingleAsync(u => u.Username == "carton-operator");
        user.Active = false;
        await db.SaveChangesAsync();
        Assert.IsType<UnauthorizedObjectResult>(await controller.Login(new("operator-password", "carton-operator")));
    }

    [Theory]
    [InlineData(6)]
    [InlineData(10)]
    [InlineData(29)]
    public void WarrantyCodeLengthFollowsSettings(int length)
    {
        var setting = new CoverageSetting { WarrantyCodeLength = length };
        var entity = WarrantyService.Validate(Request(), setting.WarrantyCodeLength).Entity!;
        Assert.Equal(3 + length, entity.Code.Length);
        Assert.Matches($"^SZ-[A-Z0-9]{{{length}}}$", entity.Code);
    }
}
