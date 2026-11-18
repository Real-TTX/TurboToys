using MatGame.Sdk;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using TurboToys.Business;
using TurboToys.Data;
using TurboToys.Game;
using TurboToys.Web;

namespace TurboToys;

/// <summary>
/// TurboToys as a game of MatGame: the player app at <c>/turbotoys/</c>, its API at <c>/turbotoys/api</c>, the hub at <c>/turbotoys/hub</c>,
/// the tables in the schema <c>turbotoys</c>, the admin pages under <c>/Admin/TurboToys</c>. The host (MatGame) signs the players in.
/// </summary>
public sealed class TurboToysModule : IGameModule
{
    /// <summary>The game id (path, schema, apps).</summary>
    public const string Id = "turbotoys";

    /// <summary>The protocol of the game: rises only with a change of the API or the hub old apps cannot follow.</summary>
    public const int Protocol = 1;

    public static readonly GameInfo Information = new(
        Id,
        "TurboToys",
        "Ferngesteuerte Autos im Comic-Look: Elektro, Benzin und Turbo, Waffen, Tuning und Pokale – gegen Bots oder Freunde.",
        AppInfo.Version,
        Protocol,
        MinClient: null,
        Accent: "#e2392f",
        Cover: "img/cover.png",
        Icon: "img/icon-512.png");

    public GameInfo Info => Information;

    public IReadOnlyList<AdminLink> Admin { get; } =
    [
        new("Übersicht", "/Admin/TurboToys", "dashboard"),
        new("Spieler", "/Admin/TurboToys/Players", "users"),
        new("Rennen", "/Admin/TurboToys/Races", "flag"),
        new("Autos", "/Admin/TurboToys/Cars", "car"),
        new("Strecken", "/Admin/TurboToys/Tracks", "track"),
        new("Pokale", "/Admin/TurboToys/Cups", "trophy"),
        new("Waffen", "/Admin/TurboToys/Weapons", "weapon"),
        new("Einstellungen", "/Admin/TurboToys/System", "settings"),
    ];

    public void AddServices(IServiceCollection services, GameEnvironment environment)
    {
        services.AddDbContext<AppDbContext>(o => AppDatabase.Configure(o, environment.ConnectionString));
        services.AddSingleton<RoomRegistry>();
        services.AddHostedService<GameTicker>();
        services.Configure<HubOptions<GameHub>>(o => o.AddFilter(new HubErrors()));
    }

    public void MapGame(IEndpointRouteBuilder game, GameEnvironment environment)
    {
        game.MapApi(Info);
        game.MapHub<GameHub>("/hub", o => o.ApplicationMaxBufferSize = 64 * 1024).RequireCors(MatGameProtocol.AppCorsPolicy);
        PlayerApp.Map(game, environment.BasePath);
    }

    public async Task StartAsync(IServiceProvider services, CancellationToken ct)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var log = scope.ServiceProvider.GetRequiredService<ILogger<TurboToysModule>>();
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await db.Database.MigrateAsync(ct);
                break;
            }
            catch (Exception e) when (attempt < 15 && !ct.IsCancellationRequested)
            {
                log.LogWarning("TurboToys: the database is not ready yet ({Message}), attempt {Attempt}", e.Message, attempt);
                await Task.Delay(TimeSpan.FromSeconds(2), ct);
            }
        }

        await SeedLogic.EnsureAsync(db, Actor.System);
        var stale = await RaceLogic.AbortStaleAsync(db, Actor.System);
        if (stale > 0)
        {
            log.LogInformation("TurboToys: {Count} races of the last run were closed", stale);
        }
    }

    public Task<GameStats> StatsAsync(IServiceProvider services, CancellationToken ct)
    {
        var registry = services.GetRequiredService<RoomRegistry>();
        var rooms = registry.Rooms.Where(r => r.Status != RoomStatus.Closed).ToList();
        var players = rooms.Sum(r => r.Humans);
        var running = rooms.Count(r => r.Status is RoomStatus.Racing or RoomStatus.Countdown);
        return Task.FromResult(new GameStats(players, running));
    }

    public async Task<GameProfile?> ProfileAsync(IServiceProvider services, long accountId, CancellationToken ct)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var player = await db.Players.AsNoTracking().FirstOrDefaultAsync(p => p.Id == accountId && p.UpdateState != UpdateState.Deleted, ct);
        return player is null ? null : new GameProfile(Progression.LevelOf(player.Xp), $"{player.RacesWon} {(player.RacesWon == 1 ? "Sieg" : "Siege")} · {player.CupsWon} Pokale");
    }

    public async Task AccountDeletedAsync(IServiceProvider services, long accountId, CancellationToken ct)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await PlayerLogic.AccountDeletedAsync(db, Actor.System, accountId);
    }
}
