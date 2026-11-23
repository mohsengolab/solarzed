using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Solarzed.Api.Application;

namespace Solarzed.Api.Tests;

// The server path: a token saved from the admin panel, then the sender resolved through DI the way Program.cs does.
public class SmsWiringTests
{
    [Fact]
    public void SoapTokenSavedFromPanelConnectsThroughDependencyInjection()
    {
        var dir = Directory.CreateTempSubdirectory("solarzed-sms-").FullName;
        try
        {
            ServiceProvider Build(IConfiguration cfg)
            {
                var services = new ServiceCollection();
                services.AddSingleton(cfg);
                services.AddDataProtection().SetApplicationName("Solarzed").PersistKeysToFileSystem(Directory.CreateDirectory(Path.Combine(dir, "keys")));
                services.AddHttpClient<IActivationSmsSender, ActivationSmsSender>();
                return services.BuildServiceProvider();
            }
            var empty = new ConfigurationBuilder().Build();
            string encrypted;
            using (var first = Build(empty))
                encrypted = first.GetRequiredService<IDataProtectionProvider>().CreateProtector("Solarzed.Faraz.Token.v1").Protect("soap-token");

            var cfg = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Faraz:Mode"] = "soap", ["Faraz:Endpoint"] = "http://185.112.33.61/wbs/send.php", ["Faraz:ProtectedToken"] = encrypted,
                ["Faraz:OtpPattern"] = "2675", ["Faraz:Sender"] = "21000051112", ["Faraz:CodeVariable"] = "code1",
                ["Sms:Enabled"] = "true",
            }).Build();
            using var second = Build(cfg);   // a restarted process reading the same keys folder
            var sender = Assert.IsType<ActivationSmsSender>(second.GetRequiredService<IActivationSmsSender>());
            Assert.True(sender.Connected);
            Assert.True(sender.Configured);
        }
        finally { Directory.Delete(dir, true); }
    }
}
