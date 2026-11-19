using System.Net;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Tests;

public class BoxLabelTests
{
    sealed class SqliteDb(DbContextOptions<AppDbContext> options) : AppDbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder model)
        {
            base.OnModelCreating(model);
            foreach (var entity in model.Model.GetEntityTypes())
                foreach (var property in entity.GetProperties())
                    if (property.ClrType == typeof(string)) property.SetColumnType("TEXT");
        }
    }
    sealed class FakeSms : IActivationSmsSender
    {
        public bool Configured { get; set; } = true;
        public bool Fails { get; set; }
        public string LastCode { get; private set; } = "";
        public Task Send(string phone, string code, string reference, CancellationToken cancellationToken)
        { if (Fails) throw new HttpRequestException(); LastCode = code; return Task.CompletedTask; }
    }
    sealed class Fixture : IDisposable
    {
        public readonly SqliteConnection Connection = new("Data Source=:memory:");
        public readonly FakeSms Sms = new();
        public readonly IDataProtectionProvider Protection = new EphemeralDataProtectionProvider();
        public SqliteDb Db { get; }
        public BoxLabelService Service { get; }
        public DbContextOptions<AppDbContext> Options { get; }
        public Fixture()
        {
            Connection.Open();
            Options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(Connection).Options;
            Db = new SqliteDb(Options); Db.Database.EnsureCreated();
            Db.Rolls.Add(new Roll { Id = "SZ-TEST-26-000001", ModelCode = "TEST", Type = WarrantyType.Tint,
                Batch = "TEST", Supplier = " abc ", LengthM = 150, Qc = RollQc.Approved, Status = RollStatus.Shipped });
            Db.CoverageSettings.Add(new CoverageSetting { TintFilmYears = 5, TintInstallYears = 2 });
            Db.SaveChanges(); Service = new(Db, Protection, Sms);
        }
        public async Task<(LabelView Label, string Code)> Issue()
        {
            var label = Assert.Single(await Service.Issue("SZ-TEST-26-000001", 1));
            return (label, label.FullCode!);
        }
        public void Dispose() { Db.Dispose(); Connection.Dispose(); }
    }
    const string Customer = "09121111111";
    static RegisterRequest Registration(string phone = "09121111111") => new("ppf", "Toyota", "Camry", "Test Customer", phone,
        "TEST123", "JTDBE32K123456789", "FORGED", "INV-TEST", "2026-01-15", "Test Seller", "09122222222", "Test Shop", ["rear"], ["hood"]);
    static async Task Error(int status, Func<Task> action) => Assert.Equal(status, (await Assert.ThrowsAsync<ActivationError>(action)).Status);

    [Fact]
    public async Task CardsCarrySerialAndSevenDigitWarrantyCodeAndAreUnique()
    {
        using var f = new Fixture();
        var labels = await f.Service.Issue("SZ-TEST-26-000001", 3);
        Assert.Equal(3, labels.Select(x => x.Id).Distinct().Count());
        Assert.Equal(3, labels.Select(x => x.CardCode).Distinct().Count());
        Assert.All(labels, x =>
        {
            Assert.Equal("ABC", x.FactoryCode);   // copied from the roll and never printed on the card
            Assert.Equal(150m, x.RemainingLengthM);
            Assert.Equal($"{x.Id}-{x.CardCode}", x.FullCode);
            Assert.Equal($"https://solarzed.com/activate#{x.FullCode}", x.ActivationUrl);
            Assert.Matches("^[1-9][0-9]{6}$", x.CardCode!);
        });
        var stored = await f.Db.BoxLabels.FirstAsync();
        Assert.Equal(labels.Single(x => x.Id == stored.Id).ActivationUrl, f.Service.View(stored, "https://solarzed.com").ActivationUrl);
        (await f.Db.Rolls.SingleAsync()).Supplier = "S1";
        await f.Db.SaveChangesAsync();
        await Error(400, () => f.Issue());
    }

    [Fact]
    public async Task OnlyTheExactCardCodeOpensTheCardAndLegacyTokensStillWork()
    {
        using var f = new Fixture();
        var (label, code) = await f.Issue();
        Assert.Equal(label.Id, (await f.Service.Info(code.ToLowerInvariant())).Id);
        Assert.Equal(label.CardCode, (await f.Service.Info($" {code} ")).WarrantyCode);
        Assert.Null((await f.Service.Info(code)).FactoryCode);
        await Error(404, () => f.Service.Info($"{label.Id}-{(label.CardCode == "1234567" ? "7654321" : "1234567")}"));
        await Error(404, () => f.Service.Info($"SA-{label.Id}-SZ-AAAAAAAAAAAAAAAA"));
        await Error(404, () => f.Service.Info(label.Id));

        // Labels issued before warranty cards keep their random 64-hex token.
        var legacy = await f.Db.BoxLabels.SingleAsync();
        legacy.FactoryCode = null; legacy.CardCode = null; await f.Db.SaveChangesAsync();
        var token = new Uri(f.Service.View(legacy, "https://solarzed.com").ActivationUrl).Fragment[1..];
        Assert.Matches("^[a-f0-9]{64}$", token);
        Assert.Equal(label.Id, (await f.Service.Info(token)).Id);
        await Error(404, () => f.Service.Info(code));
    }

    [Fact]
    public async Task CartonsAreKeyedByThePrintedRollNumber()
    {
        using var f = new Fixture();
        var labels = await f.Service.Issue("SZ-TEST-26-000001", [" cpt30614374 ", "CPT30614375"]);
        Assert.Equal(["CPT30614374", "CPT30614375"], labels.Select(x => x.Id).ToArray());
        var first = labels[0];
        Assert.Equal($"CPT30614374-{first.CardCode}", first.FullCode);
        Assert.Equal("CPT30614374", (await f.Service.Info($"cpt30614374-{first.CardCode}")).Id);
        // Another carton's warranty number does not open this carton.
        await Error(404, () => f.Service.Info($"CPT30614374-{labels[1].CardCode}"));
        // A carton gets one card only; duplicates and malformed numbers are refused.
        await Error(409, () => f.Service.Issue("SZ-TEST-26-000001", ["CPT30614374"]));
        await Error(400, () => f.Service.Issue("SZ-TEST-26-000001", ["CPT1", "cpt1"]));
        await Error(400, () => f.Service.Issue("SZ-TEST-26-000001", ["CPT/1"]));
        await Error(400, () => f.Service.Issue("SZ-TEST-26-000001", Array.Empty<string>()));
    }

    [Fact]
    public async Task LegacyFactorySerialWarrantyCardsStillOpen()
    {
        using var f = new Fixture();
        var (label, _) = await f.Issue();
        var stored = await f.Db.BoxLabels.SingleAsync();
        stored.CardCode = "SZ-ABCDEFGHJKLMNPQR"; stored.FactoryCode = "SA"; await f.Db.SaveChangesAsync();
        var legacy = $"SA-{label.Id}-SZ-ABCDEFGHJKLMNPQR";
        Assert.Equal(legacy, BoxLabelService.FullCode(stored));
        Assert.Equal(label.Id, (await f.Service.Info(legacy)).Id);
        await Error(404, () => f.Service.Info($"BF-{label.Id}-SZ-ABCDEFGHJKLMNPQR"));
    }

    [Theory]
    [InlineData("http://solarzed.com")]
    [InlineData("https://localhost")]
    [InlineData("https://user:password@solarzed.com")]
    [InlineData("https://solarzed.com/path")]
    public void RejectsInvalidPrintDomains(string site) => Assert.Throws<ActivationError>(() => BoxLabelService.ValidateSite(site));

    [Fact]
    public async Task InStockLabelsCanBePrintedButRequireReleaseBeforeActivation()
    {
        using var f = new Fixture();
        var roll = await f.Db.Rolls.SingleAsync();
        roll.Qc = RollQc.Pending; await f.Db.SaveChangesAsync();
        await Error(409, () => f.Issue());
        roll.Qc = RollQc.Approved; roll.Status = RollStatus.InStock; await f.Db.SaveChangesAsync();
        var (_, code) = await f.Issue();
        Assert.False((await f.Service.Info(code)).Released);
        await Error(409, () => f.Service.Activate(new(code, Registration()), Customer));
        roll.Status = RollStatus.Shipped;
        await f.Db.SaveChangesAsync();
        Assert.True((await f.Service.Info(code)).Released);
        (await f.Db.CoverageSettings.SingleAsync()).TintFilmYears = null; await f.Db.SaveChangesAsync();
        await Error(400, () => f.Issue());
        Assert.Single(await f.Db.BoxLabels.ToListAsync());
    }

    [Fact]
    public async Task DeletingARollAlwaysWorksAndKeepsItsWarranties()
    {
        using var f = new Fixture();
        var (label, code) = await f.Issue();
        await new BoxTransferService(f.Db).Transfer(new([label.Id], "Rep", "09125555555", null, null), "admin");
        await f.Service.Activate(new ActivateBoxRequest(code, Registration(), 30m), Customer);
        var admin = new Solarzed.Api.Controllers.AdminController(f.Db, new ConfigurationBuilder().Build());
        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await admin.DeleteRoll("SZ-TEST-26-000001"));
        using var check = new SqliteDb(f.Options);
        Assert.Empty(await check.Rolls.ToListAsync());
        Assert.Empty(await check.BoxLabels.ToListAsync());
        Assert.Empty(await check.BoxTransfers.ToListAsync());
        var warranty = await check.WarrantyRegistrations.SingleAsync();
        Assert.Null(warranty.RollId);
        Assert.Equal(30m, warranty.UsedLengthM);
    }

    [Fact]
    public async Task SignedInInstallerRegistersSeparateVehiclesFromTheSameRollAndInvoice()
    {
        using var f = new Fixture();
        var (label, code) = await f.Issue();
        await new BoxTransferService(f.Db).Transfer(new([label.Id], "Rep", "09125555555", null, null), "admin");
        (await f.Db.CoverageSettings.SingleAsync()).TintFilmYears = 10; await f.Db.SaveChangesAsync();
        // The form's phone is ignored; the signed-in, SMS-verified mobile is the warranty owner.
        var request = new ActivateBoxRequest(code, Registration("09129999999"), 30m);
        await Error(400, () => f.Service.Activate(request with { UsedLengthM = null }, Customer));
        await Error(400, () => f.Service.Activate(request with { UsedLengthM = 0 }, Customer));
        await Error(400, () => f.Service.Activate(request with { UsedLengthM = 30.001m }, Customer));
        var first = await f.Service.Activate(request, Customer);
        var warranty = first.Warranty;
        Assert.Equal(30m, warranty.UsedLengthM);
        Assert.Equal(120m, first.RemainingLengthM);
        Assert.Equal("active", warranty.Status);
        Assert.Equal("tint", warranty.Type);
        Assert.Equal(label.Id, warranty.FilmSerial);
        Assert.Equal(label.CardCode, warranty.Code);
        Assert.Equal(DateOnly.Parse("2031-01-14"), warranty.Coverage!.FilmEnds);
        Assert.Equal(DateOnly.Parse("2028-01-14"), warranty.Coverage.InstallEnds);
        var stored = await f.Db.WarrantyRegistrations.SingleAsync();
        Assert.Equal(Customer, stored.Phone);
        Assert.Equal("SZ-TEST-26-000001", stored.RollId);
        var box = await f.Db.BoxLabels.AsNoTracking().SingleAsync();
        Assert.Equal(Customer, box.HolderPhone);
        Assert.Equal(label.CardCode, box.WarrantyCode);
        var last = await f.Db.BoxTransfers.OrderBy(x => x.Id).LastAsync();
        Assert.Equal("09125555555", last.FromPhone);
        Assert.Equal(Customer, last.ToPhone);
        await Error(409, () => f.Service.Activate(request, Customer));
        var another = request with { Registration = request.Registration with { Vin = "JTDBE32K123456788", Plate = "OTHER123" }, UsedLengthM = 120m };
        await Error(409, () => f.Service.Activate(another, "09124444444"));
        await Error(409, () => f.Service.Activate(another with { UsedLengthM = 120.01m }, Customer));
        Assert.False((await f.Service.Info(code)).CanRegister);
        Assert.Null((await f.Service.Info(code)).RemainingLengthM);
        Assert.Equal(120m, (await f.Service.Info(code, Customer)).RemainingLengthM);
        var second = await f.Service.Activate(another, Customer);
        Assert.NotEqual(warranty.Code, second.Warranty.Code);
        Assert.Equal("OTHER123", second.Warranty.Plate);
        Assert.Equal(0m, second.RemainingLengthM);
        Assert.False((await f.Service.Info(code, Customer)).CanRegister);
        Assert.Equal(2, await f.Db.BoxTransfers.CountAsync());
        Assert.Equal(2, (await new PortalService(f.Db, f.Sms).Warranties(Customer)).Length);
    }

    [Fact]
    public async Task LostRaceRollsBackTheSecondActivation()
    {
        using var f = new Fixture();
        var (label, code) = await f.Issue();
        // Load a stale label in a second context before the first customer wins.
        using var stale = new SqliteDb(f.Options);
        await stale.BoxLabels.SingleAsync(x => x.Id == label.Id);
        var staleService = new BoxLabelService(stale, f.Protection, f.Sms);
        var request = new ActivateBoxRequest(code, Registration(), 100m);
        await f.Service.Activate(request, Customer);
        // Both callers saw unused snapshots; the DB revision guard rolls back the loser.
        await Error(409, () => staleService.Activate(request with { Registration = Registration() with { Vin = "JTDBE32K123456788" } }, Customer));
        Assert.Single(await f.Db.WarrantyRegistrations.ToListAsync());
        Assert.Equal(50m, (await f.Service.Info(code, Customer)).RemainingLengthM);
    }

    [Fact]
    public async Task SmsLoginBindsOneMobileAndLimitsWrongAndExpiredCodes()
    {
        using var f = new Fixture();
        var portal = new PortalService(f.Db, f.Sms);
        var challenge = await portal.SendCode("+98 912 111 1111", default);
        Assert.Equal(Customer, challenge.Phone);
        Assert.NotEqual(f.Sms.LastCode, challenge.CodeHash);
        var wrong = f.Sms.LastCode == "000000" ? "111111" : "000000";
        await Error(400, () => portal.Verify(challenge.Id, wrong));
        challenge.ExpiresAt = DateTime.UtcNow.AddSeconds(-1); await f.Db.SaveChangesAsync();
        await Error(410, () => portal.Verify(challenge.Id, f.Sms.LastCode));
        challenge.ExpiresAt = DateTime.UtcNow.AddMinutes(5); await f.Db.SaveChangesAsync();
        for (var i = 0; i < 4; i++) await Error(400, () => portal.Verify(challenge.Id, wrong));
        await Error(429, () => portal.Verify(challenge.Id, f.Sms.LastCode));
        Assert.Empty(await f.Db.PortalUsers.ToListAsync());

        challenge.CreatedAt = DateTime.UtcNow.AddMinutes(-5); await f.Db.SaveChangesAsync();
        var second = await portal.SendCode("09121111111", default);
        var user = await portal.Verify(second.Id, f.Sms.LastCode);
        Assert.Equal(Customer, user.Phone);
        Assert.NotNull(user.LastLoginAt);
        await Error(400, () => portal.Verify(second.Id, f.Sms.LastCode));
        user.Active = false; await f.Db.SaveChangesAsync();
        await Error(403, () => portal.SendCode(Customer, default));
    }

    [Fact]
    public async Task FailedOrUnconfiguredSmsNeverSignsInAndResendIsLimited()
    {
        using var f = new Fixture();
        var portal = new PortalService(f.Db, f.Sms);
        f.Sms.Configured = false;
        await Error(503, () => portal.SendCode(Customer, default));
        Assert.Empty(await f.Db.LoginChallenges.ToListAsync());
        f.Sms.Configured = true; f.Sms.Fails = true;
        await Error(503, () => portal.SendCode(Customer, default));
        var failed = await f.Db.LoginChallenges.SingleAsync();
        Assert.False(failed.Sent);
        await Error(400, () => portal.Verify(failed.Id, "123456"));
        await Error(429, () => portal.SendCode(Customer, default));
    }

    [Theory]
    [InlineData("<return>12345</return>", true)]
    [InlineData("<return>0</return>", false)]
    [InlineData("<return>-1</return>", false)]
    [InlineData("<Fault><return>12345</return></Fault>", false)]
    [InlineData("not xml", false)]
    public void FarazOnlyAcceptsPositiveProviderResult(string response, bool accepted) => Assert.Equal(accepted, ActivationSmsSender.FarazAccepted(response));

    [Fact]
    public void FarazEnvelopeEscapesSecretsAndUsesTheExistingOtpVariable()
    {
        var xml = ActivationSmsSender.FarazEnvelope("3000", "09121111111", "pattern", "secret<&", "123456");
        Assert.Contains("989121111111", xml);
        Assert.Contains("secret&lt;&amp;", xml);
        Assert.Contains("&quot;code&quot;", xml);
        Assert.DoesNotContain("secret<&", xml);
    }

    [Fact]
    public void FarazEnvelopeUsesTheConfiguredPatternVariable()
    {
        var xml = ActivationSmsSender.FarazEnvelope("21000051112", "09121111111", "2675", "t", "654321", "code1");
        Assert.Contains("&quot;code1&quot;:&quot;654321&quot;", xml);
        Assert.Contains("<patternID xsi:type=\"xsd:string\">2675</patternID>", xml);
    }

    [Fact]
    public void SoapModeAcceptsThePlainHttpPatternEndpoint()
    {
        IConfiguration Cfg(string mode) => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["Faraz:Mode"] = mode, ["Faraz:Endpoint"] = "http://185.112.33.61/wbs/send.php", ["Faraz:Token"] = "t",
            ["Faraz:OtpPattern"] = "2675", ["Faraz:Sender"] = "21000051112", ["Faraz:CodeVariable"] = "code1" }).Build();
        Assert.True(new ActivationSmsSender(new HttpClient(), Cfg("soap")).Configured);
        Assert.False(new ActivationSmsSender(new HttpClient(), Cfg("legacy")).Configured);
    }
}
