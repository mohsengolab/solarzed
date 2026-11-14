using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class BoxTransfers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "HeldSince",
                table: "BoxLabels",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Holder",
                table: "BoxLabels",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "BoxTransfers",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    LabelId = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    BatchId = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    FromHolder = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ToHolder = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ToPhone = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Actor = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    At = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoxTransfers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BoxTransfers_BoxLabels_LabelId",
                        column: x => x.LabelId,
                        principalTable: "BoxLabels",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BoxLabels_Holder",
                table: "BoxLabels",
                column: "Holder");

            migrationBuilder.CreateIndex(
                name: "IX_BoxTransfers_BatchId",
                table: "BoxTransfers",
                column: "BatchId");

            migrationBuilder.CreateIndex(
                name: "IX_BoxTransfers_LabelId_At",
                table: "BoxTransfers",
                columns: new[] { "LabelId", "At" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BoxTransfers");

            migrationBuilder.DropIndex(
                name: "IX_BoxLabels_Holder",
                table: "BoxLabels");

            migrationBuilder.DropColumn(
                name: "HeldSince",
                table: "BoxLabels");

            migrationBuilder.DropColumn(
                name: "Holder",
                table: "BoxLabels");
        }
    }
}
