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
                Batch = "TEST", Supplier = "TEST", Qc = RollQc.Approved, Status = RollStatus.Shipped });
            Db.CoverageSettings.Add(new CoverageSetting { TintFilmYears = 5, TintInstallYears = 2 });
            Db.SaveChanges(); Service = new(Db, Protection, Sms);
        }
        public async Task<(LabelView Label, string Code)> Issue()
        {
            var label = Assert.Single(await Service.Issue("SZ-TEST-26-000001", 1, "SA"));
            return (label, label.FullCode!);
        }
        public void Dispose() { Db.Dispose(); Connection.Dispose(); }
    }
    const string Customer = "09121111111";
    static RegisterRequest Registration(string phone = "09121111111") => new("ppf", "Toyota", "Camry", "Test Customer", phone,
        "TEST123", "JTDBE32K123456789", "FORGED", "INV-TEST", "2026-01-15", "Test Seller", "09122222222", "Test Shop", ["rear"], ["hood"]);
    static async Task Error(int status, Func<Task> action) => Assert.Equal(status, (await Assert.ThrowsAsync<ActivationError>(action)).Status);

    [Fact]
    public async Task CardsCarryFactorySerialAndWarrantyCodeAndAreUnique()
    {
        using var f = new Fixture();
        var labels = await f.Service.Issue("SZ-TEST-26-000001", 3, " sa ");
        Assert.Equal(3, labels.Select(x => x.Id).Distinct().Count());
        Assert.Equal(3, labels.Select(x => x.CardCode).Distinct().Count());
        Assert.All(labels, x =>
        {
            Assert.Equal("SA", x.FactoryCode);
            Assert.Equal($"SA-{x.Id}-{x.CardCode}", x.FullCode);
            Assert.Equal($"https://solarzed.com/activate#{x.FullCode}", x.ActivationUrl);
            Assert.Matches("^SZ-[A-Z0-9]{16}$", x.CardCode!);
        });
        var stored = await f.Db.BoxLabels.FirstAsync();
        Assert.Equal(labels.Single(x => x.Id == stored.Id).ActivationUrl, f.Service.View(stored, "https://solarzed.com").ActivationUrl);
        await Error(400, () => f.Service.Issue("SZ-TEST-26-000001", 1, "S1"));
        await Error(400, () => f.Service.Issue("SZ-TEST-26-000001", 1, null));
    }

    [Fact]
    public async Task OnlyTheExactCardCodeOpensTheCardAndLegacyTokensStillWork()
    {
        using var f = new Fixture();
        var (label, code) = await f.Issue();
        Assert.Equal(label.Id, (await f.Service.Info(code.ToLowerInvariant())).Id);
        Assert.Equal(label.CardCode, (await f.Service.Info($" {code} ")).WarrantyCode);
        await Error(404, () => f.Service.Info($"BF-{label.Id}-{label.CardCode}"));
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
    public async Task SignedInActivationUsesSessionMobileServerProductAndCardWarrantyCodeOnce()
    {
        using var f = new Fixture();
        var (label, code) = await f.Issue();
        await new BoxTransferService(f.Db).Transfer(new([label.Id], "Rep", "09125555555", null, null), "admin");
        (await f.Db.CoverageSettings.SingleAsync()).TintFilmYears = 10; await f.Db.SaveChangesAsync();
        // The form's phone is ignored; the signed-in, SMS-verified mobile is the warranty owner.
        var request = new ActivateBoxRequest(code, Registration("09129999999"));
        var warranty = await f.Service.Activate(request, Customer);
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
        Assert.Single(await f.Db.WarrantyRegistrations.ToListAsync());
        Assert.True((await f.Service.Info(code)).Activated);
        Assert.Single(await new PortalService(f.Db, f.Sms).Warranties(Customer));
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
        var request = new ActivateBoxRequest(code, Registration());
        await f.Service.Activate(request, Customer);
        // Both callers saw unused snapshots; the DB revision guard rolls back the loser.
        await Error(409, () => staleService.Activate(request, "09124444444"));
        Assert.Single(await f.Db.WarrantyRegistrations.ToListAsync());
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
