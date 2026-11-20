using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Solarzed.Api.Domain;

public class BoxLabel
{
    [Key, MaxLength(32)] public string Id { get; set; } = default!;
    [MaxLength(64)] public string TokenHash { get; set; } = default!;
    public string ProtectedToken { get; set; } = default!;
    // Null once the roll was deleted: an activated carton stays, so its card keeps working for the customer.
    [MaxLength(60)] public string? RollId { get; set; }
    [MaxLength(24)] public string Product { get; set; } = default!;
    public WarrantyType Type { get; set; }
    public int FilmYears { get; set; }
    public int? InstallYears { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ActivatedAt { get; set; }
    // Each carton contains one physical roll. Snapshot its length when the label is issued.
    [Column(TypeName = "decimal(7,2)")] public decimal? RemainingLengthM { get; set; }
    [MaxLength(32)] public string? WarrantyCode { get; set; }
    // Who physically holds the carton now. Null = central warehouse (where every new label starts).
    [MaxLength(200)] public string? Holder { get; set; }
    // Mobile of the representative/shop holding the carton. They see it in their account after OTP login.
    [MaxLength(30)] public string? HolderPhone { get; set; }
    public DateTime? HeldSince { get; set; }
    // Warranty number printed on the card inside the carton; becomes the warranty code when activated.
    [MaxLength(32)] public string? CardCode { get; set; }
    // Internal supplier code at issue time; needed to resolve legacy Factory-Serial-Warranty cards.
    [MaxLength(4)] public string? FactoryCode { get; set; }
    [ConcurrencyCheck] public int Revision { get; set; }
}

/// <summary>One hand-over of a carton, identified by the serial printed on the box. Rows are append-only.</summary>
public class BoxTransfer
{
    [Key] public long Id { get; set; }
    [MaxLength(32)] public string LabelId { get; set; } = default!;
    [MaxLength(24)] public string BatchId { get; set; } = default!;   // all boxes moved in one hand-over share it
    [MaxLength(200)] public string? FromHolder { get; set; }          // null = central warehouse
    [MaxLength(30)] public string? FromPhone { get; set; }
    [MaxLength(200)] public string? ToHolder { get; set; }            // null = returned to central warehouse
    [MaxLength(30)] public string? ToPhone { get; set; }
    [MaxLength(500)] public string? Note { get; set; }
    [MaxLength(100)] public string Actor { get; set; } = default!;
    public DateTime At { get; set; } = DateTime.UtcNow;
}

public class ActivationChallenge
{
    [Key, MaxLength(64)] public string Id { get; set; } = default!;
    [MaxLength(32)] public string LabelId { get; set; } = default!;
    [MaxLength(30)] public string Phone { get; set; } = default!;
    [MaxLength(100)] public string CodeHash { get; set; } = default!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public bool Sent { get; set; }
    public bool Consumed { get; set; }
    public int Attempts { get; set; }
    [ConcurrencyCheck] public int Revision { get; set; }
}

/// <summary>A representative, shop or customer who signs in to the public site with an SMS or email code.</summary>
public class PortalUser
{
    [Key] public int Id { get; set; }
    [MaxLength(30)] public string? Phone { get; set; }
    // Email is a second sign-in identifier; at least one of Phone/Email is always set.
    [MaxLength(254)] public string? Email { get; set; }
    [MaxLength(200)] public string? Name { get; set; }

    // Self-service profile: who the user is, where they are and what they do.
    [MaxLength(100)] public string? FirstName { get; set; }
    [MaxLength(100)] public string? LastName { get; set; }
    [MaxLength(100)] public string? Country { get; set; }
    [MaxLength(100)] public string? City { get; set; }
    [MaxLength(100)] public string? Job { get; set; }

    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
}

public class LoginChallenge
{
    [Key, MaxLength(64)] public string Id { get; set; } = default!;
    [MaxLength(30)] public string? Phone { get; set; }
    [MaxLength(254)] public string? Email { get; set; }
    [MaxLength(100)] public string CodeHash { get; set; } = default!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public bool Sent { get; set; }
    public bool Consumed { get; set; }
    public int Attempts { get; set; }
    [ConcurrencyCheck] public int Revision { get; set; }
}
