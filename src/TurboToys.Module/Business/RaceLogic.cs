using Microsoft.EntityFrameworkCore;
using TurboToys.Data;
using TurboToys.Game;

namespace TurboToys.Business;

/// <summary>
/// The races in the database: a record when a race starts, the results (money, experience, statistics, cup points) when it ends, the history,
/// and the administration of past races. The live race is the <see cref="RaceRoom"/> in memory.
/// </summary>
public static class RaceLogic
{
    /// <summary>The race started: writes its record (status running) with an entry per seat. Returns the record id.</summary>
    public static async Task<long> StartedAsync(AppDbContext db, Actor actor, RaceRoom room, long? cupRunId)
    {
        Guard.Admin(actor);
        var race = new Race
        {
            Token = room.Token,
            Name = room.Name,
            Kind = room.Kind,
            Status = RaceStatus.Running,
            TrackId = room.Track.Id > 0 ? room.Track.Id : null,
            Laps = room.Laps,
            Weapons = room.Weapons,
            HostPlayerId = room.HostPlayerId,
            CupRunId = cupRunId,
            Humans = room.Seats.Count(s => s.Kind == SeatKind.Human),
            Bots = room.Seats.Count(s => s.Kind == SeatKind.Bot),
            StartDate = DateTime.UtcNow,
            Entries = room.Seats.Select(s => new RaceEntry
            {
                Seat = s.Index,
                PlayerId = s.PlayerId,
                Name = s.Name,
                IsBot = s.Kind == SeatKind.Bot,
                CarName = s.Car.Name,
                CarBody = s.Car.Body,
            }).ToList(),
        };
        db.Races.Add(race);
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        return race.Id;
    }

    /// <summary>
    /// The race ended: the entries get their places and rewards; every human player gets money, experience and statistics; a cup race moves its run on
    /// (and pays the cup's prize at the end). Returns the cup outcome for the message to the player (place, prize) or null.
    /// </summary>
    public static async Task<(int Place, int Prize)?> FinishedAsync(AppDbContext db, Actor actor, RaceRoom room)
    {
        Guard.Admin(actor);
        var results = room.Results ?? throw new InvalidOperationException("The race has no results.");
        var race = await db.Races.Include(r => r.Entries).FirstOrDefaultAsync(r => r.Token == room.Token);
        if (race is not null)
        {
            race.Status = RaceStatus.Finished;
            race.EndDate = DateTime.UtcNow;
            foreach (var r in results.Results)
            {
                var entry = race.Entries.FirstOrDefault(e => e.Seat == r.Seat);
                if (entry is null)
                {
                    continue;
                }

                entry.Place = r.Place;
                entry.Finished = r.Finished;
                entry.TimeMs = r.TimeMs;
                entry.BestLapMs = r.BestLapMs;
                entry.Kills = r.Kills;
                entry.Wrecks = r.Wrecks;
                entry.MoneyGained = r.Money;
                entry.XpGained = r.Xp;
            }
        }

        var cars = results.Results.Count;
        foreach (var r in results.Results.Where(r => !r.IsBot && r.PlayerId is not null))
        {
            var player = await db.Players.FirstOrDefaultAsync(p => p.Id == r.PlayerId && p.UpdateState != UpdateState.Deleted);
            if (player is not null)
            {
                PlayerRules.AddRace(player, r, cars);
            }
        }

        (int Place, int Prize)? cupOutcome = null;
        if (room.CupRun is { } token)
        {
            var run = await db.CupRuns.Include(c => c.Cup).FirstOrDefaultAsync(c => c.Token == token && c.Status == CupRunStatus.Running);
            var player = run is null ? null : await db.Players.FirstOrDefaultAsync(p => p.Id == run.PlayerId);
            if (run?.Cup is not null && player is not null)
            {
                cupOutcome = CupRules.ApplyRace(run, run.Cup, results.Results, player.DisplayName);
                if (cupOutcome is { } outcome)
                {
                    player.Money += outcome.Prize;
                    player.MoneyEarned += outcome.Prize;
                    if (outcome.Place == 1)
                    {
                        player.CupsWon++;
                    }
                }
            }
        }

        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        return cupOutcome;
    }

    /// <summary>A race whose room disappeared without results (all players left): marked aborted.</summary>
    public static async Task AbortAsync(AppDbContext db, Actor actor, Guid token)
    {
        Guard.Admin(actor);
        await db.Races.Where(r => r.Token == token && r.Status == RaceStatus.Running)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, RaceStatus.Aborted).SetProperty(r => r.EndDate, DateTime.UtcNow));
    }

    /// <summary>At start: races of the last run that were still running are closed (their rooms are gone).</summary>
    public static async Task<int> AbortStaleAsync(AppDbContext db, Actor actor)
    {
        Guard.Admin(actor);
        return await db.Races.Where(r => r.Status == RaceStatus.Running || r.Status == RaceStatus.Lobby)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, RaceStatus.Aborted).SetProperty(r => r.EndDate, DateTime.UtcNow));
    }

    /// <summary>The last races of the actor.</summary>
    public static async Task<IReadOnlyList<HistoryItem>> HistoryAsync(AppDbContext db, Actor actor, int count = 10)
    {
        Guard.Player(actor);
        return await HistoryOfAsync(db, actor.PlayerId, count);
    }

    internal static async Task<IReadOnlyList<HistoryItem>> HistoryOfAsync(AppDbContext db, long playerId, int count)
    {
        var entries = await db.RaceEntries.AsNoTracking()
            .Where(e => e.PlayerId == playerId && e.Race!.Status == RaceStatus.Finished)
            .OrderByDescending(e => e.Race!.EndDate)
            .Take(count)
            .Select(e => new { e.Race!.Token, e.Race.Name, TrackName = e.Race.Track != null ? e.Race.Track.Name : "?", Layout = e.Race.Track != null ? e.Race.Track.Layout : "",
                e.Race.Kind, e.Race.EndDate, e.Place, Cars = e.Race.Entries.Count, e.Finished, e.TimeMs, e.BestLapMs, e.Kills, e.MoneyGained, e.XpGained })
            .ToListAsync();
        return entries.Select(e => new HistoryItem(e.Token, e.Name, e.TrackName, e.Layout, e.Kind.ToString(), e.EndDate, e.Place, e.Cars, e.Finished, e.TimeMs, e.BestLapMs, e.Kills,
            e.MoneyGained, e.XpGained)).ToList();
    }

    /// <summary>The best lap of the actor per track (for the track list).</summary>
    public static async Task<IReadOnlyDictionary<long, int>> BestLapsAsync(AppDbContext db, Actor actor)
    {
        Guard.Player(actor);
        var rows = await db.RaceEntries.AsNoTracking()
            .Where(e => e.PlayerId == actor.PlayerId && e.BestLapMs != null && e.Race!.TrackId != null)
            .GroupBy(e => e.Race!.TrackId!.Value)
            .Select(g => new { TrackId = g.Key, Best = g.Min(e => e.BestLapMs!.Value) })
            .ToListAsync();
        return rows.ToDictionary(r => r.TrackId, r => r.Best);
    }

    // ---------------------------------------------------------------- administration

    public sealed record RaceRow(long Id, Guid Token, string Name, RaceKind Kind, RaceStatus Status, string TrackName, int Laps, int Humans, int Bots, string? Winner,
        DateTime? StartDate, DateTime? EndDate);

    public static async Task<PagedResult<RaceRow>> ListAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Admin(actor);
        var all = db.Races.AsNoTracking();
        var query = all;
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            query = query.Where(r => r.Name.ToLower().Contains(s) || r.Entries.Any(e => e.Name.ToLower().Contains(s)));
        }

        if (Enum.TryParse<RaceStatus>(request.Filter("status"), out var status))
        {
            query = query.Where(r => r.Status == status);
        }

        if (Enum.TryParse<RaceKind>(request.Filter("kind"), out var kind))
        {
            query = query.Where(r => r.Kind == kind);
        }

        query = request.Sort switch
        {
            "name" => query.SortBy(r => r.Name, request.Descending),
            "players" => query.SortBy(r => r.Humans, request.Descending),
            _ => query.SortBy(r => r.StartDate, request.Descending),
        };
        var matching = await query.CountAsync();
        var total = await all.CountAsync();
        var page = await query.Page(request)
            .Select(r => new RaceRow(r.Id, r.Token, r.Name, r.Kind, r.Status, r.Track != null ? r.Track.Name : "–", r.Laps, r.Humans, r.Bots,
                r.Entries.Where(e => e.Place == 1).Select(e => e.Name).FirstOrDefault(), r.StartDate, r.EndDate))
            .ToListAsync();
        return new PagedResult<RaceRow>(page, matching, total);
    }

    public static async Task<Race?> GetAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        return await db.Races.AsNoTracking().Include(r => r.Track).Include(r => r.Entries).FirstOrDefaultAsync(r => r.Id == id);
    }

    /// <summary>Deletes a past race from the history (the players keep what they won).</summary>
    public static async Task DeleteAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        var race = await db.Races.FirstOrDefaultAsync(r => r.Id == id) ?? throw new BusinessException("Dieses Rennen gibt es nicht.");
        if (race.Status == RaceStatus.Running)
        {
            throw new BusinessException("Ein laufendes Rennen lässt sich nicht löschen.");
        }

        db.Races.Remove(race);
        await db.SaveChangesAsync();
    }

    public static string KindName(RaceKind kind) => kind switch
    {
        RaceKind.Quick => "Schnelles Rennen",
        RaceKind.Custom => "Mehrspieler",
        RaceKind.Cup => "Pokal",
        _ => kind.ToString(),
    };

    public static string StatusName(RaceStatus status) => status switch
    {
        RaceStatus.Lobby => "Lobby",
        RaceStatus.Running => "Läuft",
        RaceStatus.Finished => "Beendet",
        RaceStatus.Aborted => "Abgebrochen",
        _ => status.ToString(),
    };
}
