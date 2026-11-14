using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class PortalAccountsAndWarrantyCards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FromPhone",
                table: "BoxTransfers",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CardCode",
                table: "BoxLabels",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FactoryCode",
                table: "BoxLabels",
                type: "nvarchar(4)",
                maxLength: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HolderPhone",
                table: "BoxLabels",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);

            // Boxes already handed over with a recipient mobile become visible in that mobile's account.
            migrationBuilder.Sql("""
                UPDATE b SET HolderPhone = t.ToPhone
                FROM BoxLabels b
                CROSS APPLY (SELECT TOP 1 ToPhone FROM BoxTransfers x WHERE x.LabelId = b.Id ORDER BY x.At DESC, x.Id DESC) t
                WHERE b.Holder IS NOT NULL AND t.ToPhone IS NOT NULL
                """);
            migrationBuilder.Sql("""
                UPDATE BoxLabels SET HolderPhone = '0' + RIGHT(HolderPhone, 10)
                WHERE HolderPhone LIKE '+989%' OR HolderPhone LIKE '989%' OR HolderPhone LIKE '00989%'
                """);

            migrationBuilder.CreateTable(
                name: "LoginChallenges",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
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
                    table.PrimaryKey("PK_LoginChallenges", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PortalUsers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Phone = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Active = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastLoginAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PortalUsers", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BoxTransfers_FromPhone_At",
                table: "BoxTransfers",
                columns: new[] { "FromPhone", "At" });

            migrationBuilder.CreateIndex(
                name: "IX_BoxLabels_CardCode",
                table: "BoxLabels",
                column: "CardCode",
                unique: true,
                filter: "[CardCode] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BoxLabels_HolderPhone",
                table: "BoxLabels",
                column: "HolderPhone");

            migrationBuilder.CreateIndex(
                name: "IX_LoginChallenges_Phone_CreatedAt",
                table: "LoginChallenges",
                columns: new[] { "Phone", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PortalUsers_Phone",
                table: "PortalUsers",
                column: "Phone",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "LoginChallenges");

            migrationBuilder.DropTable(
                name: "PortalUsers");

            migrationBuilder.DropIndex(
                name: "IX_BoxTransfers_FromPhone_At",
                table: "BoxTransfers");

            migrationBuilder.DropIndex(
                name: "IX_BoxLabels_CardCode",
                table: "BoxLabels");

            migrationBuilder.DropIndex(
                name: "IX_BoxLabels_HolderPhone",
                table: "BoxLabels");

            migrationBuilder.DropColumn(
                name: "FromPhone",
                table: "BoxTransfers");

            migrationBuilder.DropColumn(
                name: "CardCode",
                table: "BoxLabels");

            migrationBuilder.DropColumn(
                name: "FactoryCode",
                table: "BoxLabels");

            migrationBuilder.DropColumn(
                name: "HolderPhone",
                table: "BoxLabels");
        }
    }
}
