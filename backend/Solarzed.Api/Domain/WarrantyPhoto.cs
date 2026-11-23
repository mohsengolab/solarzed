using System.ComponentModel.DataAnnotations;

namespace Solarzed.Api.Domain;

/// <summary>An installation photo the installer uploads with a warranty; the counter reviews it before the warranty becomes active.</summary>
public class WarrantyPhoto
{
    [Key] public long Id { get; set; }
    [MaxLength(32)] public string WarrantyCode { get; set; } = default!;
    [MaxLength(20)] public string Kind { get; set; } = default!;          // vehicle, film, vin, invoice, other
    [MaxLength(40)] public string ContentType { get; set; } = default!;   // image/jpeg, image/png, image/webp
    public byte[] Data { get; set; } = default!;
    public int SizeBytes { get; set; }
    [MaxLength(30)] public string UploadedBy { get; set; } = default!;    // partner mobile
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
