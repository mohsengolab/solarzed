using System.ComponentModel.DataAnnotations;

namespace Solarzed.Api.Domain;

public class BoxLabel
{
    [Key, MaxLength(32)] public string Id { get; set; } = default!;
    [MaxLength(64)] public string TokenHash { get; set; } = default!;
    public string ProtectedToken { get; set; } = default!;
    [MaxLength(60)] public string RollId { get; set; } = default!;
    [MaxLength(24)] public string Product { get; set; } = default!;
    public WarrantyType Type { get; set; }
    public int FilmYears { get; set; }
    public int? InstallYears { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ActivatedAt { get; set; }
    [MaxLength(32)] public string? WarrantyCode { get; set; }
    // Who physically holds the carton now. Null = central warehouse (where every new label starts).
    [MaxLength(200)] public string? Holder { get; set; }
    // Mobile of the representative/shop holding the carton. They see it in their account after OTP login.
    [MaxLength(30)] public string? HolderPhone { get; set; }
    public DateTime? HeldSince { get; set; }
    // Warranty number printed on the card inside the carton; becomes the warranty code when activated.
    [MaxLength(32)] public string? CardCode { get; set; }
    // Letters identifying the factory (e.g. SA, BF). Card code shown to the customer = Factory-Serial-Warranty.
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

/// <summary>A representative, shop or customer who signs in to the public site with an SMS code.</summary>
public class PortalUser
{
    [Key] public int Id { get; set; }
    [MaxLength(30)] public string Phone { get; set; } = default!;
    [MaxLength(200)] public string? Name { get; set; }
    public bool Active { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastLoginAt { get; set; }
}

public class LoginChallenge
{
    [Key, MaxLength(64)] public string Id { get; set; } = default!;
    [MaxLength(30)] public string Phone { get; set; } = default!;
    [MaxLength(100)] public string CodeHash { get; set; } = default!;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }
    public bool Sent { get; set; }
    public bool Consumed { get; set; }
    public int Attempts { get; set; }
    [ConcurrencyCheck] public int Revision { get; set; }
}
