namespace Solarzed.Api.Application;

/// <summary>
/// Tells the seller or installer who just received rolls, by SMS, how many were sent to them and where to sign in.
/// The hand-over is already saved, so a missing pattern or a provider failure never undoes it; the outcome is
/// returned for the page and kept in the SMS log.
/// </summary>
public class TransferSms(BoxLabelService labels, IActivationSmsSender? sms = null, SmsLog? log = null, ILogger<TransferSms>? logger = null)
{
    public const string Sent = "sent", Off = "off";

    public async Task<TransferResult> Notify(TransferResult result, CancellationToken ct = default)
    {
        if (result.ToPhone is not { } phone || result.Transfers.Length == 0) return result;
        if (sms is not { TransferConfigured: true }) return result with { Sms = Off };
        string? error = null;
        try { await sms.SendTransfer(phone, result.Transfers.Length, await labels.Site() + "/account", ct); }
        catch (ActivationError ex) { error = ex.Message; }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            error = "The SMS provider could not be reached.";
            logger?.LogWarning("Roll transfer SMS for batch {Batch} could not reach the provider", result.BatchId);
        }
        log?.Add(phone, "roll-transfer", error == null, error);
        return result with { Sms = error ?? Sent };
    }
}
