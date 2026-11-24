using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Application;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Controllers;

/// <summary>
/// Public-site accounts for representatives, shops and customers: sign in with mobile + SMS code or email + email code,
/// keep a profile (name, country, city, job), see the cartons you hold, pass them on by scanning the carton barcode,
/// see your warranties, and open support tickets.
/// </summary>
[ApiController, Route("api/portal"), Authorize(Policy = "PortalPolicy"), RequestSizeLimit(65536)]
public class PortalController(PortalService portal, BoxTransferService transfers, AppDbContext db, IConfiguration cfg) : ControllerBase
{
    /// <summary>The signed-in account, resolved from the token's stable id claim.</summary>
    async Task<PortalUser> Me()
    {
        var id = PortalAuth.Id(User) ?? throw new ActivationError(401, "Please sign in again.");
        var user = await portal.ById(id) ?? throw new ActivationError(401, "Please sign in again.");
        if (!user.Active) throw new ActivationError(403, "This account is disabled. Please contact Solarzed support.");
        return user;
    }

    /// <summary>Email codes (sign-in and adding an email) are off unless Portal:EmailVerification is true.</summary>
    bool EmailVerification => cfg.GetValue("Portal:EmailVerification", false);
    ObjectResult EmailOff() => StatusCode(503, new { error = "Email verification is temporarily unavailable. Please sign in with your mobile number." });

    [AllowAnonymous, HttpPost("otp"), EnableRateLimiting("portal-otp")]
    public async Task<IActionResult> SendCode(PortalOtpRequest request, CancellationToken ct)
    {
        try
        {
            var channel = string.Equals(request.Channel, "email", StringComparison.OrdinalIgnoreCase) || (string.IsNullOrWhiteSpace(request.Phone) && !string.IsNullOrWhiteSpace(request.Email)) ? "email" : "sms";
            if (channel == "email" && !EmailVerification) return EmailOff();
            var identifier = channel == "email" ? request.Email : request.Phone;
            var challenge = await portal.SendCode(identifier ?? "", channel, ct);
            return Ok(new { challengeId = challenge.Id, phone = challenge.Phone, email = challenge.Email, channel,
                expiresAt = challenge.ExpiresAt, retryAfterSeconds = portal.Policy.ResendSeconds });
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
        catch (DbUpdateConcurrencyException) { return Conflict(new { error = "Please retry the verification request." }); }
    }

    [AllowAnonymous, HttpPost("login"), EnableRateLimiting("portal-otp")]
    public async Task<IActionResult> Login(PortalLoginRequest request)
    {
        try
        {
            var user = await portal.Verify(request.ChallengeId, request.Code);
            var token = PortalAuth.Token(user, cfg["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key missing"));
            Response.Cookies.Append(PortalAuth.Cookie, token, new CookieOptions
            {
                HttpOnly = true, Secure = Request.IsHttps, SameSite = SameSiteMode.Strict,
                Path = "/api", MaxAge = PortalAuth.Lifetime, IsEssential = true,
            });
            return Ok(PortalService.Shape(user));
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
        catch (DbUpdateException) { return Conflict(new { error = "Please retry signing in." }); }
    }

    [AllowAnonymous, HttpPost("logout")]
    public IActionResult Logout()
    {
        Response.Cookies.Delete(PortalAuth.Cookie, new CookieOptions { Path = "/api", Secure = Request.IsHttps, SameSite = SameSiteMode.Strict, HttpOnly = true });
        return Ok(new { ok = true });
    }

    [AllowAnonymous, HttpGet("me")]
    public async Task<IActionResult> Session()
    {
        var auth = await HttpContext.AuthenticateAsync(PortalAuth.Scheme);
        PortalMe? me = null;
        if (auth.Succeeded)
        {
            var id = PortalAuth.Id(auth.Principal);
            me = id.HasValue && await portal.ById(id.Value) is { Active: true } user ? PortalService.Shape(user) : null;
        }
        return Ok(new { user = me });
    }

    // ── Profile: who the user is, where they are and what they do ────────────

    [HttpPost("profile")]
    public async Task<IActionResult> Profile([FromBody] PortalProfileRequest request)
    {
        var me = await Me();
        PortalService.ApplyProfile(me, request);
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateConcurrencyException) { return Conflict(new { error = "Please retry saving your profile." }); }
        return Ok(PortalService.Shape(me));
    }

    [HttpPost("bind-phone")]
    public async Task<IActionResult> BindPhone([FromBody] PortalBindRequest request, CancellationToken ct)
    {
        try
        {
            var me = await Me();
            var challenge = await portal.SendBindCode(me, request.Identifier, "sms", ct);
            return Ok(new { challengeId = challenge.Id, expiresAt = challenge.ExpiresAt, retryAfterSeconds = portal.Policy.ResendSeconds });
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    [HttpPost("bind-phone/verify")]
    public async Task<IActionResult> VerifyPhone([FromBody] PortalBindVerifyRequest request)
    {
        try
        {
            var me = await Me();
            await portal.VerifyBind(me, request.ChallengeId, request.Code);
            return Ok(PortalService.Shape(me));
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    [HttpPost("bind-email")]
    public async Task<IActionResult> BindEmail([FromBody] PortalBindRequest request, CancellationToken ct)
    {
        if (!EmailVerification) return EmailOff();
        try
        {
            var me = await Me();
            var challenge = await portal.SendBindCode(me, request.Identifier, "email", ct);
            return Ok(new { challengeId = challenge.Id, expiresAt = challenge.ExpiresAt, retryAfterSeconds = portal.Policy.ResendSeconds });
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    [HttpPost("bind-email/verify")]
    public async Task<IActionResult> VerifyEmail([FromBody] PortalBindVerifyRequest request)
    {
        try
        {
            var me = await Me();
            await portal.VerifyBind(me, request.ChallengeId, request.Code);
            return Ok(PortalService.Shape(me));
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    // ── Tickets ──────────────────────────────────────────────────────────────

    [HttpPost("tickets")]
    public async Task<IActionResult> CreateTicket([FromBody] PortalTicketRequest request)
    {
        var subject = (request.Subject ?? "").Trim();
        var message = (request.Message ?? "").Trim();
        if (subject.Length is 0 or > 200) return BadRequest(new { error = "Enter a subject of up to 200 characters." });
        if (message.Length is 0 or > 4000) return BadRequest(new { error = "Write your question (up to 4000 characters)." });
        var me = await Me();
        var ticket = new Ticket
        {
            Code = "TK-" + Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(4)),
            Subject = subject, UserId = me.Id,
            UserPhone = me.Phone, UserEmail = me.Email,
            FirstName = me.FirstName, LastName = me.LastName,
            Country = me.Country, City = me.City, Job = me.Job,
        };
        db.Tickets.Add(ticket);
        db.TicketReplies.Add(new TicketReply { Ticket = ticket, Author = "user", Message = message });
        try { await db.SaveChangesAsync(); }
        catch (DbUpdateException) { ticket.Code = "TK-" + Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(4)); await db.SaveChangesAsync(); }
        return Ok(new { ticket = new { ticket.Id, ticket.Code, ticket.Subject, Status = ticket.Status.ToString().ToLower(), ticket.CreatedAt, ticket.UpdatedAt, Replies = 1 } });
    }

    [HttpGet("tickets")]
    public async Task<IActionResult> MyTickets()
    {
        var me = await Me();
        var tickets = await db.Tickets.AsNoTracking().Where(t => t.UserId == me.Id)
            .OrderByDescending(t => t.UpdatedAt).Take(100)
            .Select(t => new { t.Id, t.Code, t.Subject, t.Status, t.CreatedAt, t.UpdatedAt, Replies = db.TicketReplies.Count(r => r.TicketId == t.Id) })
            .ToListAsync();
        return Ok(new { tickets });
    }

    [HttpGet("tickets/{id:long}")]
    public async Task<IActionResult> Ticket(long id)
    {
        var me = await Me();
        var ticket = await db.Tickets.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id && t.UserId == me.Id);
        if (ticket == null) return NotFound(new { error = "Ticket not found." });
        var replies = await db.TicketReplies.AsNoTracking().Where(r => r.TicketId == id)
            .OrderBy(r => r.CreatedAt).ThenBy(r => r.Id).ToListAsync();
        return Ok(new { ticket = new { ticket.Id, ticket.Code, ticket.Subject, Status = ticket.Status.ToString().ToLower(), ticket.CreatedAt, ticket.UpdatedAt },
            replies = replies.Select(r => new { r.Id, author = r.Author, authorLabel = r.AuthorLabel, r.Message, r.CreatedAt }) });
    }

    [HttpPost("tickets/{id:long}/replies")]
    public async Task<IActionResult> ReplyTicket(long id, [FromBody] PortalTicketReplyRequest request)
    {
        var message = (request.Message ?? "").Trim();
        if (message.Length is 0 or > 4000) return BadRequest(new { error = "Write your message (up to 4000 characters)." });
        var me = await Me();
        var ticket = await db.Tickets.FirstOrDefaultAsync(t => t.Id == id && t.UserId == me.Id);
        if (ticket == null) return NotFound(new { error = "Ticket not found." });
        db.TicketReplies.Add(new TicketReply { TicketId = ticket.Id, Author = "user", Message = message });
        if (ticket.Status != TicketStatus.Open) { ticket.Status = TicketStatus.Open; }
        ticket.UpdatedAt = DateTime.UtcNow;
        ticket.Revision++;
        await db.SaveChangesAsync();
        return Ok(new { ok = true });
    }

    [HttpGet("boxes")]
    public async Task<IActionResult> Boxes()
    {
        var me = await Me();
        return Ok(me.Phone is { } phone ? await transfers.Mine(phone) : new MyBoxes([], []));
    }

    [HttpPost("boxes/transfer")]
    public async Task<IActionResult> Transfer(PortalTransferRequest request)
    {
        var me = await Me();
        if (me.Phone is not { } phone)
            return BadRequest(new { error = "Add and verify your mobile number first; cartons are handed over by mobile number." });
        try { return Ok(await transfers.TransferAsHolder(request, phone)); }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    // ── Installer partners ──────────────────────────────────────────────────

    [HttpPost("partner/apply")]
    public async Task<IActionResult> ApplyPartner([FromBody] PartnerApplyRequest request)
    {
        try
        {
            var me = await Me();
            var before = me.Partner;
            PortalService.Apply(me, request);
            if (before != me.Partner) AuditLog.Add(db, "portal:" + me.Phone, "partner", me.Phone!, "applied", AuditLog.Diff(("status", before, me.Partner), ("shop", null, me.ShopName)));
            await db.SaveChangesAsync();
            return Ok(PortalService.Shape(me));
        }
        catch (ActivationError ex) { return StatusCode(ex.Status, new { error = ex.Message }); }
    }

    [HttpGet("partner/warranties")]
    public async Task<IActionResult> InstallerWarranties()
    {
        var me = await Me();
        if (me.Partner != PartnerStatus.Approved || me.Phone is not { } phone) return Ok(new { warranties = Array.Empty<InstallerWarranty>() });
        return Ok(new { warranties = await portal.Installed(phone) });
    }

    [HttpGet("warranties")]
    public async Task<IActionResult> Warranties()
    {
        var me = await Me();
        return Ok(new { warranties = me.Phone is { } phone ? await portal.Warranties(phone) : Array.Empty<WarrantyPublic>() });
    }
}

public record PortalOtpRequest(string? Phone, string? Email, string? Channel);
public record PortalLoginRequest(string ChallengeId, string Code);
public record PortalBindRequest(string Identifier);
public record PortalBindVerifyRequest(string ChallengeId, string Code);
public record PortalTicketRequest(string? Subject, string? Message);
public record PortalTicketReplyRequest(string? Message);
