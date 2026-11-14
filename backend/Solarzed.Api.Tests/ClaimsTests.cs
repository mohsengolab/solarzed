using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Solarzed.Api.Application;
using Solarzed.Api.Controllers;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Tests;

public class ClaimsTests
{
    static AppDbContext Database() => new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    static async Task<AppDbContext> WithWarranty(string code = "SZ-TESTCODE")
    {
        var db = Database();
        db.WarrantyRegistrations.Add(new WarrantyRegistration
        {
            Code = code, Type = WarrantyType.Tint, Vin = "1HGCM82633A004352", Owner = "Owner", Phone = "09120000000", Plate = "12A345",
            Make = "Make", Model = "Model", FilmSerial = "S", InvoiceNumber = "I", Installed = new DateOnly(2026, 1, 1),
            SellerName = "Seller", SellerPhone = "09120000001", Installer = "Installer", Status = WarrantyStatus.Active,
        });
        await db.SaveChangesAsync();
        return db;
    }

    static UpdateClaimRequest Update(int revision, string stage, string cause = "undetermined", string decision = "none",
        string remedy = "none", string? note = null, string? reason = null) =>
        new(revision, stage, cause, decision, note, remedy, null, null, null, null, null, reason);

    static async Task<string> Open(ClaimsController api, string code = "SZ-TESTCODE")
    {
        var result = Assert.IsType<OkObjectResult>(await api.Create(new("sz-testcode", "phone", "Bubbles on the rear window after two months.", null)));
        return JsonSerializer.SerializeToElement(result.Value).GetProperty("Id").GetString()!;
    }

    [Fact]
    public async Task CreatesClaimWithTrackingNumberAndAuditForClaimAndWarranty()
    {
        using var db = await WithWarranty(); var api = new ClaimsController(db);
        var id = await Open(api);
        Assert.Matches("^CL-\\d{6}-[A-Z2-9]{5}$", id);
        var claim = await db.WarrantyClaims.SingleAsync();
        Assert.Equal(ClaimStage.Received, claim.Stage);
        Assert.Equal("SZ-TESTCODE", claim.WarrantyCode);
        Assert.Equal(2, await db.AuditEntries.CountAsync());
        Assert.Contains(db.AuditEntries, a => a.EntityType == "warranty" && a.Action == "claimOpened");
    }

    [Fact]
    public async Task RejectsUnknownWarrantyShortDescriptionAndBadChannel()
    {
        using var db = await WithWarranty(); var api = new ClaimsController(db);
        Assert.IsType<NotFoundObjectResult>(await api.Create(new("SZ-NOPE", "phone", "A long enough description.", null)));
        Assert.IsType<BadRequestObjectResult>(await api.Create(new("SZ-TESTCODE", "phone", "short", null)));
        Assert.IsType<BadRequestObjectResult>(await api.Create(new("SZ-TESTCODE", "fax", "A long enough description.", null)));
        Assert.Empty(db.WarrantyClaims);
    }

    [Fact]
    public async Task WorkflowRequiresCauseReasonAndRemedyAndStampsEachStage()
    {
        using var db = await WithWarranty(); var api = new ClaimsController(db);
        var id = await Open(api);

        Assert.IsType<OkObjectResult>(await api.Update(id, Update(0, "initialReview")));
        Assert.IsType<OkObjectResult>(await api.Update(id, Update(1, "technicalAssessment")));
        // Final decisions need a determined cause; a rejection also needs a documented reason.
        Assert.IsType<BadRequestObjectResult>(await api.Update(id, Update(2, "decided", decision: "accepted")));
        Assert.IsType<BadRequestObjectResult>(await api.Update(id, Update(2, "decided", "film", "rejected")));
        // Accepting sets the decision stage; closing an accepted claim needs the remedy carried out.
        Assert.IsType<OkObjectResult>(await api.Update(id, Update(2, "technicalAssessment", "film", "accepted")));
        Assert.IsType<BadRequestObjectResult>(await api.Update(id, Update(3, "closed", "film", "accepted")));
        Assert.IsType<OkObjectResult>(await api.Update(id, Update(3, "closed", "film", "accepted", "replaceFilm")));

        var c = await db.WarrantyClaims.SingleAsync();
        Assert.Equal(ClaimStage.Closed, c.Stage);
        Assert.NotNull(c.AcknowledgedAt); Assert.NotNull(c.InitialReviewedAt); Assert.NotNull(c.DocumentsCompleteAt);
        Assert.NotNull(c.DecidedAt); Assert.NotNull(c.ClosedAt);
        Assert.Equal(1 + 4, await db.AuditEntries.CountAsync(a => a.EntityType == "claim"));
    }

    [Fact]
    public async Task ReopeningNeedsReasonAndStaleRevisionConflicts()
    {
        using var db = await WithWarranty(); var api = new ClaimsController(db);
        var id = await Open(api);
        Assert.IsType<OkObjectResult>(await api.Update(id, Update(0, "decided", "external", "rejected", note: "Stone chip damage")));
        Assert.IsType<ConflictObjectResult>(await api.Update(id, Update(0, "technicalAssessment")));
        Assert.IsType<BadRequestObjectResult>(await api.Update(id, Update(1, "technicalAssessment")));
        Assert.IsType<OkObjectResult>(await api.Update(id, Update(1, "technicalAssessment", reason: "Customer sent new photos")));

        var c = await db.WarrantyClaims.SingleAsync();
        Assert.Null(c.DecidedAt);
        var reopened = await db.AuditEntries.SingleAsync(a => a.Action == "reopened");
        Assert.Equal("Customer sent new photos", reopened.Reason);
        Assert.Contains("\"decision\"", reopened.ChangesJson);
    }

    [Fact]
    public void ServiceTargetsSkipFridayAndFlagLateStages()
    {
        var thursday = new DateTime(2026, 11, 12, 9, 0, 0, DateTimeKind.Utc);
        Assert.Equal(DayOfWeek.Thursday, thursday.DayOfWeek);
        Assert.Equal(new DateTime(2026, 11, 15, 9, 0, 0, DateTimeKind.Utc), ClaimService.AddBusinessDays(thursday, 2)); // Sat, Sun

        var claim = new WarrantyClaim { CreatedAt = thursday, Stage = ClaimStage.Received };
        Assert.False(ClaimService.Due(claim, thursday.AddDays(1)).Overdue);
        var late = ClaimService.Due(claim, thursday.AddDays(4));
        Assert.True(late.Overdue);
        Assert.Equal("acknowledge", late.OverdueStage);
        Assert.Null(late.DecisionBy);
    }

    [Fact]
    public async Task WarrantyDecisionKeepsPreviousStatusAndNoteInChangeLog()
    {
        using var db = await WithWarranty(); var admin = new AdminController(db, new ConfigurationBuilder().Build());
        Assert.IsType<OkObjectResult>(await admin.Decision("SZ-TESTCODE", new("rejected", "Serial does not match box")));
        Assert.IsType<OkObjectResult>(await admin.Decision("SZ-TESTCODE", new("active", "Box verified in person")));
        var log = await db.AuditEntries.Where(a => a.EntityType == "warranty").OrderBy(a => a.Id).ToListAsync();
        Assert.Equal(2, log.Count);
        Assert.Contains("Serial does not match box", log[1].ChangesJson);   // old note preserved in the second entry
        Assert.Equal("Box verified in person", log[1].Reason);
    }

    [Fact]
    public async Task RollUpdatesAndProductEditsAreLogged()
    {
        using var db = Database();
        db.Rolls.Add(new Roll { Id = "R", ModelCode = "TEST", Batch = "B", Supplier = "S" }); await db.SaveChangesAsync();
        var admin = new AdminController(db, new ConfigurationBuilder().Build());
        await admin.UpdateRoll("R", new("shipped", "approved", "QC checked"));
        var mgmt = new ManagementController(db);
        await mgmt.Create(new("P1", "Film", "tint", "S", "D", false));
        await mgmt.Update("P1", new("P1", "Film 2", "tint", "S", "D", true));
        Assert.Contains(db.AuditEntries, a => a.EntityType == "roll" && a.Reason == "QC checked" && a.ChangesJson.Contains("Shipped"));
        Assert.Contains(db.AuditEntries, a => a.EntityType == "product" && a.Action == "archived" && a.ChangesJson.Contains("Film 2"));
    }

    [Fact]
    public async Task AuditSearchFiltersByEntity()
    {
        using var db = await WithWarranty(); var api = new ClaimsController(db);
        await Open(api);
        var ok = Assert.IsType<OkObjectResult>(await api.Audit(new AuditSearch { EntityType = "warranty" }, default));
        Assert.Equal(1, JsonSerializer.SerializeToElement(ok.Value).GetProperty("total").GetInt32());
    }
}
