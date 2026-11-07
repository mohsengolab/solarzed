using System.ComponentModel.DataAnnotations;

namespace Solarzed.Api.Domain;

public class Product
{
    [Key, MaxLength(24)] public string Code { get; set; } = "";
    [MaxLength(120)] public string Name { get; set; } = "";
    public WarrantyType Type { get; set; }
    [MaxLength(80)] public string Series { get; set; } = "";
    [MaxLength(2000)] public string Description { get; set; } = "";
    public bool Archived { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
