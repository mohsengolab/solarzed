using System.ComponentModel.DataAnnotations;

namespace Solarzed.Api.Domain;

/// <summary>A place where rolls are stored, defined in admin «انبارها».</summary>
public class Warehouse
{
    [Key] public int Id { get; set; }
    [MaxLength(100)] public string Name { get; set; } = "";
    [MaxLength(300)] public string Address { get; set; } = "";
    public bool Archived { get; set; }
}
