using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.OutputCaching;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

[ApiController, Route("api/admin"), Authorize(Policy = "StaffPolicy")]
public class ManagementController(AppDbContext db) : ControllerBase
{
    static readonly Dictionary<string, System.Linq.Expressions.Expression<Func<Product, object>>> ProductSort = new()
    {
        ["code"] = p => p.Code, ["name"] = p => p.Name, ["series"] = p => p.Series, ["type"] = p => p.Type, ["updatedAt"] = p => p.UpdatedAt,
    };

    [HttpGet("products"), Perm("products.view", "rolls.view", "reports.view")]
    public async Task<IActionResult> Products([FromQuery] ProductSearch f, CancellationToken ct)
    {
        var query = db.Products.AsNoTracking();
        if (Paging.Term(f.Q) is { } q) query = query.Where(p => p.Code.Contains(q) || p.Name.Contains(q) || p.Series.Contains(q) || p.Description.Contains(q));
        if (Paging.Term(f.Series) is { } series) query = query.Where(p => p.Series == series);
        if (!string.IsNullOrEmpty(f.Type) && Enum.TryParse<WarrantyType>(f.Type, true, out var t) && Enum.IsDefined(t)) query = query.Where(p => p.Type == t);
        if (f.Availability == "active") query = query.Where(p => !p.Archived);
        if (f.Availability == "archived") query = query.Where(p => p.Archived);
        var page = new PageQuery(f.Page, f.PageSize, f.Sort, f.Dir ?? "asc");
        var result = await query.OrderBy(f.Sort, page.Desc, ProductSort, "code").ToPage(page, ct);
        var seriesList = await db.Products.AsNoTracking().Where(p => p.Series != "").Select(p => p.Series).Distinct().OrderBy(x => x).ToListAsync(ct);
        return Ok(new { items = result.Items, total = result.Total, page = result.Page, pageSize = result.PageSize, series = seriesList });
    }

    async Task EvictCatalog()
    {
        var services = HttpContext?.RequestServices;
        if (services?.GetService<IOutputCacheStore>() is { } store)
            await store.EvictByTagAsync(CatalogCache.Tag, default);

        // Ask the Next.js server to drop its cached catalog pages (server-to-server, shared secret).
        var cfg = services?.GetService<IConfiguration>();
        var secret = cfg?["Frontend:RevalidateSecret"] ?? Environment.GetEnvironmentVariable("SOLARZED_REVALIDATE_SECRET");
        if (cfg == null || string.IsNullOrEmpty(secret) || secret.Length < 16) return;
        var url = cfg["Frontend:RevalidateUrl"] ?? $"{(cfg["FrontendOrigin"] ?? "http://localhost:3000").TrimEnd('/')}/api/internal/revalidate";
        try
        {
            using var http = services!.GetRequiredService<IHttpClientFactory>().CreateClient();
            http.Timeout = TimeSpan.FromSeconds(3);
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Headers.Add("X-Revalidate-Secret", secret);
            using var _ = await http.SendAsync(request);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            // The site falls back to its 60-second cache window.
        }
    }

    [HttpPost("products"), Perm("products.edit")]
    public async Task<IActionResult> Create(ProductRequest req)
    {
        // The code is the numeric item code entered by the admin (e.g. 1015); it also goes into every roll ID.
        // Products created before codes were numeric keep their original code.
        var error = req.Code is { } c && !System.Text.RegularExpressions.Regex.IsMatch(c.Trim(), "^[0-9]{1,12}$")
            ? "Product code must be 1–12 digits." : Validate(req, requireType: true);
        if (error != null) return BadRequest(new { error });
        var code = req.Code!.Trim().ToUpperInvariant();
        if (await db.Products.AnyAsync(p => p.Code == code)) return Conflict(new { error = "Product code already exists." });
        if (await NameTaken(req.Name, null)) return Conflict(new { error = "Product name already exists." });
        var product = new Product { Code = code };
        Apply(product, req);
        db.Products.Add(product);
        AuditLog.Add(db, AuditLog.Actor(HttpContext?.User), "product", code, "created", AuditLog.Diff(
            ("name", null, product.Name), ("type", null, product.Type), ("series", null, product.Series),
            ("description", null, product.Description), ("archived", null, product.Archived)));
        await db.SaveChangesAsync();
        await EvictCatalog();
        return Ok(product);
    }

    [HttpPut("products/{code}"), Perm("products.edit")]
    public async Task<IActionResult> Update(string code, ProductRequest req)
    {
        // Rename requests carry only {code, name}: type, series and specs may be absent.
        var error = Validate(req, requireType: false);
        if (error != null) return BadRequest(new { error });
        var product = await db.Products.FindAsync(code);
        if (product == null) return NotFound();
        if (!string.Equals(code, req.Code!.Trim(), StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Product code cannot change; delete it and create a new product." });
        // Only the product name is editable. Type, series, description and the technical specs are fixed at
        // creation: to change them, delete the product and create it again.
        if (await NameTaken(req.Name, product.Code)) return Conflict(new { error = "Product name already exists." });
        var before = product.Name;
        product.Name = req.Name.Trim();
        product.UpdatedAt = DateTime.UtcNow;
        if (before != product.Name)
            AuditLog.Add(db, AuditLog.Actor(HttpContext?.User), "product", product.Code, "updated", AuditLog.Diff(("name", before, product.Name)));
        await db.SaveChangesAsync();
        await EvictCatalog();
        return Ok(product);
    }

    /// <summary>Deletes a product. Blocked while any roll still references the model code.</summary>
    [HttpDelete("products/{code}"), Perm("products.edit")]
    public async Task<IActionResult> Delete(string code)
    {
        var product = await db.Products.FindAsync(code);
        if (product == null) return NotFound();
        if (await db.Rolls.AnyAsync(r => r.ModelCode == code))
            return Conflict(new { error = "This product has rolls in inventory; delete or void its rolls first." });
        AuditLog.Add(db, AuditLog.Actor(HttpContext?.User), "product", code, "deleted", AuditLog.Diff(
            ("name", product.Name, null), ("type", product.Type, null), ("series", product.Series, null)));
        db.Products.Remove(product);
        await db.SaveChangesAsync();
        await EvictCatalog();
        return Ok(new { ok = true });
    }

    /// <summary>Product names are unique too (trimmed, case-insensitive); <paramref name="exceptCode"/> skips the product being renamed.</summary>
    Task<bool> NameTaken(string name, string? exceptCode)
    {
        var normalized = name.Trim().ToLower();
        return db.Products.AnyAsync(p => p.Code != exceptCode && p.Name.ToLower() == normalized);
    }

    static string? Validate(ProductRequest r, bool requireType = true)
    {
        if (string.IsNullOrWhiteSpace(r.Code) || !System.Text.RegularExpressions.Regex.IsMatch(r.Code!.Trim(), "^[A-Za-z0-9-]{1,24}$")) return "Code must be 1–24 letters, numbers or hyphens.";
        if (string.IsNullOrWhiteSpace(r.Name) || r.Name.Trim().Length > 120) return "Product name is required (maximum 120 characters).";
        if (requireType && (!Enum.TryParse<WarrantyType>(r.Type, true, out var type) || !Enum.IsDefined(type))) return "Invalid product type.";
        if ((r.Series?.Length ?? 0) > 80 || (r.Description?.Length ?? 0) > 2000) return "Series or description is too long.";
        if (r.ThicknessMil is { } thick && (thick <= 0 || thick > 20)) return "Thickness must be between 0 and 20 mil.";
        if (r.Vlt is { } vlt && vlt is < 0 or > 100) return "VLT must be 0–100%.";
        if (r.Irr is { } irr && irr is < 0 or > 100) return "IRR must be 0–100%.";
        if (r.Uv is { } uv && uv is < 0 or > 100) return "UV must be 0–100%.";
        if (r.Tser is { } tser && tser is < 0 or > 100) return "TSER must be 0–100%.";
        if (r.WarrantyYears is { } wy && wy is < 1 or > 30) return "Warranty years must be 1–30.";
        return null;
    }
    static void Apply(Product p, ProductRequest r)
    {
        p.Name = r.Name.Trim(); p.Type = Enum.Parse<WarrantyType>(r.Type!, true);
        p.Series = r.Series?.Trim() ?? ""; p.Description = r.Description?.Trim() ?? "";
        p.Archived = r.Archived; p.UpdatedAt = DateTime.UtcNow;
        p.ThicknessMil = r.ThicknessMil; p.Vlt = r.Vlt; p.Irr = r.Irr;
        p.Uv = r.Uv; p.Tser = r.Tser; p.WarrantyYears = r.WarrantyYears;
    }

    // ── Warehouses ──────────────────────────────────────────────────────────

    /// <summary>All warehouses with how many rolls are in each (rolls held by a user are not counted).</summary>
    [HttpGet("warehouses"), Perm("warehouses.view", "rolls.view")]
    public async Task<IActionResult> Warehouses(CancellationToken ct)
    {
        var counts = await db.Rolls.Where(r => r.WarehouseId != null && r.HolderUserId == null)
            .GroupBy(r => r.WarehouseId!.Value).Select(g => new { Id = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Id, x => x.Count, ct);
        var items = await db.Warehouses.AsNoTracking().OrderBy(w => w.Archived).ThenBy(w => w.Name).ToListAsync(ct);
        return Ok(new { items = items.Select(w => new { w.Id, w.Name, w.Address, w.Archived, Rolls = counts.GetValueOrDefault(w.Id, 0) }) });
    }

    [HttpPost("warehouses"), Perm("warehouses.edit")]
    public async Task<IActionResult> CreateWarehouse(WarehouseRequest req)
    {
        if (await ValidateWarehouse(req, null) is { } error) return BadRequest(new { error });
        var w = new Warehouse { Name = req.Name.Trim(), Address = req.Address?.Trim() ?? "", Archived = req.Archived };
        db.Warehouses.Add(w);
        await db.SaveChangesAsync();
        AuditLog.Add(db, AuditLog.Actor(HttpContext?.User), "warehouse", w.Id.ToString(), "created", AuditLog.Diff(("name", null, w.Name), ("address", null, w.Address)));
        await db.SaveChangesAsync();
        return Ok(w);
    }

    [HttpPut("warehouses/{id:int}"), Perm("warehouses.edit")]
    public async Task<IActionResult> UpdateWarehouse(int id, WarehouseRequest req)
    {
        var w = await db.Warehouses.FindAsync(id);
        if (w == null) return NotFound();
        if (await ValidateWarehouse(req, id) is { } error) return BadRequest(new { error });
        AuditLog.Add(db, AuditLog.Actor(HttpContext?.User), "warehouse", id.ToString(), "updated", AuditLog.Diff(
            ("name", w.Name, req.Name.Trim()), ("address", w.Address, req.Address?.Trim() ?? ""), ("archived", w.Archived, req.Archived)));
        w.Name = req.Name.Trim(); w.Address = req.Address?.Trim() ?? ""; w.Archived = req.Archived;
        await db.SaveChangesAsync();
        return Ok(w);
    }

    /// <summary>Deletes a warehouse. Blocked while any roll is recorded there; archive it instead.</summary>
    [HttpDelete("warehouses/{id:int}"), Perm("warehouses.edit")]
    public async Task<IActionResult> DeleteWarehouse(int id)
    {
        var w = await db.Warehouses.FindAsync(id);
        if (w == null) return NotFound();
        if (await db.Rolls.AnyAsync(r => r.WarehouseId == id))
            return Conflict(new { error = "Rolls are recorded in this warehouse; move them or archive the warehouse instead." });
        AuditLog.Add(db, AuditLog.Actor(HttpContext?.User), "warehouse", id.ToString(), "deleted", AuditLog.Diff(("name", w.Name, null)));
        db.Warehouses.Remove(w);
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    async Task<string?> ValidateWarehouse(WarehouseRequest r, int? exceptId)
    {
        var name = r.Name?.Trim() ?? "";
        if (name.Length is 0 or > 100) return "Warehouse name is required (maximum 100 characters).";
        if ((r.Address?.Length ?? 0) > 300) return "Address is limited to 300 characters.";
        var lower = name.ToLower();
        if (await db.Warehouses.AnyAsync(w => w.Id != exceptId && w.Name.ToLower() == lower)) return "A warehouse with this name already exists.";
        return null;
    }

    // The customer list is confidential: only the super administrator may read it.
    [HttpGet("customers"), Perm("customers.view")]
    public async Task<IActionResult> Customers([FromQuery] CustomerSearch f, CancellationToken ct)
    {
        var query = db.WarrantyRegistrations.AsNoTracking();
        if (Paging.Term(f.Q) is { } q) query = query.Where(w => w.Phone.Contains(q) || w.Owner.Contains(q) || w.Vin.Contains(q) || w.Plate.Contains(q) || w.Code.Contains(q));
        if (Paging.Term(f.Make) is { } make) query = query.Where(w => w.Make.Contains(make) || w.Model.Contains(make));
        if (!string.IsNullOrEmpty(f.Status) && Enum.TryParse<WarrantyStatus>(f.Status, true, out var s) && Enum.IsDefined(s)) query = query.Where(w => w.Status == s);
        if (!string.IsNullOrEmpty(f.Type) && Enum.TryParse<WarrantyType>(f.Type, true, out var t) && Enum.IsDefined(t)) query = query.Where(w => w.Type == t);
        if (f.InstalledFrom is { } from) query = query.Where(w => w.Installed >= from);
        if (f.InstalledTo is { } to) query = query.Where(w => w.Installed <= to);
        if (Paging.Term(f.Installer) is { } installer) query = query.Where(w => w.Installer.Contains(installer) || (w.InstallerPhone != null && w.InstallerPhone.Contains(installer)));
        if (Paging.Term(f.Country) is { } country) query = query.Where(w => w.Country != null && w.Country.Contains(country));
        if (f.CreatedFrom is { } cFrom) { var start = cFrom.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc); query = query.Where(w => w.CreatedAt >= start); }
        if (f.CreatedTo is { } cTo) { var end = cTo.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc); query = query.Where(w => w.CreatedAt < end); }
        if (f.ExpiringDays is > 0 and <= 3650)
        {
            var today = DateOnly.FromDateTime(DateTime.UtcNow); var until = today.AddDays(f.ExpiringDays.Value);
            query = query.Where(w => w.FilmEnds != null && w.FilmEnds >= today && w.FilmEnds <= until);
        }

        // Page over distinct customers (mobile numbers), newest activity first; return each customer's full history.
        var grouped = query.GroupBy(w => w.Phone).Select(g => new { Phone = g.Key, Last = g.Max(w => w.CreatedAt) });
        var page = new PageQuery(f.Page, f.PageSize);
        var total = await grouped.CountAsync(ct);
        var phones = await grouped.OrderByDescending(g => g.Last).Skip((page.SafePage - 1) * page.SafeSize).Take(page.SafeSize).Select(g => g.Phone).ToListAsync(ct);
        var items = await db.WarrantyRegistrations.AsNoTracking().Where(w => phones.Contains(w.Phone))
            .OrderByDescending(w => w.CreatedAt).Select(w => new { w.Code, w.Owner, w.Phone, w.Make, w.Model, w.Vin, w.Plate, w.Type, w.Installed, w.Status, w.FilmEnds,
                w.Installer, w.Country, w.FilmSerial, w.InvoiceNumber, w.CreatedAt }).ToListAsync(ct);
        return Ok(new { items, total, page = page.SafePage, pageSize = page.SafeSize, phones });
    }
}
public class ProductSearch
{
    public string? Q { get; set; }
    public string? Series { get; set; }
    public string? Type { get; set; }
    public string? Availability { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 50;
    public string? Sort { get; set; }
    public string? Dir { get; set; }
}
public class CustomerSearch
{
    public string? Q { get; set; }
    public string? Make { get; set; }
    public string? Status { get; set; }
    public string? Type { get; set; }
    public DateOnly? InstalledFrom { get; set; }
    public DateOnly? InstalledTo { get; set; }
    public string? Installer { get; set; }
    public string? Country { get; set; }
    public DateOnly? CreatedFrom { get; set; }
    public DateOnly? CreatedTo { get; set; }
    public int? ExpiringDays { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}
public record ProductRequest(string? Code, string Name, string? Type, string? Series, string? Description, bool Archived,
    decimal? ThicknessMil = null, int? Vlt = null, int? Irr = null, int? Uv = null, int? Tser = null, int? WarrantyYears = null);
public record ChangePasswordRequest(string Username, string CurrentPassword, string NewPassword);

public record WarehouseRequest(string Name, string? Address = null, bool Archived = false);
