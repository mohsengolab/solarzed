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

        // SZ-{carton Roll No}-{yyMM}-{random 7 digits}-{factory}: a random number instead of a running count,
        // so roll IDs don't reveal how many rolls were received. Without a Roll No the model code stands in.
        var ids = new List<string>();
        for (int i = 0; i < count; i++)
        {
            var head = rollNos?[i] ?? model;
            string id;
            do id = $"SZ-{head}-{yymm}-{RandomNumberGenerator.GetInt32(1_000_000, 10_000_000)}-{factory}";
            while (ids.Contains(id) || await db.Rolls.AnyAsync(r => r.Id == id));
            ids.Add(id);
        }

        // Internal register number: continues from the highest so far, starting at 1.
        var lastNumber = await db.Rolls.MaxAsync(r => (int?)r.Number) ?? 0;

        var rolls = new List<Roll>();
        for (int i = 0; i < count; i++)
        {
            rolls.Add(new Roll
            {
                Id = ids[i],
                Number = lastNumber + i + 1,
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
