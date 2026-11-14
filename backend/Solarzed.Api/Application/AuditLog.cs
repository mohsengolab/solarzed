using System.Security.Claims;
using System.Text.Json;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Application;

/// <summary>
/// Records who changed what, when and why. Entries are added to the same DbContext as the change itself,
/// so they are committed atomically by the caller's SaveChanges.
/// </summary>
public static class AuditLog
{
    public static string Actor(ClaimsPrincipal? user, string fallback = "system") =>
        user?.Identity?.Name is { Length: > 0 } name ? name : fallback;

    /// <summary>Builds a { field: [old, new] } map containing only fields whose value changed.</summary>
    public static Dictionary<string, object?[]> Diff(params (string Field, object? Old, object? New)[] fields)
    {
        var changes = new Dictionary<string, object?[]>();
        foreach (var (field, old, @new) in fields)
            if (!Equals(Normalize(old), Normalize(@new))) changes[field] = [Normalize(old), Normalize(@new)];
        return changes;
    }

    static object? Normalize(object? v) => v switch
    {
        null => null,
        Enum e => e.ToString(),
        string s when s.Length == 0 => null,
        DateOnly d => d.ToString("yyyy-MM-dd"),
        _ => v,
    };

    public static AuditEntry Add(AppDbContext db, string actor, string entityType, string entityId, string action,
        IReadOnlyDictionary<string, object?[]>? changes = null, string? reason = null)
    {
        var entry = new AuditEntry
        {
            EntityType = entityType,
            EntityId = entityId.Length > 64 ? entityId[..64] : entityId,
            Action = action,
            Actor = actor.Length > 100 ? actor[..100] : actor,
            At = DateTime.UtcNow,
            Reason = reason is { Length: > 1000 } r ? r[..1000] : reason,
            ChangesJson = JsonSerializer.Serialize(changes ?? new Dictionary<string, object?[]>()),
        };
        db.AuditEntries.Add(entry);
        return entry;
    }
}
