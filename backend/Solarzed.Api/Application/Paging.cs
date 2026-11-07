using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;

namespace Solarzed.Api.Application;

// Shared paging/sorting for admin search endpoints. Page size is capped server-side
// so a client cannot request unbounded result sets.
public record PageQuery(int Page = 1, int PageSize = 25, string? Sort = null, string? Dir = null)
{
    public const int MaxPageSize = 200;
    public int SafePage => Math.Max(1, Page);
    public int SafeSize => Math.Clamp(PageSize, 1, MaxPageSize);
    public bool Desc => !string.Equals(Dir, "asc", StringComparison.OrdinalIgnoreCase);
}

public record PagedResult<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

public static class Paging
{
    public const int MaxSearchLength = 100;

    // Search terms are trimmed and capped; returns null when empty.
    public static string? Term(string? q)
    {
        if (string.IsNullOrWhiteSpace(q)) return null;
        var t = q.Trim();
        return t.Length > MaxSearchLength ? t[..MaxSearchLength] : t;
    }

    public static IQueryable<T> OrderBy<T>(this IQueryable<T> query, string? sort, bool desc,
        IReadOnlyDictionary<string, Expression<Func<T, object>>> columns, string fallback)
    {
        var key = sort != null && columns.ContainsKey(sort) ? sort : fallback;
        var column = columns[key];
        return desc ? query.OrderByDescending(column) : query.OrderBy(column);
    }

    public static async Task<PagedResult<T>> ToPage<T>(this IQueryable<T> query, PageQuery page, CancellationToken ct = default)
    {
        var total = await query.CountAsync(ct);
        var items = await query.Skip((page.SafePage - 1) * page.SafeSize).Take(page.SafeSize).ToListAsync(ct);
        return new PagedResult<T>(items, total, page.SafePage, page.SafeSize);
    }
}
