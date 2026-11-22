using Microsoft.EntityFrameworkCore;
using Solarzed.Api.Domain;

namespace Solarzed.Api.Infrastructure;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Product> Products => Set<Product>();
    public DbSet<WarrantyRegistration> WarrantyRegistrations => Set<WarrantyRegistration>();
    public DbSet<Roll> Rolls => Set<Roll>();
    public DbSet<CoverageSetting> CoverageSettings => Set<CoverageSetting>();
    public DbSet<AdminUser> AdminUsers => Set<AdminUser>();
    public DbSet<BoxLabel> BoxLabels => Set<BoxLabel>();
    public DbSet<ActivationChallenge> ActivationChallenges => Set<ActivationChallenge>();
    public DbSet<WarrantyClaim> WarrantyClaims => Set<WarrantyClaim>();
    public DbSet<AuditEntry> AuditEntries => Set<AuditEntry>();
    public DbSet<BoxTransfer> BoxTransfers => Set<BoxTransfer>();
    public DbSet<PortalUser> PortalUsers => Set<PortalUser>();
    public DbSet<LoginChallenge> LoginChallenges => Set<LoginChallenge>();
    public DbSet<Ticket> Tickets => Set<Ticket>();
    public DbSet<TicketReply> TicketReplies => Set<TicketReply>();

    // Every timestamp is written as DateTime.UtcNow, but SQL Server's datetime2 has no time zone, so values come back
    // as Kind=Unspecified and serialize without "Z". Browsers then read them as local time (3.5 h off in Tehran).
    // Mark them UTC on the way out of the database so the JSON always carries "Z".
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
        configurationBuilder.Properties<DateTime?>().HaveConversion<NullableUtcDateTimeConverter>();
    }

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<WarrantyClaim>().HasOne<WarrantyRegistration>().WithMany().HasForeignKey(x => x.WarrantyCode).OnDelete(DeleteBehavior.Restrict);
        mb.Entity<WarrantyClaim>().HasIndex(x => new { x.Stage, x.CreatedAt });
        mb.Entity<AuditEntry>().HasIndex(x => new { x.EntityType, x.EntityId, x.At });
        mb.Entity<AuditEntry>().HasIndex(x => x.At);

        mb.Entity<Roll>().HasIndex(x => x.RollNo).IsUnique().HasFilter("[RollNo] IS NOT NULL");
        mb.Entity<Roll>().HasIndex(x => x.Number).IsUnique();
        mb.Entity<BoxLabel>().HasIndex(x => x.TokenHash).IsUnique();
        mb.Entity<BoxLabel>().HasIndex(x => x.WarrantyCode).IsUnique().HasFilter("[WarrantyCode] IS NOT NULL");
        mb.Entity<BoxLabel>().HasOne<Roll>().WithMany().HasForeignKey(x => x.RollId).OnDelete(DeleteBehavior.Restrict);
        mb.Entity<BoxLabel>().HasOne<WarrantyRegistration>().WithMany().HasForeignKey(x => x.WarrantyCode).OnDelete(DeleteBehavior.Restrict);
        mb.Entity<BoxLabel>().HasIndex(x => x.Holder);
        mb.Entity<BoxLabel>().HasIndex(x => x.HolderPhone);
        mb.Entity<BoxLabel>().HasIndex(x => x.CardCode).IsUnique().HasFilter("[CardCode] IS NOT NULL");
        mb.Entity<BoxTransfer>().HasIndex(x => new { x.FromPhone, x.At });
        mb.Entity<PortalUser>().HasIndex(x => x.Phone).IsUnique();
        mb.Entity<PortalUser>().HasIndex(x => x.Email).IsUnique().HasFilter("[Email] IS NOT NULL");
        mb.Entity<LoginChallenge>().HasIndex(x => new { x.Phone, x.CreatedAt });
        mb.Entity<LoginChallenge>().HasIndex(x => new { x.Email, x.CreatedAt });
        mb.Entity<Ticket>().HasIndex(x => new { x.Status, x.CreatedAt });
        mb.Entity<Ticket>().HasIndex(x => new { x.UserId, x.CreatedAt });
        mb.Entity<Ticket>().HasIndex(x => x.Code).IsUnique();
        mb.Entity<TicketReply>().HasIndex(x => new { x.TicketId, x.CreatedAt });
        mb.Entity<Ticket>().HasMany(x => x.Replies).WithOne(r => r.Ticket!).HasForeignKey(r => r.TicketId).OnDelete(DeleteBehavior.Cascade);
        mb.Entity<BoxTransfer>().HasOne<BoxLabel>().WithMany().HasForeignKey(x => x.LabelId).OnDelete(DeleteBehavior.Restrict);
        mb.Entity<BoxTransfer>().HasIndex(x => new { x.LabelId, x.At });
        mb.Entity<BoxTransfer>().HasIndex(x => x.BatchId);
        mb.Entity<ActivationChallenge>().HasIndex(x => new { x.Phone, x.CreatedAt });
        mb.Entity<ActivationChallenge>().HasOne<BoxLabel>().WithMany().HasForeignKey(x => x.LabelId).OnDelete(DeleteBehavior.Cascade);
        mb.Entity<WarrantyRegistration>()
            .HasIndex(w => new { w.FilmSerial, w.InvoiceNumber })
            .IsUnique().HasFilter("[UsedLengthM] IS NULL");

        mb.Entity<WarrantyRegistration>()
            .HasIndex(w => new { w.FilmSerial, w.Vin })
            .IsUnique().HasFilter("[UsedLengthM] IS NOT NULL");

        mb.Entity<WarrantyRegistration>()
            .HasIndex(w => w.Vin);

        mb.Entity<WarrantyRegistration>()
            .HasIndex(w => w.Phone);

        // Seed is handled at startup (Program.cs) to avoid EF non-deterministic model warning.
    }
}
