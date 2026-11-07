using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Solarzed.Api.Controllers;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Tests;

public class ManagementTests
{
    static AppDbContext Database() => new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
    static ProductRequest Product(string code = "TEST") => new(code, "Test film", "tint", "Test series", "Description", false);

    [Fact]
    public async Task ProductPersistsRejectsDuplicateAndArchivesWithoutDeleting()
    {
        using var db = Database(); var api = new ManagementController(db);
        Assert.IsType<OkObjectResult>(await api.Create(Product("test")));
        Assert.IsType<ConflictObjectResult>(await api.Create(Product()));
        Assert.IsType<OkObjectResult>(await api.Update("TEST", Product() with { Archived = true }));
        Assert.True((await db.Products.SingleAsync()).Archived);
    }

    [Theory]
    [InlineData("bad/code", "tint")]
    [InlineData("TEST", "other")]
    public async Task RejectsInvalidProduct(string code, string type)
    {
        using var db = Database();
        Assert.IsType<BadRequestObjectResult>(await new ManagementController(db).Create(Product(code) with { Type = type }));
        Assert.Empty(db.Products);
    }

    [Fact]
    public async Task CannotChangeTypeWithExistingInventoryOrReceiveArchivedProduct()
    {
        using var db = Database(); var api = new ManagementController(db);
        await api.Create(Product());
        db.Rolls.Add(new Roll { Id = "TEST-ROLL", ModelCode = "TEST", Type = WarrantyType.Tint, Batch = "B", Supplier = "S" });
        await db.SaveChangesAsync();
        Assert.IsType<ConflictObjectResult>(await api.Update("TEST", Product() with { Type = "ppf" }));
        await api.Update("TEST", Product() with { Archived = true });
        var admin = new AdminController(db, new ConfigurationBuilder().Build());
        Assert.IsType<BadRequestObjectResult>(await admin.ReceiveRolls(new("TEST", "tint", "B", "S", "approved", 1)));
    }

    [Fact]
    public async Task InvalidQcAndUnapprovedReleaseDoNotMutateInventory()
    {
        using var db = Database();
        db.Rolls.Add(new Roll { Id = "R", ModelCode = "TEST", Batch = "B", Supplier = "S" }); await db.SaveChangesAsync();
        var admin = new AdminController(db, new ConfigurationBuilder().Build());
        Assert.IsType<BadRequestObjectResult>(await admin.UpdateRoll("R", new("shipped", null, null)));
        Assert.IsType<BadRequestObjectResult>(await admin.UpdateRoll("R", new(null, "999", null)));
        Assert.Equal(RollStatus.InStock, (await db.Rolls.SingleAsync()).Status);
        Assert.IsType<OkObjectResult>(await admin.UpdateRoll("R", new("shipped", "approved", "QC checked")));
    }

    [Fact]
    public async Task PasswordChangeRequiresCurrentPasswordAndPersistsHash()
    {
        using var db = Database(); db.AdminUsers.Add(new AdminUser { PasswordHash = BCrypt.Net.BCrypt.HashPassword("old-test-password") }); await db.SaveChangesAsync();
        var api = new ManagementController(db);
        Assert.IsType<BadRequestObjectResult>(await api.Password(new("admin", "wrong", "new-test-password")));
        Assert.IsType<OkObjectResult>(await api.Password(new("admin", "old-test-password", "new-test-password")));
        Assert.True(BCrypt.Net.BCrypt.Verify("new-test-password", (await db.AdminUsers.SingleAsync()).PasswordHash));
    }
}
