using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

[ApiController, Route("api/admin"), Authorize(Policy = "AdminPolicy")]
public class ClaimsController(AppDbContext db) : ControllerBase
{
    string Actor => AuditLog.Actor(HttpContext?.User);

    static readonly Dictionary<string, System.Linq.Expressions.Expression<Func<WarrantyClaim, object>>> ClaimSort = new()
    {
        ["createdAt"] = c => c.CreatedAt, ["updatedAt"] = c => c.UpdatedAt, ["id"] = c => c.Id,
        ["stage"] = c => c.Stage, ["decision"] = c => c.Decision, ["warrantyCode"] = c => c.WarrantyCode,
    };

    object Row(WarrantyClaim c, DateTime now) => new
    {
        c.Id, c.WarrantyCode, c.Channel, c.Description, c.RequiredDocuments, c.Stage, c.Cause, c.Decision, c.DecisionNote,
        c.Remedy, c.RemedyNote, c.LaborCost, c.PartsCost, c.OtherCost,
        TotalCost = (c.LaborCost ?? 0) + (c.PartsCost ?? 0) + (c.OtherCost ?? 0),
        c.CreatedAt, c.CreatedBy, c.AcknowledgedAt, c.InitialReviewedAt, c.DocumentsCompleteAt, c.DecidedAt, c.ClosedAt, c.UpdatedAt, c.Revision,
        Due = ClaimService.Due(c, now),
    };

    [HttpGet("claims")]
    public async Task<IActionResult> List([FromQuery] ClaimSearch f, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var query = db.WarrantyClaims.AsNoTracking();
        if (Paging.Term(f.Q) is { } q)
            query = query.Where(c => c.Id.Contains(q) || c.WarrantyCode.Contains(q) || c.Description.Contains(q) ||
                db.WarrantyRegistrations.Any(w => w.Code == c.WarrantyCode && (w.Owner.Contains(q) || w.Phone.Contains(q) || w.Vin.Contains(q) || w.Plate.Contains(q))));
        if (Paging.Term(f.WarrantyCode) is { } code) query = query.Where(c => c.WarrantyCode == code);
        if (f.Open == true) query = query.Where(c => c.Stage != ClaimStage.Closed);
        if (Enum.TryParse<ClaimStage>(f.Stage, true, out var st) && Enum.IsDefined(st)) query = query.Where(c => c.Stage == st);
        if (Enum.TryParse<ClaimDecision>(f.Decision, true, out var d) && Enum.IsDefined(d)) query = query.Where(c => c.Decision == d);
        if (Enum.TryParse<ClaimCause>(f.Cause, true, out var cause) && Enum.IsDefined(cause)) query = query.Where(c => c.Cause == cause);
        if (f.CreatedFrom is { } from) { var x = from.ToDateTime(TimeOnly.MinValue); query = query.Where(c => c.CreatedAt >= x); }
        if (f.CreatedTo is { } to) { var x = to.AddDays(1).ToDateTime(TimeOnly.MinValue); query = query.Where(c => c.CreatedAt < x); }
        if (f.Overdue == true)
        {
            // Business-day targets are evaluated in memory over the (small) set of claims still awaiting a decision.
            var open = await query.Where(c => c.Stage < ClaimStage.Decided).ToListAsync(ct);
            var late = open.Where(c => ClaimService.Due(c, now).Overdue).Select(c => c.Id).ToList();
            query = query.Where(c => late.Contains(c.Id));
        }

        var page = new PageQuery(f.Page, f.PageSize, f.Sort, f.Dir);
        var result = await query.OrderBy(f.Sort, page.Desc, ClaimSort, "createdAt").ToPage(page, ct);
        var codes = result.Items.Select(c => c.WarrantyCode).Distinct().ToList();
        var vehicles = await db.WarrantyRegistrations.AsNoTracking().Where(w => codes.Contains(w.Code))
            .ToDictionaryAsync(w => w.Code, w => new { w.Owner, w.Make, w.Model, w.Plate, w.Type }, ct);
        return Ok(new
        {
            items = result.Items.Select(c => new { claim = Row(c, now), vehicle = vehicles.GetValueOrDefault(c.WarrantyCode) }),
            total = result.Total, page = result.Page, pageSize = result.PageSize,
        });
    }

    [HttpGet("claims/{id}")]
    public async Task<IActionResult> Get(string id, CancellationToken ct)
    {
        var c = await db.WarrantyClaims.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c == null) return NotFound(new { error = "Claim not found." });
        var w = await db.WarrantyRegistrations.AsNoTracking().FirstAsync(x => x.Code == c.WarrantyCode, ct);
        var roll = w.RollId == null ? null : await db.Rolls.AsNoTracking().Where(r => r.Id == w.RollId)
            .Select(r => new { r.Id, r.ModelCode, r.Batch, r.Supplier }).FirstOrDefaultAsync(ct);
        var history = await History("claim", c.Id, ct);
        return Ok(new
        {
            claim = Row(c, DateTime.UtcNow),
            warranty = new { w.Code, w.Type, w.Status, w.Owner, w.Phone, w.Make, w.Model, w.Vin, w.Plate, w.Installed, w.FilmEnds, w.InstallEnds, w.Installer, w.SellerName, w.FilmSerial },
            roll, history,
        });
    }

    [HttpPost("claims")]
    public async Task<IActionResult> Create([FromBody] CreateClaimRequest req)
    {
        var code = (req.WarrantyCode ?? "").Trim().ToUpperInvariant();
        var description = (req.Description ?? "").Trim();
        if (!Enum.TryParse<ClaimChannel>(req.Channel, true, out var channel) || !Enum.IsDefined(channel)) return BadRequest(new { error = "Invalid channel." });
        if (description.Length is < 10 or > 2000) return BadRequest(new { error = "Describe the problem in 10–2000 characters." });
        if ((req.RequiredDocuments?.Length ?? 0) > 1000) return BadRequest(new { error = "Required documents note is too long." });
        // A claim is accepted for any registered warranty, whatever its status: missing details are never an automatic rejection (policy rule 5).
        if (!await db.WarrantyRegistrations.AnyAsync(w => w.Code == code)) return NotFound(new { error = "Warranty code not found." });

        var now = DateTime.UtcNow;
        var claim = new WarrantyClaim
        {
            WarrantyCode = code, Channel = channel, Description = description,
            RequiredDocuments = string.IsNullOrWhiteSpace(req.RequiredDocuments) ? null : req.RequiredDocuments.Trim(),
            CreatedAt = now, UpdatedAt = now, CreatedBy = Actor,
        };
        do claim.Id = ClaimService.NewId(now); while (await db.WarrantyClaims.AnyAsync(c => c.Id == claim.Id));
        db.WarrantyClaims.Add(claim);
        AuditLog.Add(db, Actor, "claim", claim.Id, "created", AuditLog.Diff(("warrantyCode", null, code), ("channel", null, channel), ("description", null, description)));
        AuditLog.Add(db, Actor, "warranty", code, "claimOpened", AuditLog.Diff(("claim", null, claim.Id)));
        await db.SaveChangesAsync();
        return Ok(Row(claim, now));
    }

    [HttpPut("claims/{id}")]
    public async Task<IActionResult> Update(string id, [FromBody] UpdateClaimRequest req)
    {
        var c = await db.WarrantyClaims.FirstOrDefaultAsync(x => x.Id == id);
        if (c == null) return NotFound(new { error = "Claim not found." });
        if (req.Revision != c.Revision) return Conflict(new { error = "This claim was changed by someone else. Reload it and try again." });

        var before = new { c.Stage, c.Cause, c.Decision, c.DecisionNote, c.Remedy, c.RemedyNote, c.RequiredDocuments, c.LaborCost, c.PartsCost, c.OtherCost };
        var error = ClaimService.Apply(c, req, DateTime.UtcNow);
        if (error != null) return BadRequest(new { error });

        var changes = AuditLog.Diff(
            ("stage", before.Stage, c.Stage), ("cause", before.Cause, c.Cause), ("decision", before.Decision, c.Decision),
            ("decisionNote", before.DecisionNote, c.DecisionNote), ("remedy", before.Remedy, c.Remedy), ("remedyNote", before.RemedyNote, c.RemedyNote),
            ("requiredDocuments", before.RequiredDocuments, c.RequiredDocuments), ("laborCost", before.LaborCost, c.LaborCost),
            ("partsCost", before.PartsCost, c.PartsCost), ("otherCost", before.OtherCost, c.OtherCost));
        if (changes.Count == 0) return Ok(Row(c, DateTime.UtcNow));   // nothing changed; keep revision stable
        var action = c.Stage < before.Stage ? "reopened" : c.Stage != before.Stage ? "stageChanged" : "updated";
        AuditLog.Add(db, Actor, "claim", c.Id, action, changes, req.Reason);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateConcurrencyException) { return Conflict(new { error = "This claim was changed by someone else. Reload it and try again." }); }
        return Ok(Row(c, DateTime.UtcNow));
    }

    // ── Change log ────────────────────────────────────────────────────────────

    async Task<List<object>> History(string type, string id, CancellationToken ct) =>
        (await db.AuditEntries.AsNoTracking().Where(a => a.EntityType == type && a.EntityId == id).OrderByDescending(a => a.At).Take(200).ToListAsync(ct))
        .Select(Shape).ToList();

    static object Shape(AuditEntry a) => new
    {
        a.Id, a.EntityType, a.EntityId, a.Action, a.Actor, a.At, a.Reason,
        Changes = JsonSerializer.Deserialize<Dictionary<string, JsonElement[]>>(a.ChangesJson) ?? [],
    };

    [HttpGet("warranties/{code}/activity")]
    public async Task<IActionResult> WarrantyActivity(string code, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var claims = await db.WarrantyClaims.AsNoTracking().Where(c => c.WarrantyCode == code).OrderByDescending(c => c.CreatedAt).ToListAsync(ct);
        return Ok(new { claims = claims.Select(c => Row(c, now)), history = await History("warranty", code, ct) });
    }

    [HttpGet("audit")]
    public async Task<IActionResult> Audit([FromQuery] AuditSearch f, CancellationToken ct)
    {
        var query = db.AuditEntries.AsNoTracking();
        if (Paging.Term(f.EntityType) is { } type) query = query.Where(a => a.EntityType == type);
        if (Paging.Term(f.EntityId) is { } id) query = query.Where(a => a.EntityId.Contains(id));
        if (Paging.Term(f.Actor) is { } actor) query = query.Where(a => a.Actor.Contains(actor));
        if (Paging.Term(f.Action) is { } act) query = query.Where(a => a.Action == act);
        if (Paging.Term(f.Q) is { } q) query = query.Where(a => a.EntityId.Contains(q) || a.Actor.Contains(q) || (a.Reason != null && a.Reason.Contains(q)) || a.ChangesJson.Contains(q));
        if (f.From is { } from) { var x = from.ToDateTime(TimeOnly.MinValue); query = query.Where(a => a.At >= x); }
        if (f.To is { } to) { var x = to.AddDays(1).ToDateTime(TimeOnly.MinValue); query = query.Where(a => a.At < x); }
        var page = new PageQuery(f.Page, f.PageSize, "at", "desc");
        var total = await query.CountAsync(ct);
        var items = await query.OrderByDescending(a => a.At).ThenByDescending(a => a.Id)
            .Skip((page.SafePage - 1) * page.SafeSize).Take(page.SafeSize).ToListAsync(ct);
        return Ok(new { items = items.Select(Shape), total, page = page.SafePage, pageSize = page.SafeSize });
    }
}

public class ClaimSearch
{
    public string? Q { get; set; }
    public string? WarrantyCode { get; set; }
    public bool? Open { get; set; }
    public bool? Overdue { get; set; }
    public string? Stage { get; set; }
    public string? Decision { get; set; }
    public string? Cause { get; set; }
    public DateOnly? CreatedFrom { get; set; }
    public DateOnly? CreatedTo { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
    public string? Sort { get; set; }
    public string? Dir { get; set; }
}

public class AuditSearch
{
    public string? Q { get; set; }
    public string? EntityType { get; set; }
    public string? EntityId { get; set; }
    public string? Actor { get; set; }
    public string? Action { get; set; }
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 50;
}
