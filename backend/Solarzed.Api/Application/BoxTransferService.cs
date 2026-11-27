using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Application;

/// <param name="Serials">Carton serials as printed (barcode) on the box — the roll number, e.g. CPT30614374 — scanned or typed.</param>
/// <param name="ToHolder">Optional display name of the receiving representative/shop.</param>
/// <param name="ToPhone">Mobile of the receiver. Required unless <paramref name="ToWarehouse"/> is true; the receiver
/// signs in with this mobile to see and pass on the boxes.</param>
/// <param name="ExpectedFrom">Optional safety check: null skips it, "" means the boxes must be in the central warehouse,
/// any other value must match every box's current holder mobile or name.</param>
/// <param name="WarehouseId">With <paramref name="ToWarehouse"/>: the warehouse («انبارها») the rolls go back to.</param>
public record TransferRequest(string[] Serials, string? ToHolder, string? ToPhone, string? Note, string? ExpectedFrom, bool ToWarehouse = false,
    int? WarehouseId = null);
/// <param name="ToEmail">Instead of <paramref name="ToPhone"/>: the receiver's account email; the rolls go to that account's mobile.</param>
public record PortalTransferRequest(string[] Serials, string? ToPhone, string? ToName, string? Note, string? ToEmail = null);
/// <summary>Who a mobile or email belongs to, so the sender sees the receiver's name before confirming a transfer.</summary>
/// <param name="Registered">False when no account has this mobile yet: the transfer creates it and the receiver signs in with the mobile.</param>
/// <param name="Phone">Masked when the receiver was found by email.</param>
public record RecipientView(bool Registered, string? Name, string? ShopName, string? Phone, string? Email, bool Partner);
public record TransferView(long Id, string LabelId, string BatchId, string? FromHolder, string? FromPhone, string? ToHolder, string? ToPhone, string? Note, string Actor, DateTime At);
/// <param name="Sms">What happened to the receiver's SMS: "sent", "off" (no pattern / sending paused) or the failure.</param>
public record TransferResult(string BatchId, string? ToHolder, string? ToPhone, TransferView[] Transfers, string? Sms = null);
public record BoxHistory(string Id, string Product, string? RollId, bool Activated, string? Holder, string? HolderPhone, DateTime? HeldSince, TransferView[] Transfers);
public record HolderSummary(string? Holder, string? Phone, int Boxes);
/// <param name="Phone">Null for a legacy holder recorded by name only.</param>
public record HolderRow(string? Phone, string? Name, string? FirstName, string? LastName, string? ShopName, int Boxes, DateTime? LastAt);
public record HolderDetail(string? Phone, string? Name, string? FirstName, string? LastName, string? ShopName, string? City, int Boxes,
    HeldBox[] Held, TransferView[] Transfers);
/// <summary>A roll someone holds, with what the roll is: product, size, warranty years and film specs.</summary>
/// <param name="LengthM">The roll's full length.</param>
/// <param name="RemainingM">Meters left on the roll (null when usage is not tracked).</param>
/// <param name="UsedM">Meters recorded on the installations made from this roll.</param>
/// <param name="Installs">Installations (warranties) registered from this roll.</param>
public record HeldBox(string Id, string Product, string Type, string? RollId, DateTime? HeldSince,
    string? ProductName = null, decimal? LengthM = null, decimal? WidthCm = null, int? FilmYears = null, int? InstallYears = null,
    int? Vlt = null, int? Tser = null, int? Uv = null, int? Irr = null, decimal? ThicknessMil = null, bool Void = false,
    decimal? RemainingM = null, decimal UsedM = 0, int Installs = 0, DateTime? ActivatedAt = null);
/// <param name="Used">Rolls the account already started using on vehicles and still holds.</param>
public record MyBoxes(HeldBox[] Boxes, TransferView[] Outgoing, HeldBox[]? Used = null);
/// <summary>One roll the account holds, with every installation made from it and its hand-overs to or from the account.</summary>
public record RollDetail(HeldBox Roll, InstallerWarranty[] Installs, TransferView[] History);

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
    static Regex SerialPattern => BoxLabelService.SerialPattern;

    public static string NormalizeSerial(string raw) => BoxLabelService.NormalizeSerial(raw);

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
        if (serials.Length is 0 or > MaxBatch) throw new ActivationError(400, $"Enter 1–{MaxBatch} ROLL NOs.");
        var malformed = serials.Where(x => !SerialPattern.IsMatch(x)).ToArray();
        if (malformed.Length > 0) throw new ActivationError(400, $"Invalid ROLL NO: {string.Join(", ", malformed.Take(10))}");
        return serials;
    }

    /// <summary>Company hand-over from the admin panel (manager or carton operator).</summary>
    public async Task<TransferResult> Transfer(TransferRequest req, string actor)
    {
        string? phone = null;
        Warehouse? warehouse = null;
        if (!req.ToWarehouse)
        {
            if (string.IsNullOrWhiteSpace(req.ToPhone)) throw new ActivationError(400, "Enter the receiver's mobile number.");
            phone = PortalService.CanonicalPhone(req.ToPhone);
        }
        else if (req.WarehouseId is { } wid)
            warehouse = await db.Warehouses.SingleOrDefaultAsync(w => w.Id == wid && !w.Archived)
                ?? throw new ActivationError(400, "Choose a warehouse.");
        return await Move(Serials(req.Serials), phone, req.ToWarehouse ? null : NormalizeHolder(req.ToHolder), req.Note, actor,
            label => req.ExpectedFrom == null ? null
                : req.ExpectedFrom == "" ? (label.Holder == null && label.HolderPhone == null ? null : $"held by {label.Holder ?? label.HolderPhone}")
                : Same(label.HolderPhone, req.ExpectedFrom) || Same(label.Holder, req.ExpectedFrom) ? null
                : $"held by {label.Holder ?? label.HolderPhone ?? Warehouse}", warehouse: warehouse);
    }

    /// <summary>A signed-in representative passes boxes they hold to the next mobile.</summary>
    public Task<TransferResult> TransferAsHolder(PortalTransferRequest req, string myPhone)
    {
        var serials = Serials(req.Serials);
        if (string.IsNullOrWhiteSpace(req.ToPhone)) throw new ActivationError(400, "Enter the receiver's mobile number.");
        var to = PortalService.CanonicalPhone(req.ToPhone);
        if (to == myPhone) throw new ActivationError(400, "You already hold these rolls.");
        // Boxes held by someone else are reported as "not in your account" so serials of other holders reveal nothing.
        return Move(serials, to, NormalizeHolder(req.ToName), req.Note, "mobile:" + myPhone,
            label => label.HolderPhone == myPhone ? null : "not in your account", hideMissing: true);
    }

    /// <summary>A transfer addressed by email goes to the mobile of the account with that email.</summary>
    public async Task<TransferResult> TransferAsHolderTo(PortalTransferRequest req, string myPhone)
    {
        if (string.IsNullOrWhiteSpace(req.ToPhone) && !string.IsNullOrWhiteSpace(req.ToEmail))
            req = req with { ToPhone = (await ByEmail(req.ToEmail)).Phone };
        return await TransferAsHolder(req, myPhone);
    }

    async Task<PortalUser> ByEmail(string raw)
    {
        var email = PortalService.CanonicalEmail(raw);
        var user = await db.PortalUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Email == email && u.Active)
            ?? throw new ActivationError(404, "No Solarzed account has this email.");
        if (user.Phone == null) throw new ActivationError(409, "This account has no mobile number yet. Ask the receiver to add their mobile in their profile.");
        return user;
    }

    /// <summary>
    /// The name behind a mobile or email, shown to a signed-in holder before they confirm a transfer. An unknown
    /// mobile is fine (the transfer creates the account); an unknown email is not, since rolls are held by mobile.
    /// </summary>
    public async Task<RecipientView> Recipient(string? rawPhone, string? rawEmail, string myPhone)
    {
        PortalUser? user;
        string? phone = null;
        if (!string.IsNullOrWhiteSpace(rawPhone))
        {
            phone = PortalService.CanonicalPhone(rawPhone);
            user = await db.PortalUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Phone == phone);
        }
        else user = await ByEmail(rawEmail ?? "");
        if ((phone ?? user?.Phone) == myPhone) throw new ActivationError(400, "You already hold these rolls.");
        if (user == null) return new(false, null, null, phone, null, false);
        var name = NormalizeHolder($"{user.FirstName} {user.LastName}") ?? NormalizeHolder(user.Name);
        return new(true, name, user.ShopName, phone ?? PortalService.MaskPhone(user.Phone!), phone == null ? user.Email : null,
            user.Partner == PartnerStatus.Approved);
    }

    /// <summary>Adds each roll's size and its product's warranty and film specs to the held cartons.</summary>
    async Task<HeldBox[]> Held(List<BoxLabel> boxes)
    {
        var rollIds = boxes.Where(x => x.RollId != null).Select(x => x.RollId!).Distinct().ToList();
        var rolls = await db.Rolls.AsNoTracking().Where(r => rollIds.Contains(r.Id))
            .Select(r => new { r.Id, r.WidthCm, r.LengthM, r.Status }).ToDictionaryAsync(r => r.Id);
        var codes = boxes.Select(x => x.Product).Distinct().ToList();
        var products = await db.Products.AsNoTracking().Where(p => codes.Contains(p.Code)).ToDictionaryAsync(p => p.Code);
        var activated = boxes.Where(x => x.ActivatedAt != null).Select(x => x.Id).ToList();
        var usage = await db.WarrantyRegistrations.AsNoTracking().Where(w => activated.Contains(w.FilmSerial))
            .GroupBy(w => w.FilmSerial).Select(g => new { g.Key, Count = g.Count(), Used = g.Sum(w => w.UsedLengthM ?? 0) })
            .ToDictionaryAsync(g => g.Key);
        return boxes.Select(x =>
        {
            var roll = x.RollId != null && rolls.TryGetValue(x.RollId, out var r) ? r : null;
            var p = products.GetValueOrDefault(x.Product);
            var used = usage.GetValueOrDefault(x.Id);
            // An unused carton still has its whole roll; a used one keeps the running balance recorded at each install.
            var remaining = x.RemainingLengthM ?? (x.ActivatedAt == null ? roll?.LengthM : null);
            return new HeldBox(x.Id, x.Product, x.Type.ToString().ToLowerInvariant(), x.RollId, x.HeldSince,
                NormalizeHolder(p?.Name), roll?.LengthM ?? x.RemainingLengthM, roll?.WidthCm, x.FilmYears, x.InstallYears,
                p?.Vlt, p?.Tser, p?.Uv, p?.Irr, p?.ThicknessMil, roll?.Status == RollStatus.Void,
                remaining, used?.Used ?? 0, used?.Count ?? 0, x.ActivatedAt);
        }).ToArray();
    }

    async Task<TransferResult> Move(string[] serials, string? toPhone, string? toName, string? rawNote, string actor,
        Func<BoxLabel, string?> check, bool hideMissing = false, Warehouse? warehouse = null)
    {
        if (toName is { Length: > 200 }) throw new ActivationError(400, "Recipient name is too long.");
        var note = string.IsNullOrWhiteSpace(rawNote) ? null : rawNote.Trim();
        if (note is { Length: > 500 }) throw new ActivationError(400, "Note is too long.");

        var labels = await db.BoxLabels.Where(x => serials.Contains(x.Id)).ToListAsync();
        var missing = serials.Except(labels.Select(x => x.Id)).ToArray();
        if (missing.Length > 0)
            throw hideMissing
                ? new ActivationError(409, "Transfer rejected. " + string.Join("; ", missing.Take(10).Select(x => $"{x}: not in your account")))
                : new ActivationError(404, $"ROLL NO not found: {string.Join(", ", missing.Take(10))}");

        string? to = null;
        if (toPhone != null)
        {
            var receiver = await new PortalService(db, NoSms.Instance).Ensure(toPhone, toName);
            to = toName ?? receiver.Name ?? toPhone;
            // Whoever receives rolls by transfer is a partner (همکار): approved at once so they can register warranties
            // from the Serial Number, and listed under Partners in the admin panel. A suspended partner stays suspended.
            if (receiver.Partner is PartnerStatus.None or PartnerStatus.Pending)
            {
                AuditLog.Add(db, actor, "partner", toPhone, receiver.Partner == PartnerStatus.None ? "added" : "updated",
                    AuditLog.Diff(("status", receiver.Partner, PartnerStatus.Approved)), "approved by roll transfer");
                receiver.Partner = PartnerStatus.Approved;
                receiver.PartnerAppliedAt ??= DateTime.UtcNow;
                receiver.PartnerReviewedAt = DateTime.UtcNow;
                receiver.ShopName ??= toName;
            }
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
            ToHolder = to ?? warehouse?.Name, ToPhone = toPhone, Note = note, Actor = actor, At = now,
        }).ToArray();
        var sources = labels.Select(x => x.Holder ?? x.HolderPhone ?? Warehouse).Distinct().ToArray();
        // A roll handed out of the company to a seller or installer is released for distribution, so the installer who
        // ends up holding it can register warranties; it also leaves any staff user it was assigned to.
        if (toPhone != null)
        {
            var rolls = await db.Rolls.Where(r => rollIds.Contains(r.Id)).ToListAsync();
            foreach (var roll in rolls)
            {
                if (roll.Status == RollStatus.InStock && roll.Qc == RollQc.Approved)
                {
                    AuditLog.Add(db, actor, "roll", roll.Id, "updated", AuditLog.Diff(("status", roll.Status, RollStatus.Shipped)), $"transfer {batch}");
                    roll.Status = RollStatus.Shipped;
                }
                roll.HolderUserId = null;
            }
        }
        // Back to the company: the rolls are in stock again, in the chosen warehouse, ready to be sent out once more.
        else
        {
            var rolls = await db.Rolls.Where(r => rollIds.Contains(r.Id)).ToListAsync();
            foreach (var roll in rolls)
            {
                if (roll.Status == RollStatus.Shipped)
                {
                    AuditLog.Add(db, actor, "roll", roll.Id, "updated", AuditLog.Diff(("status", roll.Status, RollStatus.InStock)), $"transfer {batch}");
                    roll.Status = RollStatus.InStock;
                }
                if (warehouse != null) { roll.WarehouseId = warehouse.Id; roll.HolderUserId = null; }
            }
        }
        foreach (var label in labels)
        {
            label.Holder = to;
            label.HolderPhone = toPhone;
            label.HeldSince = now;
            label.Revision++;
        }
        db.BoxTransfers.AddRange(rows);
        AuditLog.Add(db, actor, "box-transfer", batch, "transferred", AuditLog.Diff(
            ("holder", string.Join(" | ", sources), to ?? warehouse?.Name ?? Warehouse), ("phone", null, toPhone), ("boxes", null, labels.Count)), note);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateConcurrencyException) { throw new ActivationError(409, "One of these boxes was changed by someone else. Refresh and try again."); }
        catch (DbUpdateException) when (toPhone != null) { throw new ActivationError(409, "The receiver account was just created by another request. Please retry."); }
        return new(batch, to ?? warehouse?.Name, toPhone, rows.Select(View).ToArray());
    }

    public async Task<BoxHistory> History(string serial)
    {
        var id = NormalizeSerial(serial);
        var label = await db.BoxLabels.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id)
            ?? throw new ActivationError(404, "ROLL NO not found.");
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

    // Arabic ي/ك and digits typed on either keyboard match the Persian forms stored in names.
    static string Fold(string? value)
    {
        if (string.IsNullOrEmpty(value)) return "";
        var chars = value.ToLowerInvariant().ToCharArray();
        for (var i = 0; i < chars.Length; i++)
            chars[i] = chars[i] switch
            {
                'ي' or 'ى' => 'ی', 'ك' => 'ک',
                >= '۰' and <= '۹' => (char)('0' + chars[i] - '۰'),
                >= '٠' and <= '٩' => (char)('0' + chars[i] - '٠'),
                _ => chars[i],
            };
        return new string(chars);
    }

    static string Key(string? phone, string? holder) => phone ?? "name:" + holder;

    /// <summary>
    /// People holding not-yet-activated rolls, one row per mobile, searched by name, family name, shop, mobile or a
    /// ROLL NO they hold. The central warehouse is counted separately.
    /// </summary>
    public async Task<(PagedResult<HolderRow> Page, int Warehouse)> SearchHolders(string? q, PageQuery page)
    {
        var groups = await db.BoxLabels.AsNoTracking().Where(x => x.ActivatedAt == null)
            .GroupBy(x => new { x.HolderPhone, x.Holder })
            .Select(g => new { g.Key.HolderPhone, g.Key.Holder, Boxes = g.Count(), Last = g.Max(x => x.HeldSince) }).ToListAsync();
        var warehouse = groups.Where(g => g.HolderPhone == null && g.Holder == null).Sum(g => g.Boxes);
        var people = groups.Where(g => g.HolderPhone != null || g.Holder != null)
            .GroupBy(g => Key(g.HolderPhone, g.Holder))
            .Select(g => new { Phone = g.First().HolderPhone, Holder = g.OrderByDescending(x => x.Last).First().Holder, Boxes = g.Sum(x => x.Boxes), Last = g.Max(x => x.Last) })
            .ToList();
        var phones = people.Where(p => p.Phone != null).Select(p => p.Phone!).ToList();
        var users = (await db.PortalUsers.AsNoTracking().Where(u => u.Phone != null && phones.Contains(u.Phone!))
                .Select(u => new { u.Phone, u.Name, u.FirstName, u.LastName, u.ShopName }).ToListAsync())
            .GroupBy(u => u.Phone!).ToDictionary(g => g.Key, g => g.First());
        var rows = people.Select(p =>
        {
            var u = p.Phone != null && users.TryGetValue(p.Phone, out var found) ? found : null;
            var full = NormalizeHolder($"{u?.FirstName} {u?.LastName}");
            var holder = p.Holder == p.Phone ? null : p.Holder;
            return (Key: Key(p.Phone, p.Holder), Row: new HolderRow(p.Phone, full ?? NormalizeHolder(u?.Name) ?? holder, u?.FirstName, u?.LastName,
                u?.ShopName ?? (full != null && holder != full ? holder : null), p.Boxes, p.Last));
        });

        var term = Paging.Term(q);
        if (term != null)
        {
            var tokens = Fold(term).Split(' ', StringSplitOptions.RemoveEmptyEntries);
            // A ROLL NO (or part of one) finds whoever holds that roll.
            var roll = NormalizeSerial(term);
            var byRoll = roll.Length >= 3
                ? (await db.BoxLabels.AsNoTracking()
                    .Where(x => x.ActivatedAt == null && (x.HolderPhone != null || x.Holder != null) && (x.Id.Contains(roll) || (x.RollId != null && x.RollId.Contains(roll))))
                    .Select(x => new { x.HolderPhone, x.Holder }).Distinct().Take(500).ToListAsync()).Select(x => Key(x.HolderPhone, x.Holder)).ToHashSet()
                : [];
            rows = rows.Where(r =>
            {
                if (byRoll.Contains(r.Key)) return true;
                var ph = r.Row.Phone ?? "";
                var local = ph.StartsWith("+98") ? "0" + ph[3..] : ph.StartsWith("98") ? "0" + ph[2..] : "";
                var hay = Fold($"{r.Row.Name} {r.Row.FirstName} {r.Row.LastName} {r.Row.ShopName} {ph} {local}");
                return tokens.All(hay.Contains);
            });
        }

        var list = rows.Select(r => r.Row);
        list = (page.Sort, page.Desc) switch
        {
            ("name", false) => list.OrderBy(r => r.Name ?? "\uffff"),
            ("name", true) => list.OrderByDescending(r => r.Name),
            ("lastAt", false) => list.OrderBy(r => r.LastAt),
            ("lastAt", true) => list.OrderByDescending(r => r.LastAt),
            ("boxes", false) => list.OrderBy(r => r.Boxes),
            _ => list.OrderByDescending(r => r.Boxes).ThenBy(r => r.Name),
        };
        var all = list.ToList();
        var items = all.Skip((page.SafePage - 1) * page.SafeSize).Take(page.SafeSize).ToList();
        return (new PagedResult<HolderRow>(items, all.Count, page.SafePage, page.SafeSize), warehouse);
    }

    /// <summary>
    /// The rolls one person holds now and every transfer to or from them. <paramref name="phone"/> and
    /// <paramref name="name"/> both empty is the central warehouse; a name alone is a legacy holder without a mobile.
    /// </summary>
    public async Task<HolderDetail> HolderDetail(string? phone, string? name)
    {
        phone = string.IsNullOrWhiteSpace(phone) ? null : phone.Trim();
        name = phone == null ? NormalizeHolder(name) : null;
        var held = db.BoxLabels.AsNoTracking().Where(x => x.ActivatedAt == null);
        held = phone != null ? held.Where(x => x.HolderPhone == phone)
            : name != null ? held.Where(x => x.HolderPhone == null && x.Holder == name)
            : held.Where(x => x.HolderPhone == null && x.Holder == null);
        var count = await held.CountAsync();
        var boxes = await held.OrderByDescending(x => x.HeldSince).ThenBy(x => x.Id).Take(1000).ToListAsync();

        var moves = db.BoxTransfers.AsNoTracking();
        moves = phone != null ? moves.Where(x => x.FromPhone == phone || x.ToPhone == phone)
            : name != null ? moves.Where(x => (x.FromPhone == null && x.FromHolder == name) || (x.ToPhone == null && x.ToHolder == name))
            : moves.Where(x => (x.FromPhone == null && x.FromHolder == null) || (x.ToPhone == null && x.ToHolder == null));
        var transfers = await moves.OrderByDescending(x => x.At).ThenByDescending(x => x.Id).Take(1000).ToListAsync();

        var user = phone == null ? null : await db.PortalUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Phone == phone);
        var full = NormalizeHolder($"{user?.FirstName} {user?.LastName}");
        return new(phone, full ?? NormalizeHolder(user?.Name) ?? name ?? boxes.Select(x => x.Holder).FirstOrDefault(x => x != phone), user?.FirstName, user?.LastName, user?.ShopName,
            user?.City, count,
            await Held(boxes), transfers.Select(View).ToArray());
    }

    /// <summary>What a signed-in representative holds now, and what they recently passed on.</summary>
    public async Task<MyBoxes> Mine(string phone)
    {
        var boxes = await db.BoxLabels.AsNoTracking().Where(x => x.HolderPhone == phone && x.ActivatedAt == null)
            .OrderByDescending(x => x.HeldSince).Take(1000).ToListAsync();
        var outgoing = await db.BoxTransfers.AsNoTracking().Where(x => x.FromPhone == phone)
            .OrderByDescending(x => x.At).ThenByDescending(x => x.Id).Take(200).ToListAsync();
        var used = await db.BoxLabels.AsNoTracking().Where(x => x.HolderPhone == phone && x.ActivatedAt != null)
            .OrderByDescending(x => x.ActivatedAt).Take(500).ToListAsync();
        return new(await Held(boxes), outgoing.Select(View).ToArray(), await Held(used));
    }

    /// <summary>One roll the signed-in account holds: what it is, how much is left, the vehicles it went on and its hand-overs.</summary>
    public async Task<RollDetail> Detail(string id, string phone)
    {
        var serial = NormalizeSerial(id);
        // A roll held by someone else reads as not found, so ROLL NOs of other holders reveal nothing.
        var label = await db.BoxLabels.AsNoTracking().FirstOrDefaultAsync(x => x.Id == serial && x.HolderPhone == phone)
            ?? throw new ActivationError(404, "This roll is not in your account.");
        var rows = await db.WarrantyRegistrations.AsNoTracking().Where(w => w.FilmSerial == label.Id)
            .OrderByDescending(w => w.CreatedAt).Take(200).ToListAsync();
        var codes = rows.Select(w => w.Code).ToArray();
        var photos = await db.WarrantyPhotos.AsNoTracking().Where(p => codes.Contains(p.WarrantyCode)).GroupBy(p => p.WarrantyCode)
            .Select(g => new { g.Key, Count = g.Count() }).ToDictionaryAsync(x => x.Key, x => x.Count);
        var installs = rows.Select(w => new InstallerWarranty(WarrantyService.ToPublic(w), PortalService.MaskPhone(w.Phone), w.Country,
            photos.GetValueOrDefault(w.Code), w.CreatedAt)).ToArray();
        var history = await db.BoxTransfers.AsNoTracking().Where(x => x.LabelId == label.Id && (x.FromPhone == phone || x.ToPhone == phone))
            .OrderByDescending(x => x.At).ThenByDescending(x => x.Id).Take(50).ToListAsync();
        return new((await Held([label]))[0], installs, history.Select(View).ToArray());
    }

    sealed class NoSms : IActivationSmsSender
    {
        public static readonly NoSms Instance = new();
        public bool Configured => false;
        public Task Send(string phone, string code, string reference, CancellationToken cancellationToken) => throw new InvalidOperationException();
    }
}
