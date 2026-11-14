using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Application;

/// <param name="Serials">Box serials as printed (barcode) on the carton (SZB-…), scanned or typed.</param>
/// <param name="ToHolder">Optional display name of the receiving representative/shop.</param>
/// <param name="ToPhone">Mobile of the receiver. Required unless <paramref name="ToWarehouse"/> is true; the receiver
/// signs in with this mobile to see and pass on the boxes.</param>
/// <param name="ExpectedFrom">Optional safety check: null skips it, "" means the boxes must be in the central warehouse,
/// any other value must match every box's current holder mobile or name.</param>
public record TransferRequest(string[] Serials, string? ToHolder, string? ToPhone, string? Note, string? ExpectedFrom, bool ToWarehouse = false);
public record PortalTransferRequest(string[] Serials, string? ToPhone, string? ToName, string? Note);
public record TransferView(long Id, string LabelId, string BatchId, string? FromHolder, string? FromPhone, string? ToHolder, string? ToPhone, string? Note, string Actor, DateTime At);
public record TransferResult(string BatchId, string? ToHolder, string? ToPhone, TransferView[] Transfers);
public record BoxHistory(string Id, string Product, string RollId, bool Activated, string? Holder, string? HolderPhone, DateTime? HeldSince, TransferView[] Transfers);
public record HolderSummary(string? Holder, string? Phone, int Boxes);
public record HeldBox(string Id, string Product, string Type, string RollId, DateTime? HeldSince);
public record MyBoxes(HeldBox[] Boxes, TransferView[] Outgoing);

/// <summary>
/// Moves cartons between people using only the serial printed on the box. The company hands boxes to a
/// representative's mobile; that representative (signed in with the same mobile) can pass them on to the next
/// mobile, and so on. Every hand-over is recorded in BoxTransfers (append-only) and the box's current holder is
/// updated in the same SaveChanges.
/// </summary>
public class BoxTransferService(AppDbContext db)
{
    public const int MaxBatch = 200;
    public const string Warehouse = "central warehouse";
    static readonly Regex SerialPattern = new("^SZB-[0-9A-F]{16}$");

    public static string NormalizeSerial(string raw) => Regex.Replace(raw ?? "", @"\s+", "").ToUpperInvariant();

    /// <summary>Trims and collapses whitespace so "Ali  Rezaei " and "Ali Rezaei" are the same holder.</summary>
    public static string? NormalizeHolder(string? raw)
    {
        var value = Regex.Replace(raw ?? "", @"\s+", " ").Trim();
        return value.Length == 0 ? null : value;
    }

    static bool Same(string? a, string? b) => string.Equals(NormalizeHolder(a), NormalizeHolder(b), StringComparison.OrdinalIgnoreCase);

    static TransferView View(BoxTransfer t) => new(t.Id, t.LabelId, t.BatchId, t.FromHolder, t.FromPhone, t.ToHolder, t.ToPhone, t.Note, t.Actor, t.At);

    static string[] Serials(string[]? raw)
    {
        var serials = (raw ?? []).Select(NormalizeSerial).Where(x => x.Length > 0).Distinct().ToArray();
        if (serials.Length is 0 or > MaxBatch) throw new ActivationError(400, $"Enter 1–{MaxBatch} box serials.");
        var malformed = serials.Where(x => !SerialPattern.IsMatch(x)).ToArray();
        if (malformed.Length > 0) throw new ActivationError(400, $"Invalid box serial: {string.Join(", ", malformed.Take(10))}");
        return serials;
    }

    /// <summary>Company hand-over from the admin panel (manager or carton operator).</summary>
    public Task<TransferResult> Transfer(TransferRequest req, string actor)
    {
        string? phone = null;
        if (!req.ToWarehouse)
        {
            if (string.IsNullOrWhiteSpace(req.ToPhone)) throw new ActivationError(400, "Enter the receiver's mobile number.");
            phone = PortalService.CanonicalPhone(req.ToPhone);
        }
        return Move(Serials(req.Serials), phone, req.ToWarehouse ? null : NormalizeHolder(req.ToHolder), req.Note, actor,
            label => req.ExpectedFrom == null ? null
                : req.ExpectedFrom == "" ? (label.Holder == null && label.HolderPhone == null ? null : $"held by {label.Holder ?? label.HolderPhone}")
                : Same(label.HolderPhone, req.ExpectedFrom) || Same(label.Holder, req.ExpectedFrom) ? null
                : $"held by {label.Holder ?? label.HolderPhone ?? Warehouse}");
    }

    /// <summary>A signed-in representative passes boxes they hold to the next mobile.</summary>
    public Task<TransferResult> TransferAsHolder(PortalTransferRequest req, string myPhone)
    {
        var serials = Serials(req.Serials);
        if (string.IsNullOrWhiteSpace(req.ToPhone)) throw new ActivationError(400, "Enter the receiver's mobile number.");
        var to = PortalService.CanonicalPhone(req.ToPhone);
        if (to == myPhone) throw new ActivationError(400, "You already hold these boxes.");
        // Boxes held by someone else are reported as "not in your account" so serials of other holders reveal nothing.
        return Move(serials, to, NormalizeHolder(req.ToName), req.Note, "mobile:" + myPhone,
            label => label.HolderPhone == myPhone ? null : "not in your account", hideMissing: true);
    }

    async Task<TransferResult> Move(string[] serials, string? toPhone, string? toName, string? rawNote, string actor,
        Func<BoxLabel, string?> check, bool hideMissing = false)
    {
        if (toName is { Length: > 200 }) throw new ActivationError(400, "Recipient name is too long.");
        var note = string.IsNullOrWhiteSpace(rawNote) ? null : rawNote.Trim();
        if (note is { Length: > 500 }) throw new ActivationError(400, "Note is too long.");

        var labels = await db.BoxLabels.Where(x => serials.Contains(x.Id)).ToListAsync();
        var missing = serials.Except(labels.Select(x => x.Id)).ToArray();
        if (missing.Length > 0)
            throw hideMissing
                ? new ActivationError(409, "Transfer rejected. " + string.Join("; ", missing.Take(10).Select(x => $"{x}: not in your account")))
                : new ActivationError(404, $"Box serial not found: {string.Join(", ", missing.Take(10))}");

        string? to = null;
        if (toPhone != null)
        {
            var receiver = await new PortalService(db, NoSms.Instance).Ensure(toPhone, toName);
            to = toName ?? receiver.Name ?? toPhone;
        }

        var rollIds = labels.Select(x => x.RollId).Distinct().ToArray();
        var voidRolls = await db.Rolls.Where(r => rollIds.Contains(r.Id) && r.Status == RollStatus.Void).Select(r => r.Id).ToListAsync();
        var problems = new List<string>();
        foreach (var label in labels)
        {
            var ownership = check(label);
            if (ownership != null && hideMissing) problems.Add($"{label.Id}: {ownership}");
            else if (label.ActivatedAt.HasValue) problems.Add($"{label.Id}: already activated on a vehicle");
            else if (voidRolls.Contains(label.RollId)) problems.Add($"{label.Id}: product is void");
            else if (ownership != null) problems.Add($"{label.Id}: {ownership}");
            else if (toPhone == null ? label.HolderPhone == null && label.Holder == null : label.HolderPhone == toPhone)
                problems.Add($"{label.Id}: already with {to ?? Warehouse}");
        }
        if (problems.Count > 0) throw new ActivationError(409, "Transfer rejected. " + string.Join("; ", problems.Take(10)));

        var now = DateTime.UtcNow;
        var batch = "TRF-" + Convert.ToHexString(RandomNumberGenerator.GetBytes(8));
        actor = actor.Length > 100 ? actor[..100] : actor;
        var rows = labels.Select(label => new BoxTransfer
        {
            LabelId = label.Id, BatchId = batch, FromHolder = label.Holder, FromPhone = label.HolderPhone,
            ToHolder = to, ToPhone = toPhone, Note = note, Actor = actor, At = now,
        }).ToArray();
        var sources = labels.Select(x => x.Holder ?? x.HolderPhone ?? Warehouse).Distinct().ToArray();
        foreach (var label in labels)
        {
            label.Holder = to;
            label.HolderPhone = toPhone;
            label.HeldSince = now;
            label.Revision++;
        }
        db.BoxTransfers.AddRange(rows);
        AuditLog.Add(db, actor, "box-transfer", batch, "transferred", AuditLog.Diff(
            ("holder", string.Join(" | ", sources), to ?? Warehouse), ("phone", null, toPhone), ("boxes", null, labels.Count)), note);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateConcurrencyException) { throw new ActivationError(409, "One of these boxes was changed by someone else. Refresh and try again."); }
        catch (DbUpdateException) when (toPhone != null) { throw new ActivationError(409, "The receiver account was just created by another request. Please retry."); }
        return new(batch, to, toPhone, rows.Select(View).ToArray());
    }

    public async Task<BoxHistory> History(string serial)
    {
        var id = NormalizeSerial(serial);
        var label = await db.BoxLabels.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id)
            ?? throw new ActivationError(404, "Box serial not found.");
        var transfers = await db.BoxTransfers.AsNoTracking().Where(x => x.LabelId == id)
            .OrderBy(x => x.At).ThenBy(x => x.Id).ToListAsync();
        return new(label.Id, label.Product, label.RollId, label.ActivatedAt.HasValue, label.Holder, label.HolderPhone, label.HeldSince,
            transfers.Select(View).ToArray());
    }

    /// <summary>How many not-yet-activated boxes each holder has. Null holder = central warehouse.</summary>
    public async Task<HolderSummary[]> Holders()
    {
        var rows = await db.BoxLabels.AsNoTracking().Where(x => x.ActivatedAt == null)
            .GroupBy(x => new { x.HolderPhone, x.Holder }).Select(g => new HolderSummary(g.Key.Holder, g.Key.HolderPhone, g.Count())).ToListAsync();
        return rows.OrderBy(x => x.Holder != null || x.Phone != null).ThenByDescending(x => x.Boxes).ToArray();
    }

    /// <summary>What a signed-in representative holds now, and what they recently passed on.</summary>
    public async Task<MyBoxes> Mine(string phone)
    {
        var boxes = await db.BoxLabels.AsNoTracking().Where(x => x.HolderPhone == phone && x.ActivatedAt == null)
            .OrderByDescending(x => x.HeldSince).Take(1000).ToListAsync();
        var outgoing = await db.BoxTransfers.AsNoTracking().Where(x => x.FromPhone == phone)
            .OrderByDescending(x => x.At).ThenByDescending(x => x.Id).Take(200).ToListAsync();
        return new(boxes.Select(x => new HeldBox(x.Id, x.Product, x.Type.ToString().ToLowerInvariant(), x.RollId, x.HeldSince)).ToArray(),
            outgoing.Select(View).ToArray());
    }

    sealed class NoSms : IActivationSmsSender
    {
        public static readonly NoSms Instance = new();
        public bool Configured => false;
        public Task Send(string phone, string code, string reference, CancellationToken cancellationToken) => throw new InvalidOperationException();
    }
}
