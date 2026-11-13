using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class RollDimensions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "LengthM",
                table: "Rolls",
                type: "decimal(7,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "WidthCm",
                table: "Rolls",
                type: "decimal(7,2)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LengthM",
                table: "Rolls");

            migrationBuilder.DropColumn(
                name: "WidthCm",
                table: "Rolls");
        }
    }
}
