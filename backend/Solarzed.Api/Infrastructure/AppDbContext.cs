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

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<BoxLabel>().HasIndex(x => x.TokenHash).IsUnique();
        mb.Entity<BoxLabel>().HasIndex(x => x.WarrantyCode).IsUnique().HasFilter("[WarrantyCode] IS NOT NULL");
        mb.Entity<BoxLabel>().HasOne<Roll>().WithMany().HasForeignKey(x => x.RollId).OnDelete(DeleteBehavior.Restrict);
        mb.Entity<BoxLabel>().HasOne<WarrantyRegistration>().WithMany().HasForeignKey(x => x.WarrantyCode).OnDelete(DeleteBehavior.Restrict);
        mb.Entity<ActivationChallenge>().HasIndex(x => new { x.Phone, x.CreatedAt });
        mb.Entity<ActivationChallenge>().HasOne<BoxLabel>().WithMany().HasForeignKey(x => x.LabelId).OnDelete(DeleteBehavior.Cascade);
        mb.Entity<WarrantyRegistration>()
            .HasIndex(w => new { w.FilmSerial, w.InvoiceNumber })
            .IsUnique();

        mb.Entity<WarrantyRegistration>()
            .HasIndex(w => w.Vin);

        mb.Entity<WarrantyRegistration>()
            .HasIndex(w => w.Phone);

        // Seed is handled at startup (Program.cs) to avoid EF non-deterministic model warning.
    }
}
