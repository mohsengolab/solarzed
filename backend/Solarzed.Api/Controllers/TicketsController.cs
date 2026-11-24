using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

/// <summary>
/// Support tickets opened by portal users. Every ticket carries the writer's mobile, first and last name
/// (and their profile) so whoever reads the conversation always knows who they are answering.
/// </summary>
[ApiController, Route("api/admin/tickets"), Authorize(Policy = "StaffPolicy")]
public class TicketsController(AppDbContext db) : ControllerBase
{
    string Actor => AuditLog.Actor(HttpContext?.User);

    [HttpGet, Perm("tickets.view")]
    public async Task<IActionResult> List([FromQuery] TicketSearch f, CancellationToken ct)
    {
        var query = db.Tickets.AsNoTracking();
        if (!string.IsNullOrEmpty(f.Status) && Enum.TryParse<TicketStatus>(f.Status, true, out var st) && Enum.IsDefined(st))
            query = query.Where(t => t.Status == st);
        if (Paging.Term(f.Q) is { } q)
            query = query.Where(t =>
                t.Subject.Contains(q) || t.Code.Contains(q) || (t.UserPhone != null && t.UserPhone.Contains(q)) ||
                (t.UserEmail != null && t.UserEmail.Contains(q)) ||
                (t.FirstName != null && t.FirstName.Contains(q)) || (t.LastName != null && t.LastName.Contains(q)));
        var page = new PageQuery(f.Page, f.PageSize, f.Sort, f.Dir);
        var result = await query.OrderBy(f.Sort, page.Desc, new Dictionary<string, System.Linq.Expressions.Expression<Func<Ticket, object>>> {
            ["createdAt"] = t => t.CreatedAt, ["updatedAt"] = t => t.UpdatedAt, ["subject"] = t => t.Subject, ["status"] = t => t.Status,
        }, "updatedAt").ToPage(page, ct);

        var ids = result.Items.Select(t => t.Id).ToList();
        var replies = await db.TicketReplies.AsNoTracking().Where(r => ids.Contains(r.TicketId))
            .GroupBy(r => r.TicketId).Select(g => new { TicketId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.TicketId, x => x.Count, ct);

        return Ok(new
        {
            items = result.Items.Select(t => new
            {
                t.Id, t.Code, t.Subject, Status = t.Status.ToString().ToLower(), t.CreatedAt, t.UpdatedAt,
                t.UserPhone, t.UserEmail, t.FirstName, t.LastName, t.Country, t.City, t.Job,
                Replies = replies.GetValueOrDefault(t.Id, 0),
            }),
            total = result.Total, page = result.Page, pageSize = result.PageSize,
        });
    }

    [HttpGet("{id:long}"), Perm("tickets.view")]
    public async Task<IActionResult> Detail(long id)
    {
        var ticket = await db.Tickets.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
        if (ticket == null) return NotFound(new { error = "Ticket not found." });
        var replies = await db.TicketReplies.AsNoTracking().Where(r => r.TicketId == id)
            .OrderBy(r => r.CreatedAt).ThenBy(r => r.Id).ToListAsync();
        var user = await db.PortalUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Id == ticket.UserId);
        return Ok(new
        {
            ticket = new
            {
                ticket.Id, ticket.Code, ticket.Subject, Status = ticket.Status.ToString().ToLower(),
                ticket.CreatedAt, ticket.UpdatedAt, ticket.UserPhone, ticket.UserEmail,
                ticket.FirstName, ticket.LastName, ticket.Country, ticket.City, ticket.Job,
            },
            profile = user == null ? null : new
            {
                user.Phone, user.Email, user.Name, user.FirstName, user.LastName, user.Country, user.City, user.Job,
                user.CreatedAt, user.LastLoginAt,
            },
            replies = replies.Select(r => new { r.Id, author = r.Author, authorLabel = r.AuthorLabel, r.Message, r.CreatedAt }),
        });
    }

    [HttpPost("{id:long}/reply"), Perm("tickets.edit")]
    public async Task<IActionResult> Reply(long id, [FromBody] TicketReplyRequest request)
    {
        var message = (request.Message ?? "").Trim();
        if (message.Length is 0 or > 4000) return BadRequest(new { error = "Write a reply of up to 4000 characters." });
        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket == null) return NotFound(new { error = "Ticket not found." });
        db.TicketReplies.Add(new TicketReply { TicketId = ticket.Id, Author = "staff", AuthorLabel = Actor, Message = message });
        ticket.Status = TicketStatus.Answered;
        ticket.UpdatedAt = DateTime.UtcNow;
        ticket.Revision++;
        AuditLog.Add(db, Actor, "ticket", ticket.Code, "replied");
        await db.SaveChangesAsync();
        return Ok(new { ok = true, status = "answered" });
    }

    [HttpPost("{id:long}/close"), Perm("tickets.edit")]
    public async Task<IActionResult> Close(long id)
    {
        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket == null) return NotFound(new { error = "Ticket not found." });
        ticket.Status = TicketStatus.Closed;
        ticket.UpdatedAt = DateTime.UtcNow;
        ticket.Revision++;
        AuditLog.Add(db, Actor, "ticket", ticket.Code, "closed");
        await db.SaveChangesAsync();
        return Ok(new { ok = true, status = "closed" });
    }

    [HttpPost("{id:long}/open"), Perm("tickets.edit")]
    public async Task<IActionResult> Open(long id)
    {
        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == id);
        if (ticket == null) return NotFound(new { error = "Ticket not found." });
        ticket.Status = TicketStatus.Open;
        ticket.UpdatedAt = DateTime.UtcNow;
        ticket.Revision++;
        AuditLog.Add(db, Actor, "ticket", ticket.Code, "reopened");
        await db.SaveChangesAsync();
        return Ok(new { ok = true, status = "open" });
    }
}

public class TicketSearch
{
    public string? Q { get; set; }
    public string? Status { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
    public string? Sort { get; set; }
    public string? Dir { get; set; }
}
public record TicketReplyRequest(string? Message);
