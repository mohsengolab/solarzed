using System.Net;
using System.Net.Mail;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.DataProtection;

namespace Solarzed.Api.Application;

/// <summary>Verification codes by email, alongside SMS. Credentials live in .local-sms.json under "Email".</summary>
public interface IEmailSender
{
    bool Configured { get; }
    Task Send(string email, string code, string reference, CancellationToken cancellationToken);
}

public class SmtpEmailSender(IConfiguration configuration, IDataProtectionProvider? protection = null) : IEmailSender
{
    const string Protector = "Solarzed.Email.Password.v1";
    string? Host => configuration["Email:Host"];
    int Port => int.TryParse(configuration["Email:Port"], out var p) && p is > 0 and <= 65535 ? p : 587;
    string? From => configuration["Email:From"];
    string SenderName => configuration["Email:Name"] ?? "SOLARZED";
    bool EnableSsl => !string.Equals(configuration["Email:EnableSsl"], "false", StringComparison.OrdinalIgnoreCase);

    string? Password {
        get {
            var encrypted = configuration["Email:ProtectedPassword"];
            if (!string.IsNullOrEmpty(encrypted)) {
                try { return protection?.CreateProtector(Protector).Unprotect(encrypted); }
                catch (System.Security.Cryptography.CryptographicException) { return null; }
            }
            return configuration["Email:Password"];
        }
    }

    public bool Configured => !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(From) &&
        // Host must be a hostname or IP, never a URL.
        Regex.IsMatch(Host!, @"^[A-Za-z0-9.](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d+)?$");

    public async Task Send(string email, string code, string reference, CancellationToken cancellationToken)
    {
        if (!Configured) throw new ActivationError(503, "Email verification is not configured. Please contact Solarzed support.");
        if (!Regex.IsMatch(email, @"^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,63}$"))
            throw new ActivationError(400, "Enter a valid email address.");
        using var message = new MailMessage(new MailAddress(From!, SenderName), new MailAddress(email)) {
            Subject = $"{SenderName} verification code: {code}",
            Body = $"Your {SenderName} verification code is {code}.\n\nIt is valid for a few minutes. " +
                   "Do not share this code with anyone.\n\nIf you did not request it, ignore this message.\n\n" +
                   $"Reference: {reference}",
            IsBodyHtml = false,
        };
        using var client = new SmtpClient(Host!, Port) {
            EnableSsl = EnableSsl,
            Timeout = 15000,
        };
        var user = configuration["Email:User"];
        var password = Password;
        if (!string.IsNullOrWhiteSpace(user)) {
            client.UseDefaultCredentials = false;
            client.Credentials = new NetworkCredential(user, password ?? "");
        }
        try { await client.SendMailAsync(message, cancellationToken); }
        catch (OperationCanceledException) { throw; }
        catch (SmtpFailedRecipientException) { throw new ActivationError(503, "The email provider rejected the recipient. Please check the address."); }
        catch (SmtpException) { throw new ActivationError(503, "The email provider is unavailable. Please try again later."); }
    }
}

// Local testing without a provider: codes are written to the API log. Never active outside Development.
public class DevConsoleEmail : IEmailSender
{
    public bool Configured => true;
    public Task Send(string email, string code, string reference, CancellationToken cancellationToken)
    {
        Console.WriteLine($"[DEV EMAIL] {email} code={code} ref={reference}");
        return Task.CompletedTask;
    }
}
