using System.Net;
using System.Text;
using System.Text.Json;
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
        public bool WarrantyConfigured { get; set; } = true;
        public List<(string Phone, string Code, string Link)> Warranties { get; } = [];
        public Task SendWarranty(string phone, string warrantyCode, string link, CancellationToken cancellationToken)
        { if (Fails) throw new HttpRequestException(); Warranties.Add((phone, warrantyCode, link)); return Task.CompletedTask; }
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
            Db.Rolls.Add(new Roll { Id = "SZ-TEST-26-000001", Number = 1, ModelCode = "TEST", Type = WarrantyType.Tint,
                Batch = "TEST", Supplier = " abc ", LengthM = 150, Qc = RollQc.Approved, Status = RollStatus.Shipped });
            Db.CoverageSettings.Add(new CoverageSetting { TintFilmYears = 5, TintInstallYears = 2 });
            Db.SaveChanges(); Service = new(Db, Protection, Sms);
        }
        public async Task<(LabelView Label, string Code)> Issue()
        {
            var label = Assert.Single(await Service.Issue("SZ-TEST-26-000001", 1));
            return (label, label.FullCode!);
        }
        /// <summary>The company (or a seller) transfers the roll to this mobile by ROLL NO.</summary>
        public Task GiveTo(string rollNo, string phone) => new BoxTransferService(Db).Transfer(new([rollNo], null, phone, null, null), "admin");
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
            Assert.Equal("ABC", x.FactoryCode);   // copied from the roll and printed last on the card
            Assert.Equal(150m, x.RemainingLengthM);
            Assert.Equal($"{x.Id}-{x.CardCode}-ABC", x.FullCode);
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
        // Cards printed before the factory was added (RollNo-1234567) still open.
        Assert.Equal(label.Id, (await f.Service.Info($"{label.Id}-{label.CardCode}")).Id);
        await Error(404, () => f.Service.Info($"{label.Id}-{label.CardCode}-XYZ"));   // wrong factory
        await Error(404, () => f.Service.Info($"{label.Id}-{(label.CardCode == "1234567" ? "7654321" : "1234567")}-ABC"));
        await Error(404, () => f.Service.Info($"SA-{label.Id}-SZ-AAAAAAAAAAAAAAAA"));
        await Error(403, () => f.Service.Info(label.Id));   // a bare Serial Number opens only for an approved installer

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
        Assert.Equal($"CPT30614374-{first.CardCode}-ABC", first.FullCode);
        Assert.Equal("CPT30614374", (await f.Service.Info($"cpt30614374-{first.CardCode}-abc")).Id);
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
    public async Task DeletingARollAlwaysWorksAndKeepsActivatedCartonsUsable()
    {
        using var f = new Fixture();
        var (label, code) = await f.Issue();
        var (unused, _) = await f.Issue();
        await new BoxTransferService(f.Db).Transfer(new([label.Id, unused.Id], "Rep", "09125555555", null, null), "admin");
        await f.Service.Activate(new ActivateBoxRequest(code, Registration(), 30m), Customer);
        var admin = new Solarzed.Api.Controllers.AdminController(f.Db, new ConfigurationBuilder().Build());
        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await admin.DeleteRoll("SZ-TEST-26-000001"));

        using (var check = new SqliteDb(f.Options))
        {
            Assert.Empty(await check.Rolls.ToListAsync());
            // The unused carton goes; the activated one stays, unlinked, with its hand-over history.
            var kept = await check.BoxLabels.SingleAsync();
            Assert.Equal(label.Id, kept.Id);
            Assert.Null(kept.RollId);
            Assert.Equal(120m, kept.RemainingLengthM);
            Assert.All(await check.BoxTransfers.ToListAsync(), t => Assert.Equal(label.Id, t.LabelId));
            Assert.Equal(2, await check.BoxTransfers.CountAsync());
            var warranty = await check.WarrantyRegistrations.SingleAsync();
            Assert.Null(warranty.RollId);
            Assert.Equal(30m, warranty.UsedLengthM);
        }

        // The customer's card still works for the next vehicle, but only for the first customer.
        using var after = new SqliteDb(f.Options);
        var service = new BoxLabelService(after, f.Protection, f.Sms);
        Assert.True((await service.Info(code, Customer)).CanRegister);
        var next = new ActivateBoxRequest(code, Registration() with { Vin = "JTDBE32K123456780", InvoiceNumber = "INV-2" }, 20m);
        await Error(409, () => service.Activate(next, "09124444444"));
        var second = await service.Activate(next, Customer);
        Assert.Equal(100m, second.RemainingLengthM);
        Assert.Equal(label.Id, second.Warranty.FilmSerial);
        // The serial of the activated carton cannot be given to a new carton.
        after.Rolls.Add(new Roll { Id = "SZ-TEST-26-000002", Number = 2, ModelCode = "TEST", Type = WarrantyType.Tint,
            Batch = "TEST", Supplier = "ABC", LengthM = 150, Qc = RollQc.Approved, Status = RollStatus.Shipped });
        await after.SaveChangesAsync();
        var reuse = await Assert.ThrowsAsync<ActivationError>(() => service.Issue("SZ-TEST-26-000002", [label.Id]));
        Assert.Contains("already have a warranty card", reuse.Message);
    }

    [Fact]
    public async Task SignedInInstallerRegistersAnyNumberOfVehiclesFromTheSameRollAndInvoice()
    {
        using var f = new Fixture();
        var (label, code) = await f.Issue();
        await new BoxTransferService(f.Db).Transfer(new([label.Id], "Rep", "09125555555", null, null), "admin");
        (await f.Db.CoverageSettings.SingleAsync()).TintFilmYears = 10; await f.Db.SaveChangesAsync();
        // The form's phone is ignored; the signed-in, SMS-verified mobile is the warranty owner.
        var request = new ActivateBoxRequest(code, Registration("09129999999"), 30m);
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
        Assert.False((await f.Service.Info(code)).CanRegister);
        Assert.Null((await f.Service.Info(code)).RemainingLengthM);
        Assert.Equal(120m, (await f.Service.Info(code, Customer)).RemainingLengthM);
        var second = await f.Service.Activate(another, Customer);
        Assert.NotEqual(warranty.Code, second.Warranty.Code);
        Assert.Equal("OTHER123", second.Warranty.Plate);
        Assert.Equal(0m, second.RemainingLengthM);
        // A roll has no fixed vehicle count: meters are optional and a "used up" balance never blocks the holder.
        Assert.True((await f.Service.Info(code, Customer)).CanRegister);
        var third = await f.Service.Activate(another with { Registration = request.Registration with { Vin = "JTDBE32K123456787", Plate = "THIRD123" }, UsedLengthM = null }, Customer);
        Assert.Null(third.Warranty.UsedLengthM);
        Assert.Equal(0m, third.RemainingLengthM);
        // Meters beyond the roll's balance are accepted but flagged for the counter.
        var fourth = await f.Service.Activate(another with { Registration = request.Registration with { Vin = "JTDBE32K123456786", Plate = "FOURTH12" }, UsedLengthM = 5m }, Customer);
        Assert.Contains("roll_overuse", JsonSerializer.Deserialize<string[]>((await f.Db.WarrantyRegistrations.AsNoTracking().SingleAsync(x => x.Code == fourth.Warranty.Code)).FlagsJson)!);
        Assert.Equal(2, await f.Db.BoxTransfers.CountAsync());
        Assert.Equal(4, (await new PortalService(f.Db, f.Sms).Warranties(Customer)).Length);
    }

    [Fact]
    public async Task ManyVehiclesOnOneRollAreFlaggedButNeverBlocked()
    {
        using var f = new Fixture();
        var (label, code) = await f.Issue();
        var roll = await f.Db.Rolls.SingleAsync(); roll.LengthM = 30; await f.Db.SaveChangesAsync();
        await new BoxTransferService(f.Db).Transfer(new([label.Id], "Rep", "09125555555", null, null), "admin");
        var flags = new List<string[]>();
        // 30 m at 4 m per vehicle at most = 7 plausible vehicles; the 8th is flagged, as is a 7th within 24 hours.
        for (var i = 0; i < 8; i++)
        {
            var reg = Registration() with { Vin = $"JTDBE32K12345{i:0000}", Plate = $"PLATE{i}" };
            var done = await f.Service.Activate(new ActivateBoxRequest(code, reg), Customer);
            flags.Add(JsonSerializer.Deserialize<string[]>((await f.Db.WarrantyRegistrations.AsNoTracking().SingleAsync(x => x.Code == done.Warranty.Code)).FlagsJson)!);
        }
        Assert.All(flags.Take(6), x => Assert.Empty(x));
        Assert.Equal(["roll_burst"], flags[6]);
        Assert.Equal(["roll_high_count", "roll_burst"], flags[7]);
        Assert.True((await f.Service.Info(code, Customer)).CanRegister);
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

    [Fact]
    public async Task CardIsIssuedFromTheRollNoRecordedOnTheRoll()
    {
        using var f = new Fixture();
        f.Db.Rolls.Add(new Roll { Id = "SZ-TEST-26-000002", Number = 2, RollNo = "CPT30614374", ModelCode = "TEST", Type = WarrantyType.Tint,
            Batch = "TEST", Supplier = "ABC", LengthM = 30, Qc = RollQc.Approved, Status = RollStatus.InStock });
        await f.Db.SaveChangesAsync();

        var card = Assert.Single(await f.Service.IssueForRolls(["SZ-TEST-26-000002"]));
        Assert.Equal("CPT30614374", card.Id);
        Assert.Equal("SZ-TEST-26-000002", card.RollId);
        Assert.Equal(30m, card.RemainingLengthM);
        Assert.Matches("^CPT30614374-[1-9][0-9]{6}-[A-Z]{3}$", card.FullCode);
        await Error(409, () => f.Service.IssueForRolls(["SZ-TEST-26-000002"]));   // one card per carton
        await Error(400, () => f.Service.IssueForRolls(["SZ-TEST-26-000001"]));   // no Roll No recorded
        await Error(404, () => f.Service.IssueForRolls(["SZ-MISSING"]));
    }

    [Fact]
    public async Task RollWithRollNoOnlyAcceptsItsOwnCarton()
    {
        using var f = new Fixture();
        f.Db.Rolls.Add(new Roll { Id = "SZ-TEST-26-000002", Number = 2, RollNo = "CPT30614374", ModelCode = "TEST", Type = WarrantyType.Tint,
            Batch = "TEST", Supplier = "ABC", LengthM = 30, Qc = RollQc.Approved, Status = RollStatus.Shipped });
        await f.Db.SaveChangesAsync();

        await Error(400, () => f.Service.Issue("SZ-TEST-26-000002", ["CPT99999999"]));
        await Error(400, () => f.Service.Issue("SZ-TEST-26-000002", 1));            // no generated SZB serial either
        await Error(409, () => f.Service.Issue("SZ-TEST-26-000001", ["CPT30614374"])); // another roll owns this carton
        Assert.Equal("CPT30614374", Assert.Single(await f.Service.Issue("SZ-TEST-26-000002", ["cpt30614374"])).Id);
    }

    // ── Installer partners and counter review ───────────────────────────────

    const string Installer = "09125555555";
    static byte[] Jpeg() => [0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 5, 6, 7, 8];
    static PhotoUpload[] Photos() => PhotoRules.Validate([("vehicle", Jpeg()), ("film", Jpeg())]);

    static async Task<PortalUser> Partner(Fixture f, PartnerStatus status = PartnerStatus.Approved)
    {
        var partner = new PortalUser { Phone = Installer, ShopName = "Tehran Tint", Country = "Iran", Partner = status };
        f.Db.PortalUsers.Add(partner);
        await f.Db.SaveChangesAsync();
        return partner;
    }

    [Fact]
    public async Task InstallerRegistersForTheCustomerWithPhotosAndTheCounterApproves()
    {
        using var f = new Fixture();
        var (label, code) = await f.Issue();
        var partner = await Partner(f);
        var request = new ActivateBoxRequest(code, Registration() with { Installer = "typed by hand" }, 20m, "0912 111 1111", null);

        await Error(400, () => f.Service.Activate(request with { CustomerPhone = Installer }, Installer, partner, Photos()));   // not the installer's own mobile
        await Error(400, () => f.Service.Activate(request, Installer, partner, []));                                          // photos are required
        partner.Partner = PartnerStatus.Pending;
        await Error(403, () => f.Service.Activate(request, Installer, partner, Photos()));                                    // only approved partners
        partner.Partner = PartnerStatus.Approved;
        await Error(403, () => f.Service.Activate(request, Installer, partner, Photos()));                                    // the roll is not in the installer's account yet
        await f.GiveTo(label.Id, "09127777777");                                                                             // with a seller: still not the installer's
        await Error(403, () => f.Service.Activate(request, Installer, partner, Photos()));
        await new BoxTransferService(f.Db).TransferAsHolder(new([label.Id], Installer, null, null), "09127777777");          // seller → installer

        var result = await f.Service.Activate(request, Installer, partner, Photos());
        var w = await f.Db.WarrantyRegistrations.SingleAsync();
        Assert.Equal(WarrantyStatus.Pending, w.Status);          // waits for the counter
        Assert.Equal(Customer, w.Phone);                          // warranty belongs to the customer
        Assert.Equal(Installer, w.InstallerPhone);
        Assert.Equal("Tehran Tint", w.Installer);                 // never free text
        Assert.Equal("Iran", w.Country);
        Assert.Equal(2, await f.Db.WarrantyPhotos.CountAsync(p => p.WarrantyCode == w.Code));
        Assert.Equal("pending", result.Warranty.Status);

        // The roll stays with the installer for the next vehicle; the customer cannot use it.
        var stored = await f.Db.BoxLabels.SingleAsync();
        Assert.Equal(Installer, stored.HolderPhone);
        Assert.Equal(130m, stored.RemainingLengthM);
        var next = request with { Registration = Registration("09126666666") with { Vin = "JTDBE32K123456788" }, CustomerPhone = "09126666666" };
        await Error(409, () => f.Service.Activate(next with { CustomerPhone = null }, Customer));
        await f.Service.Activate(next, Installer, partner, Photos());
        Assert.Equal(2, await f.Db.WarrantyRegistrations.CountAsync(x => x.InstallerPhone == Installer));

        var review = new Solarzed.Api.Controllers.ReviewController(f.Db);
        var reference = Confidential.Ref(w.Code, null);
        Assert.IsType<Microsoft.AspNetCore.Mvc.BadRequestObjectResult>(await review.Decide(new(reference, false, " "), default));   // a rejection needs a reason
        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await review.Decide(new(reference, true, null), default));
        Assert.Equal(WarrantyStatus.Active, (await f.Db.WarrantyRegistrations.SingleAsync(x => x.Code == w.Code)).Status);
        Assert.IsType<Microsoft.AspNetCore.Mvc.ConflictObjectResult>(await review.Decide(new(reference, false, "late"), default));
    }

    [Fact]
    public async Task InstallerRegistersBySerialNumberAndTheOwnerGetsTheGoldCard()
    {
        using var f = new Fixture();
        var (label, _) = await f.Issue();
        var partner = await Partner(f);

        // The new card QR holds only the Serial Number: only an approved installer can open the carton with it.
        await Error(403, () => f.Service.Info(label.Id));
        await Error(403, () => f.Service.Info(label.Id, Customer));
        Assert.False((await f.Service.Info(label.Id, Installer, installer: true)).CanRegister);   // not transferred to the installer yet
        await f.GiveTo(label.Id, Installer);
        var info = await f.Service.Info($" {label.Id.ToLowerInvariant()} ", Installer, installer: true);
        Assert.True(info.CanRegister);
        Assert.Equal(label.Id, info.Id);
        Assert.Null(info.WarrantyCode);                                  // the warranty number is not revealed by the serial
        await Error(404, () => f.Service.Info("CPT00000000", Installer, installer: true));
        // The roll ID from the inventory QR stands for the carton's Serial Number, with the same restrictions.
        var byRoll = await f.Service.Info(" sz-test-26-000001 ", Installer, installer: true);
        Assert.Equal(label.Id, byRoll.Id);
        Assert.Null(byRoll.WarrantyCode);
        await Error(403, () => f.Service.Info("SZ-TEST-26-000001", Customer));
        var request = new ActivateBoxRequest(label.Id, Registration(), 20m, Customer, "Iran");
        await Error(403, () => f.Service.Activate(request with { CustomerPhone = null }, Customer));   // customers cannot self-register by serial

        await f.Service.Activate(request, Installer, partner, Photos());
        var w = await f.Db.WarrantyRegistrations.SingleAsync();
        Assert.Equal(label.CardCode, w.Code);                            // the card's warranty number becomes the warranty code
        Assert.NotNull(w.CardKey);

        // Counter approval makes it active and sends one SMS with the gold card link.
        var cards = new WarrantyCards(f.Db, f.Sms);
        var review = new Solarzed.Api.Controllers.ReviewController(f.Db, null, cards);
        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await review.Decide(new(Confidential.Ref(w.Code, null), true, null), default));
        var sent = Assert.Single(f.Sms.Warranties);
        Assert.Equal((Customer, w.Code, $"https://solarzed.com/card#{w.Code}.{w.CardKey}"), sent);
        Assert.NotNull((await f.Db.WarrantyRegistrations.SingleAsync()).CardSentAt);
        await cards.Notify(w);
        Assert.Single(f.Sms.Warranties);                                 // never twice

        // The owner finds the card with VIN + mobile; both must match. The SMS link opens it without signing in.
        var api = new Solarzed.Api.Controllers.WarrantyController(f.Db, cards) { ControllerContext = new() { HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext() } };
        var found = Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Owner("jtdbe32k123456789", "+98 912 111 1111"));
        Assert.Contains(w.Code, System.Text.Json.JsonSerializer.Serialize(found.Value));
        var other = Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Owner("JTDBE32K123456789", "09129999999"));
        Assert.DoesNotContain(w.Code, System.Text.Json.JsonSerializer.Serialize(other.Value));
        Assert.IsType<Microsoft.AspNetCore.Mvc.BadRequestObjectResult>(await api.Owner("SHORT", Customer));
        var card = Assert.IsType<WarrantyCardView>(Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Card(w.Code, w.CardKey)).Value);
        Assert.Equal("Test Customer", card.Owner);
        Assert.Equal("active", card.Status);
        Assert.IsType<Microsoft.AspNetCore.Mvc.NotFoundObjectResult>(await api.Card(w.Code, "wrongkey12"));
    }

    [Fact]
    public async Task WarrantyCardSmsFailureNeverUndoesTheApproval()
    {
        using var f = new Fixture();
        var (label, _) = await f.Issue();
        var partner = await Partner(f);
        await f.GiveTo(label.Id, Installer);
        await f.Service.Activate(new ActivateBoxRequest(label.Id, Registration(), 20m, Customer, null), Installer, partner, Photos());
        var w = await f.Db.WarrantyRegistrations.SingleAsync();
        f.Sms.Fails = true;
        var review = new Solarzed.Api.Controllers.ReviewController(f.Db, null, new WarrantyCards(f.Db, f.Sms));
        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await review.Decide(new(Confidential.Ref(w.Code, null), true, null), default));
        var stored = await f.Db.WarrantyRegistrations.SingleAsync();
        Assert.Equal(WarrantyStatus.Active, stored.Status);
        Assert.Null(stored.CardSentAt);
    }

    [Fact]
    public async Task CardSmsCanBeSentLaterWhenThePatternWasMissing()
    {
        using var f = new Fixture();
        var (label, _) = await f.Issue();
        var partner = await Partner(f);
        await f.GiveTo(label.Id, Installer);
        await f.Service.Activate(new ActivateBoxRequest(label.Id, Registration(), 20m, Customer, null), Installer, partner, Photos());
        var w = await f.Db.WarrantyRegistrations.SingleAsync();
        var cards = new WarrantyCards(f.Db, f.Sms);
        var review = new Solarzed.Api.Controllers.ReviewController(f.Db, null, cards);
        Assert.Equal("The warranty is not active yet.", await cards.Notify(w));
        f.Sms.WarrantyConfigured = false;                                // approved before the pattern existed
        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await review.Decide(new(Confidential.Ref(w.Code, null), true, null), default));
        Assert.Empty(f.Sms.Warranties);
        Assert.Equal(503, Assert.IsType<Microsoft.AspNetCore.Mvc.ObjectResult>(await review.ResendCard(new(Confidential.Ref(w.Code, null)), default)).StatusCode);
        Assert.Equal((0, 0, "The warranty SMS pattern is not set."), await cards.NotifyUnsent(10));

        f.Sms.WarrantyConfigured = true;                                 // pattern saved: the backlog goes out once
        Assert.Equal((1, 0, (string?)null), await cards.NotifyUnsent(10));
        Assert.Equal((0, 0, (string?)null), await cards.NotifyUnsent(10));
        Assert.Single(f.Sms.Warranties);
        // The counter can send it again on request.
        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await review.ResendCard(new(Confidential.Ref(w.Code, null)), default));
        Assert.Equal(2, f.Sms.Warranties.Count);
    }

    [Fact]
    public void PhotosMustBeRealImagesOfKnownKinds()
    {
        Assert.Equal(400, Assert.Throws<ActivationError>(() => PhotoRules.Validate([("vehicle", "%PDF-1.4 fake"u8.ToArray()), ("film", Jpeg())])).Status);
        Assert.Equal(400, Assert.Throws<ActivationError>(() => PhotoRules.Validate([("vehicle", Jpeg())])).Status);            // film photo missing
        Assert.Equal(400, Assert.Throws<ActivationError>(() => PhotoRules.Validate([("selfie", Jpeg()), ("vehicle", Jpeg()), ("film", Jpeg())])).Status);
        Assert.Equal(400, Assert.Throws<ActivationError>(() => PhotoRules.Validate(Enumerable.Repeat(("other", Jpeg()), 5).Concat([("vehicle", Jpeg()), ("film", Jpeg())]).ToList())).Status);
        var png = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0 };
        Assert.Equal("image/png", PhotoRules.Validate([("vehicle", png), ("film", Jpeg())])[0].ContentType);
    }

    [Fact]
    public async Task PartnersApplyAndManagersApproveOrSuspend()
    {
        using var f = new Fixture();
        var user = new PortalUser { Phone = Installer };
        f.Db.PortalUsers.Add(user);
        await f.Db.SaveChangesAsync();
        Assert.Equal(400, Assert.Throws<ActivationError>(() => PortalService.Apply(user, new(" ", null, null))).Status);
        PortalService.Apply(user, new("Tehran Tint", "Iran", "Tehran"));
        Assert.Equal(PartnerStatus.Pending, user.Partner);
        await f.Db.SaveChangesAsync();

        var api = new Solarzed.Api.Controllers.PartnersController(f.Db);
        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.SetStatus(user.Id, new("approved", null), default));
        Assert.Equal(PartnerStatus.Approved, (await f.Db.PortalUsers.SingleAsync()).Partner);
        Assert.IsType<Microsoft.AspNetCore.Mvc.BadRequestObjectResult>(await api.SetStatus(user.Id, new("pending", null), default));

        // Adding by mobile approves a new partner directly, keyed by the canonical mobile.
        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Add(new("+98 912 777 7777", "Karaj PPF", null, null, "Iran", "Karaj"), default));
        Assert.Equal(PartnerStatus.Approved, (await f.Db.PortalUsers.SingleAsync(u => u.Phone == "09127777777")).Partner);
        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.List(null, null, default));

        user.Partner = PartnerStatus.Suspended;
        Assert.Equal(403, Assert.Throws<ActivationError>(() => PortalService.Apply(user, new("Again", null, null))).Status);
    }
}
