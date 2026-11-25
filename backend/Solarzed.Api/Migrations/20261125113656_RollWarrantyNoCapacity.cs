using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class RollWarrantyNoCapacity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_WarrantyRegistrations_FilmSerial_InvoiceNumber",
                table: "WarrantyRegistrations");

            migrationBuilder.DropIndex(
                name: "IX_WarrantyRegistrations_FilmSerial_Vin",
                table: "WarrantyRegistrations");

            migrationBuilder.CreateIndex(
                name: "IX_WarrantyRegistrations_FilmSerial_InvoiceNumber",
                table: "WarrantyRegistrations",
                columns: new[] { "FilmSerial", "InvoiceNumber" },
                unique: true,
                filter: "[RollId] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_WarrantyRegistrations_FilmSerial_Vin",
                table: "WarrantyRegistrations",
                columns: new[] { "FilmSerial", "Vin" },
                unique: true,
                filter: "[RollId] IS NOT NULL");
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
    }
}
