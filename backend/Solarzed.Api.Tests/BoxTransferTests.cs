using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Tests;

public class BoxTransferTests
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
    sealed class NoSms : IActivationSmsSender
    {
        public bool Configured => false;
        public Task Send(string phone, string code, string reference, CancellationToken cancellationToken) => Task.CompletedTask;
    }
    sealed class RecordingSms(bool fail = false) : IActivationSmsSender
    {
        public List<(string Phone, int Count, string Link)> Sent { get; } = [];
        public bool Configured => true;
        public bool TransferConfigured => true;
        public Task Send(string phone, string code, string reference, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SendTransfer(string phone, int count, string link, CancellationToken cancellationToken)
        {
            if (fail) throw new ActivationError(503, "Faraz did not accept the roll transfer message.");
            Sent.Add((phone, count, link)); return Task.CompletedTask;
        }
    }
    sealed class Fixture : IDisposable
    {
        readonly SqliteConnection connection = new("Data Source=:memory:");
        public SqliteDb Db { get; }
        public BoxTransferService Transfers { get; }
        public BoxLabelService Labels { get; }
        public Fixture()
        {
            connection.Open();
            Db = new SqliteDb(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
            Db.Database.EnsureCreated();
            Db.Rolls.Add(new Roll { Id = "SZ-TEST-26-000001", Number = 1, ModelCode = "TEST", Type = WarrantyType.Tint,
                Batch = "TEST", Supplier = "ABC", LengthM = 150, Qc = RollQc.Approved, Status = RollStatus.Shipped });
            Db.CoverageSettings.Add(new CoverageSetting { TintFilmYears = 5, TintInstallYears = 2 });
            Db.SaveChanges();
            Labels = new(Db, new EphemeralDataProtectionProvider(), new NoSms());
            Transfers = new(Db);
        }
        public async Task<string[]> Issue(int n) => (await Labels.Issue("SZ-TEST-26-000001", n)).Select(x => x.Id).ToArray();
        public void Dispose() { Db.Dispose(); connection.Dispose(); }
    }
    const string RepA = "09121111111", RepB = "09122222222", Shop = "09123333333";
    static TransferRequest To(string? phone, params string[] serials) => new(serials, null, phone, null, null);
    static async Task<string> Error(int status, Func<Task> action)
    {
        var ex = await Assert.ThrowsAsync<ActivationError>(action);
        Assert.Equal(status, ex.Status);
        return ex.Message;
    }

    [Fact]
    public async Task CompanyHandsBoxesToARepresentativeMobileAndTheChainIsRecorded()
    {
        using var f = new Fixture();
        var ids = await f.Issue(3);
        Assert.All(await f.Db.BoxLabels.ToListAsync(), x => Assert.Null(x.HolderPhone));

        // Scanner input may be lowercase or padded; Persian digits and +98 normalise to one mobile.
        var first = await f.Transfers.Transfer(new(ids.Select(x => " " + x.ToLowerInvariant()).ToArray(), "Tehran  Branch", "۰۹۱۲۱۱۱۱۱۱۱", "first load", ""), "admin");
        Assert.Equal(3, first.Transfers.Length);
        Assert.Equal(RepA, first.ToPhone);
        Assert.All(first.Transfers, t => { Assert.Null(t.FromPhone); Assert.Equal("Tehran Branch", t.ToHolder); Assert.Equal(RepA, t.ToPhone); });
        Assert.Equal("Tehran Branch", (await f.Db.PortalUsers.SingleAsync()).Name);

        // The representative sees the boxes in their account and passes one on to a shop.
        Assert.Equal(3, (await f.Transfers.Mine(RepA)).Boxes.Length);
        var onward = await f.Transfers.TransferAsHolder(new([ids[0]], "+989123333333", "Shop Ali", null), RepA);
        Assert.Equal(Shop, onward.ToPhone);
        var mine = await f.Transfers.Mine(RepA);
        Assert.Equal(2, mine.Boxes.Length);
        Assert.Single(mine.Outgoing);
        Assert.Equal(ids[0], Assert.Single((await f.Transfers.Mine(Shop)).Boxes).Id);

        var history = await f.Transfers.History(ids[0]);
        Assert.Equal(Shop, history.HolderPhone);
        Assert.Equal([null, RepA], history.Transfers.Select(x => x.FromPhone));
        Assert.Equal("mobile:" + RepA, history.Transfers[1].Actor);

        var holders = await f.Transfers.Holders();
        Assert.Contains(holders, h => h.Phone == RepA && h.Boxes == 2);
        Assert.Contains(holders, h => h.Phone == Shop && h.Holder == "Shop Ali" && h.Boxes == 1);
        Assert.Equal(1, await f.Db.AuditEntries.CountAsync(x => x.EntityType == "box-transfer" && x.EntityId == first.BatchId));
    }

    [Fact]
    public async Task RepresentativeCanOnlyMoveBoxesInTheirOwnAccount()
    {
        using var f = new Fixture();
        var ids = await f.Issue(2);
        await f.Transfers.Transfer(To(RepA, ids[0]), "admin");
        await f.Transfers.Transfer(To(RepB, ids[1]), "admin");
        // Someone else's box, a warehouse box and an unknown serial all read the same, and nothing moves.
        var message = await Error(409, () => f.Transfers.TransferAsHolder(new(ids, Shop, null, null), RepA));
        Assert.Contains($"{ids[1]}: not in your account", message);
        Assert.Contains("not in your account", await Error(409, () => f.Transfers.TransferAsHolder(new(["SZB-0000000000000000"], Shop, null, null), RepA)));
        await Error(400, () => f.Transfers.TransferAsHolder(new([ids[0]], RepA, null, null), RepA));
        await Error(400, () => f.Transfers.TransferAsHolder(new([ids[0]], " ", null, null), RepA));
        Assert.Equal(2, await f.Db.BoxTransfers.CountAsync());
        Assert.Equal(RepA, (await f.Db.BoxLabels.AsNoTracking().SingleAsync(x => x.Id == ids[0])).HolderPhone);
    }

    [Fact]
    public async Task ExpectedSenderMustHoldEveryBoxAndNothingMovesOnFailure()
    {
        using var f = new Fixture();
        var ids = await f.Issue(2);
        await f.Transfers.Transfer(To(RepA, ids[0]), "admin");
        var message = await Error(409, () => f.Transfers.Transfer(new(ids, null, RepB, null, RepA), "admin"));
        Assert.Contains(ids[1], message);
        Assert.Null((await f.Db.BoxLabels.AsNoTracking().SingleAsync(x => x.Id == ids[1])).HolderPhone);
        Assert.Equal(1, await f.Db.BoxTransfers.CountAsync());
    }

    [Fact]
    public async Task RejectsUnknownMalformedSameHolderActivatedAndVoidBoxes()
    {
        using var f = new Fixture();
        var ids = await f.Issue(3);
        await Error(400, () => f.Transfers.Transfer(To(RepA, "NOT/A_SERIAL"), "admin"));
        await Error(404, () => f.Transfers.Transfer(To(RepA, "SZB-0000000000000000"), "admin"));
        await Error(400, () => f.Transfers.Transfer(To("  ", ids[0]), "admin"));
        await Error(400, () => f.Transfers.Transfer(To("not a phone", ids[0]), "admin"));
        await Error(400, () => f.Transfers.Transfer(To(RepA), "admin"));

        await f.Transfers.Transfer(To(RepA, ids[0]), "admin");
        await Error(409, () => f.Transfers.Transfer(To("+989121111111", ids[0]), "admin"));

        var activated = await f.Db.BoxLabels.SingleAsync(x => x.Id == ids[1]);
        activated.ActivatedAt = DateTime.UtcNow; await f.Db.SaveChangesAsync();
        Assert.Contains("activated", await Error(409, () => f.Transfers.Transfer(To(RepB, ids[1]), "admin")));

        var roll = await f.Db.Rolls.SingleAsync(); roll.Status = RollStatus.Void; await f.Db.SaveChangesAsync();
        Assert.Contains("void", await Error(409, () => f.Transfers.Transfer(To(RepB, ids[2]), "admin")));
    }

    [Fact]
    public async Task BoxesCanReturnToWarehouse()
    {
        using var f = new Fixture();
        var ids = await f.Issue(1);
        await f.Transfers.Transfer(To(RepA, ids), "admin");
        var back = await f.Transfers.Transfer(new(ids, null, null, "returned", RepA, ToWarehouse: true), "admin");
        Assert.Null(back.ToHolder);
        Assert.Null((await f.Transfers.History(ids[0])).HolderPhone);
        Assert.Empty((await f.Transfers.Mine(RepA)).Boxes);
        await Error(409, () => f.Transfers.Transfer(new(ids, null, null, null, null, ToWarehouse: true), "admin"));
    }

    [Fact]
    public async Task ReceiverGetsAnSmsWithTheRollCountAndSignInLink()
    {
        using var f = new Fixture();
        var ids = await f.Issue(2);
        var sms = new RecordingSms();
        var log = new SmsLog();
        var result = await new TransferSms(f.Labels, sms, log).Notify(await f.Transfers.Transfer(To(RepA, ids), "admin"));
        Assert.Equal(TransferSms.Sent, result.Sms);
        var (phone, count, link) = Assert.Single(sms.Sent);
        Assert.Equal(RepA, phone);
        Assert.Equal(2, count);
        Assert.EndsWith("/account", link);
        Assert.True(Assert.Single(log.Recent()).Ok);

        // A seller passing rolls on to an installer notifies the installer too.
        var passed = await new TransferSms(f.Labels, sms).Notify(
            await f.Transfers.TransferAsHolder(new([ids[0]], RepB, null, null), RepA));
        Assert.Equal(RepB, sms.Sent[^1].Phone);
        Assert.Equal(1, sms.Sent[^1].Count);
        Assert.Equal(TransferSms.Sent, passed.Sms);
    }

    [Fact]
    public async Task TransferStandsWhenTheSmsIsOffOrFails()
    {
        using var f = new Fixture();
        var ids = await f.Issue(2);
        var off = await new TransferSms(f.Labels, new NoSms()).Notify(await f.Transfers.Transfer(To(RepA, ids[0]), "admin"));
        Assert.Equal(TransferSms.Off, off.Sms);
        var failed = await new TransferSms(f.Labels, new RecordingSms(fail: true)).Notify(await f.Transfers.Transfer(To(RepA, ids[1]), "admin"));
        Assert.Contains("did not accept", failed.Sms);
        Assert.Equal(2, (await f.Transfers.Mine(RepA)).Boxes.Length);

        // Returning to the warehouse has no receiver mobile, so nothing is sent.
        var back = await new TransferSms(f.Labels, new RecordingSms()).Notify(
            await f.Transfers.Transfer(new(ids, null, null, null, null, ToWarehouse: true), "admin"));
        Assert.Null(back.Sms);
    }

    [Fact]
    public async Task ReturnPutsRollBackInChosenWarehouse()
    {
        using var f = new Fixture();
        var store = new Warehouse { Name = "انبار شرق" };
        f.Db.Warehouses.Add(store); await f.Db.SaveChangesAsync();
        var ids = await f.Issue(1);
        var roll = await f.Db.Rolls.SingleAsync(); roll.Qc = RollQc.Approved; await f.Db.SaveChangesAsync();
        await f.Transfers.Transfer(To(RepA, ids), "admin");
        Assert.Equal(RollStatus.Shipped, (await f.Db.Rolls.SingleAsync()).Status);

        var back = await f.Transfers.Transfer(new(ids, null, null, null, null, ToWarehouse: true, WarehouseId: store.Id), "admin");
        Assert.Equal("انبار شرق", back.ToHolder);
        roll = await f.Db.Rolls.SingleAsync();
        Assert.Equal(RollStatus.InStock, roll.Status);
        Assert.Equal(store.Id, roll.WarehouseId);
        await Error(400, () => f.Transfers.Transfer(new(ids, null, null, null, null, ToWarehouse: true, WarehouseId: 9999), "admin"));
    }

    [Fact]
    public async Task BatchSizeIsLimited()
    {
        using var f = new Fixture();
        var many = Enumerable.Range(0, BoxTransferService.MaxBatch + 1).Select(i => $"SZB-{i:X16}").ToArray();
        await Error(400, () => f.Transfers.Transfer(To(RepA, many), "admin"));
    }

    [Fact]
    public async Task RollsTransferFromTheRollListByRollNoAndAreReleasedToTheSeller()
    {
        using var f = new Fixture();
        f.Db.Rolls.Add(new Roll { Id = "SZ-CPT30614374-2611-1234567-ABC", Number = 2, ModelCode = "TEST", RollNo = "CPT30614374", Type = WarrantyType.Tint,
            Batch = "TEST", Supplier = "ABC", LengthM = 30, Qc = RollQc.Approved, Status = RollStatus.InStock, HolderUserId = 7 });
        f.Db.AdminUsers.Add(new AdminUser { Id = 7, Username = "store", PasswordHash = "x" });
        await f.Db.SaveChangesAsync();
        var api = new Solarzed.Api.Controllers.BoxLabelsController(f.Db, f.Labels, f.Transfers, new NoSms(), new TransferSms(f.Labels))
            { ControllerContext = new() { HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext() } };

        // A bad mobile is refused before any warranty card is issued.
        Assert.Equal(400, Assert.IsType<Microsoft.AspNetCore.Mvc.ObjectResult>(await api.Transfer(To("12", "cpt30614374"))).StatusCode);
        Assert.Empty(f.Db.BoxLabels);

        Assert.IsType<Microsoft.AspNetCore.Mvc.OkObjectResult>(await api.Transfer(To(RepA, "cpt30614374")));
        var label = await f.Db.BoxLabels.SingleAsync();                  // the card was issued on the way out
        Assert.Equal(("CPT30614374", RepA), (label.Id, label.HolderPhone));
        var roll = await f.Db.Rolls.SingleAsync(r => r.Number == 2);
        Assert.Equal(RollStatus.Shipped, roll.Status);                   // released, so the installer can register it later
        Assert.Null(roll.HolderUserId);

        // The seller passes it on to the installer by mobile and ROLL NO.
        await f.Transfers.TransferAsHolder(new(["CPT30614374"], Shop, null, null), RepA);
        Assert.Equal(Shop, (await f.Db.BoxLabels.SingleAsync()).HolderPhone);
    }
}
