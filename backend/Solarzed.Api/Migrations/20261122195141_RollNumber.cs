using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class RollNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Number",
                table: "Rolls",
                type: "int",
                nullable: false,
                defaultValue: 0);

            // Number existing rolls 1, 2, 3… in the order they were received.
            migrationBuilder.Sql(@"
WITH ordered AS (SELECT Number, ROW_NUMBER() OVER (ORDER BY ReceivedAt, Id) AS n FROM Rolls)
UPDATE ordered SET Number = n;");

            migrationBuilder.CreateIndex(
                name: "IX_Rolls_Number",
                table: "Rolls",
                column: "Number",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Rolls_Number",
                table: "Rolls");

            migrationBuilder.DropColumn(
                name: "Number",
                table: "Rolls");
        }
    }
}
