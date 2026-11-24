using System.Collections.Concurrent;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Application;

public record PermissionItem(string Key, string Label);
public record PermissionPage(string Page, string Label, PermissionItem[] Items);

/// <summary>
/// Page and in-page permissions for the staff roles. The super administrator (مدیر کل) decides, per role, which pages a
/// manager (مدیر) or counter (کانتر) sees and what they may change there; the super administrator always has everything.
/// The API enforces every permission with <see cref="PermAttribute"/>; the admin UI only hides what the API would refuse.
/// </summary>
public static class Permissions
{
    public const string ClaimType = "perm";
    public const string PolicyPrefix = "perm:";
    public static readonly string[] EditableRoles = ["admin", "counter"];
    public static readonly string[] StaffRoles = ["superadmin", "admin", "counter"];

    public static readonly PermissionPage[] Catalog =
    [
        new("overview", "نمای کلی", [new("overview.view", "دیدن صفحه")]),
        new("reports", "گزارش‌ها", [new("reports.view", "دیدن گزارش‌ها و خروجی CSV")]),
        new("warranties", "گارانتی‌ها", [
            new("warranties.view", "دیدن لیست گارانتی‌ها و عکس‌ها"),
            new("warranties.edit", "تأیید / رد گارانتی و ارسال دوباره کارت طلایی")]),
        new("review", "بررسی عکس‌ها", [
            new("review.view", "دیدن ثبت‌های نصاب‌ها و عکس‌ها"),
            new("review.edit", "تأیید / رد عکس‌های نصب")]),
        new("partners", "همکاران", [
            new("partners.view", "دیدن همکاران"),
            new("partners.edit", "افزودن همکار و تغییر وضعیت")]),
        new("claims", "ادعاها", [
            new("claims.view", "دیدن ادعاها"),
            new("claims.edit", "ثبت و پیگیری ادعا")]),
        new("tickets", "تیکت‌ها", [
            new("tickets.view", "دیدن تیکت‌ها"),
            new("tickets.edit", "پاسخ، بستن و بازکردن تیکت")]),
        new("rolls", "رول‌ها", [
            new("rolls.view", "دیدن لیست و تاریخچه رول‌ها"),
            new("rolls.edit", "ویرایش موجودی، وضعیت و انتقال رول"),
            new("rolls.create", "دریافت (ثبت) رول جدید"),
            new("rolls.delete", "حذف رول")]),
        new("warehouses", "انبارها", [
            new("warehouses.view", "دیدن انبارها"),
            new("warehouses.edit", "افزودن، ویرایش و حذف انبار")]),
        new("products", "محصولات", [
            new("products.view", "دیدن محصولات"),
            new("products.edit", "افزودن، ویرایش و حذف محصول")]),
        new("customers", "مشتریان (محرمانه)", [new("customers.view", "دیدن لیست مشتریان")]),
        new("labels", "برچسب‌ها و کارتن‌ها", [
            new("labels.view", "دیدن سریال کارتن‌ها"),
            new("labels.edit", "صدور کارت گارانتی و دیدن جزئیات کامل"),
            new("labels.transfer", "انتقال کارتن به نماینده / نصاب")]),
        new("history", "سابقه تغییرات", [new("history.view", "دیدن سابقه تغییرات")]),
        new("sms", "پیامک", [
            new("sms.view", "دیدن تنظیمات و گزارش پیامک"),
            new("sms.edit", "تغییر تنظیمات و ارسال پیامک")]),
        new("settings", "تنظیمات", [
            new("settings.view", "دیدن تنظیمات"),
            new("settings.edit", "تغییر تنظیمات پوشش گارانتی")]),
        new("confidential", "اطلاعات محرمانه", [
            new("codes.view", "دیدن کد کامل گارانتی و شناسه رول (و ویرایش Batch، تأمین‌کننده و ابعاد)")]),
    ];

    public static readonly HashSet<string> All = Catalog.SelectMany(p => p.Items).Select(i => i.Key).ToHashSet();

    /// <summary>What each role could do before permissions became editable; used until the super administrator saves a change.</summary>
    public static IReadOnlySet<string> Defaults(string role) => role switch
    {
        "superadmin" => All,
        "admin" => All.Where(k => !k.StartsWith("customers.") && !k.StartsWith("review.") && k is not ("rolls.create" or "rolls.delete" or "codes.view")).ToHashSet(),
        "counter" => new HashSet<string> { "review.view", "review.edit", "labels.view", "labels.transfer" },
        _ => new HashSet<string>(),
    };

    /// <summary>Drops unknown keys and adds a page's view permission whenever anything else on that page is granted.</summary>
    public static HashSet<string> Normalize(IEnumerable<string>? keys)
    {
        var set = (keys ?? []).Where(All.Contains).ToHashSet();
        foreach (var page in Catalog)
        {
            var view = page.Items[0].Key;
            if (view.EndsWith(".view") && page.Items.Skip(1).Any(i => set.Contains(i.Key))) set.Add(view);
        }
        return set;
    }

    public static bool Has(ClaimsPrincipal? user, string key) =>
        user != null && (user.IsInRole("superadmin") || user.HasClaim(ClaimType, key));
}

/// <summary>Allows the action when the signed-in staff member has any one of the listed permissions.</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class PermAttribute(params string[] keys) : AuthorizeAttribute(Permissions.PolicyPrefix + string.Join('|', keys))
{
    public IReadOnlyList<string> Keys { get; } = keys;
}

/// <summary>Builds the "perm:a|b" policies on demand; everything else goes to the policies registered in Program.cs.</summary>
public class PermissionPolicyProvider(IOptions<AuthorizationOptions> options) : DefaultAuthorizationPolicyProvider(options)
{
    readonly ConcurrentDictionary<string, AuthorizationPolicy> built = new();

    public override Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        if (!policyName.StartsWith(Permissions.PolicyPrefix, StringComparison.Ordinal)) return base.GetPolicyAsync(policyName);
        var policy = built.GetOrAdd(policyName, name =>
        {
            var keys = name[Permissions.PolicyPrefix.Length..].Split('|', StringSplitOptions.RemoveEmptyEntries);
            return new AuthorizationPolicyBuilder()
                .RequireRole(Permissions.StaffRoles)
                .RequireAssertion(ctx => ctx.User.IsInRole("superadmin") || keys.Any(k => ctx.User.HasClaim(Permissions.ClaimType, k)))
                .Build();
        });
        return Task.FromResult<AuthorizationPolicy?>(policy);
    }
}

/// <summary>The saved permission sets, cached briefly so the per-request token check stays cheap.</summary>
public class PermissionStore(TimeProvider clock)
{
    static readonly TimeSpan Ttl = TimeSpan.FromSeconds(30);
    readonly ConcurrentDictionary<string, (IReadOnlySet<string> Keys, DateTimeOffset At)> cache = new();

    public async Task<IReadOnlySet<string>> For(string role, AppDbContext db, CancellationToken ct = default)
    {
        if (role == "superadmin") return Permissions.All;
        var now = clock.GetUtcNow();
        if (cache.TryGetValue(role, out var hit) && now - hit.At < Ttl) return hit.Keys;
        var json = await db.RolePermissions.AsNoTracking().Where(r => r.Role == role).Select(r => r.PermissionsJson).FirstOrDefaultAsync(ct);
        var keys = json == null ? Permissions.Defaults(role) : Permissions.Normalize(JsonSerializer.Deserialize<string[]>(json));
        cache[role] = (keys, now);
        return keys;
    }

    public void Invalidate() => cache.Clear();
}
