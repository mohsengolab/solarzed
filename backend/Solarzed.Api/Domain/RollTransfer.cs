using System.ComponentModel.DataAnnotations;

namespace Solarzed.Api.Domain;

/// <summary>
/// One move of a roll between locations (warehouse to warehouse, or to / from a user), recorded from the roll's
/// «لوکیشن» with how it was moved (carrier, driver, waybill…) and when it was delivered.
/// Location names are copied so the record still reads the same after a warehouse or user is renamed.
/// </summary>
public class RollTransfer
{
    [Key] public long Id { get; set; }
    [MaxLength(60)] public string RollId { get; set; } = default!;
    [MaxLength(150)] public string From { get; set; } = "";
    [MaxLength(150)] public string To { get; set; } = "";
    [MaxLength(500)] public string? Info { get; set; }
    public DateTime? DeliveredAt { get; set; }
    public DateTime At { get; set; } = DateTime.UtcNow;
    [MaxLength(100)] public string By { get; set; } = "";
}
