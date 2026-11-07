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
}
