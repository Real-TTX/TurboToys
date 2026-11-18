namespace TurboToys.Data;

/// <summary>Soft delete state of a record: 0 = deleted, 1 = created, 2 = updated.</summary>
public enum UpdateState
{
    Deleted = 0,
    Created = 1,
    Updated = 2,
}

/// <summary>Every record: a bigint key and the audit columns (filled when saving).</summary>
public abstract class Entity
{
    public long Id { get; set; }

    public DateTime CreateDate { get; set; }

    public long? CreateUserId { get; set; }

    public DateTime UpdateDate { get; set; }

    public long? UpdateUserId { get; set; }
}

/// <summary>A record that is never removed, only marked deleted.</summary>
public abstract class SoftDeleteEntity : Entity
{
    public UpdateState UpdateState { get; set; } = UpdateState.Created;
}

/// <summary>How a car is driven: changes the engine curve, the sound and the look.</summary>
public enum CarDrive
{
    /// <summary>Electric: full torque from standstill, a little less top speed.</summary>
    Electric = 0,

    /// <summary>Gas (nitro fuel): torque grows with the revs, loud, high top speed.</summary>
    Gas = 1,

    /// <summary>Turbo: lazy at first, then the turbo spools up and kicks hard.</summary>
    Turbo = 2,
}

/// <summary>The weapons of a race. The machine gun is every car's; the others come from the crates.</summary>
public enum WeaponKind
{
    MachineGun = 0,
    Rocket = 1,
    Mine = 2,
    Oil = 3,
    Shock = 4,
    Shield = 5,
}

/// <summary>The time of day of a track.</summary>
public enum TimeOfDay
{
    Day = 0,
    Dusk = 1,
    Night = 2,
}

public enum RaceKind
{
    /// <summary>A quick race against bots.</summary>
    Quick = 0,

    /// <summary>A room of players (online) with or without bots.</summary>
    Custom = 1,

    /// <summary>A race of a cup (tournament) against the cup's bots.</summary>
    Cup = 2,
}

public enum RaceStatus
{
    Lobby = 0,
    Running = 1,
    Finished = 2,
    Aborted = 3,
}

public enum CupRunStatus
{
    Running = 0,
    Finished = 1,
    Abandoned = 2,
}

/// <summary>The tuning parts of a car (each 0 … <see cref="Business.Tuning.MaxLevel"/>).</summary>
public enum Part
{
    Engine = 0,
    Tires = 1,
    Armor = 2,
    Turbo = 3,
    Weapons = 4,
}

/// <summary>
/// A player of TurboToys: the id is MatGame's account id (no own sign-in). Money ("Schrauben"), experience, the avatar and the statistics.
/// </summary>
public sealed class Player : SoftDeleteEntity
{
    public string DisplayName { get; set; } = string.Empty;

    public bool IsGuest { get; set; }

    /// <summary>The currency of the game: "Schrauben".</summary>
    public int Money { get; set; }

    public int Xp { get; set; }

    // the comic avatar (keys are a contract with js/game/ui/avatar.js – never rename one)
    public string AvatarFace { get; set; } = "grin";

    public string AvatarHair { get; set; } = "spiky";

    public string AvatarHelmet { get; set; } = "racer";

    public string AvatarColor { get; set; } = "#e2392f";

    public string AvatarSkin { get; set; } = "#f2c9a0";

    /// <summary>The car of the garage the player drives (null = the first one).</summary>
    public long? SelectedGarageCarId { get; set; }

    public int RacesPlayed { get; set; }

    public int RacesWon { get; set; }

    public int Podiums { get; set; }

    public int Kills { get; set; }

    public int Wrecks { get; set; }

    public int CupsWon { get; set; }

    public int MoneyEarned { get; set; }

    public DateTime? LastRaceDate { get; set; }
}

/// <summary>A car of the catalogue (the shop). Ratings 1 … 10; <see cref="Body"/> names the 3D model (js/game/cars/models.js BODIES).</summary>
public sealed class Car : SoftDeleteEntity
{
    /// <summary>A short key (sparky, viper …): stable, used by bots and the seed.</summary>
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    /// <summary>buggy, truck, muscle, rally, super, van, formula, pickup.</summary>
    public string Body { get; set; } = "buggy";

    public CarDrive Drive { get; set; }

    public int Speed { get; set; } = 5;

    public int Acceleration { get; set; } = 5;

    public int Grip { get; set; } = 5;

    public int Armor { get; set; } = 5;

    public int Weight { get; set; } = 5;

    public int TurboCapacity { get; set; } = 5;

    public int Price { get; set; }

    public int UnlockLevel { get; set; } = 1;

    public string DefaultPaint { get; set; } = "#e2392f";

    public int SortOrder { get; set; } = 100;

    public bool IsEnabled { get; set; } = true;
}

/// <summary>A weapon (one per kind is used in races: the first enabled one by sort order).</summary>
public sealed class Weapon : SoftDeleteEntity
{
    public WeaponKind Kind { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    /// <summary>Damage per hit (machine gun: per bullet; shock: to everyone near).</summary>
    public int Damage { get; set; }

    /// <summary>How many a crate gives (mines: 3 …); the machine gun's ammunition comes from the car.</summary>
    public int Amount { get; set; } = 1;

    /// <summary>Time between two shots (ms).</summary>
    public int CooldownMs { get; set; } = 500;

    /// <summary>How often crates contain it (relative weight, 0 = never).</summary>
    public int CrateWeight { get; set; } = 10;

    public int SortOrder { get; set; } = 100;

    public bool IsEnabled { get; set; } = true;
}

/// <summary>A track: a layout of data/layouts.json (the shape and the world) with a name, laps and a time of day.</summary>
public sealed class Track : SoftDeleteEntity
{
    /// <summary>The key of the layout (kidsroom, garden, kitchen, workshop, supermarket, attic).</summary>
    public string Layout { get; set; } = "kidsroom";

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public int Laps { get; set; } = 3;

    public TimeOfDay TimeOfDay { get; set; }

    public int UnlockLevel { get; set; } = 1;

    public int SortOrder { get; set; } = 100;

    public bool IsEnabled { get; set; } = true;
}

/// <summary>A cup (tournament): races on several tracks against the same bots; points per place, the best wins the prize.</summary>
public sealed class Cup : SoftDeleteEntity
{
    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    /// <summary>The tracks in order, as ids separated by commas.</summary>
    public string TrackIds { get; set; } = string.Empty;

    public int Laps { get; set; } = 3;

    public int EntryFee { get; set; }

    public int Prize { get; set; }

    /// <summary>How many bots race (1 … 7).</summary>
    public int Opponents { get; set; } = 5;

    /// <summary>How good the bots are (1 … 5).</summary>
    public int BotSkill { get; set; } = 2;

    public int UnlockLevel { get; set; } = 1;

    public int SortOrder { get; set; } = 100;

    public bool IsEnabled { get; set; } = true;

    public IReadOnlyList<long> TrackIdList() =>
        TrackIds.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(t => long.TryParse(t, System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out var id) ? id : 0)
            .Where(id => id > 0)
            .ToList();
}

/// <summary>A car a player owns, with its tuning and its look.</summary>
public sealed class GarageCar : Entity
{
    public long PlayerId { get; set; }

    public long CarId { get; set; }

    public Car? Car { get; set; }

    public int Engine { get; set; }

    public int Tires { get; set; }

    public int Armor { get; set; }

    public int Turbo { get; set; }

    public int Weapons { get; set; }

    public string Paint { get; set; } = "#e2392f";

    /// <summary>none, stripes, flames, stars, checker, bolt (js/game/cars/models.js DECALS).</summary>
    public string Decal { get; set; } = "stripes";

    public int Number { get; set; } = 7;

    public int LevelOf(Part part) => part switch
    {
        Part.Engine => Engine,
        Part.Tires => Tires,
        Part.Armor => Armor,
        Part.Turbo => Turbo,
        Part.Weapons => Weapons,
        _ => 0,
    };

    public void SetLevel(Part part, int level)
    {
        switch (part)
        {
            case Part.Engine: Engine = level; break;
            case Part.Tires: Tires = level; break;
            case Part.Armor: Armor = level; break;
            case Part.Turbo: Turbo = level; break;
            case Part.Weapons: Weapons = level; break;
        }
    }
}

/// <summary>A race that was started (the history); the live race is a <see cref="Game.RaceRoom"/> in memory.</summary>
public sealed class Race : Entity
{
    /// <summary>The secret of the race in links (never the id).</summary>
    public Guid Token { get; set; }

    public string Name { get; set; } = string.Empty;

    public RaceKind Kind { get; set; }

    public RaceStatus Status { get; set; }

    public long? TrackId { get; set; }

    public Track? Track { get; set; }

    public int Laps { get; set; }

    public bool Weapons { get; set; } = true;

    public long? HostPlayerId { get; set; }

    public long? CupRunId { get; set; }

    public int Humans { get; set; }

    public int Bots { get; set; }

    public DateTime? StartDate { get; set; }

    public DateTime? EndDate { get; set; }

    public List<RaceEntry> Entries { get; set; } = [];
}

/// <summary>A car of a race and how it did.</summary>
public sealed class RaceEntry : Entity
{
    public long RaceId { get; set; }

    public Race? Race { get; set; }

    public int Seat { get; set; }

    public long? PlayerId { get; set; }

    public string Name { get; set; } = string.Empty;

    public bool IsBot { get; set; }

    public string CarName { get; set; } = string.Empty;

    public string CarBody { get; set; } = string.Empty;

    public int Place { get; set; }

    public bool Finished { get; set; }

    public int? TimeMs { get; set; }

    public int? BestLapMs { get; set; }

    public int Kills { get; set; }

    public int Wrecks { get; set; }

    public int MoneyGained { get; set; }

    public int XpGained { get; set; }
}

/// <summary>A player's way through a cup: the race index and the standings of everyone (JSON).</summary>
public sealed class CupRun : Entity
{
    public Guid Token { get; set; }

    public long PlayerId { get; set; }

    public long CupId { get; set; }

    public Cup? Cup { get; set; }

    public int RaceIndex { get; set; }

    public CupRunStatus Status { get; set; }

    /// <summary>The standings as JSON: [{ name, isPlayer, car, body, paint, points, wins }] (see <see cref="Business.CupRules"/>).</summary>
    public string Standings { get; set; } = "[]";

    public int? Place { get; set; }

    public int PrizeWon { get; set; }

    public DateTime StartDate { get; set; }

    public DateTime? EndDate { get; set; }
}

/// <summary>A setting of the game (key/value).</summary>
public sealed class Setting : Entity
{
    public string Key { get; set; } = string.Empty;

    public string Value { get; set; } = string.Empty;
}
