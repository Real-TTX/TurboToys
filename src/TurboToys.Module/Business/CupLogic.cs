using Microsoft.EntityFrameworkCore;
using TurboToys.Data;
using TurboToys.Game;

namespace TurboToys.Business;

/// <summary>The cups (tournaments) of a player: the list with the running run, entering, the next race, giving up.</summary>
public static class CupLogic
{
    public static async Task<IReadOnlyList<CupView>> CupsAsync(AppDbContext db, Actor actor)
    {
        Guard.Player(actor);
        var player = await db.Players.AsNoTracking().FirstAsync(p => p.Id == actor.PlayerId);
        var level = actor.IsAdmin ? int.MaxValue : Progression.LevelOf(player.Xp);
        var cups = await db.Cups.AsNoTracking().Where(c => c.IsEnabled && c.UpdateState != UpdateState.Deleted).OrderBy(c => c.SortOrder).ToListAsync();
        var tracks = await db.Tracks.AsNoTracking().Where(t => t.UpdateState != UpdateState.Deleted).ToDictionaryAsync(t => t.Id);
        var runs = await db.CupRuns.AsNoTracking().Where(r => r.PlayerId == actor.PlayerId).ToListAsync();
        return cups.Select(c => Views.Cup(c, tracks, level,
            runs.Where(r => r.CupId == c.Id && r.Status == CupRunStatus.Running).OrderByDescending(r => r.Id).FirstOrDefault()
            ?? runs.Where(r => r.CupId == c.Id && r.Status == CupRunStatus.Finished && r.EndDate > DateTime.UtcNow.AddMinutes(-30)).OrderByDescending(r => r.Id).FirstOrDefault(),
            runs.Count(r => r.CupId == c.Id && r.Status == CupRunStatus.Finished && r.Place == 1))).ToList();
    }

    /// <summary>Enters a cup: pays the entry, draws the opponents. A running run of the same cup is given up first.</summary>
    public static async Task<CupRunView> EnterAsync(AppDbContext db, Actor actor, long cupId)
    {
        Guard.Player(actor);
        var player = await db.Players.FirstAsync(p => p.Id == actor.PlayerId);
        var cup = await db.Cups.AsNoTracking().FirstOrDefaultAsync(c => c.Id == cupId) ?? throw new BusinessException("Diesen Pokal gibt es nicht.");
        var owned = await db.GarageCars.AsNoTracking().Include(g => g.Car).Where(g => g.PlayerId == actor.PlayerId).ToListAsync();
        var garage = PlayerRules.Selected(player, owned);
        var catalog = await ContentLogic.CarsAsync(db);
        await db.CupRuns.Where(r => r.PlayerId == actor.PlayerId && r.Status == CupRunStatus.Running)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, CupRunStatus.Abandoned).SetProperty(r => r.EndDate, DateTime.UtcNow));
        var standings = CupRules.Enter(player, cup, catalog, garage, garage?.Car, Random.Shared.Next());
        var run = new CupRun
        {
            Token = Guid.NewGuid(),
            PlayerId = player.Id,
            CupId = cup.Id,
            Status = CupRunStatus.Running,
            Standings = CupRules.Write(standings),
            StartDate = DateTime.UtcNow,
        };
        db.CupRuns.Add(run);
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        var tracks = await db.Tracks.AsNoTracking().ToDictionaryAsync(t => t.Id);
        return Views.CupRun(run, cup, tracks, Progression.LevelOf(player.Xp));
    }

    public static async Task AbandonAsync(AppDbContext db, Actor actor, Guid token)
    {
        Guard.Player(actor);
        var run = await db.CupRuns.FirstOrDefaultAsync(r => r.Token == token && r.PlayerId == actor.PlayerId) ?? throw new BusinessException("Diesen Pokal fährst du nicht.");
        if (run.Status == CupRunStatus.Running)
        {
            run.Status = CupRunStatus.Abandoned;
            run.EndDate = DateTime.UtcNow;
            db.ActingAs(actor.AuditId);
            await db.SaveChangesAsync();
        }
    }

    /// <summary>The next race of a running run: the track, the laps and the bots (the same every race).</summary>
    public static async Task<(CupRun Run, Cup Cup, Track Track, IReadOnlyList<(string Name, CarLoadout Car, int Skill)> Bots)> NextRaceAsync(AppDbContext db, Actor actor, Guid token)
    {
        Guard.Player(actor);
        var run = await db.CupRuns.AsNoTracking().Include(r => r.Cup).FirstOrDefaultAsync(r => r.Token == token && r.PlayerId == actor.PlayerId)
                  ?? throw new BusinessException("Diesen Pokal fährst du nicht.");
        if (run.Status != CupRunStatus.Running || run.Cup is null)
        {
            throw new BusinessException("Dieser Pokal ist schon vorbei.");
        }

        var ids = run.Cup.TrackIdList();
        if (run.RaceIndex >= ids.Count)
        {
            throw new BusinessException("Dieser Pokal ist schon vorbei.");
        }

        var track = await db.Tracks.AsNoTracking().FirstOrDefaultAsync(t => t.Id == ids[run.RaceIndex]) ?? throw new BusinessException("Die Strecke gibt es nicht mehr.");
        var catalog = await ContentLogic.CarsAsync(db);
        var bots = Views.CupBots(CupRules.Read(run.Standings), catalog, (int)(run.Id % int.MaxValue));
        return (run, run.Cup, track, bots);
    }
}
