using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class UserRolesAndWarrantyCodeLength : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "WarrantyCodeLength",
                table: "CoverageSettings",
                type: "int",
                nullable: false,
                defaultValue: 16);

            migrationBuilder.AddColumn<bool>(
                name: "Active",
                table: "AdminUsers",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "DisplayName",
                table: "AdminUsers",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Role",
                table: "AdminUsers",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "admin");

            // Existing accounts keep full manager access after the upgrade.
            migrationBuilder.Sql("UPDATE [AdminUsers] SET [Role] = 'admin' WHERE [Role] IS NULL OR [Role] = '';");
            migrationBuilder.Sql("UPDATE [AdminUsers] SET [Active] = 1;");
            migrationBuilder.Sql("UPDATE [CoverageSettings] SET [WarrantyCodeLength] = 16 WHERE [WarrantyCodeLength] < 6 OR [WarrantyCodeLength] > 29;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "WarrantyCodeLength",
                table: "CoverageSettings");

            migrationBuilder.DropColumn(
                name: "Active",
                table: "AdminUsers");

            migrationBuilder.DropColumn(
                name: "DisplayName",
                table: "AdminUsers");

            migrationBuilder.DropColumn(
                name: "Role",
                table: "AdminUsers");
        }
    }
}
