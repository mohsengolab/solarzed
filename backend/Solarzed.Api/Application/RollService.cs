using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Application;

public record CreateRollsRequest(
    string ModelCode, string Type, string Batch, string Supplier, string Qc, int Quantity,
    decimal? WidthCm = null, decimal? LengthM = null,
    decimal? ThicknessMil = null, int? Vlt = null, int? Irr = null, int? Uv = null, int? Tser = null, int? WarrantyYears = null,
    string[]? RollNos = null);

public static class RollService
{
    public static string? SupplierCode(string? raw)
    {
        var value = raw?.Trim() ?? "";
        return System.Text.RegularExpressions.Regex.IsMatch(value, @"\A[A-Za-z]{3}\z") ? value.ToUpperInvariant() : null;
    }

    public static async Task<Roll[]> CreateRolls(CreateRollsRequest req, AppDbContext db, string actor = "system")
    {
        var type = req.Type.ToLower() == "ppf" ? WarrantyType.Ppf : WarrantyType.Tint;
        var qc = req.Qc.ToLower() switch
        {
            "approved" => RollQc.Approved,
            "rejected" => RollQc.Rejected,
            _ => RollQc.Pending
        };

        // Gregorian year and month side by side, e.g. 2611 for November 2026.
        var yymm = DateTime.UtcNow.ToString("yyMM", System.Globalization.CultureInfo.InvariantCulture);
        var model = req.ModelCode.ToUpperInvariant().Replace(" ", "");
        var supplier = SupplierCode(req.Supplier) ?? req.Supplier;
        var factory = supplier.ToUpperInvariant().Replace(" ", "");

        // One roll per scanned carton Roll No when given (already validated by the caller).
        var rollNos = req.RollNos is { Length: > 0 } ? req.RollNos : null;
        var count = rollNos?.Length ?? req.Quantity;

        // SZ-{model}-{yyMM}-{random 7 digits}-{factory}: a random number instead of a running count,
        // so roll IDs don't reveal how many rolls were received.
        var prefix = $"SZ-{model}-{yymm}-";
        var ids = new List<string>();
        while (ids.Count < count)
        {
            var batch = Enumerable.Range(0, (count - ids.Count) * 2)
                .Select(_ => $"{prefix}{RandomNumberGenerator.GetInt32(1_000_000, 10_000_000)}-{factory}")
                .Distinct().Where(x => !ids.Contains(x)).ToList();
            var taken = await db.Rolls.Where(r => batch.Contains(r.Id)).Select(r => r.Id).ToListAsync();
            ids.AddRange(batch.Except(taken).Take(count - ids.Count));
        }

        var rolls = new List<Roll>();
        for (int i = 0; i < count; i++)
        {
            rolls.Add(new Roll
            {
                Id = ids[i],
                ModelCode = model,
                RollNo = rollNos?[i],
                Type = type,
                Batch = req.Batch,
                Supplier = supplier,
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
        foreach (var r in rolls)
            AuditLog.Add(db, actor, "roll", r.Id, "received", AuditLog.Diff(
                ("modelCode", null, r.ModelCode), ("rollNo", null, r.RollNo), ("batch", null, r.Batch), ("supplier", null, r.Supplier), ("qc", null, r.Qc),
                ("widthCm", null, r.WidthCm), ("lengthM", null, r.LengthM)));
        await db.SaveChangesAsync();
        return [.. rolls];
    }
}
