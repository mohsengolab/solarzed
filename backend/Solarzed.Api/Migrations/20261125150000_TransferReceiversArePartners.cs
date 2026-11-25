using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Solarzed.Api.Infrastructure;

#nullable disable

namespace Solarzed.Api.Migrations
{
    /// <summary>
    /// Data only: everyone who has received rolls by transfer becomes an approved partner (همکار), so they can register
    /// warranties from the Serial Number and appear under Partners. Suspended partners are left as they are.
    /// PartnerStatus: 0 None, 1 Pending, 2 Approved, 3 Suspended.
    /// </summary>
    [DbContext(typeof(AppDbContext))]
    [Migration("20261125150000_TransferReceiversArePartners")]
    public partial class TransferReceiversArePartners : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE u SET Partner = 2,
                    PartnerAppliedAt = COALESCE(u.PartnerAppliedAt, SYSUTCDATETIME()),
                    PartnerReviewedAt = SYSUTCDATETIME(),
                    ShopName = COALESCE(u.ShopName, u.Name)
                FROM PortalUsers u
                WHERE u.Partner IN (0, 1) AND u.Phone IS NOT NULL
                  AND EXISTS (SELECT 1 FROM BoxTransfers t WHERE t.ToPhone = u.Phone AND t.BatchId LIKE 'TRF-%');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder) { }
    }
}
