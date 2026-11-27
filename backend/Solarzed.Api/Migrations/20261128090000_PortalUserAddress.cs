using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Solarzed.Api.Infrastructure;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <summary>Portal users (installers, shops) can add their address in their profile.</summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261128090000_PortalUserAddress")]
    public partial class PortalUserAddress : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "Address", table: "PortalUsers", type: "nvarchar(500)", maxLength: 500, nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "Address", table: "PortalUsers");
        }
    }
}
