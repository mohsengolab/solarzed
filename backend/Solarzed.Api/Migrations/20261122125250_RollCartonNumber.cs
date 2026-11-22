using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class RollCartonNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RollNo",
                table: "Rolls",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Rolls_RollNo",
                table: "Rolls",
                column: "RollNo",
                unique: true,
                filter: "[RollNo] IS NOT NULL");

            // Rolls whose single carton was already issued under its printed Roll No take that number.
            migrationBuilder.Sql(@"
UPDATE r SET r.RollNo = b.Id
FROM Rolls r
JOIN (SELECT RollId, MIN(Id) AS Id FROM BoxLabels WHERE RollId IS NOT NULL GROUP BY RollId HAVING COUNT(*) = 1) b ON b.RollId = r.Id
WHERE b.Id NOT LIKE 'SZB-%';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Rolls_RollNo",
                table: "Rolls");

            migrationBuilder.DropColumn(
                name: "RollNo",
                table: "Rolls");
        }
    }
}
