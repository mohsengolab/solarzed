using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Security;
using System.Xml.Linq;
using Microsoft.AspNetCore.DataProtection;

namespace Solarzed.Api.Application;

public interface IActivationSmsSender
{
    bool Configured { get; }
    Task Send(string phone, string code, string reference, CancellationToken cancellationToken);
    /// <summary>True when the "warranty active" pattern (warranty number + gold card link) is set and sending is on.</summary>
    bool WarrantyConfigured => false;
    Task SendWarranty(string phone, string link, CancellationToken cancellationToken) => Task.CompletedTask;
    /// <summary>True when the "rolls received" pattern (roll count + sign-in link) is set and sending is on.</summary>
    bool TransferConfigured => false;
    Task SendTransfer(string phone, int count, string link, CancellationToken cancellationToken) => Task.CompletedTask;
}

// The existing HTTPS webhook contract is shared with the legacy SMS adapter.
// Credentials and OTPs never go to the browser or application logs.
public class ActivationSmsSender(HttpClient http, IConfiguration configuration, IDataProtectionProvider? protection = null) : IActivationSmsSender
{
    bool Rest => configuration["Faraz:Mode"] == "rest";
    string? Endpoint => configuration["ActivationSms:Webhook"] ?? configuration["SOLARZED_SMS_WEBHOOK"];
    string? FarazEndpoint => configuration["Faraz:Endpoint"];
    string? FarazToken {
        get {
            var encrypted = configuration["Faraz:ProtectedToken"];
            if (!string.IsNullOrEmpty(encrypted)) {
                try { return protection?.CreateProtector("Solarzed.Faraz.Token.v1").Unprotect(encrypted); }
                catch (System.Security.Cryptography.CryptographicException) { return null; }
            }
            return configuration["Faraz:Token"] ?? configuration["SMS_API_KEY"];
        }
    }
    // SOAP pattern web service (token login, as used by robatpayam). Its official endpoint is plain HTTP,
    // so an administrator who explicitly picks "soap" mode may use http; other modes still require https.
    bool Soap => configuration["Faraz:Mode"] == "soap";
    bool FarazConfigured => Uri.TryCreate(FarazEndpoint, UriKind.Absolute, out var uri) && (uri.Scheme == "https" || (Soap && uri.Scheme == "http")) &&
        !string.IsNullOrWhiteSpace(FarazToken) && !string.IsNullOrWhiteSpace(configuration["Faraz:Sender"]) && !string.IsNullOrWhiteSpace(configuration["Faraz:OtpPattern"]);
    // Connected: credentials present. Configured: connected and not paused by an administrator.
    public bool Configured => Connected && SmsPolicy.From(configuration).Enabled;
    public bool Connected => Soap ? FarazConfigured : Rest ?!string.IsNullOrWhiteSpace(FarazToken) && !string.IsNullOrWhiteSpace(configuration["Faraz:OtpPattern"]) && !string.IsNullOrWhiteSpace(configuration["Faraz:Sender"]) : FarazConfigured || (Uri.TryCreate(Endpoint, UriKind.Absolute, out var uri) && uri.Scheme == "https");

    public static bool FarazAccepted(string xml)
    {
        try
        {
            var doc = XDocument.Parse(xml);
            if (doc.Descendants().Any(x => x.Name.LocalName == "Fault")) return false;
            var value = doc.Descendants().FirstOrDefault(x => x.Name.LocalName is "return" or "SendSMSByPatternResult")?.Value.Trim();
            return value != null && Regex.IsMatch(value, @"^(?:[1-9]\d*|true)$", RegexOptions.IgnoreCase);
        }
        catch (System.Xml.XmlException) { return false; }
    }

    // Mirrors dande/apps/api/src/modules/sms/faraz-pattern.ts (SOAP pattern API).
    public static string FarazEnvelope(string sender, string mobile, string pattern, string token, string code, string variable = "code") =>
        FarazEnvelope(sender, mobile, pattern, token, new Dictionary<string, string> { [variable] = code });

    public static string FarazEnvelope(string sender, string mobile, string pattern, string token, IDictionary<string, string> attributes)
    {
        static string E(string value) => SecurityElement.Escape(value) ?? "";
        var recipient = mobile.StartsWith("0") ? "98" + mobile[1..] : mobile.TrimStart('+');
        var values = E(JsonSerializer.Serialize(attributes));
        return $"""
            <?xml version="1.0" encoding="UTF-8"?>
            <SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><SOAP-ENV:Body><ns1:SendSMSByPattern xmlns:ns1="Send_API"><fromNum xsi:type="xsd:string">{E(sender)}</fromNum><toNum SOAP-ENC:arrayType="xsd:string[1]" xsi:type="SOAP-ENC:Array"><item xsi:type="xsd:string">{E(recipient)}</item></toNum><Content xsi:type="xsd:string">{values}</Content><patternID xsi:type="xsd:string">{E(pattern)}</patternID><Type xsi:type="xsd:string">0</Type><token xsi:type="xsd:string">{E(token)}</token></ns1:SendSMSByPattern></SOAP-ENV:Body></SOAP-ENV:Envelope>
            """;
    }

    public async Task Send(string phone, string code, string reference, CancellationToken cancellationToken)
    {
        if (!Configured) throw new ActivationError(503, "SMS verification is not configured. Please contact Solarzed support.");
        if (Rest) {
            if (!Regex.IsMatch(phone, @"^(?:09\d{9}|\+?989\d{9})$")) throw new ActivationError(400, "An Iranian mobile number is required.");
            var mobile = phone.StartsWith("0") ? phone : "0" + phone.TrimStart('+')[2..];
            using var rest = new HttpRequestMessage(HttpMethod.Post, "https://api.iranpayamak.com/ws/v1/sms/pattern");
            rest.Headers.Add("Api-Key", FarazToken);
            rest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            rest.Content = JsonContent.Create(new { code = configuration["Faraz:OtpPattern"],
                attributes = new Dictionary<string, string> { [configuration["Faraz:CodeVariable"] ?? "code1"] = code },
                recipient = mobile, line_number = configuration["Faraz:Sender"], number_format = "english" });
            using var result = await http.SendAsync(rest, cancellationToken);
            var json = await result.Content.ReadAsStringAsync(cancellationToken);
            if (!result.IsSuccessStatusCode || !RestAccepted(json)) throw new ActivationError(503, "Faraz did not accept the verification message. Please contact Solarzed support.");
            return;
        }
        if (FarazConfigured)
        {
            if (!Regex.IsMatch(phone, @"^(?:09\d{9}|\+?989\d{9})$")) throw new ActivationError(400, "Faraz requires an Iranian mobile number, for example 09123456789.");
            using var faraz = new HttpRequestMessage(HttpMethod.Post, FarazEndpoint);
            faraz.Headers.Add("SOAPAction", "\"SendSMSByPattern\"");
            faraz.Content = new StringContent(FarazEnvelope(configuration["Faraz:Sender"]!, phone,
                configuration["Faraz:OtpPattern"]!, FarazToken!, code, configuration["Faraz:CodeVariable"] ?? "code"), Encoding.UTF8, "text/xml");
            using var reply = await http.SendAsync(faraz, cancellationToken);
            var xml = await reply.Content.ReadAsStringAsync(cancellationToken);
            if (!reply.IsSuccessStatusCode || !FarazAccepted(xml))
                throw new ActivationError(503, "Faraz did not accept the verification message. Please try again later.");
            return;
        }
        using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint);
        request.Content = JsonContent.Create(new { to = phone, message = $"Solarzed warranty verification code: {code}. Expires in 5 minutes. Do not share this code.", reference });
        var token = configuration["ActivationSms:Token"] ?? configuration["SOLARZED_SMS_TOKEN"];
        if (!string.IsNullOrEmpty(token)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) throw new ActivationError(503, "The verification message could not be submitted. Please try again later.");
    }

    string? WarrantyPattern => configuration["Faraz:WarrantyPattern"];
    public bool WarrantyConfigured => Configured && (!(Rest || FarazConfigured) || !string.IsNullOrWhiteSpace(WarrantyPattern));

    /// <summary>"Warranty active" message: only the link to the gold card, through its own approved pattern. The warranty number is never sent.</summary>
    public Task SendWarranty(string phone, string link, CancellationToken cancellationToken)
    {
        if (!WarrantyConfigured) throw new ActivationError(503, "The warranty SMS pattern is not set.");
        return SendPattern(phone, WarrantyPattern, new Dictionary<string, string>
        {
            [configuration["Faraz:WarrantyLinkVariable"] ?? "link"] = link,
        }, $"Your Solarzed warranty is active. Your warranty card: {link}", "warranty-card",
            "Faraz did not accept the warranty message.", "The warranty message could not be submitted.", cancellationToken);
    }

    string? TransferPattern => configuration["Faraz:TransferPattern"];
    public bool TransferConfigured => Configured && (!(Rest || FarazConfigured) || !string.IsNullOrWhiteSpace(TransferPattern));

    /// <summary>"Rolls received" message to a seller or installer: how many rolls were sent to them and where to sign in.</summary>
    public Task SendTransfer(string phone, int count, string link, CancellationToken cancellationToken)
    {
        if (!TransferConfigured) throw new ActivationError(503, "The roll transfer SMS pattern is not set.");
        return SendPattern(phone, TransferPattern, new Dictionary<string, string>
        {
            [configuration["Faraz:TransferCountVariable"] ?? "count"] = count.ToString(),
            [configuration["Faraz:TransferLinkVariable"] ?? "link"] = link,
        }, $"Solarzed: {count} roll(s) were sent to you. Sign in to see them: {link}", "transfer",
            "Faraz did not accept the roll transfer message.", "The roll transfer message could not be submitted.", cancellationToken);
    }

    /// <summary>One message through an approved pattern (REST or SOAP), or as plain text through the HTTPS webhook.</summary>
    async Task SendPattern(string phone, string? pattern, Dictionary<string, string> values, string webhookText, string reference,
        string rejected, string unsent, CancellationToken cancellationToken)
    {
        if (Rest)
        {
            if (!Regex.IsMatch(phone, @"^(?:09\d{9}|\+?989\d{9})$")) throw new ActivationError(400, "An Iranian mobile number is required.");
            var mobile = phone.StartsWith("0") ? phone : "0" + phone.TrimStart('+')[2..];
            using var rest = new HttpRequestMessage(HttpMethod.Post, "https://api.iranpayamak.com/ws/v1/sms/pattern");
            rest.Headers.Add("Api-Key", FarazToken);
            rest.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            rest.Content = JsonContent.Create(new { code = pattern, attributes = values, recipient = mobile,
                line_number = configuration["Faraz:Sender"], number_format = "english" });
            using var result = await http.SendAsync(rest, cancellationToken);
            if (!result.IsSuccessStatusCode || !RestAccepted(await result.Content.ReadAsStringAsync(cancellationToken)))
                throw new ActivationError(503, rejected);
            return;
        }
        if (FarazConfigured)
        {
            if (!Regex.IsMatch(phone, @"^(?:09\d{9}|\+?989\d{9})$")) throw new ActivationError(400, "An Iranian mobile number is required.");
            using var faraz = new HttpRequestMessage(HttpMethod.Post, FarazEndpoint);
            faraz.Headers.Add("SOAPAction", "\"SendSMSByPattern\"");
            faraz.Content = new StringContent(FarazEnvelope(configuration["Faraz:Sender"]!, phone, pattern!, FarazToken!, values), Encoding.UTF8, "text/xml");
            using var reply = await http.SendAsync(faraz, cancellationToken);
            if (!reply.IsSuccessStatusCode || !FarazAccepted(await reply.Content.ReadAsStringAsync(cancellationToken)))
                throw new ActivationError(503, rejected);
            return;
        }
        using var request = new HttpRequestMessage(HttpMethod.Post, Endpoint);
        request.Content = JsonContent.Create(new { to = phone, message = webhookText, reference });
        var token = configuration["ActivationSms:Token"] ?? configuration["SOLARZED_SMS_TOKEN"];
        if (!string.IsNullOrEmpty(token)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await http.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode) throw new ActivationError(503, unsent);
    }

    public static bool RestAccepted(string json) {
        try { using var doc = JsonDocument.Parse(json); return doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("status", out var status) && status.ValueKind == JsonValueKind.String && status.GetString() == "success"; }
        catch (JsonException) { return false; }
    }
}
