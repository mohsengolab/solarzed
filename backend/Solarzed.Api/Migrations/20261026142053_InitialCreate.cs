using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AdminUsers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Username = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdminUsers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CoverageSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TintFilmYears = table.Column<int>(type: "int", nullable: true),
                    TintInstallYears = table.Column<int>(type: "int", nullable: true),
                    PpfFilmYears = table.Column<int>(type: "int", nullable: true),
                    PpfInstallYears = table.Column<int>(type: "int", nullable: true),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CoverageSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Rolls",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    ModelCode = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    Batch = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Supplier = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Qc = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    HistoryJson = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Rolls", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WarrantyRegistrations",
                columns: table => new
                {
                    Code = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    Vin = table.Column<string>(type: "nvarchar(17)", maxLength: 17, nullable: false),
                    Owner = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Plate = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Make = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Model = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    FilmSerial = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    InvoiceNumber = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Installed = table.Column<DateOnly>(type: "date", nullable: false),
                    SellerName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    SellerPhone = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Installer = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AreasJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    FlagsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    ReviewNote = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    FilmEnds = table.Column<DateOnly>(type: "date", nullable: true),
                    InstallEnds = table.Column<DateOnly>(type: "date", nullable: true),
                    RollId = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ReviewedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarrantyRegistrations", x => x.Code);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WarrantyRegistrations_FilmSerial_InvoiceNumber",
                table: "WarrantyRegistrations",
                columns: new[] { "FilmSerial", "InvoiceNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WarrantyRegistrations_Phone",
                table: "WarrantyRegistrations",
                column: "Phone");

            migrationBuilder.CreateIndex(
                name: "IX_WarrantyRegistrations_Vin",
                table: "WarrantyRegistrations",
                column: "Vin");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AdminUsers");

            migrationBuilder.DropTable(
                name: "CoverageSettings");

            migrationBuilder.DropTable(
                name: "Rolls");

            migrationBuilder.DropTable(
                name: "WarrantyRegistrations");
        }
    }
}
