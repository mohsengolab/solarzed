using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Application;

public record CreateRollsRequest(
    string ModelCode, string Type, string Batch, string Supplier, string Qc, int Quantity,
    decimal? WidthCm = null, decimal? LengthM = null,
    decimal? ThicknessMil = null, int? Vlt = null, int? Irr = null, int? Uv = null, int? Tser = null, int? WarrantyYears = null);

public static class RollService
{
    public static async Task<Roll[]> CreateRolls(CreateRollsRequest req, AppDbContext db)
    {
        var type = req.Type.ToLower() == "ppf" ? WarrantyType.Ppf : WarrantyType.Tint;
        var qc = req.Qc.ToLower() switch
        {
            "approved" => RollQc.Approved,
            "rejected" => RollQc.Rejected,
            _ => RollQc.Pending
        };

        var yy = DateTime.UtcNow.ToString("yy");
        var model = req.ModelCode.ToUpperInvariant().Replace(" ", "");

        // Find highest existing sequence for this model+year
        var prefix = $"SZ-{model}-{yy}-";
        var existing = await db.Rolls
            .Where(r => r.Id.StartsWith(prefix))
            .Select(r => r.Id)
            .ToListAsync();

        int next = 1;
        if (existing.Count > 0)
        {
            next = existing
                .Select(id => int.TryParse(id[prefix.Length..], out var n) ? n : 0)
                .Max() + 1;
        }

        var rolls = new List<Roll>();
        for (int i = 0; i < req.Quantity; i++)
        {
            var seq = (next + i).ToString("D6");
            rolls.Add(new Roll
            {
                Id = $"{prefix}{seq}",
                ModelCode = model,
                Type = type,
                Batch = req.Batch,
                Supplier = req.Supplier,
                Qc = qc,
                WidthCm = req.WidthCm,
                LengthM = req.LengthM,
                Status = RollStatus.InStock,
                HistoryJson = JsonSerializer.Serialize(new[] {
                    new { at = DateTime.UtcNow, action = "received", note = $"batch {req.Batch}" }
                })
            });
        }

        db.Rolls.AddRange(rolls);
        await db.SaveChangesAsync();
        return [.. rolls];
    }
}
