namespace Solarzed.Api.Application;

/// <summary>
/// Development-only stand-in for the SMS provider: writes the code to the API log so the sign-in flow can be tested
/// locally. Registered only when ASPNETCORE_ENVIRONMENT=Development and Sms:DevConsole=true (see Program.cs).
/// </summary>
public class DevConsoleSms(ILogger<DevConsoleSms> logger) : IActivationSmsSender
{
    public bool Configured => true;

    public Task Send(string phone, string code, string reference, CancellationToken cancellationToken)
    {
        logger.LogWarning("DEV SMS to {Phone}: code {Code}", phone, code);
        return Task.CompletedTask;
    }

    public bool WarrantyConfigured => true;

    public Task SendWarranty(string phone, string warrantyCode, string link, CancellationToken cancellationToken)
    {
        logger.LogWarning("DEV SMS to {Phone}: warranty {Code} is active, card {Link}", phone, warrantyCode, link);
        return Task.CompletedTask;
    }

    public bool TransferConfigured => true;

    public Task SendTransfer(string phone, int count, string link, CancellationToken cancellationToken)
    {
        logger.LogWarning("DEV SMS to {Phone}: {Count} roll(s) sent to you, sign in at {Link}", phone, count, link);
        return Task.CompletedTask;
    }
}
