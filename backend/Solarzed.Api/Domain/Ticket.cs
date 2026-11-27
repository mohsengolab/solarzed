using System.ComponentModel.DataAnnotations;

namespace Solarzed.Api.Domain;

public enum TicketStatus { Open, Answered, Closed }

/// <summary>Which team a ticket goes to. Support is 0 so tickets opened before departments existed stay with support.</summary>
public enum TicketDepartment { Support, Sales }

/// <summary>
/// A support ticket a portal user opens. The user's mobile, first and last name are captured from
/// their verified session and profile so support can always see who is writing.
/// </summary>
public class Ticket
{
    [Key] public long Id { get; set; }
    [MaxLength(32)] public string Code { get; set; } = default!;      // public reference, e.g. TK-4F2A9C
    [MaxLength(200)] public string Subject { get; set; } = default!;

    public TicketStatus Status { get; set; } = TicketStatus.Open;
    public TicketDepartment Department { get; set; } = TicketDepartment.Support;

    // Snapshot of the writer's identity at ticket time (never masked for support).
    [MaxLength(30)] public string? UserPhone { get; set; }
    [MaxLength(254)] public string? UserEmail { get; set; }
    [MaxLength(100)] public string? FirstName { get; set; }
    [MaxLength(100)] public string? LastName { get; set; }
    [MaxLength(100)] public string? Country { get; set; }
    [MaxLength(100)] public string? City { get; set; }
    [MaxLength(100)] public string? Job { get; set; }

    public int UserId { get; set; }                    // PortalUser.Id, the ticket owner
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    [ConcurrencyCheck] public int Revision { get; set; }

    public List<TicketReply> Replies { get; set; } = [];
}

/// <summary>One message inside a ticket conversation. Rows are append-only.</summary>
public class TicketReply
{
    [Key] public long Id { get; set; }
    public long TicketId { get; set; }
    public Ticket? Ticket { get; set; }
    // "user" or "staff"; AuthorLabel is the username for staff replies.
    [MaxLength(10)] public string Author { get; set; } = "user";
    [MaxLength(100)] public string? AuthorLabel { get; set; }
    [MaxLength(4000)] public string Message { get; set; } = default!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
