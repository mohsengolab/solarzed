using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

[ApiController]
[Route("api/admin")]
[Authorize(Policy = "StaffPolicy")]
public class AdminController(AppDbContext db, IConfiguration cfg, Microsoft.AspNetCore.DataProtection.IDataProtectionProvider? protection = null) : ControllerBase
{
    string JwtKey => cfg["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key missing");
    string Actor => AuditLog.Actor(HttpContext?.User);
    // Roll IDs and warranty codes are shown to the super administrator only (see Confidential).
    bool SeesCodes => Confidential.SeesCodes(HttpContext?.User);

    // ── Auth ────────────────────────────────────────────────────────────────

    [AllowAnonymous]
    [HttpPost("login")]
    [EnableRateLimiting("admin-login")]
    [RequestSizeLimit(4096)]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        var username = (req.Username ?? "").Trim();
        var password = req.Password ?? "";
        if (username.Length is 0 or > 100 || password.Length is 0 or > 200)
            return Unauthorized(new { error = "invalid password" });

        var throttle = HttpContext?.RequestServices.GetService<LoginThrottle>();
        if (throttle != null && throttle.Locked(username, out var retry))
        {
            if (HttpContext != null) Response.Headers.RetryAfter = ((int)Math.Ceiling(retry.TotalSeconds)).ToString();
            return StatusCode(429, new { error = "Too many failed sign-in attempts. Try again later." });
        }

        var admin = await db.AdminUsers.FirstOrDefaultAsync(x => x.Username == username);
        // Always run one bcrypt verification so timing does not reveal unknown usernames.
        var ok = BCrypt.Net.BCrypt.Verify(password, admin?.PasswordHash ?? AdminAuth.DummyHash) &&
                 admin != null && admin.Active && (admin.Role == "admin" || admin.Role == "carton" || admin.Role == "superadmin");
        if (!ok)
        {
            throttle?.Fail(username);
            return Unauthorized(new { error = "invalid password" });
        }
        throttle?.Succeed(username);

        var token = BuildToken(admin!);
        // Only the browser UI (which sends the CSRF header) gets the HttpOnly cookie; scripts use the returned token.
        if (HttpContext != null && Request.Headers["X-Requested-With"] == "fetch")
            Response.Cookies.Append(AdminAuth.Cookie, token, new CookieOptions
            {
                HttpOnly = true, Secure = Request.IsHttps, SameSite = SameSiteMode.Strict,
                Path = "/api", MaxAge = AdminAuth.Lifetime, IsEssential = true,
            });
        // The token is also returned for API clients (scripts/tests). The admin UI relies on the HttpOnly cookie.
        return Ok(new { token, username = admin!.Username, role = admin.Role, expiresAt = DateTime.UtcNow.Add(AdminAuth.Lifetime) });
    }

    [HttpGet("session")]
    public async Task<IActionResult> Session()
    {
        var name = User.Identity?.Name;
        var role = User.FindFirst(ClaimTypes.Role)?.Value;
        if (string.IsNullOrEmpty(role) && name != null)
            role = await db.AdminUsers.Where(a => a.Username == name).Select(a => a.Role).FirstOrDefaultAsync();
        return Ok(new { username = name ?? "admin", role = role ?? "admin" });
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete(AdminAuth.Cookie, new CookieOptions { Path = "/api", Secure = Request.IsHttps, SameSite = SameSiteMode.Strict, HttpOnly = true });
        return Ok(new { ok = true });
    }

    string BuildToken(AdminUser admin)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(
            issuer: AdminAuth.Issuer,
            audience: AdminAuth.Audience,
            claims: [
                new Claim(ClaimTypes.Role, admin.Role),
                new Claim(ClaimTypes.Name, admin.Username),
                new Claim(AdminAuth.StampClaim, AdminAuth.Stamp(admin.PasswordHash)),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            ],
            notBefore: DateTime.UtcNow,
            expires: DateTime.UtcNow.Add(AdminAuth.Lifetime),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(jwt);
    }

    // ── Overview ────────────────────────────────────────────────────────────

    [HttpGet("overview")]
    [Authorize(Policy = "AdminPolicy")]
    public async Task<IActionResult> Overview()
    {
        var total = await db.WarrantyRegistrations.CountAsync();
        var pending = await db.WarrantyRegistrations.CountAsync(w => w.Status == WarrantyStatus.Pending);
        var active = await db.WarrantyRegistrations.CountAsync(w => w.Status == WarrantyStatus.Active);
        var rejected = await db.WarrantyRegistrations.CountAsync(w => w.Status == WarrantyStatus.Rejected);
        var rollCount = await db.Rolls.CountAsync();

        var queue = await db.WarrantyRegistrations
            .Where(w => w.Status == WarrantyStatus.Pending)
            .OrderBy(w => w.CreatedAt)
            .Take(20)
            .Select(w => new { w.Code, w.Type, w.Make, w.Model, w.Owner, w.Installed, w.FlagsJson, w.CreatedAt })
            .ToListAsync();
        var shownQueue = queue.Select(w => new { Code = SeesCodes ? w.Code : Confidential.Mask(w.Code), Ref = Confidential.Ref(w.Code, protection),
            w.Type, w.Make, w.Model, w.Owner, w.Installed, w.FlagsJson, w.CreatedAt });

        var awaitingDecision = await db.WarrantyClaims.AsNoTracking().Where(c => c.Stage < ClaimStage.Decided).ToListAsync();
        var openClaims = await db.WarrantyClaims.CountAsync(c => c.Stage != ClaimStage.Closed);
        var now = DateTime.UtcNow;
        var overdueClaims = awaitingDecision.Count(c => ClaimService.Due(c, now).Overdue);

        return Ok(new { total, pending, active, rejected, rollCount, openClaims, overdueClaims, queue = shownQueue });
    }

    // ── Warranties ──────────────────────────────────────────────────────────

    static readonly Dictionary<string, System.Linq.Expressions.Expression<Func<WarrantyRegistration, object>>> WarrantySort = new()
    {
        ["createdAt"] = w => w.CreatedAt, ["installed"] = w => w.Installed, ["code"] = w => w.Code,
        ["owner"] = w => w.Owner, ["make"] = w => w.Make, ["installer"] = w => w.Installer,
        ["status"] = w => w.Status, ["type"] = w => w.Type, ["filmEnds"] = w => w.FilmEnds!,
    };

    [HttpGet("warranties")]
    [Authorize(Policy = "AdminPolicy")]
    public async Task<IActionResult> Warranties([FromQuery] WarrantySearch f, CancellationToken ct)
    {
        var query = db.WarrantyRegistrations.AsNoTracking();

        if (!string.IsNullOrEmpty(f.Status) && Enum.TryParse<WarrantyStatus>(f.Status, true, out var s) && Enum.IsDefined(s))
            query = query.Where(w => w.Status == s);
        if (!string.IsNullOrEmpty(f.Type) && Enum.TryParse<WarrantyType>(f.Type, true, out var t) && Enum.IsDefined(t))
            query = query.Where(w => w.Type == t);
        if (f.Flagged == true) query = query.Where(w => w.FlagsJson != "[]");
        if (f.Flagged == false) query = query.Where(w => w.FlagsJson == "[]");
        if (!string.IsNullOrEmpty(f.Flag) && System.Text.RegularExpressions.Regex.IsMatch(f.Flag, "^[a-z_]{1,40}$"))
        {
            var needle = "\"" + f.Flag + "\"";
            query = query.Where(w => w.FlagsJson.Contains(needle));
        }
        if (Paging.Term(f.Make) is { } make) query = query.Where(w => w.Make.Contains(make) || w.Model.Contains(make));
        if (Paging.Term(f.Installer) is { } installer) query = query.Where(w => w.Installer.Contains(installer) || w.SellerName.Contains(installer));
        if (f.InstalledFrom is { } inFrom) query = query.Where(w => w.Installed >= inFrom);
        if (f.InstalledTo is { } inTo) query = query.Where(w => w.Installed <= inTo);
        if (f.CreatedFrom is { } crFrom) { var from = crFrom.ToDateTime(TimeOnly.MinValue); query = query.Where(w => w.CreatedAt >= from); }
        if (f.CreatedTo is { } crTo) { var to = crTo.AddDays(1).ToDateTime(TimeOnly.MinValue); query = query.Where(w => w.CreatedAt < to); }
        if (f.ExpiringDays is int days and > 0 and <= 3650)
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var until = today.AddDays(days);
            query = query.Where(w => w.FilmEnds != null && w.FilmEnds >= today && w.FilmEnds <= until);
        }
        if (Paging.Term(f.Q) is { } q)
        {
            query = SeesCodes
                ? query.Where(w =>
                    w.Code.Contains(q) || w.Vin.Contains(q) || w.Phone.Contains(q) || w.Plate.Contains(q) ||
                    w.FilmSerial.Contains(q) || w.Owner.Contains(q) || w.InvoiceNumber.Contains(q) ||
                    (w.RollId != null && w.RollId.Contains(q)))
                : query.Where(w => w.Vin.Contains(q) || w.Phone.Contains(q) || w.Plate.Contains(q) ||
                    w.FilmSerial.Contains(q) || w.Owner.Contains(q) || w.InvoiceNumber.Contains(q));
        }

        var page = new PageQuery(f.Page, f.PageSize, f.Sort, f.Dir);
        var result = await query.OrderBy(f.Sort, page.Desc, WarrantySort, "createdAt").ToPage(page, ct);
        // Every row carries a reference to act on it; other staff see the code masked and no roll ID.
        var refs = result.Items.Select(w => Confidential.Ref(w.Code, protection)).ToList();
        if (!SeesCodes)
            foreach (var w in result.Items) { w.Code = Confidential.Mask(w.Code); w.RollId = null; }
        return Ok(new { items = result.Items, refs, total = result.Total, page = result.Page, pageSize = result.PageSize });
    }

    [HttpPost("warranties/{code}/decision")]
    [Authorize(Policy = "AdminPolicy")]
    public async Task<IActionResult> Decision(string code, [FromBody] DecisionRequest req)
    {
        if (Confidential.Resolve(code, HttpContext?.User, protection) is not { } resolved) return NotFound();
        var w = await db.WarrantyRegistrations.FirstOrDefaultAsync(x => x.Code == resolved);
        if (w == null) return NotFound();

        if (!Enum.TryParse<WarrantyStatus>(req.Status, true, out var st) || !Enum.IsDefined(st))
            return BadRequest(new { error = "invalid status" });

        if (st == WarrantyStatus.Rejected && string.IsNullOrWhiteSpace(req.Note))
            return BadRequest(new { error = "rejection requires a note" });

        if ((req.Note?.Length ?? 0) > 500) return BadRequest(new { error = "Note is limited to 500 characters." });

        var before = new { w.Status, w.ReviewNote, w.FilmEnds, w.InstallEnds };
        w.Status = st;
        w.ReviewNote = req.Note;
        w.ReviewedAt = DateTime.UtcNow;
        w.FilmEnds = null;
        w.InstallEnds = null;

        if (st == WarrantyStatus.Active)
        {
            var setting = await db.CoverageSettings.FirstOrDefaultAsync() ?? new CoverageSetting();
            if (w.Type == WarrantyType.Tint)
            {
                if (setting.TintFilmYears.HasValue)
                    w.FilmEnds = WarrantyService.AddYears(w.Installed, setting.TintFilmYears.Value);
                if (setting.TintInstallYears.HasValue)
                    w.InstallEnds = WarrantyService.AddYears(w.Installed, setting.TintInstallYears.Value);
            }
            else
            {
                if (setting.PpfFilmYears.HasValue)
                    w.FilmEnds = WarrantyService.AddYears(w.Installed, setting.PpfFilmYears.Value);
                if (setting.PpfInstallYears.HasValue)
                    w.InstallEnds = WarrantyService.AddYears(w.Installed, setting.PpfInstallYears.Value);
            }
        }

        // The previous status and note stay in the change log; the decision never silently overwrites history.
        AuditLog.Add(db, Actor, "warranty", w.Code, "decision", AuditLog.Diff(
            ("status", before.Status, w.Status), ("reviewNote", before.ReviewNote, w.ReviewNote),
            ("filmEnds", before.FilmEnds, w.FilmEnds), ("installEnds", before.InstallEnds, w.InstallEnds)), req.Note);
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    // ── Rolls ────────────────────────────────────────────────────────────────

    static readonly Dictionary<string, System.Linq.Expressions.Expression<Func<Roll, object>>> RollSort = new()
    {
        ["receivedAt"] = r => r.ReceivedAt, ["number"] = r => r.Number, ["id"] = r => r.Id, ["modelCode"] = r => r.ModelCode, ["rollNo"] = r => r.RollNo!,
        ["batch"] = r => r.Batch, ["supplier"] = r => r.Supplier, ["qc"] = r => r.Qc, ["status"] = r => r.Status, ["type"] = r => r.Type,
    };

    [HttpGet("rolls")]
    public async Task<IActionResult> GetRolls([FromQuery] RollSearch f, CancellationToken ct)
    {
        var query = db.Rolls.AsNoTracking();
        if (Paging.Term(f.Q) is { } q)
        {
            var number = int.TryParse(q, out var n) ? n : -1;   // the register number, e.g. 12
            var byId = SeesCodes;
            query = query.Where(r => r.Number == number || (byId && r.Id.Contains(q)) || (r.RollNo != null && r.RollNo.Contains(q)) || r.ModelCode.Contains(q) || r.Batch.Contains(q) || r.Supplier.Contains(q));
        }
        if (Paging.Term(f.Model) is { } model) { var m = model.ToUpperInvariant(); query = query.Where(r => r.ModelCode == m); }
        if (Paging.Term(f.Batch) is { } batch) query = query.Where(r => r.Batch.Contains(batch));
        if (Paging.Term(f.Supplier) is { } supplier) query = query.Where(r => r.Supplier.Contains(supplier));
        if (ParseLocation(f.Location) is { } loc)
            query = loc.Kind == "user" ? query.Where(r => r.HolderUserId == loc.Id)
                : query.Where(r => r.HolderUserId == null && r.WarehouseId == loc.Id);
        if (!string.IsNullOrEmpty(f.Type) && Enum.TryParse<WarrantyType>(f.Type, true, out var t) && Enum.IsDefined(t))
            query = query.Where(r => r.Type == t);
        if (!string.IsNullOrEmpty(f.Qc) && Enum.TryParse<RollQc>(f.Qc, true, out var qc) && Enum.IsDefined(qc))
            query = query.Where(r => r.Qc == qc);
        if (!string.IsNullOrEmpty(f.Status) && Enum.TryParse<RollStatus>(f.Status, true, out var st) && Enum.IsDefined(st))
            query = query.Where(r => r.Status == st);
        if (f.ReceivedFrom is { } rf) { var from = rf.ToDateTime(TimeOnly.MinValue); query = query.Where(r => r.ReceivedAt >= from); }
        if (f.ReceivedTo is { } rt) { var to = rt.AddDays(1).ToDateTime(TimeOnly.MinValue); query = query.Where(r => r.ReceivedAt < to); }
        if (f.HasInstalls is bool used)
            query = used ? query.Where(r => db.WarrantyRegistrations.Any(w => w.RollId == r.Id))
                         : query.Where(r => !db.WarrantyRegistrations.Any(w => w.RollId == r.Id));

        var page = new PageQuery(f.Page, f.PageSize, f.Sort, f.Dir);
        var result = await query.OrderBy(f.Sort, page.Desc, RollSort, "receivedAt").ToPage(page, ct);

        // attach install counts (non-confidential)
        var ids = result.Items.Select(r => r.Id).ToList();
        var counts = await db.WarrantyRegistrations
            .Where(w => w.RollId != null && ids.Contains(w.RollId))
            .GroupBy(w => w.RollId!)
            .Select(g => new { RollId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.RollId, x => x.Count, ct);
        // Warranty cards already issued for each roll's carton(s).
        var cards = await db.BoxLabels
            .Where(b => b.RollId != null && ids.Contains(b.RollId))
            .GroupBy(b => b.RollId!)
            .Select(g => new { RollId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.RollId, x => x.Count, ct);
        // Where each roll is: a system user holding it, the person its carton was handed to, or its warehouse.
        var warehouseIds = result.Items.Where(r => r.WarehouseId != null).Select(r => r.WarehouseId!.Value).Distinct().ToList();
        var warehouses = await db.Warehouses.Where(w => warehouseIds.Contains(w.Id)).ToDictionaryAsync(w => w.Id, w => w.Name, ct);
        var userIds = result.Items.Where(r => r.HolderUserId != null).Select(r => r.HolderUserId!.Value).Distinct().ToList();
        var users = await db.AdminUsers.Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => string.IsNullOrWhiteSpace(u.DisplayName) ? u.Username : u.DisplayName!, ct);
        var holders = (await db.BoxLabels.Where(b => b.RollId != null && ids.Contains(b.RollId) && b.Holder != null)
            .Select(b => new { RollId = b.RollId!, b.Holder, b.HolderPhone }).ToListAsync(ct))
            .GroupBy(b => b.RollId).ToDictionary(g => g.Key, g => g.First());
        RollLocation? Location(Roll r) =>
            r.HolderUserId is { } u ? new RollLocation("user", u, users.GetValueOrDefault(u, "?"), null)
            : holders.TryGetValue(r.Id, out var h) ? new RollLocation("person", 0, h.Holder!, h.HolderPhone)
            : r.WarehouseId is { } w ? new RollLocation("warehouse", w, warehouses.GetValueOrDefault(w, "?"), null)
            : null;

        return Ok(new
        {
            items = result.Items.Select(r => new
            {
                Id = SeesCodes ? r.Id : null, r.Number, r.RollNo, r.ModelCode, r.Type, r.Batch, r.Supplier, r.HistoryJson, r.WidthCm, r.LengthM,
                Qc = r.Qc.ToString().ToLower(), Status = r.Status.ToString().ToLower(),
                r.WarehouseId, r.HolderUserId, Location = Location(r),
                r.ReceivedAt,
                Installs = counts.GetValueOrDefault(r.Id, 0),
                Cards = cards.GetValueOrDefault(r.Id, 0)
            }),
            total = result.Total, page = result.Page, pageSize = result.PageSize
        });
    }

    [HttpPost("rolls")]
    [Authorize(Policy = "SuperAdminPolicy")]   // receiving shows the new roll IDs
    public async Task<IActionResult> ReceiveRolls([FromBody] CreateRollsRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.ModelCode)) return BadRequest(new { error = "modelCode required" });
        // Scanned carton Roll Nos: one roll per carton, so they also set the quantity.
        string[]? rollNos = null;
        if (req.RollNos is { Length: > 0 })
        {
            try { rollNos = BoxLabelService.ParseSerials(req.RollNos); }
            catch (ActivationError ex) { return BadRequest(new { error = ex.Message }); }
            var taken = await db.Rolls.Where(r => r.RollNo != null && rollNos.Contains(r.RollNo)).Select(r => r.RollNo!).ToListAsync();
            taken.AddRange(await db.BoxLabels.Where(b => rollNos.Contains(b.Id)).Select(b => b.Id).ToListAsync());
            if (taken.Count > 0) return Conflict(new { error = $"These Roll Nos are already registered: {string.Join(", ", taken.Distinct().Take(10))}" });
        }
        else if (req.Quantity < 1 || req.Quantity > 200) return BadRequest(new { error = "quantity 1–200" });
        if (!System.Text.RegularExpressions.Regex.IsMatch(req.ModelCode, "^[A-Za-z0-9-]{1,24}$") ||
            string.IsNullOrWhiteSpace(req.Batch) || req.Batch.Length > 32)
            return BadRequest(new { error = "Valid model code and batch (max 32) are required." });
        var supplier = RollService.SupplierCode(req.Supplier);
        if (supplier == null) return BadRequest(new { error = "Supplier code must be exactly 3 English letters." });
        if (!Enum.TryParse<WarrantyType>(req.Type, true, out var type) || !Enum.IsDefined(type) ||
            !Enum.TryParse<RollQc>(req.Qc, true, out var quality) || !Enum.IsDefined(quality))
            return BadRequest(new { error = "Invalid product type or QC." });
        // Rolls are received for a film model already defined in Products (e.g. PC15).
        var product = await db.Products.FindAsync(req.ModelCode.ToUpperInvariant());
        if (product == null) return BadRequest(new { error = "Define this film model in Products first." });
        if (product.Archived || product.Type != type)
            return BadRequest(new { error = "Product is archived or its type does not match." });
        if (req.WidthCm is { } w && (w <= 0 || w > 1000)) return BadRequest(new { error = "Width must be between 0 and 1000 cm." });
        if (req.LengthM is { } l && (l <= 0 || l > 10000)) return BadRequest(new { error = "Length must be between 0 and 10000 m." });
        if (req.WarehouseId is { } wh && !await db.Warehouses.AnyAsync(x => x.Id == wh && !x.Archived))
            return BadRequest(new { error = "Choose an active warehouse." });
        // Technical specs belong to the product and are fixed there; a receipt never changes them.

        Roll[] rolls;
        try { rolls = await RollService.CreateRolls(req with { Supplier = supplier, RollNos = rollNos }, db, Actor); }
        // Two receipts of the same carton at once trip the unique Roll No index.
        // Two receipts at once trip the unique Roll No or register-number index.
        catch (DbUpdateException) { return Conflict(new { error = "Another receipt was saved at the same time. Refresh and try again." }); }
        return Ok(rolls.Select(r => new { r.Id, r.Number, r.RollNo, r.ModelCode, r.Type, r.Batch }));
    }

    record LocationRef(string Kind, int Id);
    static LocationRef? ParseLocation(string? raw)
    {
        var parts = (raw ?? "").Trim().Split(':');
        return parts.Length == 2 && parts[0] is "warehouse" or "user" && int.TryParse(parts[1], out var id) && id > 0
            ? new LocationRef(parts[0], id) : null;
    }

    /// <summary>Choices for a roll's location: active warehouses and active system users (names only).</summary>
    [HttpGet("locations")]
    public async Task<IActionResult> Locations(CancellationToken ct) => Ok(new
    {
        warehouses = await db.Warehouses.AsNoTracking().Where(w => !w.Archived).OrderBy(w => w.Name)
            .Select(w => new { w.Id, w.Name }).ToListAsync(ct),
        users = await db.AdminUsers.AsNoTracking().Where(u => u.Active).OrderBy(u => u.Username)
            .Select(u => new { u.Id, Name = string.IsNullOrEmpty(u.DisplayName) ? u.Username : u.DisplayName }).ToListAsync(ct),
    });

    [HttpPost("rolls/{id}")]
    [Authorize(Policy = "AdminPolicy")]
    public async Task<IActionResult> UpdateRoll(string id, [FromBody] UpdateRollRequest req)
    {
        // Other staff address a roll by its register number, since they do not see roll IDs.
        var roll = int.TryParse(id, out var number)
            ? await db.Rolls.FirstOrDefaultAsync(r => r.Number == number)
            : await db.Rolls.FirstOrDefaultAsync(r => r.Id == id);
        if (roll == null) return NotFound();
        id = roll.Id;
        // Other staff may only move a roll (location) and change its stock status.
        if (!SeesCodes) req = req with { Qc = null, Batch = null, Supplier = null, WidthCm = null, LengthM = null, RollNo = null };

        var st = roll.Status;
        var qc = roll.Qc;
        if ((!string.IsNullOrEmpty(req.Status) && (!Enum.TryParse(req.Status, true, out st) || !Enum.IsDefined(st))) ||
            (!string.IsNullOrEmpty(req.Qc) && (!Enum.TryParse(req.Qc, true, out qc) || !Enum.IsDefined(qc))))
            return BadRequest(new { error = "Invalid stock status or QC." });
        if ((st == RollStatus.Shipped || st == RollStatus.Consumed) && qc != RollQc.Approved)
            return BadRequest(new { error = "QC approval is required before release." });
        if ((req.Note?.Length ?? 0) > 1000) return BadRequest(new { error = "Note is too long." });
        if (req.Batch is { Length: > 32 }) return BadRequest(new { error = "Batch is limited to 32 characters." });
        var supplier = RollService.SupplierCode(req.Supplier);
        if (req.Supplier != null && supplier == null && req.Supplier != roll.Supplier)
            return BadRequest(new { error = "Supplier code must be exactly 3 English letters." });
        if (req.WidthCm is { } w && (w <= 0 || w > 1000)) return BadRequest(new { error = "Width must be between 0 and 1000 cm." });
        if (req.LengthM is { } l && (l <= 0 || l > 10000)) return BadRequest(new { error = "Length must be between 0 and 10000 m." });
        var rollNo = string.IsNullOrWhiteSpace(req.RollNo) ? roll.RollNo : BoxLabelService.NormalizeSerial(req.RollNo);
        if (rollNo != roll.RollNo)
        {
            if (!BoxLabelService.SerialPattern.IsMatch(rollNo!)) return BadRequest(new { error = $"Invalid roll number: {rollNo}" });
            // The issued card's QR already carries the old carton number.
            if (await db.BoxLabels.AnyAsync(b => b.RollId == id))
                return Conflict(new { error = "A warranty card was already issued for this roll, so its Roll No cannot change." });
            if (await db.Rolls.AnyAsync(r => r.RollNo == rollNo && r.Id != id) || await db.BoxLabels.AnyAsync(b => b.Id == rollNo))
                return Conflict(new { error = $"These Roll Nos are already registered: {rollNo}" });
        }

        // Location: "warehouse:{id}", "user:{id}", or "" to clear; null leaves it unchanged.
        int? warehouseId = roll.WarehouseId, holderUserId = roll.HolderUserId;
        if (req.Location != null)
        {
            var loc = ParseLocation(req.Location);
            if (req.Location.Trim() != "" && loc == null) return BadRequest(new { error = "Invalid location." });
            if (loc?.Kind == "warehouse" && !await db.Warehouses.AnyAsync(x => x.Id == loc.Id && !x.Archived))
                return BadRequest(new { error = "Choose an active warehouse." });
            if (loc?.Kind == "user" && !await db.AdminUsers.AnyAsync(x => x.Id == loc.Id && x.Active))
                return BadRequest(new { error = "Choose an active user." });
            holderUserId = loc?.Kind == "user" ? loc.Id : null;
            // Handing a roll to a user keeps its warehouse, so it shows there again when the user returns it.
            if (loc?.Kind == "warehouse") warehouseId = loc.Id;
            else if (loc == null) warehouseId = null;
        }

        var before = new { roll.Status, roll.Qc, roll.Batch, roll.Supplier, roll.WidthCm, roll.LengthM, roll.RollNo };
        AuditLog.Add(db, Actor, "roll", roll.Id, "updated", AuditLog.Diff(
            ("status", before.Status, st), ("qc", before.Qc, qc), ("rollNo", before.RollNo, rollNo),
            ("batch", before.Batch, string.IsNullOrWhiteSpace(req.Batch) ? before.Batch : req.Batch.Trim()),
            ("supplier", before.Supplier, supplier ?? before.Supplier),
            ("widthCm", before.WidthCm, req.WidthCm ?? before.WidthCm), ("lengthM", before.LengthM, req.LengthM ?? before.LengthM),
            ("warehouseId", roll.WarehouseId, warehouseId), ("holderUserId", roll.HolderUserId, holderUserId)), req.Note);
        roll.WarehouseId = warehouseId;
        roll.HolderUserId = holderUserId;
        roll.Status = st;
        roll.Qc = qc;
        roll.RollNo = rollNo;
        if (!string.IsNullOrWhiteSpace(req.Batch)) roll.Batch = req.Batch.Trim();
        if (supplier != null) roll.Supplier = supplier;
        if (req.WidthCm is { } width) roll.WidthCm = width;
        if (req.LengthM is { } length) roll.LengthM = length;

        // append to history
        var history = JsonSerializer.Deserialize<List<JsonElement>>(roll.HistoryJson) ?? [];
        history.Add(JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            at = DateTime.UtcNow, action = "updated",
            note = req.Note ?? $"status={req.Status} qc={req.Qc}"
        })).RootElement);
        roll.HistoryJson = JsonSerializer.Serialize(history);

        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    /// <summary>
    /// Deletes a roll in every case. Cartons never used on a vehicle go with it (with their transfers and activation
    /// challenges), so their serials can be issued again. Cartons already activated stay, unlinked from the roll: the
    /// card in the customer's hands keeps working for further vehicles, the hand-over history is kept and the serial
    /// cannot be given to another carton. Warranty registrations are customer records and are only unlinked.
    /// </summary>
    [HttpDelete("rolls/{id}")]
    [Authorize(Policy = "SuperAdminPolicy")]
    public async Task<IActionResult> DeleteRoll(string id)
    {
        var roll = await db.Rolls.FirstOrDefaultAsync(r => r.Id == id);
        if (roll == null) return NotFound();

        var labels = await db.BoxLabels.Where(b => b.RollId == id).ToListAsync();
        var kept = labels.Where(b => b.ActivatedAt != null).ToList();
        var removed = labels.Where(b => b.ActivatedAt == null).ToList();
        var removedIds = removed.Select(b => b.Id).ToList();
        var transfers = await db.BoxTransfers.Where(t => removedIds.Contains(t.LabelId)).ToListAsync();
        var challenges = await db.ActivationChallenges.Where(c => removedIds.Contains(c.LabelId)).ToListAsync();
        var warranties = await db.WarrantyRegistrations.Where(w => w.RollId == id).ToListAsync();

        foreach (var w in warranties)
        {
            AuditLog.Add(db, Actor, "warranty", w.Code, "roll_unlinked", AuditLog.Diff(("rollId", id, null)));
            w.RollId = null;
        }
        foreach (var b in kept)
        {
            AuditLog.Add(db, Actor, "box_label", b.Id, "roll_unlinked", AuditLog.Diff(("rollId", b.RollId, null)));
            b.RollId = null;
            b.Revision++;
        }
        foreach (var b in removed)
            AuditLog.Add(db, Actor, "box_label", b.Id, "deleted", AuditLog.Diff(
                ("rollId", b.RollId, null), ("cardCode", b.CardCode, null), ("holder", b.Holder, null)));
        db.BoxTransfers.RemoveRange(transfers);
        db.ActivationChallenges.RemoveRange(challenges);
        db.BoxLabels.RemoveRange(removed);

        AuditLog.Add(db, Actor, "roll", roll.Id, "deleted", AuditLog.Diff(
            ("modelCode", roll.ModelCode, null), ("rollNo", roll.RollNo, null), ("batch", roll.Batch, null), ("supplier", roll.Supplier, null),
            ("qc", roll.Qc, null), ("status", roll.Status, null),
            ("labels", removed.Count, null), ("activatedLabelsKept", kept.Count, null), ("warrantiesUnlinked", warranties.Count, null)));
        db.Rolls.Remove(roll);
        // One SaveChanges = one transaction: either everything goes or nothing does.
        await db.SaveChangesAsync();
        return Ok(new { ok = true, labelsDeleted = removed.Count, activatedLabelsKept = kept.Count, warrantiesUnlinked = warranties.Count });
    }

    // ── Settings ─────────────────────────────────────────────────────────────

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        var s = await db.CoverageSettings.FirstOrDefaultAsync() ?? new CoverageSetting();
        return Ok(new
        {
            durations = new
            {
                tint = new { film = s.TintFilmYears, install = s.TintInstallYears },
                ppf = new { film = s.PpfFilmYears, install = s.PpfInstallYears }
            },
            warrantyCodeLength = s.WarrantyCodeLength
        });
    }

    [HttpPost("settings")]
    [Authorize(Policy = "AdminPolicy")]
    public async Task<IActionResult> SaveSettings([FromBody] SettingsRequest req)
    {
        foreach (var period in new[] { req.Durations?.Tint, req.Durations?.Ppf })
        {
            if (period?.Film is int film && film is not (3 or 5 or 7 or 10))
                return BadRequest(new { error = "Film warranty must be 3, 5, 7 or 10 years." });
            if (period?.Install is int install && install is not (1 or 2 or 3))
                return BadRequest(new { error = "Installation warranty must be 1, 2 or 3 years." });
        }

        var s = await db.CoverageSettings.FirstOrDefaultAsync();
        if (s == null) { s = new CoverageSetting(); db.CoverageSettings.Add(s); }
        var before = new { s.TintFilmYears, s.TintInstallYears, s.PpfFilmYears, s.PpfInstallYears, s.WarrantyCodeLength };

        s.TintFilmYears = req.Durations?.Tint?.Film;
        s.TintInstallYears = req.Durations?.Tint?.Install;
        s.PpfFilmYears = req.Durations?.Ppf?.Film;
        s.PpfInstallYears = req.Durations?.Ppf?.Install;
        if (req.WarrantyCodeLength is int len)
        {
            if (len is < 6 or > 29) return BadRequest(new { error = "Warranty code length must be between 6 and 29 characters." });
            s.WarrantyCodeLength = len;
        }
        s.UpdatedAt = DateTime.UtcNow;

        var changes = AuditLog.Diff(
            ("tintFilmYears", before.TintFilmYears, s.TintFilmYears), ("tintInstallYears", before.TintInstallYears, s.TintInstallYears),
            ("ppfFilmYears", before.PpfFilmYears, s.PpfFilmYears), ("ppfInstallYears", before.PpfInstallYears, s.PpfInstallYears),
            ("warrantyCodeLength", before.WarrantyCodeLength, s.WarrantyCodeLength));
        if (changes.Count > 0) AuditLog.Add(db, Actor, "settings", "coverage", "updated", changes);
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }
}

public record LoginRequest(string Password, string Username);

public class WarrantySearch
{
    public string? Q { get; set; }
    public string? Status { get; set; }
    public string? Type { get; set; }
    public bool? Flagged { get; set; }
    public string? Flag { get; set; }
    public string? Make { get; set; }
    public string? Installer { get; set; }
    public DateOnly? InstalledFrom { get; set; }
    public DateOnly? InstalledTo { get; set; }
    public DateOnly? CreatedFrom { get; set; }
    public DateOnly? CreatedTo { get; set; }
    public int? ExpiringDays { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
    public string? Sort { get; set; }
    public string? Dir { get; set; }
}

public class RollSearch
{
    public string? Q { get; set; }
    public string? Model { get; set; }
    public string? Batch { get; set; }
    public string? Supplier { get; set; }
    public string? Type { get; set; }
    public string? Qc { get; set; }
    public string? Status { get; set; }
    public DateOnly? ReceivedFrom { get; set; }
    public DateOnly? ReceivedTo { get; set; }
    public bool? HasInstalls { get; set; }
    public string? Location { get; set; }   // "warehouse:{id}" or "user:{id}"
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 25;
    public string? Sort { get; set; }
    public string? Dir { get; set; }
}
public record DecisionRequest(string Status, string? Note);
public record UpdateRollRequest(string? Status, string? Qc, string? Note, string? Batch = null, string? Supplier = null, decimal? WidthCm = null, decimal? LengthM = null, string? RollNo = null, string? Location = null);
public record RollLocation(string Kind, int Id, string Name, string? Phone);
public record SettingsRequest(DurationsDto? Durations, int? WarrantyCodeLength);
public record DurationsDto(PeriodDto? Tint, PeriodDto? Ppf);
public record PeriodDto(int? Film, int? Install);
