using System.ComponentModel.DataAnnotations;

namespace Solarzed.Api.Domain;

/// <summary>
/// What one staff role (مدیر "admin" or کانتر "counter") may see and do in the admin panel, chosen by the super
/// administrator. The super administrator always has every permission and has no row here.
/// </summary>
public class RolePermission
{
    [Key, MaxLength(20)]
    public string Role { get; set; } = default!;

    /// <summary>JSON array of permission keys, e.g. ["rolls.view","rolls.edit"].</summary>
    public string PermissionsJson { get; set; } = "[]";

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
