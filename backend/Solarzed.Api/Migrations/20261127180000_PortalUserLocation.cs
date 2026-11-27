using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Solarzed.Api.Infrastructure;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <summary>Portal users can pick where they are on a map in their profile (latitude / longitude, WGS84).</summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261127180000_PortalUserLocation")]
    public partial class PortalUserLocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(name: "Latitude", table: "PortalUsers", type: "float", nullable: true);
            migrationBuilder.AddColumn<double>(name: "Longitude", table: "PortalUsers", type: "float", nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "Latitude", table: "PortalUsers");
            migrationBuilder.DropColumn(name: "Longitude", table: "PortalUsers");
        }
    }
}
