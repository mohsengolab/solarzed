using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class Warehouses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "HolderUserId",
                table: "Rolls",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "WarehouseId",
                table: "Rolls",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Warehouses",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Address = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    Archived = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Warehouses", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Rolls_HolderUserId",
                table: "Rolls",
                column: "HolderUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Rolls_WarehouseId",
                table: "Rolls",
                column: "WarehouseId");

            migrationBuilder.CreateIndex(
                name: "IX_Warehouses_Name",
                table: "Warehouses",
                column: "Name",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Rolls_AdminUsers_HolderUserId",
                table: "Rolls",
                column: "HolderUserId",
                principalTable: "AdminUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Rolls_Warehouses_WarehouseId",
                table: "Rolls",
                column: "WarehouseId",
                principalTable: "Warehouses",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            // Start with a main warehouse and record every existing roll there.
            migrationBuilder.Sql(@"
INSERT INTO Warehouses (Name, Address, Archived) VALUES (N'انبار مرکزی', N'', 0);
UPDATE Rolls SET WarehouseId = SCOPE_IDENTITY();");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Rolls_AdminUsers_HolderUserId",
                table: "Rolls");

            migrationBuilder.DropForeignKey(
                name: "FK_Rolls_Warehouses_WarehouseId",
                table: "Rolls");

            migrationBuilder.DropTable(
                name: "Warehouses");

            migrationBuilder.DropIndex(
                name: "IX_Rolls_HolderUserId",
                table: "Rolls");

            migrationBuilder.DropIndex(
                name: "IX_Rolls_WarehouseId",
                table: "Rolls");

            migrationBuilder.DropColumn(
                name: "HolderUserId",
                table: "Rolls");

            migrationBuilder.DropColumn(
                name: "WarehouseId",
                table: "Rolls");
        }
    }
}
