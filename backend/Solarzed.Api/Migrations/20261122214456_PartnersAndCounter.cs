using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class PartnersAndCounter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The staff role first shipped as "carton" is the counter (کانتر).
            migrationBuilder.Sql("UPDATE AdminUsers SET Role = 'counter' WHERE Role = 'carton'");

            migrationBuilder.AddColumn<string>(
                name: "Country",
                table: "WarrantyRegistrations",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InstallerPhone",
                table: "WarrantyRegistrations",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Partner",
                table: "PortalUsers",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "PartnerAppliedAt",
                table: "PortalUsers",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "PartnerReviewedAt",
                table: "PortalUsers",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ShopName",
                table: "PortalUsers",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "WarrantyPhotos",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    WarrantyCode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Data = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                    SizeBytes = table.Column<int>(type: "int", nullable: false),
                    UploadedBy = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WarrantyPhotos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WarrantyPhotos_WarrantyRegistrations_WarrantyCode",
                        column: x => x.WarrantyCode,
                        principalTable: "WarrantyRegistrations",
                        principalColumn: "Code",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_WarrantyRegistrations_InstallerPhone",
                table: "WarrantyRegistrations",
                column: "InstallerPhone");

            migrationBuilder.CreateIndex(
                name: "IX_WarrantyRegistrations_Status_CreatedAt",
                table: "WarrantyRegistrations",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PortalUsers_Partner",
                table: "PortalUsers",
                column: "Partner");

            migrationBuilder.CreateIndex(
                name: "IX_WarrantyPhotos_WarrantyCode",
                table: "WarrantyPhotos",
                column: "WarrantyCode");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE AdminUsers SET Role = 'carton' WHERE Role = 'counter'");

            migrationBuilder.DropTable(
                name: "WarrantyPhotos");

            migrationBuilder.DropIndex(
                name: "IX_WarrantyRegistrations_InstallerPhone",
                table: "WarrantyRegistrations");

            migrationBuilder.DropIndex(
                name: "IX_WarrantyRegistrations_Status_CreatedAt",
                table: "WarrantyRegistrations");

            migrationBuilder.DropIndex(
                name: "IX_PortalUsers_Partner",
                table: "PortalUsers");

            migrationBuilder.DropColumn(
                name: "Country",
                table: "WarrantyRegistrations");

            migrationBuilder.DropColumn(
                name: "InstallerPhone",
                table: "WarrantyRegistrations");

            migrationBuilder.DropColumn(
                name: "Partner",
                table: "PortalUsers");

            migrationBuilder.DropColumn(
                name: "PartnerAppliedAt",
                table: "PortalUsers");

            migrationBuilder.DropColumn(
                name: "PartnerReviewedAt",
                table: "PortalUsers");

            migrationBuilder.DropColumn(
                name: "ShopName",
                table: "PortalUsers");
        }
    }
}
