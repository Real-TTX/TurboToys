using Microsoft.EntityFrameworkCore;
using TurboToys.Data;
using TurboToys.Game;

namespace TurboToys.Business;

public sealed record CarInput(long Id, string Key, string Name, string Description, string Body, CarDrive Drive, int Speed, int Acceleration, int Grip, int Armor, int Weight,
    int TurboCapacity, int Price, int UnlockLevel, string DefaultPaint, int SortOrder, bool IsEnabled);

public sealed record WeaponInput(long Id, WeaponKind Kind, string Name, string Description, int Damage, int Amount, int CooldownMs, int CrateWeight, int SortOrder, bool IsEnabled);

public sealed record TrackInput(long Id, string Layout, string Name, string Description, int Laps, TimeOfDay TimeOfDay, int UnlockLevel, int SortOrder, bool IsEnabled);

public sealed record CupInput(long Id, string Name, string Description, IReadOnlyList<long> TrackIds, int Laps, int EntryFee, int Prize, int Opponents, int BotSkill,
    int UnlockLevel, int SortOrder, bool IsEnabled);

/// <summary>The catalogue of the game – cars, weapons, tracks, cups: the lists the players see and the administration of each.</summary>
public static class ContentLogic
{
    // ---------------------------------------------------------------- what players see

    public static async Task<CatalogView> CatalogAsync(AppDbContext db) =>
        Views.Catalog(await db.Cars.AsNoTracking().ToListAsync(), await db.Weapons.AsNoTracking().ToListAsync());

    public static async Task<IReadOnlyList<TrackView>> TracksAsync(AppDbContext db, Actor actor)
    {
        Guard.Player(actor);
        var level = await LevelAsync(db, actor);
        var tracks = await db.Tracks.AsNoTracking().Where(t => t.IsEnabled && t.UpdateState != UpdateState.Deleted).OrderBy(t => t.SortOrder).ThenBy(t => t.Id).ToListAsync();
        return tracks.Where(t => Layouts.Exists(t.Layout)).Select(t => Views.Track(t, actor.IsAdmin ? int.MaxValue : level)).ToList();
    }

    /// <summary>A track a player may race on (enabled, level reached), or a readable error.</summary>
    public static async Task<Track> PlayableTrackAsync(AppDbContext db, Actor actor, long? trackId)
    {
        Guard.Player(actor);
        var level = actor.IsAdmin ? int.MaxValue : await LevelAsync(db, actor);
        var tracks = await db.Tracks.AsNoTracking().Where(t => t.IsEnabled && t.UpdateState != UpdateState.Deleted).OrderBy(t => t.SortOrder).ToListAsync();
        var track = trackId is > 0 ? tracks.FirstOrDefault(t => t.Id == trackId) : tracks.FirstOrDefault(t => t.UnlockLevel <= level);
        if (track is null || !Layouts.Exists(track.Layout))
        {
            throw new BusinessException("Diese Strecke gibt es nicht.", "trackId");
        }

        if (track.UnlockLevel > level)
        {
            throw new BusinessException($"„{track.Name}“ gibt es ab Level {track.UnlockLevel}.", "trackId");
        }

        return track;
    }

    public static async Task<IReadOnlyList<WeaponRule>> WeaponRulesAsync(AppDbContext db) => Views.WeaponRules(await db.Weapons.AsNoTracking().ToListAsync());

    public static async Task<IReadOnlyList<Car>> CarsAsync(AppDbContext db) =>
        await db.Cars.AsNoTracking().Where(c => c.IsEnabled && c.UpdateState != UpdateState.Deleted).ToListAsync();

    private static async Task<int> LevelAsync(AppDbContext db, Actor actor) =>
        Progression.LevelOf(await db.Players.Where(p => p.Id == actor.PlayerId).Select(p => p.Xp).FirstOrDefaultAsync());

    // ---------------------------------------------------------------- cars (administration)

    public static async Task<PagedResult<Car>> ListCarsAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Admin(actor);
        var all = db.Cars.AsNoTracking().Where(c => c.UpdateState != UpdateState.Deleted);
        var query = all;
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            query = query.Where(c => c.Name.ToLower().Contains(s) || c.Key.ToLower().Contains(s) || c.Description.ToLower().Contains(s));
        }

        if (Enum.TryParse<CarDrive>(request.Filter("drive"), out var drive))
        {
            query = query.Where(c => c.Drive == drive);
        }

        query = request.Filter("status") switch
        {
            "enabled" => query.Where(c => c.IsEnabled),
            "disabled" => query.Where(c => !c.IsEnabled),
            _ => query,
        };
        query = request.Sort switch
        {
            "name" => query.SortBy(c => c.Name, request.Descending),
            "price" => query.SortBy(c => c.Price, request.Descending),
            "level" => query.SortBy(c => c.UnlockLevel, request.Descending),
            "speed" => query.SortBy(c => c.Speed, request.Descending),
            _ => query.SortBy(c => c.SortOrder, request.Descending),
        };
        return new PagedResult<Car>(await query.Page(request).ToListAsync(), await query.CountAsync(), await all.CountAsync());
    }

    public static async Task<Car?> GetCarAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        return await db.Cars.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id && c.UpdateState != UpdateState.Deleted);
    }

    public static async Task<long> SaveCarAsync(AppDbContext db, Actor actor, CarInput input)
    {
        Guard.Admin(actor);
        var key = (input.Key ?? string.Empty).Trim().ToLowerInvariant();
        Require(input.Name, "Name", "Bitte einen Namen eingeben.");
        if (key.Length is < 2 or > 24 || !key.All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c)))
        {
            throw new BusinessException("Der Schlüssel besteht aus 2–24 Kleinbuchstaben oder Ziffern.", "Key");
        }

        if (await db.Cars.AnyAsync(c => c.Key == key && c.Id != input.Id))
        {
            throw new BusinessException("Diesen Schlüssel hat schon ein anderes Auto.", "Key");
        }

        if (!Looks.Bodies.Contains(input.Body))
        {
            throw new BusinessException("Diese Karosserie gibt es nicht.", "Body");
        }

        foreach (var (value, field) in new[] { (input.Speed, "Speed"), (input.Acceleration, "Acceleration"), (input.Grip, "Grip"), (input.Armor, "Armor"), (input.Weight, "Weight"), (input.TurboCapacity, "TurboCapacity") })
        {
            if (value is < 1 or > 10)
            {
                throw new BusinessException("Werte gehen von 1 bis 10.", field);
            }
        }

        if (input.Price is < 0 or > 1_000_000)
        {
            throw new BusinessException("Der Preis liegt zwischen 0 und 1 Million.", "Price");
        }

        if (!Looks.IsColor(input.DefaultPaint))
        {
            throw new BusinessException("Bitte eine Farbe wählen.", "DefaultPaint");
        }

        var car = input.Id == 0 ? new Car() : await db.Cars.FirstOrDefaultAsync(c => c.Id == input.Id && c.UpdateState != UpdateState.Deleted)
                                              ?? throw new BusinessException("Dieses Auto gibt es nicht.");
        car.Key = key;
        car.Name = input.Name.Trim();
        car.Description = (input.Description ?? string.Empty).Trim();
        car.Body = input.Body;
        car.Drive = input.Drive;
        car.Speed = input.Speed;
        car.Acceleration = input.Acceleration;
        car.Grip = input.Grip;
        car.Armor = input.Armor;
        car.Weight = input.Weight;
        car.TurboCapacity = input.TurboCapacity;
        car.Price = input.Price;
        car.UnlockLevel = Math.Clamp(input.UnlockLevel, 1, Progression.MaxLevel);
        car.DefaultPaint = input.DefaultPaint.ToLowerInvariant();
        car.SortOrder = input.SortOrder;
        car.IsEnabled = input.IsEnabled;
        if (input.Id == 0)
        {
            db.Cars.Add(car);
        }

        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        return car.Id;
    }

    /// <summary>Deletes a car from the shop (soft: garages keep it, it can no longer be bought).</summary>
    public static async Task DeleteCarAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        var car = await db.Cars.FirstOrDefaultAsync(c => c.Id == id) ?? throw new BusinessException("Dieses Auto gibt es nicht.");
        if (await db.Cars.CountAsync(c => c.UpdateState != UpdateState.Deleted && c.IsEnabled && c.Price == 0 && c.Id != id) == 0 && car.Price == 0)
        {
            throw new BusinessException("Das ist das letzte kostenlose Auto – neue Spieler brauchen eins zum Start.");
        }

        car.UpdateState = UpdateState.Deleted;
        car.IsEnabled = false;
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
    }

    // ---------------------------------------------------------------- weapons (administration)

    public static async Task<PagedResult<Weapon>> ListWeaponsAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Admin(actor);
        var all = db.Weapons.AsNoTracking().Where(w => w.UpdateState != UpdateState.Deleted);
        var query = all;
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            query = query.Where(w => w.Name.ToLower().Contains(s) || w.Description.ToLower().Contains(s));
        }

        if (Enum.TryParse<WeaponKind>(request.Filter("kind"), out var kind))
        {
            query = query.Where(w => w.Kind == kind);
        }

        query = request.Sort switch
        {
            "name" => query.SortBy(w => w.Name, request.Descending),
            "damage" => query.SortBy(w => w.Damage, request.Descending),
            _ => query.SortBy(w => w.SortOrder, request.Descending),
        };
        return new PagedResult<Weapon>(await query.Page(request).ToListAsync(), await query.CountAsync(), await all.CountAsync());
    }

    public static async Task<Weapon?> GetWeaponAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        return await db.Weapons.AsNoTracking().FirstOrDefaultAsync(w => w.Id == id && w.UpdateState != UpdateState.Deleted);
    }

    public static async Task<long> SaveWeaponAsync(AppDbContext db, Actor actor, WeaponInput input)
    {
        Guard.Admin(actor);
        Require(input.Name, "Name", "Bitte einen Namen eingeben.");
        if (input.Damage is < 0 or > 200)
        {
            throw new BusinessException("Der Schaden liegt zwischen 0 und 200.", "Damage");
        }

        if (input.Amount is < 0 or > 10)
        {
            throw new BusinessException("Pro Kiste gibt es 0 bis 10 Stück.", "Amount");
        }

        if (input.CooldownMs is < 50 or > 10000)
        {
            throw new BusinessException("Die Pause liegt zwischen 50 und 10 000 ms.", "CooldownMs");
        }

        if (input.CrateWeight is < 0 or > 100)
        {
            throw new BusinessException("Die Häufigkeit liegt zwischen 0 und 100.", "CrateWeight");
        }

        var weapon = input.Id == 0 ? new Weapon() : await db.Weapons.FirstOrDefaultAsync(w => w.Id == input.Id && w.UpdateState != UpdateState.Deleted)
                                                    ?? throw new BusinessException("Diese Waffe gibt es nicht.");
        weapon.Kind = input.Kind;
        weapon.Name = input.Name.Trim();
        weapon.Description = (input.Description ?? string.Empty).Trim();
        weapon.Damage = input.Kind is WeaponKind.Oil or WeaponKind.Shield ? 0 : input.Damage;
        weapon.Amount = input.Kind == WeaponKind.MachineGun ? 0 : input.Amount;
        weapon.CooldownMs = input.CooldownMs;
        weapon.CrateWeight = input.Kind == WeaponKind.MachineGun ? 0 : input.CrateWeight;
        weapon.SortOrder = input.SortOrder;
        weapon.IsEnabled = input.IsEnabled;
        if (input.Id == 0)
        {
            db.Weapons.Add(weapon);
        }

        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        return weapon.Id;
    }

    public static async Task DeleteWeaponAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        var weapon = await db.Weapons.FirstOrDefaultAsync(w => w.Id == id) ?? throw new BusinessException("Diese Waffe gibt es nicht.");
        weapon.UpdateState = UpdateState.Deleted;
        weapon.IsEnabled = false;
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
    }

    public static string KindName(WeaponKind kind) => kind switch
    {
        WeaponKind.MachineGun => "Bord-MG",
        WeaponKind.Rocket => "Rakete",
        WeaponKind.Mine => "Mine",
        WeaponKind.Oil => "Öl",
        WeaponKind.Shock => "Schock",
        WeaponKind.Shield => "Schild",
        _ => kind.ToString(),
    };

    public static string DriveName(CarDrive drive) => drive switch
    {
        CarDrive.Electric => "Elektro",
        CarDrive.Gas => "Benzin",
        CarDrive.Turbo => "Turbo",
        _ => drive.ToString(),
    };

    public static string TimeName(TimeOfDay time) => time switch
    {
        TimeOfDay.Day => "Tag",
        TimeOfDay.Dusk => "Abend",
        TimeOfDay.Night => "Nacht",
        _ => time.ToString(),
    };

    public static string BodyName(string body) => body switch
    {
        "buggy" => "Buggy",
        "truck" => "Monstertruck",
        "muscle" => "Muscle-Car",
        "rally" => "Rallye",
        "super" => "Supersportler",
        "van" => "Lieferwagen",
        "formula" => "Formel",
        "pickup" => "Pickup",
        _ => body,
    };

    public static string LayoutName(string layout) => Layouts.Find(layout)?.Name ?? layout;

    // ---------------------------------------------------------------- tracks (administration)

    public static async Task<PagedResult<Track>> ListTracksAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Admin(actor);
        var all = db.Tracks.AsNoTracking().Where(t => t.UpdateState != UpdateState.Deleted);
        var query = all;
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            query = query.Where(t => t.Name.ToLower().Contains(s) || t.Description.ToLower().Contains(s));
        }

        if (request.Filter("layout") is { } layout)
        {
            query = query.Where(t => t.Layout == layout);
        }

        if (Enum.TryParse<TimeOfDay>(request.Filter("time"), out var time))
        {
            query = query.Where(t => t.TimeOfDay == time);
        }

        query = request.Sort switch
        {
            "name" => query.SortBy(t => t.Name, request.Descending),
            "level" => query.SortBy(t => t.UnlockLevel, request.Descending),
            _ => query.SortBy(t => t.SortOrder, request.Descending),
        };
        return new PagedResult<Track>(await query.Page(request).ToListAsync(), await query.CountAsync(), await all.CountAsync());
    }

    public static async Task<Track?> GetTrackAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        return await db.Tracks.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id && t.UpdateState != UpdateState.Deleted);
    }

    public static async Task<IReadOnlyList<Track>> AllTracksAsync(AppDbContext db, Actor actor)
    {
        Guard.Admin(actor);
        return await db.Tracks.AsNoTracking().Where(t => t.UpdateState != UpdateState.Deleted).OrderBy(t => t.SortOrder).ToListAsync();
    }

    public static async Task<long> SaveTrackAsync(AppDbContext db, Actor actor, TrackInput input)
    {
        Guard.Admin(actor);
        Require(input.Name, "Name", "Bitte einen Namen eingeben.");
        if (!Layouts.Exists(input.Layout))
        {
            throw new BusinessException("Diese Strecke gibt es nicht.", "Layout");
        }

        if (input.Laps is < 1 or > 9)
        {
            throw new BusinessException("1 bis 9 Runden.", "Laps");
        }

        var track = input.Id == 0 ? new Track() : await db.Tracks.FirstOrDefaultAsync(t => t.Id == input.Id && t.UpdateState != UpdateState.Deleted)
                                                  ?? throw new BusinessException("Diese Strecke gibt es nicht.");
        track.Layout = input.Layout;
        track.Name = input.Name.Trim();
        track.Description = (input.Description ?? string.Empty).Trim();
        track.Laps = input.Laps;
        track.TimeOfDay = input.TimeOfDay;
        track.UnlockLevel = Math.Clamp(input.UnlockLevel, 1, Progression.MaxLevel);
        track.SortOrder = input.SortOrder;
        track.IsEnabled = input.IsEnabled;
        if (input.Id == 0)
        {
            db.Tracks.Add(track);
        }

        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        return track.Id;
    }

    public static async Task DeleteTrackAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        var track = await db.Tracks.FirstOrDefaultAsync(t => t.Id == id) ?? throw new BusinessException("Diese Strecke gibt es nicht.");
        track.UpdateState = UpdateState.Deleted;
        track.IsEnabled = false;
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
    }

    // ---------------------------------------------------------------- cups (administration)

    public static async Task<PagedResult<Cup>> ListCupsAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Admin(actor);
        var all = db.Cups.AsNoTracking().Where(c => c.UpdateState != UpdateState.Deleted);
        var query = all;
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim().ToLower();
            query = query.Where(c => c.Name.ToLower().Contains(s) || c.Description.ToLower().Contains(s));
        }

        query = request.Filter("status") switch
        {
            "enabled" => query.Where(c => c.IsEnabled),
            "disabled" => query.Where(c => !c.IsEnabled),
            _ => query,
        };
        query = request.Sort switch
        {
            "name" => query.SortBy(c => c.Name, request.Descending),
            "prize" => query.SortBy(c => c.Prize, request.Descending),
            "level" => query.SortBy(c => c.UnlockLevel, request.Descending),
            _ => query.SortBy(c => c.SortOrder, request.Descending),
        };
        return new PagedResult<Cup>(await query.Page(request).ToListAsync(), await query.CountAsync(), await all.CountAsync());
    }

    public static async Task<Cup?> GetCupAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        return await db.Cups.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id && c.UpdateState != UpdateState.Deleted);
    }

    public static async Task<long> SaveCupAsync(AppDbContext db, Actor actor, CupInput input)
    {
        Guard.Admin(actor);
        Require(input.Name, "Name", "Bitte einen Namen eingeben.");
        var ids = input.TrackIds.Where(id => id > 0).ToList();
        if (ids.Count == 0)
        {
            throw new BusinessException("Ein Pokal braucht mindestens eine Strecke.", "Track1");
        }

        var known = await db.Tracks.Where(t => ids.Contains(t.Id) && t.UpdateState != UpdateState.Deleted).Select(t => t.Id).ToListAsync();
        if (ids.Any(id => !known.Contains(id)))
        {
            throw new BusinessException("Eine der Strecken gibt es nicht.", "Track1");
        }

        if (input.Opponents is < 1 or > 7)
        {
            throw new BusinessException("1 bis 7 Gegner.", "Opponents");
        }

        if (input.BotSkill is < 1 or > 5)
        {
            throw new BusinessException("Die Stärke geht von 1 bis 5.", "BotSkill");
        }

        if (input.EntryFee < 0 || input.Prize < 0)
        {
            throw new BusinessException("Startgeld und Preis dürfen nicht negativ sein.", "Prize");
        }

        var cup = input.Id == 0 ? new Cup() : await db.Cups.FirstOrDefaultAsync(c => c.Id == input.Id && c.UpdateState != UpdateState.Deleted)
                                              ?? throw new BusinessException("Diesen Pokal gibt es nicht.");
        cup.Name = input.Name.Trim();
        cup.Description = (input.Description ?? string.Empty).Trim();
        cup.TrackIds = string.Join(',', ids);
        cup.Laps = Math.Clamp(input.Laps, 1, 9);
        cup.EntryFee = input.EntryFee;
        cup.Prize = input.Prize;
        cup.Opponents = input.Opponents;
        cup.BotSkill = input.BotSkill;
        cup.UnlockLevel = Math.Clamp(input.UnlockLevel, 1, Progression.MaxLevel);
        cup.SortOrder = input.SortOrder;
        cup.IsEnabled = input.IsEnabled;
        if (input.Id == 0)
        {
            db.Cups.Add(cup);
        }

        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        return cup.Id;
    }

    public static async Task DeleteCupAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        var cup = await db.Cups.FirstOrDefaultAsync(c => c.Id == id) ?? throw new BusinessException("Diesen Pokal gibt es nicht.");
        cup.UpdateState = UpdateState.Deleted;
        cup.IsEnabled = false;
        await db.CupRuns.Where(r => r.CupId == id && r.Status == CupRunStatus.Running).ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, CupRunStatus.Abandoned));
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
    }

    private static void Require(string? value, string field, string message)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new BusinessException(message, field);
        }
    }
}
