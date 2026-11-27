using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Solarzed.Api.Infrastructure;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <summary>Window film registrations keep the film size (length × width, cm) cut for each glass.</summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261127120000_WarrantyGlassSizes")]
    public partial class WarrantyGlassSizes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GlassSizesJson",
                table: "WarrantyRegistrations",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "GlassSizesJson", table: "WarrantyRegistrations");
        }
    }
}
