using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Solarzed.Api.Application;
using Solarzed.Api.Controllers;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Tests;

public class TicketsTests
{
    sealed class FakeSms : IActivationSmsSender
    {
        public bool Configured { get; set; } = true;
        public Task Send(string phone, string code, string reference, CancellationToken cancellationToken) => Task.CompletedTask;
    }

    static AppDbContext Database() => new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    static PortalController Portal(AppDbContext db, PortalUser me) => new(
        new PortalService(db, new FakeSms()), new BoxTransferService(db), db, new ConfigurationBuilder().Build())
    {
        ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("sub", me.Id.ToString())], "Test")),
            },
        },
    };

    static PortalUser Writer() => new()
    {
        Phone = "09121111111", Email = "sara@example.com", Name = "sara",
        FirstName = "Sara", LastName = "Ahmadi", Country = "Iran", City = "Tehran", Job = "Shop",
    };

    [Fact]
    public async Task CreatingATicketSnapshotsTheWriterIdentity()
    {
        using var db = Database();
        var me = Writer(); db.PortalUsers.Add(me); await db.SaveChangesAsync();
        var portal = Portal(db, me);

        var result = await portal.CreateTicket(new("Film peeling", "My film is peeling."));
        Assert.IsType<OkObjectResult>(result);

        var ticket = await db.Tickets.Include(t => t.Replies).SingleAsync();
        Assert.StartsWith("TK-", ticket.Code);
        Assert.Equal(TicketStatus.Open, ticket.Status);
        // Every field support needs to know who is writing, frozen at ticket time.
        Assert.Equal("09121111111", ticket.UserPhone);
        Assert.Equal("sara@example.com", ticket.UserEmail);
        Assert.Equal("Sara", ticket.FirstName);
        Assert.Equal("Ahmadi", ticket.LastName);
        Assert.Equal("Iran", ticket.Country);
        Assert.Equal("Tehran", ticket.City);
        Assert.Equal("Shop", ticket.Job);
        var reply = Assert.Single(ticket.Replies);
        Assert.Equal("user", reply.Author);
        Assert.Equal("My film is peeling.", reply.Message);

        // Validation: both a subject and a message are required.
        Assert.IsType<BadRequestObjectResult>(await portal.CreateTicket(new("", "hi")));
        Assert.IsType<BadRequestObjectResult>(await portal.CreateTicket(new("Subject", "  ")));
    }

    [Fact]
    public async Task StaffReplyAnswersAndUserReplyReopensTheTicket()
    {
        using var db = Database();
        var me = Writer(); db.PortalUsers.Add(me);
        var ticket = new Ticket { Code = "TK-1", Subject = "Question", UserId = me.Id, UserPhone = me.Phone, FirstName = me.FirstName, LastName = me.LastName };
        db.Tickets.Add(ticket);
        db.TicketReplies.Add(new TicketReply { Ticket = ticket, Author = "user", Message = "My film is peeling." });
        await db.SaveChangesAsync();

        var admin = new TicketsController(db);
        Assert.IsType<OkObjectResult>(await admin.Reply(ticket.Id, new("We will check it.")));
        Assert.Equal(TicketStatus.Answered, ticket.Status);
        Assert.Equal(2, await db.TicketReplies.CountAsync(r => r.TicketId == ticket.Id));

        // The user's follow-up hands the conversation back to staff.
        var portal = Portal(db, me);
        Assert.IsType<OkObjectResult>(await portal.ReplyTicket(ticket.Id, new("Thanks, one more question.")));
        Assert.Equal(TicketStatus.Open, ticket.Status);

        Assert.IsType<OkObjectResult>(await admin.Close(ticket.Id));
        Assert.Equal(TicketStatus.Closed, ticket.Status);
        Assert.IsType<OkObjectResult>(await admin.Open(ticket.Id));
        Assert.Equal(TicketStatus.Open, ticket.Status);
    }

    [Fact]
    public async Task UsersCannotTouchOtherUsersTickets()
    {
        using var db = Database();
        var me = Writer(); db.PortalUsers.Add(me);
        db.PortalUsers.Add(new PortalUser { Phone = "09351111111" });
        var ticket = new Ticket { Code = "TK-2", Subject = "Question", UserId = me.Id, UserPhone = me.Phone };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var stranger = await db.PortalUsers.SingleAsync(u => u.Phone == "09351111111");
        var strangerPortal = Portal(db, stranger);
        Assert.IsType<NotFoundObjectResult>(await strangerPortal.Ticket(ticket.Id));
        Assert.IsType<NotFoundObjectResult>(await strangerPortal.ReplyTicket(ticket.Id, new("hi")));

        // Staff can read and answer any ticket.
        Assert.IsType<OkObjectResult>(await new TicketsController(db).Detail(ticket.Id));
    }

    [Fact]
    public async Task StaffDetailAlwaysShowsWhoWroteIt()
    {
        using var db = Database();
        var me = Writer(); db.PortalUsers.Add(me);
        var ticket = new Ticket
        {
            Code = "TK-3", Subject = "Question", UserId = me.Id, UserPhone = me.Phone,
            UserEmail = me.Email, FirstName = me.FirstName, LastName = me.LastName,
        };
        db.Tickets.Add(ticket);
        await db.SaveChangesAsync();

        var ok = Assert.IsType<OkObjectResult>(await new TicketsController(db).Detail(ticket.Id));
        var json = JsonSerializer.Serialize(ok.Value);
        // Identity is never masked for staff, no matter who wrote it.
        Assert.Contains("09121111111", json);
        Assert.Contains("sara@example.com", json);
        Assert.Contains("Sara", json);
        Assert.Contains("Ahmadi", json);
        Assert.DoesNotContain("staff", json); // no staff replies yet, only the seeded ones

        var list = Assert.IsType<OkObjectResult>(await new TicketsController(db).List(new TicketSearch(), default));
        var listJson = JsonSerializer.Serialize(list.Value);
        Assert.Contains("TK-3", listJson);
        Assert.Contains("Ahmadi", listJson);
    }
}
