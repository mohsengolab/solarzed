using System.Reflection;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Solarzed.Api.Application;
using Solarzed.Api.Controllers;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Tests;

public class PermissionsTests
{
    static AppDbContext Database() => new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    static ClaimsPrincipal Staff(string role, params string[] perms)
    {
        var user = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, role + "-user"), new Claim(ClaimTypes.Role, role)], "test"));
        user.AddIdentity(new ClaimsIdentity(perms.Select(p => new Claim(Permissions.ClaimType, p))));
        return user;
    }

    static async Task<bool> Allowed(ClaimsPrincipal user, params string[] keys)
    {
        var services = new ServiceCollection().AddLogging().AddAuthorization()
            .AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>().BuildServiceProvider();
        var auth = services.GetRequiredService<IAuthorizationService>();
        return (await auth.AuthorizeAsync(user, null, new PermAttribute(keys).Policy!)).Succeeded;
    }

    static IEnumerable<MethodInfo> Actions(Type controller) =>
        controller.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => m.GetCustomAttributes().Any(a => a is Microsoft.AspNetCore.Mvc.Routing.HttpMethodAttribute));

    [Fact]
    public void EveryPermissionUsedByTheApiIsInTheCatalog()
    {
        var used = typeof(PermAttribute).Assembly.GetTypes().Where(t => typeof(ControllerBase).IsAssignableFrom(t))
            .SelectMany(t => Actions(t).SelectMany(m => m.GetCustomAttributes<PermAttribute>()).Concat(t.GetCustomAttributes<PermAttribute>()))
            .SelectMany(a => a.Keys).Distinct().ToArray();
        Assert.NotEmpty(used);
        Assert.All(used, k => Assert.Contains(k, Permissions.All));
    }

    [Fact]
    public void EveryStaffActionIsGuardedByAPermission()
    {
        // Open to any signed-in staff member: their own session and password, and the read-only coverage durations.
        var open = new HashSet<string> { "AdminController.Login", "AdminController.Session", "AdminController.Logout", "AdminController.GetSettings", "AccountController.Password" };
        var missing = typeof(PermAttribute).Assembly.GetTypes()
            .Where(t => typeof(ControllerBase).IsAssignableFrom(t) && t.GetCustomAttribute<AuthorizeAttribute>()?.Policy == "StaffPolicy")
            .SelectMany(t => Actions(t).Select(m => (t, m)))
            .Where(x => !x.m.GetCustomAttributes<PermAttribute>().Any() && !open.Contains($"{x.t.Name}.{x.m.Name}"))
            .Select(x => $"{x.t.Name}.{x.m.Name}").ToArray();
        Assert.Empty(missing);
    }

    [Fact]
    public void DefaultsKeepTodaysAccess()
    {
        var admin = Permissions.Defaults("admin");
        Assert.Contains("rolls.edit", admin);
        Assert.DoesNotContain("customers.view", admin);
        Assert.DoesNotContain("rolls.delete", admin);
        Assert.DoesNotContain("codes.view", admin);
        Assert.Equal(["labels.transfer", "labels.view", "review.edit", "review.view"], Permissions.Defaults("counter").Order());
    }

    [Fact]
    public void GrantingAnActionAlsoShowsItsPage()
    {
        var set = Permissions.Normalize(["rolls.delete", "nonsense"]);
        Assert.Equal(["rolls.delete", "rolls.view"], set.Order());
    }

    [Fact]
    public async Task PoliciesFollowTheRolesPermissions()
    {
        Assert.True(await Allowed(Staff("counter", "rolls.view"), "rolls.view"));
        Assert.False(await Allowed(Staff("counter", "rolls.view"), "rolls.edit"));
        Assert.True(await Allowed(Staff("admin", "reports.view"), "rolls.view", "reports.view"));   // any one of them
        Assert.True(await Allowed(Staff("superadmin"), "rolls.delete"));                            // always everything
        // A portal (customer) account never passes, even with a forged claim.
        Assert.False(await Allowed(Staff("customer", "rolls.view"), "rolls.view"));
    }

    [Fact]
    public void CodesFollowThePermission()
    {
        Assert.False(Confidential.SeesCodes(Staff("admin")));
        Assert.True(Confidential.SeesCodes(Staff("admin", "codes.view")));
        Assert.True(Confidential.SeesCodes(Staff("superadmin")));
    }

    [Fact]
    public async Task SuperAdminSavesARolesPermissions()
    {
        using var db = Database();
        var store = new PermissionStore(TimeProvider.System);
        var api = new PermissionsController(db, store) { ControllerContext = new() { HttpContext = new Microsoft.AspNetCore.Http.DefaultHttpContext { User = Staff("superadmin") } } };

        Assert.Equal(Permissions.Defaults("counter").Order(), (await store.For("counter", db)).Order());   // nothing saved yet
        Assert.IsType<BadRequestObjectResult>(await api.Save("superadmin", new(["rolls.view"])));
        Assert.IsType<BadRequestObjectResult>(await api.Save("counter", new(["rolls.fly"])));

        Assert.IsType<OkObjectResult>(await api.Save("counter", new(["rolls.edit", "labels.view"])));
        Assert.Equal(["labels.view", "rolls.edit", "rolls.view"], (await store.For("counter", db)).Order());
        var audit = await db.AuditEntries.SingleAsync();
        Assert.Equal(("role", "counter", "permissionsChanged"), (audit.EntityType, audit.EntityId, audit.Action));

        // Everything can be taken away.
        Assert.IsType<OkObjectResult>(await api.Save("counter", new([])));
        Assert.Empty(await store.For("counter", db));
    }
}
