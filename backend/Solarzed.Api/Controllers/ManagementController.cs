using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.OutputCaching;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

[ApiController, Route("api/admin"), Authorize(Policy = "AdminPolicy")]
public class ManagementController(AppDbContext db) : ControllerBase
{
    static readonly Dictionary<string, System.Linq.Expressions.Expression<Func<Product, object>>> ProductSort = new()
    {
        ["code"] = p => p.Code, ["name"] = p => p.Name, ["series"] = p => p.Series, ["type"] = p => p.Type, ["updatedAt"] = p => p.UpdatedAt,
    };

    [HttpGet("products")]
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

    [HttpPost("products")]
    public async Task<IActionResult> Create(ProductRequest req)
    {
        var error = Validate(req);
        if (error != null) return BadRequest(new { error });
        var code = req.Code.Trim().ToUpperInvariant();
        if (await db.Products.AnyAsync(p => p.Code == code)) return Conflict(new { error = "Product code already exists." });
        var product = new Product { Code = code };
        Apply(product, req);
        db.Products.Add(product);
        await db.SaveChangesAsync();
        await EvictCatalog();
        return Ok(product);
    }

    [HttpPut("products/{code}")]
    public async Task<IActionResult> Update(string code, ProductRequest req)
    {
        var error = Validate(req);
        if (error != null) return BadRequest(new { error });
        var product = await db.Products.FindAsync(code);
        if (product == null) return NotFound();
        if (!string.Equals(code, req.Code.Trim(), StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "Product code cannot change; archive it and create a new product." });
        var type = Enum.Parse<WarrantyType>(req.Type, true);
        if (type != product.Type && await db.Rolls.AnyAsync(r => r.ModelCode == code))
            return Conflict(new { error = "A product with inventory cannot change warranty type." });
        Apply(product, req);
        await db.SaveChangesAsync();
        await EvictCatalog();
        return Ok(product);
    }

    static string? Validate(ProductRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Code) || !System.Text.RegularExpressions.Regex.IsMatch(r.Code.Trim(), "^[A-Za-z0-9-]{1,24}$")) return "Code must be 1–24 letters, numbers or hyphens.";
        if (string.IsNullOrWhiteSpace(r.Name) || r.Name.Trim().Length > 120) return "Product name is required (maximum 120 characters).";
        if (!Enum.TryParse<WarrantyType>(r.Type, true, out var type) || !Enum.IsDefined(type)) return "Invalid product type.";
        if ((r.Series?.Length ?? 0) > 80 || (r.Description?.Length ?? 0) > 2000) return "Series or description is too long.";
        return null;
    }
    static void Apply(Product p, ProductRequest r)
    {
        p.Name = r.Name.Trim(); p.Type = Enum.Parse<WarrantyType>(r.Type, true);
        p.Series = r.Series?.Trim() ?? ""; p.Description = r.Description?.Trim() ?? "";
        p.Archived = r.Archived; p.UpdatedAt = DateTime.UtcNow;
    }

    [HttpGet("customers")]
    public async Task<IActionResult> Customers([FromQuery] CustomerSearch f, CancellationToken ct)
    {
        var query = db.WarrantyRegistrations.AsNoTracking();
        if (Paging.Term(f.Q) is { } q) query = query.Where(w => w.Phone.Contains(q) || w.Owner.Contains(q) || w.Vin.Contains(q) || w.Plate.Contains(q) || w.Code.Contains(q));
        if (Paging.Term(f.Make) is { } make) query = query.Where(w => w.Make.Contains(make) || w.Model.Contains(make));
        if (!string.IsNullOrEmpty(f.Status) && Enum.TryParse<WarrantyStatus>(f.Status, true, out var s) && Enum.IsDefined(s)) query = query.Where(w => w.Status == s);
        if (!string.IsNullOrEmpty(f.Type) && Enum.TryParse<WarrantyType>(f.Type, true, out var t) && Enum.IsDefined(t)) query = query.Where(w => w.Type == t);
        if (f.InstalledFrom is { } from) query = query.Where(w => w.Installed >= from);
        if (f.InstalledTo is { } to) query = query.Where(w => w.Installed <= to);

        // Page over distinct customers (mobile numbers), newest activity first; return each customer's full history.
        var grouped = query.GroupBy(w => w.Phone).Select(g => new { Phone = g.Key, Last = g.Max(w => w.CreatedAt) });
        var page = new PageQuery(f.Page, f.PageSize);
        var total = await grouped.CountAsync(ct);
        var phones = await grouped.OrderByDescending(g => g.Last).Skip((page.SafePage - 1) * page.SafeSize).Take(page.SafeSize).Select(g => g.Phone).ToListAsync(ct);
        var items = await db.WarrantyRegistrations.AsNoTracking().Where(w => phones.Contains(w.Phone))
            .OrderByDescending(w => w.CreatedAt).Select(w => new { w.Code, w.Owner, w.Phone, w.Make, w.Model, w.Vin, w.Plate, w.Type, w.Installed, w.Status, w.FilmEnds }).ToListAsync(ct);
        return Ok(new { items, total, page = page.SafePage, pageSize = page.SafeSize, phones });
    }

    [HttpPost("account/password")]
    public async Task<IActionResult> Password(ChangePasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Username) || string.IsNullOrEmpty(req.CurrentPassword) || req.NewPassword is null || req.NewPassword.Length < 12 || System.Text.Encoding.UTF8.GetByteCount(req.NewPassword) > 72)
            return BadRequest(new { error = "New password must have at least 12 characters and at most 72 UTF-8 bytes." });
        // A signed-in administrator can only change their own password.
        var current = HttpContext?.User.Identity?.Name;
        if (!string.IsNullOrEmpty(current) && !string.Equals(current, req.Username, StringComparison.Ordinal))
            return BadRequest(new { error = "Current credentials are incorrect." });
        var admin = await db.AdminUsers.FirstOrDefaultAsync(a => a.Username == req.Username);
        if (admin == null || !BCrypt.Net.BCrypt.Verify(req.CurrentPassword, admin.PasswordHash)) return BadRequest(new { error = "Current credentials are incorrect." });
        admin.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
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
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}
public record ProductRequest(string Code, string Name, string Type, string? Series, string? Description, bool Archived);
public record ChangePasswordRequest(string Username, string CurrentPassword, string NewPassword);
