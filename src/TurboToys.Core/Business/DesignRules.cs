using System.Text.Json;
using TurboToys.Data;
using TurboToys.Game;

namespace TurboToys.Business;

/// <summary>What the track editor saves (<c>POST designs</c>): no id = a new track.</summary>
public sealed record DesignInput(long? Id, string? Name, string? Theme, string? TimeOfDay, int Laps, JsonElement? Design);

/// <summary>A player's own track as the track editor sees it; <see cref="Design"/> carries the key (custom-{id}), the name and the world of the track.</summary>
public sealed record DesignView(long Id, string Name, string Theme, string TimeOfDay, int Laps, DateTime UpdatedAt, JsonElement Design);

/// <summary>
/// The players' own tracks (track editor), online and offline the same: what may be saved, who may see and race a track, and the design as the browsers get it.
/// A designed track is a <see cref="Track"/> with a <see cref="Track.Design"/>; it belongs to its builder (<see cref="Track.OwnerId"/>) until an administrator
/// releases it for everyone. Players' tracks never count for cups.
/// </summary>
public static class DesignRules
{
    public const int MaxPerPlayer = 20;
    public const int MaxNameLength = 40;

    /// <summary>The layout key of a designed track in the browsers.</summary>
    public static string KeyOf(long id) => $"custom-{id}";

    /// <summary>Checks the editor's input and writes it to the track (a new one or one of the player's own). <paramref name="ownTracks"/>: how many the player has.</summary>
    public static void Apply(Track track, DesignInput input, int ownTracks)
    {
        var name = (input.Name ?? string.Empty).Trim();
        if (name.Length is < 1 or > MaxNameLength)
        {
            throw new BusinessException($"Der Name hat 1 bis {MaxNameLength} Zeichen.", "name");
        }

        if (input.Laps is < 1 or > 9)
        {
            throw new BusinessException("1 bis 9 Runden.", "laps");
        }

        if (!Enum.TryParse<TimeOfDay>(input.TimeOfDay, ignoreCase: true, out var time) || !Enum.IsDefined(time))
        {
            throw new BusinessException("Diese Tageszeit gibt es nicht.", "timeOfDay");
        }

        if (input.Design is not { ValueKind: JsonValueKind.Object } design)
        {
            throw new BusinessException("Der Streckenplan fehlt.", "design");
        }

        var theme = string.IsNullOrWhiteSpace(input.Theme) ? (design.TryGetProperty("theme", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null) : input.Theme;
        if (theme is null || !Layouts.Themes.Contains(theme))
        {
            throw new BusinessException("Diese Welt gibt es nicht.", "theme");
        }

        if (track.Id == 0 && ownTracks >= MaxPerPlayer)
        {
            throw new BusinessException($"Du hast schon {MaxPerPlayer} eigene Strecken – lösche erst eine.");
        }

        var stamped = Layouts.Stamp(design.GetRawText(), KeyOf(track.Id), name, theme);
        if (!Layouts.Validate(stamped, out var error))
        {
            throw new BusinessException(error!, "design");
        }

        track.Layout = theme;
        track.Name = name;
        track.Laps = input.Laps;
        track.TimeOfDay = time;
        track.Design = stamped.GetRawText();
        track.UnlockLevel = 1;
        if (track.Id == 0)
        {
            track.SortOrder = 1000;
            track.IsEnabled = true;
        }
    }

    /// <summary>The design as the browsers get it: with the key, the name and the world of the track (null for a layout of data/layouts.json).</summary>
    public static JsonElement? DesignOf(Track track) => track.Design is null ? null : Layouts.Stamp(track.Design, KeyOf(track.Id), track.Name, track.Layout);

    /// <summary>May the actor race on the track: an official one that is open, the player's own, or any for an administrator.</summary>
    public static bool CanRace(Track track, Actor actor) =>
        track.UpdateState != UpdateState.Deleted && track.IsEnabled
        && (track.OwnerId is null || track.OwnerId == actor.PlayerId || actor.IsAdmin)
        && (track.Design is not null || Layouts.Exists(track.Layout));

    /// <summary>May the actor see the design of a track (preview): the builder, an administrator, and everyone once it is official and open.</summary>
    public static bool CanSeeDesign(Track track, Actor actor) =>
        track.UpdateState != UpdateState.Deleted && track.Design is not null
        && (track.OwnerId == actor.PlayerId || actor.IsAdmin || (track.OwnerId is null && track.IsEnabled));
}
