using Microsoft.EntityFrameworkCore;

namespace TurboToys.Data;

/// <summary>
/// The tables of TurboToys in the database of MatGame (PostgreSQL), all in the schema <see cref="Schema"/> with their own migration history there.
/// Tables and columns are PascalCase (singular table names), every key is a bigint "Id" (the key of <see cref="Player"/> is the MatGame account id).
/// Saving fills the audit columns: CreateDate/CreateUserId for new records, UpdateDate/UpdateUserId always, UpdateState = Updated for changed soft-delete records.
/// The business layer says who acts with <see cref="ActingAs"/>.
/// </summary>
public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public const string Schema = "turbotoys";

    public DbSet<Player> Players => Set<Player>();

    public DbSet<Car> Cars => Set<Car>();

    public DbSet<Weapon> Weapons => Set<Weapon>();

    public DbSet<Track> Tracks => Set<Track>();

    public DbSet<Cup> Cups => Set<Cup>();

    public DbSet<GarageCar> GarageCars => Set<GarageCar>();

    public DbSet<Race> Races => Set<Race>();

    public DbSet<RaceEntry> RaceEntries => Set<RaceEntry>();

    public DbSet<CupRun> CupRuns => Set<CupRun>();

    public DbSet<Setting> Settings => Set<Setting>();

    /// <summary>The player whose changes are saved (null = the system).</summary>
    public long? ActorId { get; private set; }

    public AppDbContext ActingAs(long? playerId)
    {
        ActorId = playerId;
        return this;
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.Entity<Player>(e =>
        {
            e.ToTable("Player");
            e.Property(p => p.Id).ValueGeneratedNever();
            e.Property(p => p.DisplayName).HasMaxLength(60);
            e.Property(p => p.AvatarFace).HasMaxLength(24);
            e.Property(p => p.AvatarHair).HasMaxLength(24);
            e.Property(p => p.AvatarHelmet).HasMaxLength(24);
            e.Property(p => p.AvatarColor).HasMaxLength(7);
            e.Property(p => p.AvatarSkin).HasMaxLength(7);
            e.HasIndex(p => p.Xp);
        });

        modelBuilder.Entity<Car>(e =>
        {
            e.ToTable("Car");
            e.Property(c => c.Key).HasMaxLength(24);
            e.Property(c => c.Name).HasMaxLength(60);
            e.Property(c => c.Description).HasMaxLength(400);
            e.Property(c => c.Body).HasMaxLength(24);
            e.Property(c => c.DefaultPaint).HasMaxLength(7);
            e.Property(c => c.Drive).HasConversion<int>();
            e.HasIndex(c => c.Key).IsUnique();
        });

        modelBuilder.Entity<Weapon>(e =>
        {
            e.ToTable("Weapon");
            e.Property(w => w.Name).HasMaxLength(60);
            e.Property(w => w.Description).HasMaxLength(400);
            e.Property(w => w.Kind).HasConversion<int>();
        });

        modelBuilder.Entity<Track>(e =>
        {
            e.ToTable("Track");
            e.Property(t => t.Layout).HasMaxLength(24);
            e.Property(t => t.Name).HasMaxLength(60);
            e.Property(t => t.Description).HasMaxLength(400);
            e.Property(t => t.TimeOfDay).HasConversion<int>();
        });

        modelBuilder.Entity<Cup>(e =>
        {
            e.ToTable("Cup");
            e.Property(c => c.Name).HasMaxLength(60);
            e.Property(c => c.Description).HasMaxLength(400);
            e.Property(c => c.TrackIds).HasMaxLength(200);
        });

        modelBuilder.Entity<GarageCar>(e =>
        {
            e.ToTable("GarageCar");
            e.Property(g => g.Paint).HasMaxLength(7);
            e.Property(g => g.Decal).HasMaxLength(24);
            e.HasOne(g => g.Car).WithMany().HasForeignKey(g => g.CarId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne<Player>().WithMany().HasForeignKey(g => g.PlayerId).OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(g => new { g.PlayerId, g.CarId }).IsUnique();
        });

        modelBuilder.Entity<Race>(e =>
        {
            e.ToTable("Race");
            e.Property(r => r.Name).HasMaxLength(60);
            e.Property(r => r.Kind).HasConversion<int>();
            e.Property(r => r.Status).HasConversion<int>();
            e.HasIndex(r => r.Token).IsUnique();
            e.HasIndex(r => r.Status);
            e.HasOne(r => r.Track).WithMany().HasForeignKey(r => r.TrackId).OnDelete(DeleteBehavior.SetNull);
            e.HasMany(r => r.Entries).WithOne(x => x.Race).HasForeignKey(x => x.RaceId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RaceEntry>(e =>
        {
            e.ToTable("RaceEntry");
            e.Property(x => x.Name).HasMaxLength(60);
            e.Property(x => x.CarName).HasMaxLength(60);
            e.Property(x => x.CarBody).HasMaxLength(24);
            e.HasIndex(x => x.PlayerId);
            e.HasIndex(x => new { x.RaceId, x.Seat }).IsUnique();
        });

        modelBuilder.Entity<CupRun>(e =>
        {
            e.ToTable("CupRun");
            e.Property(r => r.Status).HasConversion<int>();
            e.Property(r => r.Standings).HasMaxLength(4000);
            e.HasIndex(r => r.Token).IsUnique();
            e.HasIndex(r => new { r.PlayerId, r.Status });
            e.HasOne(r => r.Cup).WithMany().HasForeignKey(r => r.CupId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Setting>(e =>
        {
            e.ToTable("Setting");
            e.Property(s => s.Key).HasMaxLength(80);
            e.Property(s => s.Value).HasMaxLength(2000);
            e.HasIndex(s => s.Key).IsUnique();
        });
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        foreach (var entry in ChangeTracker.Entries<Entity>())
        {
            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreateDate = now;
                entry.Entity.CreateUserId = ActorId;
                entry.Entity.UpdateDate = now;
                entry.Entity.UpdateUserId = ActorId;
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdateDate = now;
                entry.Entity.UpdateUserId = ActorId;
                if (entry.Entity is SoftDeleteEntity soft && soft.UpdateState != UpdateState.Deleted)
                {
                    soft.UpdateState = UpdateState.Updated;
                }
            }
        }

        return base.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>How the plugin and the tools open the database: Npgsql, the migration history in the game's own schema.</summary>
public static class AppDatabase
{
    public static void Configure(DbContextOptionsBuilder options, string connectionString)
        => options.UseNpgsql(connectionString, npgsql => npgsql.MigrationsHistoryTable("__EFMigrationsHistory", AppDbContext.Schema));
}

/// <summary>For <c>dotnet ef migrations add</c> (no host needed): the local Postgres of MatGame's stack (port 2775).</summary>
public sealed class AppDbContextFactory : Microsoft.EntityFrameworkCore.Design.IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>();
        AppDatabase.Configure(options, Environment.GetEnvironmentVariable("TURBOTOYS_DESIGN_DB")
                                       ?? "Host=localhost;Port=2775;Database=matgame;Username=matgame;Password=matgame");
        return new AppDbContext(options.Options);
    }
}
