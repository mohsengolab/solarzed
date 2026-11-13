using System.IO.Compression;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;
using Solarzed.Api.Application;
using Solarzed.Api.Controllers;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile(".local-sms.json", optional: true, reloadOnChange: true);
builder.WebHost.ConfigureKestrel(k =>
{
    k.AddServerHeader = false;
    k.Limits.MaxRequestBodySize = 1024 * 1024; // 1 MB; endpoints set tighter limits where relevant
});
builder.Services.AddDataProtection();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<LoginThrottle>();
builder.Services.AddSingleton<SmsLog>();
builder.Services.AddScoped<BoxLabelService>();
builder.Services.AddHttpClient<IActivationSmsSender, ActivationSmsSender>(client => client.Timeout = TimeSpan.FromSeconds(15));

static string ClientKey(HttpContext context) => context.Connection.RemoteIpAddress?.ToString() ?? "local";
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.OnRejected = async (ctx, ct) =>
    {
        if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
            ctx.HttpContext.Response.Headers.RetryAfter = ((int)retry.TotalSeconds).ToString();
        await ctx.HttpContext.Response.WriteAsJsonAsync(new { error = "Too many requests. Please slow down and try again shortly." }, ct);
    };
    // Baseline for every request, per client IP.
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context => RateLimitPartition.GetSlidingWindowLimiter(
        ClientKey(context), _ => new SlidingWindowRateLimiterOptions { PermitLimit = 600, Window = TimeSpan.FromMinutes(1), SegmentsPerWindow = 6, QueueLimit = 0 }));
    options.AddPolicy("activation", context => RateLimitPartition.GetFixedWindowLimiter(
        ClientKey(context), _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    options.AddPolicy("admin-login", context => RateLimitPartition.GetFixedWindowLimiter(
        ClientKey(context), _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(10), QueueLimit = 0 }));
    options.AddPolicy("sms-test", context => RateLimitPartition.GetFixedWindowLimiter(
        ClientKey(context), _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(10), QueueLimit = 0 }));
});

// ── Caching & compression ────────────────────────────────────────────────────
builder.Services.AddOutputCache(o => o.AddPolicy(CatalogCache.Policy, p => p.Expire(TimeSpan.FromMinutes(10)).Tag(CatalogCache.Tag)));
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true; // responses carrying secrets are no-store admin JSON, not reflected user input
    o.Providers.Add<BrotliCompressionProvider>();
    o.Providers.Add<GzipCompressionProvider>();
});
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);

// Behind a reverse proxy, set ReverseProxy:Enabled=true so rate limits see the real client IP.
if (builder.Configuration.GetValue<bool>("ReverseProxy:Enabled"))
    builder.Services.Configure<ForwardedHeadersOptions>(o =>
    {
        o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
        o.ForwardLimit = 1;
    });

// ── EF Core ──────────────────────────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("Default"))
       .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning)));

// ── JWT Auth ─────────────────────────────────────────────────────────────────
var jwtKey = builder.Configuration["Jwt:Key"]
    ?? Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32));
builder.Configuration["Jwt:Key"] = jwtKey;

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = true;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
            ValidateIssuer = true, ValidIssuer = AdminAuth.Issuer,
            ValidateAudience = true, ValidAudience = AdminAuth.Audience,
            ValidateLifetime = true, RequireExpirationTime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
        };
        o.Events = new JwtBearerEvents
        {
            // The admin UI authenticates with an HttpOnly cookie; scripts may still send a Bearer header.
            OnMessageReceived = ctx =>
            {
                if (string.IsNullOrEmpty(ctx.Request.Headers.Authorization) &&
                    ctx.Request.Cookies.TryGetValue(AdminAuth.Cookie, out var cookie))
                    ctx.Token = cookie;
                return Task.CompletedTask;
            },
            // Tokens issued before a password change, role change or deactivation are rejected.
            OnTokenValidated = async ctx =>
            {
                var name = ctx.Principal?.Identity?.Name;
                var stamp = ctx.Principal?.FindFirst(AdminAuth.StampClaim)?.Value;
                var role = ctx.Principal?.FindFirst(ClaimTypes.Role)?.Value;
                var db = ctx.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var account = name == null ? null : await db.AdminUsers
                    .Where(a => a.Username == name)
                    .Select(a => new { a.PasswordHash, a.Role, a.Active })
                    .FirstOrDefaultAsync();
                if (account == null || !account.Active || stamp != AdminAuth.Stamp(account.PasswordHash) || role != account.Role)
                    ctx.Fail("Session revoked.");
            },
        };
    });
builder.Services.AddAuthorization(opt =>
{
    opt.AddPolicy("AdminPolicy", p => p.RequireRole("admin"));
    opt.AddPolicy("CartonPolicy", p => p.RequireRole("carton"));
    opt.AddPolicy("StaffPolicy", p => p.RequireRole("admin", "carton"));
});

// ── Controllers & CORS ───────────────────────────────────────────────────────
builder.Services.AddControllers().AddJsonOptions(options =>
    options.JsonSerializerOptions.Converters.Add(
        new System.Text.Json.Serialization.JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase)));
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(
        builder.Configuration["FrontendOrigin"] ?? "http://localhost:3000",
        "http://localhost:4173"    // legacy static preview
    )
    .WithHeaders("Content-Type", "Authorization", "X-Requested-With")
    .WithMethods("GET", "POST", "PUT", "DELETE")
    .AllowCredentials()
    .SetPreflightMaxAge(TimeSpan.FromHours(1))));
builder.Services.AddHsts(o => { o.MaxAge = TimeSpan.FromDays(365); o.IncludeSubDomains = true; });

var app = builder.Build();

// ── Auto-migrate + seed admin ─────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    if (!db.AdminUsers.Any())
    {
        var pw = builder.Configuration["AdminPassword"]
            ?? Environment.GetEnvironmentVariable("SOLARZED_ADMIN_PASSWORD")
            ?? Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(8));
        db.AdminUsers.Add(new AdminUser { Username = "admin", Role = "admin", Active = true, PasswordHash = BCrypt.Net.BCrypt.HashPassword(pw) });
        db.SaveChanges();
        Console.WriteLine($"\n  SOLARZED ADMIN PASSWORD: {pw}\n");
    }

    // An explicit AdminPassword / SOLARZED_ADMIN_PASSWORD is authoritative: it also resets an
    // existing admin password, so the operator never has to know the original random one.
    var configured = builder.Configuration["AdminPassword"] ?? Environment.GetEnvironmentVariable("SOLARZED_ADMIN_PASSWORD");
    if (!string.IsNullOrWhiteSpace(configured))
    {
        var admin = db.AdminUsers.FirstOrDefault(a => a.Username == "admin");
        if (admin == null)
        {
            db.AdminUsers.Add(new AdminUser { Username = "admin", Role = "admin", Active = true, PasswordHash = BCrypt.Net.BCrypt.HashPassword(configured) });
            db.SaveChanges();
            Console.WriteLine("\n  SOLARZED ADMIN ACCOUNT CREATED FROM CONFIGURATION\n");
        }
        else if (!BCrypt.Net.BCrypt.Verify(configured, admin.PasswordHash))
        {
            admin.PasswordHash = BCrypt.Net.BCrypt.HashPassword(configured);
            admin.Role = "admin";
            admin.Active = true;
            db.SaveChanges();
            Console.WriteLine("\n  SOLARZED ADMIN PASSWORD UPDATED FROM CONFIGURATION\n");
        }
    }

    if (!db.CoverageSettings.Any())
    {
        db.CoverageSettings.Add(new CoverageSetting());
        db.SaveChanges();
    }
}

if (app.Configuration.GetValue<bool>("ReverseProxy:Enabled")) app.UseForwardedHeaders();
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler(e => e.Run(ctx => ctx.Response.WriteAsJsonAsync(new { error = "Unexpected server error." })));
    app.UseHsts();
}

// Security headers for every API response. The API only serves JSON, so the CSP forbids everything.
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h.XContentTypeOptions = "nosniff";
    h.XFrameOptions = "DENY";
    h.ContentSecurityPolicy = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
    h["Referrer-Policy"] = "no-referrer";
    h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()";
    h["Cross-Origin-Opener-Policy"] = "same-origin";
    h["Cross-Origin-Resource-Policy"] = "same-site";
    var path = ctx.Request.Path;
    if (path.StartsWithSegments("/api/admin") || path.StartsWithSegments("/api/activation"))
        ctx.Response.OnStarting(() => { ctx.Response.Headers.CacheControl = "no-store"; ctx.Response.Headers.Pragma = "no-cache"; return Task.CompletedTask; });

    // CSRF defence for cookie sessions: state-changing admin requests authenticated by the cookie must carry
    // the custom header that browsers only allow from same-origin scripts or CORS-approved origins.
    if (path.StartsWithSegments("/api/admin") && !HttpMethods.IsGet(ctx.Request.Method) && !HttpMethods.IsHead(ctx.Request.Method) &&
        !HttpMethods.IsOptions(ctx.Request.Method) && string.IsNullOrEmpty(ctx.Request.Headers.Authorization) &&
        ctx.Request.Cookies.ContainsKey(AdminAuth.Cookie) && ctx.Request.Headers["X-Requested-With"] != "fetch")
    {
        ctx.Response.StatusCode = 403;
        await ctx.Response.WriteAsJsonAsync(new { error = "Request blocked." });
        return;
    }
    await next();
});

app.UseResponseCompression();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseOutputCache();
app.MapControllers();

app.Run();
