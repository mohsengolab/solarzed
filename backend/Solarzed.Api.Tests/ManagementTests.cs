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
    static WarrantyRegistration Registration(string rollId) => new()
    {
        Code = "W-" + rollId, Vin = "VIN" + rollId, Owner = "Owner", Phone = "09120000000",
        Plate = "12ب345 Iran", Make = "Pride", Model = "131", FilmSerial = "FS", InvoiceNumber = "INV",
        Installed = DateOnly.FromDateTime(DateTime.UtcNow), SellerName = "Shop", SellerPhone = "09120000000",
        Installer = "Installer", RollId = rollId,
    };

    [Fact]
    public async Task ProductDuplicateCodeIsRejected()
    {
        using var db = Database(); var api = new ManagementController(db);
        Assert.IsType<OkObjectResult>(await api.Create(Product("test")));
        Assert.IsType<ConflictObjectResult>(await api.Create(Product()));
        Assert.Single(db.Products);
    }

    [Fact]
    public async Task ProductDuplicateNameIsRejectedOnCreateAndRename()
    {
        using var db = Database(); var api = new ManagementController(db);
        Assert.IsType<OkObjectResult>(await api.Create(Product("A")));
        // Same name, different code: rejected regardless of case and surrounding spaces.
        Assert.IsType<ConflictObjectResult>(await api.Create(Product("B") with { Name = "  TEST FILM " }));
        Assert.IsType<OkObjectResult>(await api.Create(Product("B") with { Name = "Other film" }));
        Assert.IsType<ConflictObjectResult>(await api.Update("B", Product("B") with { Name = "test film" }));
        // Re-saving a product under its own name is fine.
        Assert.IsType<OkObjectResult>(await api.Update("A", Product("A")));
        Assert.Equal(2, await db.Products.CountAsync());
        Assert.Equal("Other film", (await db.Products.FindAsync("B"))!.Name);
    }

    [Fact]
    public async Task ProductUpdateChangesTheNameOnly()
    {
        using var db = Database(); var api = new ManagementController(db);
        await api.Create(Product());
        // A rename request that also "tries" to change type, series and description only renames.
        Assert.IsType<OkObjectResult>(await api.Update("TEST", Product() with
        {
            Name = "Renamed film", Type = "ppf", Series = "other series", Description = "changed",
        }));
        var product = await db.Products.SingleAsync();
        Assert.Equal("Renamed film", product.Name);
        Assert.Equal(WarrantyType.Tint, product.Type);
        Assert.Equal("Test series", product.Series);
        Assert.Equal("Description", product.Description);
        // The code itself is immutable: delete it and create a new product instead.
        Assert.IsType<BadRequestObjectResult>(await api.Update("TEST", Product("OTHER")));
        Assert.IsType<NotFoundResult>(await api.Update("GHOST", Product()));
    }

    [Fact]
    public async Task ProductDeleteIsBlockedWhileRollsExistThenFreesTheCode()
    {
        using var db = Database(); var api = new ManagementController(db);
        await api.Create(Product());
        db.Rolls.Add(new Roll { Id = "TEST-ROLL", ModelCode = "TEST", Type = WarrantyType.Tint, Batch = "B", Supplier = "S" });
        await db.SaveChangesAsync();

        Assert.IsType<ConflictObjectResult>(await api.Delete("TEST"));
        Assert.Single(db.Products);

        db.Rolls.Remove(await db.Rolls.SingleAsync()); await db.SaveChangesAsync();
        Assert.IsType<OkObjectResult>(await api.Delete("TEST"));
        Assert.Empty(db.Products);
        // The code is immediately free again for a re-create.
        Assert.IsType<OkObjectResult>(await api.Create(Product()));
    }

    [Fact]
    public async Task RollDeleteRemovesLabelsAndUnlinksRegistrations()
    {
        using var db = Database(); var admin = new AdminController(db, new ConfigurationBuilder().Build());
        db.Rolls.Add(new Roll { Id = "R", ModelCode = "TEST", Type = WarrantyType.Tint, Batch = "B", Supplier = "S" });
        db.WarrantyRegistrations.Add(Registration("R"));
        db.BoxLabels.Add(new BoxLabel { Id = "L1", TokenHash = "h", ProtectedToken = "p", RollId = "R", Product = "TEST", Type = WarrantyType.Tint, FilmYears = 5 });
        await db.SaveChangesAsync();

        Assert.IsType<OkObjectResult>(await admin.DeleteRoll("R"));
        Assert.Empty(db.Rolls);
        Assert.Empty(db.BoxLabels);
        Assert.Null(db.WarrantyRegistrations.Single().RollId);
        Assert.IsType<NotFoundResult>(await admin.DeleteRoll("R"));
    }

    [Fact]
    public async Task CannotReceiveRollsForArchivedProduct()
    {
        using var db = Database();
        db.Products.Add(new Product { Code = "TEST", Name = "Archived film", Type = WarrantyType.Tint, Archived = true });
        await db.SaveChangesAsync();
        var admin = new AdminController(db, new ConfigurationBuilder().Build());
        Assert.IsType<BadRequestObjectResult>(await admin.ReceiveRolls(new("TEST", "tint", "B", "ABC", "approved", 1)));
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
    public async Task RollEditPersistsBatchSupplierAndDimensions()
    {
        using var db = Database();
        db.Rolls.Add(new Roll { Id = "R", ModelCode = "TEST", Batch = "B1", Supplier = "S1" }); await db.SaveChangesAsync();
        var admin = new AdminController(db, new ConfigurationBuilder().Build());
        Assert.IsType<BadRequestObjectResult>(await admin.UpdateRoll("R", new(null, null, null, "new batch", "ABC", 2000, 20000)));
        var roll = await db.Rolls.SingleAsync();
        Assert.Equal("B1", roll.Batch);
        Assert.IsType<OkObjectResult>(await admin.UpdateRoll("R", new(null, null, null, "new batch", "abc", 152, 30)));
        Assert.Equal("new batch", roll.Batch);
        Assert.Equal("ABC", roll.Supplier);
        Assert.Equal(152m, roll.WidthCm);
        Assert.Equal(30m, roll.LengthM);
    }

    [Fact]
    public async Task PasswordChangeRequiresCurrentPasswordAndPersistsHash()
    {
        using var db = Database(); db.AdminUsers.Add(new AdminUser { PasswordHash = BCrypt.Net.BCrypt.HashPassword("old-test-password") }); await db.SaveChangesAsync();
        var api = new AccountController(db);
        Assert.IsType<BadRequestObjectResult>(await api.Password(new("admin", "wrong", "new-test-password")));
        Assert.IsType<OkObjectResult>(await api.Password(new("admin", "old-test-password", "new-test-password")));
        Assert.True(BCrypt.Net.BCrypt.Verify("new-test-password", (await db.AdminUsers.SingleAsync()).PasswordHash));
    }
}
