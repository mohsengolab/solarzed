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
            Db.Rolls.Add(new Roll { Id = "SZ-TEST-26-000001", ModelCode = "TEST", Type = WarrantyType.Tint,
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
    public async Task BatchSizeIsLimited()
    {
        using var f = new Fixture();
        var many = Enumerable.Range(0, BoxTransferService.MaxBatch + 1).Select(i => $"SZB-{i:X16}").ToArray();
        await Error(400, () => f.Transfers.Transfer(To(RepA, many), "admin"));
    }
}
