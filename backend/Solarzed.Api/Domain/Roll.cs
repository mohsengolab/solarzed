using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Solarzed.Api.Domain;

public enum RollQc { Pending, Approved, Rejected }
public enum RollStatus { InStock, Shipped, Consumed, Void }

public class Roll
{
    [Key]
    [MaxLength(60)]
    public string Id { get; set; } = default!;   // SZ-{ROLL NO}-{YYMM}-{7 random digits}-{FACTORY}, e.g. SZ-CPT30614374-2611-4827153-ABC;
                                                  // the model code stands in when no Roll No is given at receipt. Older rolls keep earlier formats.

    // Running number of the roll in receipt order, starting at 1 (the internal register number).
    public int Number { get; set; }

    [MaxLength(24)]
    public string ModelCode { get; set; } = default!;

    // Roll No the factory prints (with its barcode) on the carton, e.g. CPT30614374. One carton holds one roll,
    // so this becomes the carton serial (BoxLabel.Id) when its warranty card is issued. Null for older rolls.
    [MaxLength(32)]
    public string? RollNo { get; set; }

    public WarrantyType Type { get; set; }

    [MaxLength(32)]
    public string Batch { get; set; } = default!;

    [MaxLength(16)]
    public string Supplier { get; set; } = default!;   // confidential

    // Where the roll is: in a warehouse, or with a specific system user (the user wins when both are set).
    public int? WarehouseId { get; set; }
    public int? HolderUserId { get; set; }

    public RollQc Qc { get; set; } = RollQc.Pending;
    public RollStatus Status { get; set; } = RollStatus.InStock;

    // Physical roll dimensions
    [Column(TypeName = "decimal(7,2)")] public decimal? WidthCm { get; set; }
    [Column(TypeName = "decimal(7,2)")] public decimal? LengthM { get; set; }

    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;

    [Column(TypeName = "nvarchar(max)")]
    public string HistoryJson { get; set; } = "[]";
}
