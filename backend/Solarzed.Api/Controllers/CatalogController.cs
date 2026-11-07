using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

public static class CatalogCache
{
    public const string Tag = "catalog";
    public const string Policy = "catalog";
}

[ApiController, Route("api/catalog")]
public class CatalogController(AppDbContext db) : ControllerBase
{
    // Server-side output cache (evicted whenever an administrator saves a product) plus a
    // short public cache window so CDNs and the Next.js server can reuse the response.
    [HttpGet]
    [OutputCache(PolicyName = CatalogCache.Policy)]
    [ResponseCache(Duration = 30, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> Get() => Ok(await db.Products.AsNoTracking()
        .Where(p => !p.Archived).OrderBy(p => p.Series).ThenBy(p => p.Code)
        .Select(p => new { p.Code, p.Name, p.Type, p.Series, p.Description }).ToListAsync());
}
