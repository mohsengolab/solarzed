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
    [MaxLength(300)]
    public string PublicSiteUrl { get; set; } = "https://solarzed.com";

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
