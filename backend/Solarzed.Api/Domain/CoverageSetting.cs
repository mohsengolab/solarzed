using System.ComponentModel.DataAnnotations;

namespace Solarzed.Api.Domain;

public class CoverageSetting
{
    [Key]
    public int Id { get; set; }

    public int? TintFilmYears { get; set; }
    public int? TintInstallYears { get; set; }
    public int? PpfFilmYears { get; set; }
    public int? PpfInstallYears { get; set; }

    // Number of characters after the SZ- prefix in a warranty code (6–29).
    public int WarrantyCodeLength { get; set; } = 16;

    [MaxLength(300)]
    public string PublicSiteUrl { get; set; } = "https://solarzed.com";

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
