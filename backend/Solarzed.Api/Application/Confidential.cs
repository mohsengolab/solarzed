using System.Security.Claims;
using Microsoft.AspNetCore.DataProtection;

namespace Solarzed.Api.Application;

/// <summary>
/// Roll IDs and warranty codes are for the super administrator only. Other staff ("admin", مدیر) get a masked code
/// (last four characters) and an opaque reference they can send back to act on that warranty.
/// </summary>
public static class Confidential
{
    const string Purpose = "Solarzed.WarrantyRef.v1";
    // Used when no provider is injected (tests), so a reference is never the plain code.
    static readonly IDataProtectionProvider Fallback = new EphemeralDataProtectionProvider();

    /// <summary>True for the super administrator, or a role granted «codes.view». A request with no signed-in user (internal calls, tests) sees everything.</summary>
    public static bool SeesCodes(ClaimsPrincipal? user) =>
        user?.Identity?.IsAuthenticated != true || Permissions.Has(user, "codes.view");

    public static string Mask(string? code) =>
        string.IsNullOrEmpty(code) ? "" : "••••" + code[^Math.Min(4, code.Length)..];

    /// <summary>An opaque handle for a warranty code, valid only on this server.</summary>
    public static string Ref(string code, IDataProtectionProvider? protection) =>
        (protection ?? Fallback).CreateProtector(Purpose).Protect(code);

    /// <summary>The warranty code behind a handle: a reference from <see cref="Ref"/>, or the code itself for the super administrator.</summary>
    public static string? Resolve(string handle, ClaimsPrincipal? user, IDataProtectionProvider? protection)
    {
        try { return (protection ?? Fallback).CreateProtector(Purpose).Unprotect(handle); }
        catch (System.Security.Cryptography.CryptographicException) { }
        return SeesCodes(user) ? handle : null;
    }
}
