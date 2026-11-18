using TurboToys.Data;

namespace TurboToys.Business;

/// <summary>
/// What a car can do in a race: its catalogue ratings (1 … 10) plus its tuning, as the numbers the browser's physics uses
/// (js/game/race/physics.js reads exactly these). The server computes them, so online every player drives the car the server knows.
/// </summary>
/// <param name="TopSpeed">Units per second (1 unit = 10 cm).</param>
/// <param name="Acceleration">Units per second² at full throttle (at the best point of the engine curve).</param>
/// <param name="Grip">0.6 … 1.6: how hard the tyres hold sideways.</param>
/// <param name="Health">Hit points of the car.</param>
/// <param name="TurboSeconds">How long a full turbo tank lasts.</param>
/// <param name="Weight">1 … 10: who pushes whom in a crash.</param>
/// <param name="GunDamage">Damage of one machine-gun bullet.</param>
/// <param name="GunAmmo">Machine-gun bullets at the start of a race.</param>
public sealed record CarSpec(double TopSpeed, double Acceleration, double Grip, int Health, double TurboSeconds, int Weight, double GunDamage, int GunAmmo);

/// <summary>The tuning shop: five parts, five levels each, prices and effects.</summary>
public static class Tuning
{
    public const int MaxLevel = 5;

    public static readonly IReadOnlyList<Part> Parts = [Part.Engine, Part.Tires, Part.Armor, Part.Turbo, Part.Weapons];

    public static string NameOf(Part part) => part switch
    {
        Part.Engine => "Motor",
        Part.Tires => "Reifen",
        Part.Armor => "Panzerung",
        Part.Turbo => "Turbo",
        Part.Weapons => "Waffen",
        _ => part.ToString(),
    };

    public static string DescriptionOf(Part part) => part switch
    {
        Part.Engine => "Mehr Spitze und mehr Schub.",
        Part.Tires => "Mehr Grip in den Kurven, weniger Rutschen.",
        Part.Armor => "Mehr Lebenspunkte, Raketen tun weniger weh.",
        Part.Turbo => "Größerer Turbo-Tank, lädt schneller nach.",
        Part.Weapons => "Mehr Schaden und Munition für das MG.",
        _ => string.Empty,
    };

    /// <summary>The price of the next level (level = the level after buying, 1 … 5): grows with the car's price and the level.</summary>
    public static int PriceOf(Car car, Part part, int level)
    {
        var basePrice = 150 + car.Price / 12;
        var factor = part switch
        {
            Part.Engine => 1.3,
            Part.Turbo => 1.15,
            Part.Armor => 1.0,
            Part.Tires => 0.9,
            _ => 0.85,
        };
        return (int)(Math.Round(basePrice * factor * level * (1 + 0.35 * (level - 1)) / 10.0) * 10);
    }

    /// <summary>The numbers of a car with its tuning.</summary>
    public static CarSpec SpecOf(Car car, GarageCar? garage)
    {
        var engine = garage?.Engine ?? 0;
        var tires = garage?.Tires ?? 0;
        var armor = garage?.Armor ?? 0;
        var turbo = garage?.Turbo ?? 0;
        var weapons = garage?.Weapons ?? 0;
        var drive = car.Drive switch
        {
            CarDrive.Electric => (speed: 0.97, accel: 1.08),
            CarDrive.Gas => (speed: 1.03, accel: 0.97),
            _ => (speed: 1.0, accel: 1.0),
        };
        return new CarSpec(
            TopSpeed: Math.Round((40 + Clamp(car.Speed) * 2.6) * drive.speed * (1 + 0.04 * engine), 2),
            Acceleration: Math.Round((24 + Clamp(car.Acceleration) * 3.4) * drive.accel * (1 + 0.07 * engine), 2),
            Grip: Math.Round((0.62 + Clamp(car.Grip) * 0.07) * (1 + 0.05 * tires), 3),
            Health: 70 + Clamp(car.Armor) * 8 + armor * 12,
            TurboSeconds: Math.Round((2.4 + Clamp(car.TurboCapacity) * 0.24) * (1 + 0.12 * turbo), 2),
            Weight: Clamp(car.Weight),
            GunDamage: Math.Round(3.0 * (1 + 0.1 * weapons), 2),
            GunAmmo: 60 + 20 * weapons);
    }

    private static int Clamp(int rating) => Math.Clamp(rating, 1, 10);
}

/// <summary>Money: start capital, prizes, bonuses (the currency is "Schrauben").</summary>
public static class Economy
{
    public const int StartMoney = 1500;

    public const int KillBonus = 75;

    public const int MoneyBag = 60;

    public const string Currency = "Schrauben";

    private static readonly int[] Prizes = [500, 350, 250, 175, 120, 90, 60, 40];

    /// <summary>The prize of a place (1 = first) among <paramref name="cars"/> cars; fewer cars pay a little less, a cup race a little more.</summary>
    public static int PrizeFor(int place, int cars, RaceKind kind, double multiplier = 1.0)
    {
        if (place < 1 || place > Prizes.Length)
        {
            return 0;
        }

        var field = Math.Clamp(cars, 2, 8) / 8.0;
        var kindFactor = kind switch
        {
            RaceKind.Cup => 1.2,
            RaceKind.Custom => 1.1,
            _ => 1.0,
        };
        return (int)(Math.Round(Prizes[place - 1] * (0.55 + 0.45 * field) * kindFactor * multiplier / 5.0) * 5);
    }
}

/// <summary>Experience and levels (the same curve online and offline; offline it only counts on the device).</summary>
public static class Progression
{
    public const int MaxLevel = 50;

    /// <summary>The experience needed to reach a level (level 1 = 0).</summary>
    public static int XpFor(int level) => level <= 1 ? 0 : (int)Math.Round(220 * Math.Pow(level - 1, 1.55) / 10.0) * 10;

    public static int LevelOf(int xp)
    {
        var level = 1;
        while (level < MaxLevel && xp >= XpFor(level + 1))
        {
            level++;
        }

        return level;
    }

    /// <summary>The experience of a race: finishing, the place among the field, wrecked opponents, a bonus for the win.</summary>
    public static int XpForRace(int place, int cars, int kills, bool finished)
    {
        if (place < 1)
        {
            return 0;
        }

        var xp = (finished ? 80 : 30) + Math.Max(0, cars - place) * 25 + kills * 20;
        if (place == 1 && cars > 1)
        {
            xp += 60;
        }

        return xp;
    }
}

/// <summary>The comic avatar: the keys of each part (a contract with js/game/ui/avatar.js: never rename one, add new ones at the end) and the unlock levels.</summary>
public static class Avatars
{
    public static readonly IReadOnlyList<(string Key, int Level)> Faces = [("grin", 1), ("cool", 1), ("angry", 1), ("wink", 2), ("shock", 3), ("smirk", 5), ("crazy", 8)];

    public static readonly IReadOnlyList<(string Key, int Level)> Hairs = [("spiky", 1), ("bob", 1), ("bald", 1), ("mohawk", 3), ("afro", 4), ("ponytail", 2), ("quiff", 6)];

    public static readonly IReadOnlyList<(string Key, int Level)> Helmets = [("none", 1), ("racer", 1), ("cap", 1), ("goggles", 2), ("bandana", 3), ("crown", 10), ("viking", 7), ("headset", 4)];

    public static readonly IReadOnlyList<string> Colors = ["#e2392f", "#f28c28", "#f6c638", "#9bd23c", "#2aa198", "#2f6fd0", "#7a4bc4", "#e86aa6", "#34373d", "#f7f3ea"];

    public static readonly IReadOnlyList<string> Skins = ["#f6d7b8", "#f2c9a0", "#d9a273", "#b8794a", "#8a5a32", "#5e3b22"];

    public static int LevelNeeded(string part, string key)
    {
        var list = part switch
        {
            "face" => Faces,
            "hair" => Hairs,
            "helmet" => Helmets,
            _ => [],
        };
        foreach (var (k, level) in list)
        {
            if (k == key)
            {
                return level;
            }
        }

        return int.MaxValue;
    }
}

/// <summary>The paints and decals a garage car may wear (a contract with js/game/cars/models.js).</summary>
public static class Looks
{
    public static readonly IReadOnlyList<string> Paints = ["#e2392f", "#f28c28", "#f6c638", "#9bd23c", "#2aa198", "#2f6fd0", "#7a4bc4", "#e86aa6", "#f7f3ea", "#34373d"];

    public static readonly IReadOnlyList<string> Decals = ["none", "stripes", "flames", "stars", "checker", "bolt"];

    public static readonly IReadOnlyList<string> Bodies = ["buggy", "truck", "muscle", "rally", "super", "van", "formula", "pickup"];

    public static bool IsColor(string? value) =>
        value is { Length: 7 } && value[0] == '#' && value.Skip(1).All(Uri.IsHexDigit);
}
