using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Solarzed.Api.Domain;

public enum WarrantyType { Tint, Ppf }
public enum WarrantyStatus { Pending, Active, Rejected }

public class WarrantyRegistration
{
    [Key]
    [MaxLength(32)]
    public string Code { get; set; } = default!;

    public WarrantyType Type { get; set; }

    [MaxLength(17)]
    public string Vin { get; set; } = default!;

    [MaxLength(200)]
    public string Owner { get; set; } = default!;

    [MaxLength(30)]
    public string Phone { get; set; } = default!;

    [MaxLength(20)]
    public string Plate { get; set; } = default!;

    [MaxLength(100)]
    public string Make { get; set; } = default!;

    [MaxLength(100)]
    public string Model { get; set; } = default!;

    [MaxLength(40)]
    public string FilmSerial { get; set; } = default!;

    [Column(TypeName = "decimal(7,2)")]
    public decimal? UsedLengthM { get; set; }

    [MaxLength(60)]
    public string InvoiceNumber { get; set; } = default!;

    public DateOnly Installed { get; set; }

    [MaxLength(200)]
    public string SellerName { get; set; } = default!;

    [MaxLength(30)]
    public string SellerPhone { get; set; } = default!;

    [MaxLength(200)]
    public string Installer { get; set; } = default!;

    // Mobile of the approved partner account that registered this installation (null = customer self-registration).
    [MaxLength(30)]
    public string? InstallerPhone { get; set; }

    // Country where the vehicle was fitted.
    [MaxLength(100)]
    public string? Country { get; set; }

    // JSON columns – stored as text
    [Column(TypeName = "nvarchar(max)")]
    public string AreasJson { get; set; } = "[]";    // string[] of window or panel keys

    [Column(TypeName = "nvarchar(max)")]
    public string? GlassSizesJson { get; set; }      // window film: { glass: { lengthCm, widthCm } }

    [Column(TypeName = "nvarchar(max)")]
    public string FlagsJson { get; set; } = "[]";    // string[] flag codes

    public WarrantyStatus Status { get; set; } = WarrantyStatus.Pending;

    [MaxLength(500)]
    public string? ReviewNote { get; set; }

    public DateOnly? FilmEnds { get; set; }
    public DateOnly? InstallEnds { get; set; }

    [MaxLength(60)]
    public string? RollId { get; set; }

    // Random key in the gold-card link sent to the owner by SMS ({site}/card#{Code}.{CardKey}).
    [MaxLength(16)]
    public string? CardKey { get; set; }

    // When the "warranty active" SMS with the gold card link went out (null = not sent yet).
    public DateTime? CardSentAt { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAt { get; set; }
}
