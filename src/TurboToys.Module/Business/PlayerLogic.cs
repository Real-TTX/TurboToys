using Microsoft.EntityFrameworkCore;
using TurboToys.Data;

namespace TurboToys.Business;

/// <summary>The players of TurboToys (one per MatGame account): created at the first request, profile and avatar, the leaderboard, the administration.</summary>
public static class PlayerLogic
{
    /// <summary>
    /// The player row of the actor: made at the first request (start capital, the starter car), its name follows the account. Null when the player was
    /// removed by an administrator.
    /// </summary>
    public static async Task<Player?> EnsureAsync(AppDbContext db, Actor actor, bool isGuest)
    {
        Guard.Player(actor);
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == actor.PlayerId);
        if (player is { UpdateState: UpdateState.Deleted })
        {
            return null;
        }

        db.ActingAs(actor.AuditId);
        if (player is null)
        {
            player = PlayerRules.NewPlayer(actor.PlayerId, actor.DisplayName, isGuest);
            player.Money = (await SettingLogic.GetAsync(db)).StartMoney;
            db.Players.Add(player);
            await db.SaveChangesAsync();
        }
        else if (player.DisplayName != actor.DisplayName || player.IsGuest != isGuest)
        {
            player.DisplayName = actor.DisplayName.Length > 60 ? actor.DisplayName[..60] : actor.DisplayName;
            player.IsGuest = isGuest;
            await db.SaveChangesAsync();
        }

        if (!await db.GarageCars.AnyAsync(g => g.PlayerId == player.Id))
        {
            var catalog = await db.Cars.AsNoTracking().ToListAsync();
            if (PlayerRules.EnsureStarterCar(player, [], catalog) is { } starter)
            {
                starter.Car = null;
                db.GarageCars.Add(starter);
                await db.SaveChangesAsync();
                player.SelectedGarageCarId = starter.Id;
                await db.SaveChangesAsync();
            }
        }

        return player;
    }

    public static async Task<Player?> GetAsync(AppDbContext db, Actor actor, long playerId)
    {
        Guard.AdminOrSelf(actor, playerId);
        return await db.Players.AsNoTracking().FirstOrDefaultAsync(p => p.Id == playerId && p.UpdateState != UpdateState.Deleted);
    }

    public static async Task<ProfileView> ProfileAsync(AppDbContext db, Actor actor)
    {
        Guard.Player(actor);
        var player = await db.Players.AsNoTracking().FirstAsync(p => p.Id == actor.PlayerId);
        return Views.Profile(player, actor.IsAdmin, await RankAsync(db, player));
    }

    public static async Task<ProfileView> SaveAvatarAsync(AppDbContext db, Actor actor, string? face, string? hair, string? helmet, string? color, string? skin)
    {
        Guard.Player(actor);
        var player = await db.Players.FirstAsync(p => p.Id == actor.PlayerId);
        PlayerRules.SetAvatar(player, face, hair, helmet, color, skin, actor.IsAdmin);
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        return Views.Profile(player, actor.IsAdmin, await RankAsync(db, player));
    }

    /// <summary>The place in the leaderboard (accounts only, by experience), null for guests and players without races.</summary>
    public static async Task<int?> RankAsync(AppDbContext db, Player player)
    {
        if (player.IsGuest || player.RacesPlayed == 0)
        {
            return null;
        }

        return await db.Players.CountAsync(p => !p.IsGuest && p.UpdateState != UpdateState.Deleted && p.RacesPlayed > 0 && p.Xp > player.Xp) + 1;
    }

    /// <summary>The best players (accounts only: guests are not in the leaderboard).</summary>
    public static async Task<IReadOnlyList<LeaderRow>> LeaderboardAsync(AppDbContext db, Actor actor, int count = 25)
    {
        Guard.Player(actor);
        var players = await db.Players.AsNoTracking()
            .Where(p => !p.IsGuest && p.UpdateState != UpdateState.Deleted && p.RacesPlayed > 0)
            .OrderByDescending(p => p.Xp).ThenByDescending(p => p.RacesWon).Take(Math.Clamp(count, 1, 100))
            .ToListAsync();
        return players.Select((p, i) => new LeaderRow(i + 1, p.Id, p.DisplayName, Progression.LevelOf(p.Xp), p.Xp, p.RacesWon, p.Podiums, p.Kills, PlayerRules.AvatarOf(p))).ToList();
    }

    // ---------------------------------------------------------------- administration

    public sealed record PlayerRow(long Id, string DisplayName, bool IsGuest, int Level, int Xp, int Money, int RacesPlayed, int RacesWon, int Cars, DateTime? LastRaceDate);

    public static async Task<PagedResult<PlayerRow>> ListAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Admin(actor);
        var all = db.Players.AsNoTracking().Where(p => p.UpdateState != UpdateState.Deleted);
        var query = all;
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            query = query.Where(p => p.DisplayName.ToLower().Contains(s));
        }

        query = request.Filter("kind") switch
        {
            "guest" => query.Where(p => p.IsGuest),
            "account" => query.Where(p => !p.IsGuest),
            _ => query,
        };

        query = request.Sort switch
        {
            "xp" => query.SortBy(p => p.Xp, request.Descending),
            "money" => query.SortBy(p => p.Money, request.Descending),
            "races" => query.SortBy(p => p.RacesPlayed, request.Descending),
            "last" => query.SortBy(p => p.LastRaceDate, request.Descending),
            _ => query.SortBy(p => p.DisplayName, request.Descending),
        };

        var matching = await query.CountAsync();
        var total = await all.CountAsync();
        var page = await query.Page(request)
            .Select(p => new { p.Id, p.DisplayName, p.IsGuest, p.Xp, p.Money, p.RacesPlayed, p.RacesWon, p.LastRaceDate, Cars = db.GarageCars.Count(g => g.PlayerId == p.Id) })
            .ToListAsync();
        return new PagedResult<PlayerRow>(
            page.Select(p => new PlayerRow(p.Id, p.DisplayName, p.IsGuest, Progression.LevelOf(p.Xp), p.Xp, p.Money, p.RacesPlayed, p.RacesWon, p.Cars, p.LastRaceDate)).ToList(),
            matching, total);
    }

    public sealed record PlayerDetail(Player Player, IReadOnlyList<(GarageCar Garage, Car Car)> Garage, IReadOnlyList<HistoryItem> History);

    public static async Task<PlayerDetail?> DetailAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        var player = await db.Players.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id && p.UpdateState != UpdateState.Deleted);
        if (player is null)
        {
            return null;
        }

        var garage = await db.GarageCars.AsNoTracking().Include(g => g.Car).Where(g => g.PlayerId == id).OrderBy(g => g.Id).ToListAsync();
        var history = await RaceLogic.HistoryOfAsync(db, id, 20);
        return new PlayerDetail(player, garage.Where(g => g.Car is not null).Select(g => (g, g.Car!)).ToList(), history);
    }

    /// <summary>The administration changes money and experience of a player (its name is the account's).</summary>
    public static async Task SaveAsync(AppDbContext db, Actor actor, long id, int money, int xp)
    {
        Guard.Admin(actor);
        if (money < 0 || money > 10_000_000)
        {
            throw new BusinessException("Das Geld muss zwischen 0 und 10 Millionen liegen.", "Money");
        }

        if (xp < 0 || xp > 10_000_000)
        {
            throw new BusinessException("Die Erfahrung muss zwischen 0 und 10 Millionen liegen.", "Xp");
        }

        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == id && p.UpdateState != UpdateState.Deleted)
                     ?? throw new BusinessException("Diesen Spieler gibt es nicht.");
        player.Money = money;
        player.Xp = xp;
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
    }

    /// <summary>Removes a player from TurboToys (soft): garage and runs go, the account in MatGame stays. A new visit starts from scratch only if an admin restores it.</summary>
    public static async Task DeleteAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == id) ?? throw new BusinessException("Diesen Spieler gibt es nicht.");
        player.UpdateState = UpdateState.Deleted;
        db.GarageCars.RemoveRange(db.GarageCars.Where(g => g.PlayerId == id));
        db.CupRuns.RemoveRange(db.CupRuns.Where(r => r.PlayerId == id));
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
    }

    /// <summary>MatGame deleted the account: the player and its garage go, the races keep the name without the link.</summary>
    public static async Task AccountDeletedAsync(AppDbContext db, Actor actor, long accountId)
    {
        Guard.Admin(actor);
        await db.RaceEntries.Where(e => e.PlayerId == accountId).ExecuteUpdateAsync(s => s.SetProperty(e => e.PlayerId, (long?)null));
        await db.GarageCars.Where(g => g.PlayerId == accountId).ExecuteDeleteAsync();
        await db.CupRuns.Where(r => r.PlayerId == accountId).ExecuteDeleteAsync();
        await db.Players.Where(p => p.Id == accountId).ExecuteDeleteAsync();
    }

    public sealed record Dashboard(int Players, int Guests, int RacesToday, int RacesTotal, int CupsWon, IReadOnlyList<LeaderRow> Top);

    public static async Task<Dashboard> DashboardAsync(AppDbContext db, Actor actor)
    {
        Guard.Admin(actor);
        var today = DateTime.UtcNow.Date;
        var players = await db.Players.CountAsync(p => !p.IsGuest && p.UpdateState != UpdateState.Deleted);
        var guests = await db.Players.CountAsync(p => p.IsGuest && p.UpdateState != UpdateState.Deleted);
        var racesToday = await db.Races.CountAsync(r => r.Status == RaceStatus.Finished && r.EndDate >= today);
        var racesTotal = await db.Races.CountAsync(r => r.Status == RaceStatus.Finished);
        var cups = await db.CupRuns.CountAsync(r => r.Status == CupRunStatus.Finished && r.Place == 1);
        return new Dashboard(players, guests, racesToday, racesTotal, cups, await LeaderboardAsync(db, actor, 5));
    }
}
