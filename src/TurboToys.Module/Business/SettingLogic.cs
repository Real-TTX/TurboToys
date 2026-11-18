using System.Globalization;
using Microsoft.EntityFrameworkCore;
using TurboToys.Data;

namespace TurboToys.Business;

/// <summary>The settings of the game as the administration keeps them.</summary>
/// <param name="Announcement">A text in the main menu (empty = none).</param>
/// <param name="MaxPlayers">The most players a room may have.</param>
/// <param name="GuestsCreateRooms">Guests may open public rooms (they may always join one and race alone).</param>
/// <param name="StartMoney">What a new player gets.</param>
public sealed record GameSettings(string Announcement, int MaxPlayers, bool GuestsCreateRooms, int StartMoney);

public static class SettingLogic
{
    private const string AnnouncementKey = "Announcement";
    private const string MaxPlayersKey = "MaxPlayers";
    private const string GuestsCreateRoomsKey = "GuestsCreateRooms";
    private const string StartMoneyKey = "StartMoney";

    public static async Task<GameSettings> GetAsync(AppDbContext db)
    {
        var all = await db.Settings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value);
        return new GameSettings(
            all.GetValueOrDefault(AnnouncementKey, string.Empty),
            int.TryParse(all.GetValueOrDefault(MaxPlayersKey), NumberStyles.Integer, CultureInfo.InvariantCulture, out var max) ? max : 8,
            all.GetValueOrDefault(GuestsCreateRoomsKey, "true") == "true",
            int.TryParse(all.GetValueOrDefault(StartMoneyKey), NumberStyles.Integer, CultureInfo.InvariantCulture, out var money) ? money : Economy.StartMoney);
    }

    public static async Task SaveAsync(AppDbContext db, Actor actor, GameSettings settings)
    {
        Guard.Admin(actor);
        if (settings.MaxPlayers is < 2 or > 8)
        {
            throw new BusinessException("2 bis 8 Spieler.", "MaxPlayers");
        }

        if (settings.StartMoney is < 0 or > 1_000_000)
        {
            throw new BusinessException("Das Startgeld liegt zwischen 0 und 1 Million.", "StartMoney");
        }

        if ((settings.Announcement ?? string.Empty).Length > 500)
        {
            throw new BusinessException("Höchstens 500 Zeichen.", "Announcement");
        }

        await SetAsync(db, AnnouncementKey, (settings.Announcement ?? string.Empty).Trim());
        await SetAsync(db, MaxPlayersKey, settings.MaxPlayers.ToString(CultureInfo.InvariantCulture));
        await SetAsync(db, GuestsCreateRoomsKey, settings.GuestsCreateRooms ? "true" : "false");
        await SetAsync(db, StartMoneyKey, settings.StartMoney.ToString(CultureInfo.InvariantCulture));
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
    }

    private static async Task SetAsync(AppDbContext db, string key, string value)
    {
        var setting = await db.Settings.FirstOrDefaultAsync(s => s.Key == key);
        if (setting is null)
        {
            db.Settings.Add(new Setting { Key = key, Value = value });
        }
        else
        {
            setting.Value = value;
        }
    }
}

/// <summary>The seeded content: added to a new (or older) database by key; what an administrator changed stays.</summary>
public static class SeedLogic
{
    public static async Task EnsureAsync(AppDbContext db, Actor actor)
    {
        Guard.Admin(actor);
        db.ActingAs(actor.AuditId);
        var cars = await db.Cars.Select(c => c.Key).ToListAsync();
        foreach (var car in SeedContent.AllCars().Where(c => !cars.Contains(c.Key)))
        {
            db.Cars.Add(car);
        }

        var weapons = await db.Weapons.Select(w => w.Kind).Distinct().ToListAsync();
        foreach (var weapon in SeedContent.AllWeapons().Where(w => !weapons.Contains(w.Kind)))
        {
            db.Weapons.Add(weapon);
        }

        var tracks = await db.Tracks.ToListAsync();
        foreach (var track in SeedContent.AllTracks().Where(t => !tracks.Any(x => x.Layout == t.Layout && x.TimeOfDay == t.TimeOfDay)))
        {
            db.Tracks.Add(track);
        }

        await db.SaveChangesAsync();

        tracks = await db.Tracks.Where(t => t.UpdateState != UpdateState.Deleted).OrderBy(t => t.Id).ToListAsync();
        var cups = await db.Cups.Select(c => c.Name).ToListAsync();
        foreach (var (cup, list) in SeedContent.AllCups().Where(c => !cups.Contains(c.Cup.Name)))
        {
            var ids = list.Select(l => tracks.FirstOrDefault(t => t.Layout == l.Layout && t.TimeOfDay == l.Time)?.Id ?? tracks.FirstOrDefault(t => t.Layout == l.Layout)?.Id)
                .Where(id => id is not null).Select(id => id!.Value).ToList();
            if (ids.Count == 0)
            {
                continue;
            }

            cup.TrackIds = string.Join(',', ids);
            db.Cups.Add(cup);
        }

        await db.SaveChangesAsync();
    }
}
