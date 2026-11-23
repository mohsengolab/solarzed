using Microsoft.AspNetCore.Builder;
using Solarzed.Api.Application;

namespace Solarzed.Api.Tests;

public class SmsSettingsFileTests
{
    // The admin panel writes .local-sms.json under ContentRootPath. Configuration must read that same file:
    // the default file provider skips dot-prefixed names, which left saved SMS settings unread on the server.
    [Fact]
    public void SettingsWrittenByThePanelAreReadAndReloaded()
    {
        var root = Directory.CreateTempSubdirectory("solarzed-root-").FullName;
        try
        {
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions { ContentRootPath = root });
            var file = SmsSettingsFile.For(builder.Environment);
            Assert.Equal(Path.Combine(root, ".local-sms.json"), file);
            File.WriteAllText(file, "{\"Faraz\":{\"Mode\":\"soap\"}}");
            builder.Configuration.AddSmsSettings(builder.Environment);
            Assert.Equal("soap", builder.Configuration["Faraz:Mode"]);

            File.WriteAllText(file, "{\"Faraz\":{\"Mode\":\"rest\"}}");   // the panel's save, then its Reload()
            ((Microsoft.Extensions.Configuration.IConfigurationRoot)builder.Configuration).Reload();
            Assert.Equal("rest", builder.Configuration["Faraz:Mode"]);
        }
        finally { Directory.Delete(root, true); }
    }
}
