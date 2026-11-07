using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class BoxLabelsAndActivation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PublicSiteUrl",
                table: "CoverageSettings",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: false,
                defaultValue: "https://solarzed.com");

            migrationBuilder.CreateTable(
                name: "BoxLabels",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    TokenHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ProtectedToken = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    RollId = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Product = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    FilmYears = table.Column<int>(type: "int", nullable: false),
                    InstallYears = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ActivatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    WarrantyCode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    Revision = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoxLabels", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BoxLabels_Rolls_RollId",
                        column: x => x.RollId,
                        principalTable: "Rolls",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BoxLabels_WarrantyRegistrations_WarrantyCode",
                        column: x => x.WarrantyCode,
                        principalTable: "WarrantyRegistrations",
                        principalColumn: "Code",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ActivationChallenges",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    LabelId = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    CodeHash = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Sent = table.Column<bool>(type: "bit", nullable: false),
                    Consumed = table.Column<bool>(type: "bit", nullable: false),
                    Attempts = table.Column<int>(type: "int", nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActivationChallenges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ActivationChallenges_BoxLabels_LabelId",
                        column: x => x.LabelId,
                        principalTable: "BoxLabels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ActivationChallenges_LabelId",
                table: "ActivationChallenges",
                column: "LabelId");

            migrationBuilder.CreateIndex(
                name: "IX_ActivationChallenges_Phone_CreatedAt",
                table: "ActivationChallenges",
                columns: new[] { "Phone", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BoxLabels_RollId",
                table: "BoxLabels",
                column: "RollId");

            migrationBuilder.CreateIndex(
                name: "IX_BoxLabels_TokenHash",
                table: "BoxLabels",
                column: "TokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BoxLabels_WarrantyCode",
                table: "BoxLabels",
                column: "WarrantyCode",
                unique: true,
                filter: "[WarrantyCode] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ActivationChallenges");

            migrationBuilder.DropTable(
                name: "BoxLabels");

            migrationBuilder.DropColumn(
                name: "PublicSiteUrl",
                table: "CoverageSettings");
        }
    }
}
