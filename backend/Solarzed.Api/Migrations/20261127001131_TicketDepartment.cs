using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <inheritdoc />
    public partial class TicketDepartment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Department",
                table: "Tickets",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Department",
                table: "Tickets");
        }
    }
}
