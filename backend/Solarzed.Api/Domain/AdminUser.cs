using System.ComponentModel.DataAnnotations;

namespace Solarzed.Api.Domain;

public class AdminUser
{
    [Key]
    public int Id { get; set; }

    [MaxLength(100)]
    public string Username { get; set; } = "admin";

    [MaxLength(200)]
    public string PasswordHash { get; set; } = default!;

    // "admin" = full manager access; "carton" = carton/serial operator (no QR, no warranty code).
    [MaxLength(20)]
    public string Role { get; set; } = "admin";

    [MaxLength(100)]
    public string? DisplayName { get; set; }

    public bool Active { get; set; } = true;
}
