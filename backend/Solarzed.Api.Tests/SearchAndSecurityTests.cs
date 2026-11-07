using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Solarzed.Api.Application;
using Solarzed.Api.Controllers;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Tests;

sealed class ManualClock : TimeProvider
{
    DateTimeOffset now = DateTimeOffset.UtcNow;
    public override DateTimeOffset GetUtcNow() => now;
    public void Advance(TimeSpan by) => now += by;
}

public class SearchAndSecurityTests
{
    static AppDbContext Database() => new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    static WarrantyRegistration W(string code, WarrantyStatus status, WarrantyType type, string make, DateOnly installed, string flags = "[]", DateOnly? filmEnds = null) => new()
    {
        Code = code, Status = status, Type = type, Make = make, Model = "M", Owner = "Owner " + code, Phone = "0912" + code.PadLeft(7, '0')[^7..],
        Vin = "VIN" + code, Plate = "P", FilmSerial = "S" + code, InvoiceNumber = "I" + code, Installed = installed, SellerName = "Seller",
        SellerPhone = "0", Installer = "Shop " + make, FlagsJson = flags, FilmEnds = filmEnds,
    };

    static JsonElement Json(IActionResult r) => JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(r).Value,
        new JsonSerializerOptions(JsonSerializerDefaults.Web));

    [Fact]
    public async Task WarrantySearchCombinesFiltersSortsAndPages()
    {
        using var db = Database();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        db.WarrantyRegistrations.AddRange(
            W("A1", WarrantyStatus.Active, WarrantyType.Tint, "Toyota", new(2026, 1, 10), filmEnds: today.AddDays(20)),
            W("A2", WarrantyStatus.Active, WarrantyType.Ppf, "Toyota", new(2026, 3, 1), "[\"vin_repeat\"]", today.AddDays(400)),
            W("P1", WarrantyStatus.Pending, WarrantyType.Tint, "Kia", new(2025, 6, 1), "[\"roll_unknown\"]"),
            W("P2", WarrantyStatus.Pending, WarrantyType.Tint, "Toyota", new(2026, 2, 1)));
        await db.SaveChangesAsync();
        var api = new AdminController(db, new ConfigurationBuilder().Build());

        var toyotaTint = Json(await api.Warranties(new WarrantySearch { Make = "Toyota", Type = "tint", Sort = "installed", Dir = "asc" }, default));
        Assert.Equal(2, toyotaTint.GetProperty("total").GetInt32());
        Assert.Equal(["A1", "P2"], toyotaTint.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("code").GetString()));

        Assert.Equal(1, Json(await api.Warranties(new WarrantySearch { Flag = "vin_repeat" }, default)).GetProperty("total").GetInt32());
        Assert.Equal(2, Json(await api.Warranties(new WarrantySearch { Flagged = false }, default)).GetProperty("total").GetInt32());
        Assert.Equal(1, Json(await api.Warranties(new WarrantySearch { ExpiringDays = 30 }, default)).GetProperty("total").GetInt32());
        Assert.Equal(3, Json(await api.Warranties(new WarrantySearch { InstalledFrom = new(2026, 1, 1) }, default)).GetProperty("total").GetInt32());
        Assert.Equal(1, Json(await api.Warranties(new WarrantySearch { Q = "IP1" }, default)).GetProperty("total").GetInt32()); // invoice number

        var paged = Json(await api.Warranties(new WarrantySearch { PageSize = 3, Page = 2 }, default));
        Assert.Equal(4, paged.GetProperty("total").GetInt32());
        Assert.Single(paged.GetProperty("items").EnumerateArray());
        // Invalid input never widens or breaks the query.
        Assert.Equal(4, Json(await api.Warranties(new WarrantySearch { Status = "999", Sort = "Owner; DROP", Flag = "\"x\" OR 1=1", PageSize = 100000 }, default)).GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task RollSearchFiltersByQcStatusAndInstallations()
    {
        using var db = Database();
        db.Rolls.AddRange(
            new Roll { Id = "R1", ModelCode = "PIR", Batch = "B1", Supplier = "S1", Qc = RollQc.Approved, Status = RollStatus.Shipped },
            new Roll { Id = "R2", ModelCode = "PIR", Batch = "B2", Supplier = "S2", Qc = RollQc.Pending },
            new Roll { Id = "R3", ModelCode = "CP", Type = WarrantyType.Ppf, Batch = "B3", Supplier = "S1", Qc = RollQc.Approved });
        var reg = W("X", WarrantyStatus.Active, WarrantyType.Tint, "Kia", new(2026, 1, 1)); reg.RollId = "R1";
        db.WarrantyRegistrations.Add(reg);
        await db.SaveChangesAsync();
        var api = new AdminController(db, new ConfigurationBuilder().Build());

        Assert.Equal(2, Json(await api.GetRolls(new RollSearch { Qc = "approved" }, default)).GetProperty("total").GetInt32());
        Assert.Equal(1, Json(await api.GetRolls(new RollSearch { Model = "pir", Status = "shipped" }, default)).GetProperty("total").GetInt32());
        var used = Json(await api.GetRolls(new RollSearch { HasInstalls = true }, default));
        Assert.Equal("R1", used.GetProperty("items")[0].GetProperty("id").GetString());
        Assert.Equal(1, used.GetProperty("items")[0].GetProperty("installs").GetInt32());
        Assert.Equal(1, Json(await api.GetRolls(new RollSearch { Type = "ppf", Supplier = "S1" }, default)).GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task ProductAndCustomerSearch()
    {
        using var db = Database();
        db.Products.AddRange(new Product { Code = "A", Name = "Alpha", Series = "One" }, new Product { Code = "B", Name = "Beta", Series = "Two", Archived = true, Type = WarrantyType.Ppf });
        db.WarrantyRegistrations.AddRange(W("C1", WarrantyStatus.Active, WarrantyType.Tint, "Kia", new(2026, 1, 1)), W("C2", WarrantyStatus.Pending, WarrantyType.Ppf, "BMW", new(2026, 1, 1)));
        await db.SaveChangesAsync();
        var api = new ManagementController(db);
        var archived = Json(await api.Products(new ProductSearch { Availability = "archived" }, default));
        Assert.Equal("B", archived.GetProperty("items")[0].GetProperty("code").GetString());
        Assert.Equal(2, archived.GetProperty("series").GetArrayLength());
        Assert.Equal(1, Json(await api.Products(new ProductSearch { Q = "Alp" }, default)).GetProperty("total").GetInt32());
        var customers = Json(await api.Customers(new CustomerSearch { Make = "BMW" }, default));
        Assert.Equal(1, customers.GetProperty("total").GetInt32());
        Assert.Equal("C2", customers.GetProperty("items")[0].GetProperty("code").GetString());
    }

    [Fact]
    public void LoginThrottleLocksAfterRepeatedFailuresAndExpires()
    {
        var clock = new ManualClock();
        var throttle = new LoginThrottle(clock);
        for (var i = 0; i < LoginThrottle.MaxFailures; i++) Assert.False(throttle.Locked("Admin", out _)); // checked before each attempt
        for (var i = 0; i < LoginThrottle.MaxFailures; i++) throttle.Fail("admin ");
        Assert.True(throttle.Locked("ADMIN", out var retry));
        Assert.True(retry > TimeSpan.Zero);
        clock.Advance(LoginThrottle.Window + TimeSpan.FromSeconds(1));
        Assert.False(throttle.Locked("admin", out _));
        throttle.Fail("admin"); throttle.Succeed("admin");
        Assert.False(throttle.Locked("admin", out _));
    }

    [Fact]
    public void PasswordStampChangesWithPasswordHash()
    {
        var a = BCrypt.Net.BCrypt.HashPassword("first-password-1");
        var b = BCrypt.Net.BCrypt.HashPassword("second-password-2");
        Assert.Equal(AdminAuth.Stamp(a), AdminAuth.Stamp(a));
        Assert.NotEqual(AdminAuth.Stamp(a), AdminAuth.Stamp(b));
    }

    [Fact]
    public void SmsPolicyDefaultsAndClampsAndMasksNumbers()
    {
        Assert.Equal(new SmsPolicy(true, 5, 60, 10), SmsPolicy.From(null));
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["Sms:Enabled"] = "false", ["Sms:OtpMinutes"] = "99", ["Sms:ResendSeconds"] = "1", ["Sms:DailyLimit"] = "abc" }).Build();
        Assert.Equal(new SmsPolicy(false, 15, 30, 10), SmsPolicy.From(cfg));
        Assert.Equal("0912••••567", SmsLog.Mask("09121234567"));
        Assert.DoesNotContain("1234", SmsLog.Mask("09121234567"));
    }

    [Fact]
    public async Task PausedSmsIsNotConfiguredButStaysConnected()
    {
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["Faraz:Mode"] = "rest", ["Faraz:Token"] = "k", ["Faraz:OtpPattern"] = "1", ["Faraz:Sender"] = "3000", ["Sms:Enabled"] = "false" }).Build();
        var sender = new ActivationSmsSender(new HttpClient(), cfg);
        Assert.True(sender.Connected);
        Assert.False(sender.Configured);
        var error = await Assert.ThrowsAsync<ActivationError>(() => sender.Send("09120000000", "123456", "t", default));
        Assert.Equal(503, error.Status);
    }
}
