using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Solarzed.Api.Application;
using Solarzed.Api.Controllers;
using Solarzed.Api.Domain;
using Solarzed.Api.Infrastructure;

namespace Solarzed.Api.Tests;

public class CatalogAndSmsTests
{
    [Fact]
    public async Task PublicCatalogExcludesArchivedAndReflectsEdits()
    {
        using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.Products.AddRange(new Product { Code = "LIVE", Name = "Original", Series = "Live series" }, new Product { Code = "HIDDEN", Name = "Private", Archived = true });
        await db.SaveChangesAsync();
        var api = new CatalogController(db);
        var json = JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(await api.Get()).Value);
        Assert.Contains("LIVE", json); Assert.DoesNotContain("HIDDEN", json);
        (await db.Products.FindAsync("LIVE"))!.Name = "Changed"; await db.SaveChangesAsync();
        Assert.Contains("Changed", JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(await api.Get()).Value));
    }

    sealed class Handler(string response) : HttpMessageHandler
    {
        public string? Body; public string? Key; public Uri? Uri;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Uri = request.RequestUri; Key = request.Headers.GetValues("Api-Key").Single();
            Body = await request.Content!.ReadAsStringAsync(ct);
            return new HttpResponseMessage(HttpStatusCode.Created) { Content = new StringContent(response, Encoding.UTF8, "application/json") };
        }
    }

    [Fact]
    public async Task HttpsRestUsesProtectedKeyExactPatternVariableAndNormalizedPhone()
    {
        var protection = new EphemeralDataProtectionProvider();
        var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
            ["Faraz:Mode"] = "rest", ["Faraz:ProtectedToken"] = protection.CreateProtector("Solarzed.Faraz.Token.v1").Protect("test-key"),
            ["Faraz:OtpPattern"] = "2675", ["Faraz:Sender"] = "300000", ["Faraz:CodeVariable"] = "code1"
        }).Build();
        var handler = new Handler("{\"status\":\"success\",\"data\":0}");
        var sender = new ActivationSmsSender(new HttpClient(handler), cfg, protection);
        Assert.True(sender.Configured);
        await sender.Send("+989120000000", "123456", "test", default);
        Assert.Equal("https://api.iranpayamak.com/ws/v1/sms/pattern", handler.Uri!.ToString());
        Assert.Equal("test-key", handler.Key);
        using var body = JsonDocument.Parse(handler.Body!);
        Assert.Equal("2675", body.RootElement.GetProperty("code").GetString());
        Assert.Equal("123456", body.RootElement.GetProperty("attributes").GetProperty("code1").GetString());
        Assert.Equal("09120000000", body.RootElement.GetProperty("recipient").GetString());
    }

    [Theory]
    [InlineData("{\"status\":\"error\"}")]
    [InlineData("{\"status\":1}")]
    [InlineData("[]")]
    [InlineData("invalid")]
    public void RestRejectsInvalidOrFailedProviderReplies(string json) => Assert.False(ActivationSmsSender.RestAccepted(json));
}
