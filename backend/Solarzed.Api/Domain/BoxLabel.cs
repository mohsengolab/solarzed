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
    [ConcurrencyCheck] public int Revision { get; set; }
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
