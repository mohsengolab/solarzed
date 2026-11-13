using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Solarzed.Api.Domain;

public enum RollQc { Pending, Approved, Rejected }
public enum RollStatus { InStock, Shipped, Consumed, Void }

public class Roll
{
    [Key]
    [MaxLength(60)]
    public string Id { get; set; } = default!;   // SZ-{MODEL}-{YY}-{NNNNNN}

    [MaxLength(24)]
    public string ModelCode { get; set; } = default!;

    public WarrantyType Type { get; set; }

    [MaxLength(32)]
    public string Batch { get; set; } = default!;

    [MaxLength(16)]
    public string Supplier { get; set; } = default!;   // confidential

    public RollQc Qc { get; set; } = RollQc.Pending;
    public RollStatus Status { get; set; } = RollStatus.InStock;

    // Physical roll dimensions
    [Column(TypeName = "decimal(7,2)")] public decimal? WidthCm { get; set; }
    [Column(TypeName = "decimal(7,2)")] public decimal? LengthM { get; set; }

    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;

    [Column(TypeName = "nvarchar(max)")]
    public string HistoryJson { get; set; } = "[]";
}
