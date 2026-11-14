using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Solarzed.Api.Domain;

// Warranty policy §5: received → initial review → technical assessment → decision → remedy and close.
public enum ClaimStage { Received, InitialReview, TechnicalAssessment, Decided, Closed }
public enum ClaimCause { Undetermined, Film, Installation, Vehicle, External }
public enum ClaimDecision { None, Accepted, NeedsMoreReview, Rejected }
public enum ClaimRemedy { None, FixInstallation, ReplaceFilm, ReplaceProduct, Refund, Other }
public enum ClaimChannel { Phone, Installer, Website, Email, InPerson }

public class WarrantyClaim
{
    [Key, MaxLength(24)] public string Id { get; set; } = default!;           // CL-YYMMDD-XXXXX (tracking number)
    [MaxLength(32)] public string WarrantyCode { get; set; } = default!;
    public ClaimChannel Channel { get; set; }
    [MaxLength(2000)] public string Description { get; set; } = default!;
    [MaxLength(1000)] public string? RequiredDocuments { get; set; }          // what the customer still has to provide

    public ClaimStage Stage { get; set; } = ClaimStage.Received;
    public ClaimCause Cause { get; set; } = ClaimCause.Undetermined;
    public ClaimDecision Decision { get; set; } = ClaimDecision.None;
    [MaxLength(1000)] public string? DecisionNote { get; set; }
    public ClaimRemedy Remedy { get; set; } = ClaimRemedy.None;
    [MaxLength(1000)] public string? RemedyNote { get; set; }

    [Column(TypeName = "decimal(14,2)")] public decimal? LaborCost { get; set; }
    [Column(TypeName = "decimal(14,2)")] public decimal? PartsCost { get; set; }
    [Column(TypeName = "decimal(14,2)")] public decimal? OtherCost { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(100)] public string CreatedBy { get; set; } = "system";
    public DateTime? AcknowledgedAt { get; set; }      // stage 1 done (service target: 2 business days)
    public DateTime? InitialReviewedAt { get; set; }   // stage 2 done (service target: 3 business days)
    public DateTime? DocumentsCompleteAt { get; set; } // starts the 7-business-day decision target
    public DateTime? DecidedAt { get; set; }
    public DateTime? ClosedAt { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [ConcurrencyCheck] public int Revision { get; set; }
}

// Append-only change log. Rows are never updated or deleted by the application.
public class AuditEntry
{
    [Key] public long Id { get; set; }
    [MaxLength(20)] public string EntityType { get; set; } = default!;   // warranty, claim, roll, product, settings, user
    [MaxLength(64)] public string EntityId { get; set; } = default!;
    [MaxLength(40)] public string Action { get; set; } = default!;
    [MaxLength(100)] public string Actor { get; set; } = default!;
    public DateTime At { get; set; } = DateTime.UtcNow;
    [MaxLength(1000)] public string? Reason { get; set; }
    [Column(TypeName = "nvarchar(max)")] public string ChangesJson { get; set; } = "{}";  // { field: [old, new] }
}
