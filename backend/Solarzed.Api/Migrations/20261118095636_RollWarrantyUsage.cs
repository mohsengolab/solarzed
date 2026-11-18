using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class RollWarrantyUsage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WarrantyRegistrations_FilmSerial_InvoiceNumber",
                table: "WarrantyRegistrations");

            migrationBuilder.AddColumn<decimal>(
                name: "UsedLengthM",
                table: "WarrantyRegistrations",
                type: "decimal(7,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RemainingLengthM",
                table: "BoxLabels",
                type: "decimal(7,2)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_WarrantyRegistrations_FilmSerial_InvoiceNumber",
                table: "WarrantyRegistrations",
                columns: new[] { "FilmSerial", "InvoiceNumber" },
                unique: true,
                filter: "[UsedLengthM] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_WarrantyRegistrations_FilmSerial_Vin",
                table: "WarrantyRegistrations",
                columns: new[] { "FilmSerial", "Vin" },
                unique: true,
                filter: "[UsedLengthM] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WarrantyRegistrations_FilmSerial_InvoiceNumber",
                table: "WarrantyRegistrations");

            migrationBuilder.DropIndex(
                name: "IX_WarrantyRegistrations_FilmSerial_Vin",
                table: "WarrantyRegistrations");

            migrationBuilder.DropColumn(
                name: "UsedLengthM",
                table: "WarrantyRegistrations");

            migrationBuilder.DropColumn(
                name: "RemainingLengthM",
                table: "BoxLabels");

            migrationBuilder.CreateIndex(
                name: "IX_WarrantyRegistrations_FilmSerial_InvoiceNumber",
                table: "WarrantyRegistrations",
                columns: new[] { "FilmSerial", "InvoiceNumber" },
                unique: true);
        }
    }
}
