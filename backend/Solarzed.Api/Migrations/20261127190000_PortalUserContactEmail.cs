using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Solarzed.Api.Infrastructure;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <summary>Portal users can add a contact email in their profile (unverified, not a sign-in identifier).</summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261127190000_PortalUserContactEmail")]
    public partial class PortalUserContactEmail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(name: "ContactEmail", table: "PortalUsers", type: "nvarchar(254)", maxLength: 254, nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "ContactEmail", table: "PortalUsers");
        }
    }
}
