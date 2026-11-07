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
        public async Task<(LabelView Label, string Token)> Issue()
        {
            var label = Assert.Single(await Service.Issue("SZ-TEST-26-000001", 1));
            return (label, new Uri(label.ActivationUrl).Fragment[1..]);
        }
        public void Dispose() { Db.Dispose(); Connection.Dispose(); }
    }
    static RegisterRequest Registration(string phone = "09121111111") => new("ppf", "Toyota", "Camry", "Test Customer", phone,
        "TEST123", "JTDBE32K123456789", "FORGED", "INV-TEST", "2026-01-15", "Test Seller", "09122222222", "Test Shop", ["rear"], ["hood"]);
    static async Task Error(int status, Func<Task> action) => Assert.Equal(status, (await Assert.ThrowsAsync<ActivationError>(action)).Status);

    [Fact]
    public async Task LabelsAreUniqueReprintableAndContainNoPersonalData()
    {
        using var f = new Fixture();
        var labels = await f.Service.Issue("SZ-TEST-26-000001", 3);
        Assert.Equal(3, labels.Select(x => x.Id).Distinct().Count());
        Assert.Equal(3, labels.Select(x => x.ActivationUrl).Distinct().Count());
        Assert.All(labels, x => Assert.StartsWith("https://solarzed.com/activate#", x.ActivationUrl));
        var stored = await f.Db.BoxLabels.FirstAsync();
        Assert.DoesNotContain(new Uri(labels[0].ActivationUrl).Fragment[1..], stored.ProtectedToken);
        Assert.Equal(labels.Single(x => x.Id == stored.Id).ActivationUrl, f.Service.View(stored, "https://solarzed.com").ActivationUrl);
    }

    [Theory]
    [InlineData("http://solarzed.com")]
    [InlineData("https://localhost")]
    [InlineData("https://user:password@solarzed.com")]
    [InlineData("https://solarzed.com/path")]
    public void RejectsInvalidPrintDomains(string site) => Assert.Throws<ActivationError>(() => BoxLabelService.ValidateSite(site));

    [Fact]
    public async Task InStockLabelsCanBePrintedButRequireReleaseBeforeOtp()
    {
        using var f = new Fixture();
        var roll = await f.Db.Rolls.SingleAsync();
        roll.Qc = RollQc.Pending; await f.Db.SaveChangesAsync();
        await Error(409, () => f.Issue());
        roll.Qc = RollQc.Approved; roll.Status = RollStatus.InStock; await f.Db.SaveChangesAsync();
        var (_, token) = await f.Issue();
        Assert.False((await f.Service.Info(token)).Released);
        await Error(409, () => f.Service.SendCode(token, "09121111111", default));
        roll.Status = RollStatus.Shipped;
        await f.Db.SaveChangesAsync();
        Assert.True((await f.Service.Info(token)).Released);
        (await f.Db.CoverageSettings.SingleAsync()).TintFilmYears = null; await f.Db.SaveChangesAsync();
        await Error(400, () => f.Issue());
        Assert.Single(await f.Db.BoxLabels.ToListAsync());
    }

    [Fact]
    public async Task VerifiedActivationUsesServerProductAndLabelCoverageOnce()
    {
        using var f = new Fixture();
        var (label, token) = await f.Issue();
        var challenge = await f.Service.SendCode(token, "۰۹۱۲۱۱۱۱۱۱۱", default);
        Assert.NotEqual(f.Sms.LastCode, challenge.CodeHash);
        (await f.Db.CoverageSettings.SingleAsync()).TintFilmYears = 10; await f.Db.SaveChangesAsync();
        var request = new ActivateBoxRequest(token, challenge.Id, f.Sms.LastCode, Registration());
        var warranty = await f.Service.Activate(request);
        Assert.Equal("active", warranty.Status);
        Assert.Equal("tint", warranty.Type);
        Assert.Equal(label.Id, warranty.FilmSerial);
        Assert.Equal(DateOnly.Parse("2031-01-14"), warranty.Coverage!.FilmEnds);
        Assert.Equal(DateOnly.Parse("2028-01-14"), warranty.Coverage.InstallEnds);
        Assert.Equal("SZ-TEST-26-000001", (await f.Db.WarrantyRegistrations.SingleAsync()).RollId);
        Assert.True(challenge.Consumed);
        await Error(409, () => f.Service.Activate(request));
        Assert.Single(await f.Db.WarrantyRegistrations.ToListAsync());
        var info = await f.Service.Info(token);
        Assert.True(info.Activated);
    }

    [Fact]
    public async Task MobileBindingExpiryAndFiveWrongCodesPreventActivation()
    {
        using var f = new Fixture();
        var (_, token) = await f.Issue();
        var challenge = await f.Service.SendCode(token, "09121111111", default);
        var request = new ActivateBoxRequest(token, challenge.Id, f.Sms.LastCode, Registration("09123333333"));
        await Error(400, () => f.Service.Activate(request));
        request = request with { Registration = Registration() };
        challenge.ExpiresAt = DateTime.UtcNow.AddSeconds(-1); await f.Db.SaveChangesAsync();
        await Error(410, () => f.Service.Activate(request));
        challenge.ExpiresAt = DateTime.UtcNow.AddMinutes(5); await f.Db.SaveChangesAsync();
        var wrongCode = f.Sms.LastCode == "000000" ? "111111" : "000000";
        for (var i = 0; i < 5; i++) await Error(400, () => f.Service.Activate(request with { Otp = wrongCode }));
        await Error(429, () => f.Service.Activate(request));
        Assert.Empty(await f.Db.WarrantyRegistrations.ToListAsync());
    }

    [Fact]
    public async Task FailedOrUnconfiguredSmsNeverActivatesAndResendIsLimited()
    {
        using var f = new Fixture();
        var (_, token) = await f.Issue();
        f.Sms.Configured = false;
        await Error(503, () => f.Service.SendCode(token, "09121111111", default));
        Assert.Empty(await f.Db.ActivationChallenges.ToListAsync());
        f.Sms.Configured = true; f.Sms.Fails = true;
        await Error(503, () => f.Service.SendCode(token, "09121111111", default));
        var failed = await f.Db.ActivationChallenges.SingleAsync();
        Assert.False(failed.Sent);
        await Error(400, () => f.Service.Activate(new(token, failed.Id, "123456", Registration())));
        await Error(429, () => f.Service.SendCode(token, "09121111111", default));
    }

    [Fact]
    public async Task LostRaceRollsBackNewWarrantyAndOtpConsumption()
    {
        using var f = new Fixture();
        var (label, token) = await f.Issue();
        var challenge = await f.Service.SendCode(token, "09121111111", default);
        // Load a stale label in a second context before the first customer wins.
        using var stale = new SqliteDb(f.Options);
        await stale.BoxLabels.SingleAsync(x => x.Id == label.Id);
        await stale.ActivationChallenges.SingleAsync(x => x.Id == challenge.Id);
        var staleService = new BoxLabelService(stale, f.Protection, f.Sms);
        var request = new ActivateBoxRequest(token, challenge.Id, f.Sms.LastCode, Registration());
        await f.Service.Activate(request);
        // Both callers saw unused snapshots; the DB revision guard rolls back the loser.
        await Error(409, () => staleService.Activate(request));
        Assert.Single(await f.Db.WarrantyRegistrations.ToListAsync());
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
}
