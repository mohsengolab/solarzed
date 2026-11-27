using Solarzed.Api.Application;
using Solarzed.Api.Domain;

public class ProfileTests
{
    static PortalProfileRequest Req(string? company) => new("Ali", "Rezaei", "Iran", "Tehran", null, null, company);

    [Fact]
    public void Company_set_by_admin_can_be_renamed_but_not_cleared()
    {
        var user = new PortalUser { Phone = "09121111111", ShopName = "Old Shop" };
        PortalService.ApplyProfile(user, Req("  New Shop "));
        Assert.Equal("New Shop", user.ShopName);
        PortalService.ApplyProfile(user, Req(""));
        Assert.Equal("New Shop", user.ShopName);
        PortalService.ApplyProfile(user, Req(null));
        Assert.Equal("New Shop", user.ShopName);
    }

    [Fact]
    public void Company_cannot_be_added_without_admin()
    {
        var user = new PortalUser { Phone = "09121111111" };
        PortalService.ApplyProfile(user, Req("My Company"));
        Assert.Null(user.ShopName);
    }

    [Fact]
    public void Map_location_is_saved_as_a_valid_pair_or_cleared()
    {
        var user = new PortalUser { Phone = "09121111111" };
        PortalService.ApplyProfile(user, Req(null) with { Latitude = 35.6891975123, Longitude = 51.3889736 });
        Assert.Equal(35.689198, user.Latitude);
        Assert.Equal(51.388974, user.Longitude);
        PortalService.ApplyProfile(user, Req(null) with { Latitude = 95, Longitude = 51 });
        Assert.Null(user.Latitude);
        Assert.Null(user.Longitude);
        PortalService.ApplyProfile(user, Req(null) with { Latitude = 35.7 });
        Assert.Null(user.Latitude);
    }
}
