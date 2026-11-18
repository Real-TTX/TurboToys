using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TurboToys.Data;

namespace TurboToys.Business;

/// <summary>
/// The players' own tracks (track editor): list, save and delete the actor's tracks, and the design of a track for the preview. The rules are
/// <see cref="DesignRules"/> (the same offline). Guests may build too; a track stays its builder's until an administrator releases it
/// (<see cref="ContentLogic.PublishTrackAsync"/>).
/// </summary>
public static class DesignLogic
{
    /// <summary>The actor's own tracks, the last changed first.</summary>
    public static async Task<IReadOnlyList<DesignView>> ListAsync(AppDbContext db, Actor actor)
    {
        Guard.Player(actor);
        var tracks = await db.Tracks.AsNoTracking()
            .Where(t => t.OwnerId == actor.PlayerId && t.Design != null && t.UpdateState != UpdateState.Deleted)
            .OrderByDescending(t => t.UpdateDate)
            .ToListAsync();
        return tracks.Select(Views.Design).ToList();
    }

    /// <summary>Creates a track (no id) or changes one of the actor's own.</summary>
    public static async Task<DesignView> SaveAsync(AppDbContext db, Actor actor, DesignInput input)
    {
        Guard.Player(actor);
        var track = new Track { OwnerId = actor.PlayerId };
        if (input.Id is > 0)
        {
            track = await db.Tracks.FirstOrDefaultAsync(t => t.Id == input.Id && t.Design != null && t.UpdateState != UpdateState.Deleted)
                    ?? throw new BusinessException("Diese Strecke gibt es nicht.");
            if (track.OwnerId != actor.PlayerId)
            {
                throw new AccessDeniedException("Das ist nicht deine Strecke.");
            }
        }

        var own = await db.Tracks.CountAsync(t => t.OwnerId == actor.PlayerId && t.UpdateState != UpdateState.Deleted);
        DesignRules.Apply(track, input, own);
        if (track.Id == 0)
        {
            db.Tracks.Add(track);
        }

        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        return Views.Design(track);
    }

    /// <summary>Deletes one of the actor's own tracks (soft: past races keep it).</summary>
    public static async Task DeleteAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Player(actor);
        var track = await db.Tracks.FirstOrDefaultAsync(t => t.Id == id && t.Design != null && t.UpdateState != UpdateState.Deleted)
                    ?? throw new BusinessException("Diese Strecke gibt es nicht.");
        if (track.OwnerId != actor.PlayerId)
        {
            throw new AccessDeniedException("Das ist nicht deine Strecke.");
        }

        track.UpdateState = UpdateState.Deleted;
        track.IsEnabled = false;
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
    }

    /// <summary>The design of a track the actor may see (its builder, an administrator, everyone once it is official) – for the preview.</summary>
    public static async Task<JsonElement> DesignAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Player(actor);
        var track = await db.Tracks.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id && t.UpdateState != UpdateState.Deleted);
        if (track?.Design is null)
        {
            throw new BusinessException("Diese Strecke hat keinen eigenen Plan.");
        }

        if (!DesignRules.CanSeeDesign(track, actor))
        {
            throw new AccessDeniedException("Das ist nicht deine Strecke.");
        }

        return DesignRules.DesignOf(track)!.Value;
    }
}
