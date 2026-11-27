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
        public List<(string Phone, string Link)> Warranties { get; } = [];
        public Task SendWarranty(string phone, string link, CancellationToken cancellationToken)
        { if (Fails) throw new HttpRequestException(); Warranties.Add((phone, link)); return Task.CompletedTask; }
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
    /// <summary>Serial Number of the fixture roll: the only code that opens activation.</summary>
    const string Serial = "SZ-TEST-26-000001";
    static RegisterRequest Registration(string phone = "09121111111") => new("ppf", "Toyota", "Camry", "Test Customer", phone,
        "TEST123", "JTDBE32K123456789", "FORGED", "INV-TEST", "2026-01-15", "Test Seller", "09122222222", "Test Shop", ["rear"], ["hood"],
        new() { ["rear"] = new(110, 60) });
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
    public async Task OnlyTheSerialNumberOpensActivation()
    {
        using var f = new Fixture();
        var (label, code) = await f.Issue();
        await Partner(f);
        await f.GiveTo(label.Id, Installer);
        Assert.Equal(Serial, (await f.Service.Info($" {Serial.ToLowerInvariant()} ", Installer, installer: true)).Id);
        // The ROLL NO is for authenticity and transfers only; older card codes and label tokens no longer open activation.
        await Error(400, () => f.Service.Info(label.Id, Installer, installer: true));
        await Error(400, () => f.Service.Info(code, Installer, installer: true));
        await Error(400, () => f.Service.Info($"{label.Id}-{label.CardCode}", Installer, installer: true));
        await Error(400, () => f.Service.Info(new string('a', 64), Installer, installer: true));
        await Error(404, () => f.Service.Info("SZ-TEST-26-999999", Installer, installer: true));
        // Only an approved installer opens a Serial Number.
        await Error(403, () => f.Service.Info(Serial));
        await Error(403, () => f.Service.Info(Serial, Customer));
    }

    [Fact]
    public async Task CartonsAreKeyedByThePrintedRollNumber()
    {
        using var f = new Fixture();
        var labels = await f.Service.Issue("SZ-TEST-26-000001", [" cpt30614374 ", "CPT30614375"]);
        Assert.Equal(["CPT30614374", "CPT30614375"], labels.Select(x => x.Id).ToArray());
        var first = labels[0];
        Assert.Equal($"CPT30614374-{first.CardCode}-ABC", first.FullCode);
        // Neither the ROLL NO nor the old card code opens activation; a serial shared by several cartons is refused.
        await Error(400, () => f.Service.Info("CPT30614374", Installer, installer: true));
        await Error(400, () => f.Service.Info($"cpt30614374-{first.CardCode}-abc", Installer, installer: true));
        await Error(404, () => f.Service.Info(Serial, Installer, installer: true));
        // A carton gets one card only; duplicates and malformed numbers are refused.
        await Error(409, () => f.Service.Issue("SZ-TEST-26-000001", ["CPT30614374"]));
        await Error(400, () => f.Service.Issue("SZ-TEST-26-000001", ["CPT1", "cpt1"]));
        await Error(400, () => f.Service.Issue("SZ-TEST-26-000001", ["CPT/1"]));
        await Error(400, () => f.Service.Issue("SZ-TEST-26-000001", Array.Empty<string>()));
    }

    [Fact]
    public async Task LegacyFactorySerialWarrantyCardsNoLongerOpenActivation()
    {
        using var f = new Fixture();
        var (label, _) = await f.Issue();
        var stored = await f.Db.BoxLabels.SingleAsync();
        stored.CardCode = "SZ-ABCDEFGHJKLMNPQR"; stored.FactoryCode = "SA"; await f.Db.SaveChangesAsync();
        var legacy = $"SA-{label.Id}-SZ-ABCDEFGHJKLMNPQR";
        Assert.Equal(legacy, BoxLabelService.FullCode(stored));
        await Error(400, () => f.Service.Info(legacy, Installer, installer: true));
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
        var (label, _) = await f.Issue();
        var partner = await Partner(f);
        await f.GiveTo(label.Id, Installer);
        roll.Status = RollStatus.InStock; await f.Db.SaveChangesAsync();   // still awaiting release
        Assert.False((await f.Service.Info(Serial, Installer, installer: true)).Released);
        await Error(409, () => f.Service.Activate(new(Serial, Registration(), null, Customer), Installer, partner, Photos()));
        roll.Status = RollStatus.Shipped;
        await f.Db.SaveChangesAsync();
        Assert.True((await f.Service.Info(Serial, Installer, installer: true)).Released);
        (await f.Db.CoverageSettings.SingleAsync()).TintFilmYears = null; await f.Db.SaveChangesAsync();
        await Error(400, () => f.Issue());
        Assert.Single(await f.Db.BoxLabels.ToListAsync());
    }

    [Fact]
    public async Task DeletingARollAlwaysWorksAndKeepsActivatedCartonsAndWarranties()
    {
        using var f = new Fixture();
        var (label, _) = await f.Issue();
        var partner = await Partner(f);
        await f.GiveTo(label.Id, Installer);
        await f.Service.Activate(new ActivateBoxRequest(Serial, Registration(), 30m, Customer), Installer, partner, Photos());
        var (unused, _) = await f.Issue();
        await f.GiveTo(unused.Id, Installer);
        var admin = new Solarzed.Api.Controllers.AdminController(f.Db, new ConfigurationBuilder().Build());
        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await admin.DeleteRoll(Serial));

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

        // The deleted roll's Serial Number no longer opens activation.
        using var after = new SqliteDb(f.Options);
        var service = new BoxLabelService(after, f.Protection, f.Sms);
        await Error(404, () => service.Info(Serial, Installer, installer: true));
        // The ROLL NO of the activated carton cannot be given to a new carton.
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
        var (label, _) = await f.Issue();
        var partner = await Partner(f);
        await f.GiveTo(label.Id, Installer);
        (await f.Db.CoverageSettings.SingleAsync()).TintFilmYears = 10; await f.Db.SaveChangesAsync();
        // The form's phone is ignored; the customer's mobile the installer enters is the warranty owner.
        var request = new ActivateBoxRequest(Serial, Registration("09129999999"), 30m, Customer);
        await Error(400, () => f.Service.Activate(request with { UsedLengthM = 0 }, Installer, partner, Photos()));
        await Error(400, () => f.Service.Activate(request with { UsedLengthM = 30.001m }, Installer, partner, Photos()));
        var first = await f.Service.Activate(request, Installer, partner, Photos());
        var warranty = first.Warranty;
        Assert.Equal(30m, warranty.UsedLengthM);
        Assert.Equal(120m, first.RemainingLengthM);
        Assert.Equal("pending", warranty.Status);
        Assert.Equal("tint", warranty.Type);
        Assert.Equal(label.Id, warranty.FilmSerial);
        Assert.Equal(label.CardCode, first.Code);
        var stored = await f.Db.WarrantyRegistrations.SingleAsync();
        Assert.Equal(DateOnly.Parse("2031-01-14"), stored.FilmEnds);
        Assert.Null(stored.InstallEnds);   // one warranty only: no installation warranty
        Assert.Equal(Customer, stored.Phone);
        Assert.Equal(Serial, stored.RollId);
        var box = await f.Db.BoxLabels.AsNoTracking().SingleAsync();
        Assert.Equal(Installer, box.HolderPhone);
        Assert.Equal(label.CardCode, box.WarrantyCode);
        // The installer's account lists the roll as in use, with its full length, meters used and left.
        var transfers = new BoxTransferService(f.Db);
        var mine = await transfers.Mine(Installer);
        Assert.Empty(mine.Boxes);
        var inUse = Assert.Single(mine.Used!);
        Assert.Equal((150m, 120m, 30m, 1), (inUse.LengthM, inUse.RemainingM, inUse.UsedM, inUse.Installs));
        var detail = await transfers.Detail(label.Id.ToLowerInvariant(), Installer);
        Assert.Equal("TEST123", Assert.Single(detail.Installs).Warranty.Plate);
        Assert.Contains(detail.History, h => h.Note == "Warranty activated");
        await Error(404, () => transfers.Detail(label.Id, "09124444444"));
        await Error(409, () => f.Service.Activate(request, Installer, partner, Photos()));
        var another = request with { Registration = request.Registration with { Vin = "JTDBE32K123456788", Plate = "OTHER123" }, UsedLengthM = 120m };
        Assert.False((await f.Service.Info(Serial, "09124444444", installer: true)).CanRegister);
        Assert.Null((await f.Service.Info(Serial, "09124444444", installer: true)).RemainingLengthM);
        Assert.Equal(120m, (await f.Service.Info(Serial, Installer, installer: true)).RemainingLengthM);
        var second = await f.Service.Activate(another, Installer, partner, Photos());
        Assert.NotEqual(first.Code, second.Code);
        Assert.Equal("OTHER123", second.Warranty.Plate);
        Assert.Equal(0m, second.RemainingLengthM);
        // A roll has no fixed vehicle count: a "used up" balance never blocks the holder, but the meters are required.
        Assert.True((await f.Service.Info(Serial, Installer, installer: true)).CanRegister);
        await Error(400, () => f.Service.Activate(another with { Registration = request.Registration with { Vin = "JTDBE32K123456787", Plate = "THIRD123" }, UsedLengthM = null }, Installer, partner, Photos()));
        var third = await f.Service.Activate(another with { Registration = request.Registration with { Vin = "JTDBE32K123456787", Plate = "THIRD123" }, UsedLengthM = 4m }, Installer, partner, Photos());
        Assert.Equal(0m, third.RemainingLengthM);
        // Meters beyond the roll's balance are accepted but flagged for the counter.
        var fourth = await f.Service.Activate(another with { Registration = request.Registration with { Vin = "JTDBE32K123456786", Plate = "FOURTH12" }, UsedLengthM = 5m }, Installer, partner, Photos());
        Assert.Contains("roll_overuse", JsonSerializer.Deserialize<string[]>((await f.Db.WarrantyRegistrations.AsNoTracking().SingleAsync(x => x.Code == fourth.Code)).FlagsJson)!);
        Assert.Equal(2, await f.Db.BoxTransfers.CountAsync());
        Assert.Equal(4, await f.Db.WarrantyRegistrations.CountAsync(x => x.Phone == Customer && x.InstallerPhone == Installer));
    }

    [Fact]
    public async Task InstallationPhotosAreVisibleToTheOwnerAndTheInstallerOnly()
    {
        using var f = new Fixture();
        var (label, _) = await f.Issue();
        var partner = await Partner(f);
        await f.GiveTo(label.Id, Installer);
        var done = await f.Service.Activate(new ActivateBoxRequest(Serial, Registration(), 30m, Customer), Installer, partner, Photos());
        var portal = new PortalService(f.Db, f.Sms);
        Assert.True(await portal.CanSeePhotos(Customer, done.Code));
        Assert.True(await portal.CanSeePhotos(Installer, done.Code));
        Assert.False(await portal.CanSeePhotos("09124444444", done.Code));
        Assert.False(await portal.CanSeePhotos(Customer, "0000000"));
    }

    [Fact]
    public async Task InstallationsIncludeOlderRegistrationsMadeFromTheInstallersMobile()
    {
        using var f = new Fixture();
        static WarrantyRegistration Reg(string code, string phone, string? sellerPhone, string? installerPhone) => new()
        {
            Code = code, Vin = "V" + code, Owner = "O", Phone = phone, Plate = "P" + code, Make = "Kia", Model = "Rio", FilmSerial = "CPT1",
            InvoiceNumber = "I" + code, SellerName = "S", SellerPhone = sellerPhone ?? "", Installer = "Shop", InstallerPhone = installerPhone,
            Installed = new DateOnly(2026, 11, 7),
        };
        f.Db.WarrantyRegistrations.AddRange(
            Reg("A1", Customer, Installer, Installer),          // registered through the installer form
            Reg("A2", Installer, Installer, null),              // registered before the partner account was approved
            Reg("A3", "09128888888", Installer, null),          // older registration naming the installer as seller
            Reg("A4", "09128888888", "09126666666", "09127777777")); // another installer's work
        await f.Db.SaveChangesAsync();
        var portal = new PortalService(f.Db, f.Sms);
        var refs = (await portal.Installed(Installer)).Select(x => x.Warranty.FilmSerial + ":" + x.Warranty.Plate).Order().ToArray();
        Assert.Equal(["CPT1:PA1", "CPT1:PA2", "CPT1:PA3"], refs);
        Assert.True(await portal.CanSeePhotos(Installer, "A3"));
        Assert.False(await portal.CanSeePhotos(Installer, "A4"));
    }

    [Fact]
    public async Task ManyVehiclesOnOneRollAreFlaggedButNeverBlocked()
    {
        using var f = new Fixture();
        var (label, code) = await f.Issue();
        var roll = await f.Db.Rolls.SingleAsync(); roll.LengthM = 30; await f.Db.SaveChangesAsync();
        var partner = await Partner(f);
        await f.GiveTo(label.Id, Installer);
        var flags = new List<string[]>();
        // 30 m at 4 m per vehicle at most = 7 plausible vehicles; the 8th is flagged, as is a 7th within 24 hours.
        for (var i = 0; i < 8; i++)
        {
            var reg = Registration() with { Vin = $"JTDBE32K12345{i:0000}", Plate = $"PLATE{i}" };
            var done = await f.Service.Activate(new ActivateBoxRequest(Serial, reg, 4m, Customer), Installer, partner, Photos());
            flags.Add(JsonSerializer.Deserialize<string[]>((await f.Db.WarrantyRegistrations.AsNoTracking().SingleAsync(x => x.Code == done.Code)).FlagsJson)!);
        }
        Assert.All(flags.Take(6), x => Assert.Empty(x));
        Assert.Equal(["roll_burst"], flags[6]);
        Assert.Equal(["roll_high_count", "roll_burst"], flags[7]);
        Assert.True((await f.Service.Info(Serial, Installer, installer: true)).CanRegister);
    }

    [Fact]
    public async Task LostRaceRollsBackTheSecondActivation()
    {
        using var f = new Fixture();
        var (label, _) = await f.Issue();
        var partner = await Partner(f);
        await f.GiveTo(label.Id, Installer);
        // Load a stale label in a second context before the first registration wins.
        using var stale = new SqliteDb(f.Options);
        await stale.BoxLabels.SingleAsync(x => x.Id == label.Id);
        var staleService = new BoxLabelService(stale, f.Protection, f.Sms);
        var request = new ActivateBoxRequest(Serial, Registration(), 100m, Customer);
        await f.Service.Activate(request, Installer, partner, Photos());
        // Both callers saw unused snapshots; the DB revision guard rolls back the loser.
        await Error(409, () => staleService.Activate(request with { Registration = Registration() with { Vin = "JTDBE32K123456788" } }, Installer, partner, Photos()));
        Assert.Single(await f.Db.WarrantyRegistrations.ToListAsync());
        Assert.Equal(50m, (await f.Service.Info(Serial, Installer, installer: true)).RemainingLengthM);
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
        var (label, _) = await f.Issue();
        var partner = await Partner(f);
        var request = new ActivateBoxRequest(Serial, Registration() with { Installer = "typed by hand" }, 20m, "0912 111 1111", null);

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
        await Error(403, () => f.Service.Activate(next with { CustomerPhone = null }, Customer));   // customers never register
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

        // The card QR holds only the roll's Serial Number: only an approved installer can open the carton with it.
        await Error(403, () => f.Service.Info(Serial));
        await Error(403, () => f.Service.Info(Serial, Customer));
        Assert.False((await f.Service.Info(Serial, Installer, installer: true)).CanRegister);   // not transferred to the installer yet
        await f.GiveTo(label.Id, Installer);                                                     // transfers go by ROLL NO
        var info = await f.Service.Info($" {Serial.ToLowerInvariant()} ", Installer, installer: true);
        Assert.True(info.CanRegister);
        Assert.Equal(Serial, info.Id);
        Assert.Null(info.WarrantyCode);                                  // the warranty number is not revealed by the serial
        await Error(400, () => f.Service.Info(label.Id, Installer, installer: true));            // the ROLL NO never opens activation
        await Error(404, () => f.Service.Info("SZ-TEST-26-000099", Installer, installer: true));
        var request = new ActivateBoxRequest(Serial, Registration(), 20m, Customer, "Iran");
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
        Assert.Equal((Customer, $"https://solarzed.com/card#{w.CardKey}"), sent);   // never the warranty number
        Assert.NotNull((await f.Db.WarrantyRegistrations.SingleAsync()).CardSentAt);
        await cards.Notify(w);
        Assert.Single(f.Sms.Warranties);                                 // never twice

        // The owner finds the card with VIN + mobile; both must match. The SMS link opens it without signing in.
        var api = new Solarzed.Api.Controllers.WarrantyController(f.Db, cards) { ControllerContext = new() { HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext() } };
        var found = Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Owner("jtdbe32k123456789", "+98 912 111 1111"));
        Assert.Contains(System.Text.Json.JsonSerializer.Serialize(WarrantyService.MaskPlate(w.Plate)).Trim('"'), System.Text.Json.JsonSerializer.Serialize(found.Value));
        Assert.DoesNotContain(w.Plate, System.Text.Json.JsonSerializer.Serialize(found.Value));   // the plate is masked like the VIN
        Assert.DoesNotContain(w.Code, System.Text.Json.JsonSerializer.Serialize(found.Value));   // the warranty number is never shown
        var other = Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Owner("JTDBE32K123456789", "09129999999"));
        Assert.DoesNotContain(w.Plate, System.Text.Json.JsonSerializer.Serialize(other.Value));
        Assert.IsType<Microsoft.AspNetCore.Mvc.BadRequestObjectResult>(await api.Owner("SHORT", Customer));
        var masked = System.Text.Json.JsonSerializer.Serialize(WarrantyService.MaskPlate(w.Plate)).Trim('"');
        // Any one of VIN, mobile or the owner's account email finds the cards on its own.
        Assert.Contains(masked, System.Text.Json.JsonSerializer.Serialize(Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Owner(null, null, q: "JTDBE32K123456789")).Value));
        Assert.Contains(masked, System.Text.Json.JsonSerializer.Serialize(Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Owner(null, null, q: "+98 912 111 1111")).Value));
        f.Db.PortalUsers.Add(new PortalUser { Phone = Customer, Email = "owner@example.com" });
        await f.Db.SaveChangesAsync();
        Assert.Contains(masked, System.Text.Json.JsonSerializer.Serialize(Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Owner(null, null, q: "Owner@Example.com")).Value));
        Assert.DoesNotContain(w.Plate, System.Text.Json.JsonSerializer.Serialize(Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Owner(null, null, q: "nobody@example.com")).Value));
        Assert.IsType<Microsoft.AspNetCore.Mvc.BadRequestObjectResult>(await api.Owner(null, null));
        var card = Assert.IsType<WarrantyCardView>(Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Card(w.CardKey)).Value);
        Assert.DoesNotContain(w.Code, System.Text.Json.JsonSerializer.Serialize(card));
        Assert.Equal(w.Code, Confidential.Unref(card.Ref));
        Assert.Equal("Test Customer", card.Owner);
        Assert.Equal("active", card.Status);
        Assert.IsType<Microsoft.AspNetCore.Mvc.NotFoundObjectResult>(await api.Card("wrongkey12"));
    }

    [Fact]
    public async Task WarrantyCardSmsFailureNeverUndoesTheApproval()
    {
        using var f = new Fixture();
        var (label, _) = await f.Issue();
        var partner = await Partner(f);
        await f.GiveTo(label.Id, Installer);
        await f.Service.Activate(new ActivateBoxRequest(Serial, Registration(), 20m, Customer, null), Installer, partner, Photos());
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
        await f.Service.Activate(new ActivateBoxRequest(Serial, Registration(), 20m, Customer, null), Installer, partner, Photos());
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
