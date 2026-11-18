using System.Text.Json;
using TurboToys.Data;

namespace TurboToys.Business;

/// <summary>
/// The rules of a player's garage, money and avatar, on plain objects: the plugin (database) and the offline game (profile.json) load the player,
/// call these and save. Every method checks the rule it guards and throws a <see cref="BusinessException"/> with a German message.
/// </summary>
public static class PlayerRules
{
    /// <summary>A new player with the start capital.</summary>
    public static Player NewPlayer(long id, string name, bool isGuest) => new()
    {
        Id = id,
        DisplayName = Trim(name, 60),
        IsGuest = isGuest,
        Money = Economy.StartMoney,
    };

    /// <summary>Gives a player without cars the free starter car (price 0, the first by sort order). Returns the new garage car or null.</summary>
    public static GarageCar? EnsureStarterCar(Player player, IReadOnlyList<GarageCar> owned, IReadOnlyList<Car> catalog)
    {
        if (owned.Count > 0)
        {
            return null;
        }

        var starter = catalog.Where(c => c.IsEnabled && c.UpdateState != UpdateState.Deleted).OrderBy(c => c.Price).ThenBy(c => c.SortOrder).FirstOrDefault();
        return starter is null ? null : NewGarageCar(player, starter, 7);
    }

    /// <summary>Buys a car: enabled, not owned, level reached, money enough. Returns the new garage car (the caller adds and saves it).</summary>
    public static GarageCar Buy(Player player, IReadOnlyList<GarageCar> owned, Car car)
    {
        if (!car.IsEnabled || car.UpdateState == UpdateState.Deleted)
        {
            throw new BusinessException("Dieses Auto gibt es nicht zu kaufen.");
        }

        if (owned.Any(g => g.CarId == car.Id))
        {
            throw new BusinessException("Das Auto steht schon in deiner Garage.");
        }

        var level = Progression.LevelOf(player.Xp);
        if (level < car.UnlockLevel)
        {
            throw new BusinessException($"„{car.Name}“ gibt es ab Level {car.UnlockLevel}.");
        }

        if (player.Money < car.Price)
        {
            throw new BusinessException($"Dafür fehlen dir {car.Price - player.Money} {Economy.Currency}.");
        }

        player.Money -= car.Price;
        return NewGarageCar(player, car, 1 + owned.Count);
    }

    /// <summary>Buys the next level of a part. Returns the price paid.</summary>
    public static int Upgrade(Player player, GarageCar garage, Car car, Part part)
    {
        if (garage.PlayerId != player.Id)
        {
            throw new AccessDeniedException();
        }

        var current = garage.LevelOf(part);
        if (current >= Tuning.MaxLevel)
        {
            throw new BusinessException($"{Tuning.NameOf(part)} ist schon voll ausgebaut.");
        }

        var price = Tuning.PriceOf(car, part, current + 1);
        if (player.Money < price)
        {
            throw new BusinessException($"Dafür fehlen dir {price - player.Money} {Economy.Currency}.");
        }

        player.Money -= price;
        garage.SetLevel(part, current + 1);
        return price;
    }

    /// <summary>Paint, decal and race number of a garage car.</summary>
    public static void SetLook(Player player, GarageCar garage, string? paint, string? decal, int? number)
    {
        if (garage.PlayerId != player.Id)
        {
            throw new AccessDeniedException();
        }

        if (paint is not null)
        {
            if (!Looks.IsColor(paint))
            {
                throw new BusinessException("Diese Farbe gibt es nicht.", "paint");
            }

            garage.Paint = paint.ToLowerInvariant();
        }

        if (decal is not null)
        {
            if (!Looks.Decals.Contains(decal))
            {
                throw new BusinessException("Diesen Aufkleber gibt es nicht.", "decal");
            }

            garage.Decal = decal;
        }

        if (number is not null)
        {
            if (number < 0 || number > 99)
            {
                throw new BusinessException("Die Startnummer geht von 0 bis 99.", "number");
            }

            garage.Number = number.Value;
        }
    }

    public static void Select(Player player, GarageCar garage)
    {
        if (garage.PlayerId != player.Id)
        {
            throw new AccessDeniedException();
        }

        player.SelectedGarageCarId = garage.Id;
    }

    /// <summary>The garage car the player drives: the selected one, else the first.</summary>
    public static GarageCar? Selected(Player player, IReadOnlyList<GarageCar> owned) =>
        owned.FirstOrDefault(g => g.Id == player.SelectedGarageCarId) ?? owned.OrderBy(g => g.Id).FirstOrDefault();

    /// <summary>The avatar: every part must exist and be unlocked (administrators may wear anything).</summary>
    public static void SetAvatar(Player player, string? face, string? hair, string? helmet, string? color, string? skin, bool isAdmin)
    {
        var level = isAdmin ? int.MaxValue : Progression.LevelOf(player.Xp);
        if (face is not null)
        {
            Check("face", face, level, "Gesicht");
            player.AvatarFace = face;
        }

        if (hair is not null)
        {
            Check("hair", hair, level, "Frisur");
            player.AvatarHair = hair;
        }

        if (helmet is not null)
        {
            Check("helmet", helmet, level, "Kopfbedeckung");
            player.AvatarHelmet = helmet;
        }

        if (color is not null)
        {
            if (!Avatars.Colors.Contains(color))
            {
                throw new BusinessException("Diese Farbe gibt es nicht.", "color");
            }

            player.AvatarColor = color;
        }

        if (skin is not null)
        {
            if (!Avatars.Skins.Contains(skin))
            {
                throw new BusinessException("Diesen Hautton gibt es nicht.", "skin");
            }

            player.AvatarSkin = skin;
        }
    }

    /// <summary>Adds what a race brought: money, experience and the statistics (never for bots).</summary>
    public static void AddRace(Player player, RaceSeatResult result, int cars)
    {
        player.Money += result.Money;
        player.MoneyEarned += Math.Max(0, result.Money);
        player.Xp += result.Xp;
        player.RacesPlayed++;
        if (result.Place == 1 && cars > 1)
        {
            player.RacesWon++;
        }

        if (result.Place is >= 1 and <= 3 && cars > 2)
        {
            player.Podiums++;
        }

        player.Kills += result.Kills;
        player.Wrecks += result.Wrecks;
        player.LastRaceDate = DateTime.UtcNow;
    }

    /// <summary>The loadout of a garage car for a race (catalogue + tuning + look).</summary>
    public static Game.CarLoadout LoadoutOf(Car car, GarageCar? garage) => new(
        car.Key,
        car.Name,
        car.Body,
        car.Drive.ToString(),
        garage?.Paint ?? car.DefaultPaint,
        garage?.Decal ?? "stripes",
        garage?.Number ?? 0,
        Tuning.SpecOf(car, garage),
        new Game.TuningLevels(garage?.Engine ?? 0, garage?.Tires ?? 0, garage?.Armor ?? 0, garage?.Turbo ?? 0, garage?.Weapons ?? 0));

    public static Game.AvatarView AvatarOf(Player player) =>
        new(player.AvatarFace, player.AvatarHair, player.AvatarHelmet, player.AvatarColor, player.AvatarSkin);

    private static GarageCar NewGarageCar(Player player, Car car, int number) => new()
    {
        PlayerId = player.Id,
        CarId = car.Id,
        Car = car,
        Paint = car.DefaultPaint,
        Decal = "stripes",
        Number = Math.Clamp(number, 0, 99),
    };

    private static void Check(string part, string key, int level, string label)
    {
        var needed = Avatars.LevelNeeded(part, key);
        if (needed == int.MaxValue)
        {
            throw new BusinessException($"Diese {label} gibt es nicht.", part);
        }

        if (needed > level)
        {
            throw new BusinessException($"Diese {label} gibt es ab Level {needed}.", part);
        }
    }

    private static string Trim(string text, int max)
    {
        var t = (text ?? string.Empty).Trim();
        return t.Length > max ? t[..max] : t;
    }
}

/// <summary>What a seat got from a race (prize + bonuses, experience).</summary>
public sealed record RaceSeatResult(int Seat, long? PlayerId, string Name, bool IsBot, int Place, bool Finished, int? TimeMs, int? BestLapMs, int Kills, int Wrecks,
    int Prize, int Money, int Xp);

/// <summary>One participant of a cup run.</summary>
public sealed record CupStanding(string Name, bool IsPlayer, string CarKey, string CarName, string Body, string Drive, string Paint, int Points, int Wins, int Skill);

/// <summary>The rules of cups (tournaments): entering, the bots of a run, points per race, the end and the prize.</summary>
public static class CupRules
{
    public static readonly IReadOnlyList<int> Points = [10, 8, 6, 5, 4, 3, 2, 1];

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Checks and pays the entry; returns the standings of the new run (the player and the cup's bots with their cars).</summary>
    public static IReadOnlyList<CupStanding> Enter(Player player, Cup cup, IReadOnlyList<Car> catalog, GarageCar? playerCar, Car? playerCarModel, int seed)
    {
        if (!cup.IsEnabled || cup.UpdateState == UpdateState.Deleted)
        {
            throw new BusinessException("Diesen Pokal gibt es nicht.");
        }

        if (cup.TrackIdList().Count == 0)
        {
            throw new BusinessException("Dieser Pokal hat keine Strecken.");
        }

        if (Progression.LevelOf(player.Xp) < cup.UnlockLevel)
        {
            throw new BusinessException($"„{cup.Name}“ gibt es ab Level {cup.UnlockLevel}.");
        }

        if (player.Money < cup.EntryFee)
        {
            throw new BusinessException($"Das Startgeld sind {cup.EntryFee} {Economy.Currency} – dir fehlen {cup.EntryFee - player.Money}.");
        }

        player.Money -= cup.EntryFee;
        var random = new Random(seed);
        var standings = new List<CupStanding>
        {
            new(player.DisplayName, true, playerCarModel?.Key ?? "", playerCarModel?.Name ?? "", playerCarModel?.Body ?? "buggy", playerCarModel?.Drive.ToString() ?? "Electric",
                playerCar?.Paint ?? "#e2392f", 0, 0, 0),
        };
        var names = SeedContent.BotNames.OrderBy(_ => random.Next()).ToList();
        for (var i = 0; i < Math.Clamp(cup.Opponents, 1, 7); i++)
        {
            var car = Bots.PickCar(catalog, cup.BotSkill, random);
            standings.Add(new CupStanding(names[i % names.Count], false, car.Key, car.Name, car.Body, car.Drive.ToString(),
                Looks.Paints[random.Next(Looks.Paints.Count)], 0, 0, cup.BotSkill));
        }

        return standings;
    }

    public static IReadOnlyList<CupStanding> Read(string json) =>
        string.IsNullOrWhiteSpace(json) ? [] : JsonSerializer.Deserialize<List<CupStanding>>(json, Json) ?? [];

    public static string Write(IReadOnlyList<CupStanding> standings) => JsonSerializer.Serialize(standings, Json);

    /// <summary>
    /// Adds the points of a race (places by name: the cup's names are unique) and moves the run on. When it was the last race the run ends:
    /// returns the final place of the player (1 = the cup is won) and the prize (1st: all, 2nd: half, 3rd: a quarter), else null.
    /// </summary>
    public static (int Place, int Prize)? ApplyRace(CupRun run, Cup cup, IReadOnlyList<RaceSeatResult> results, string playerName)
    {
        var standings = Read(run.Standings).ToList();
        for (var i = 0; i < standings.Count; i++)
        {
            var s = standings[i];
            var result = s.IsPlayer ? results.FirstOrDefault(r => !r.IsBot) : results.FirstOrDefault(r => r.IsBot && r.Name == s.Name);
            if (result is null)
            {
                continue;
            }

            var points = result.Place >= 1 && result.Place <= Points.Count ? Points[result.Place - 1] : 0;
            standings[i] = s with { Points = s.Points + points, Wins = s.Wins + (result.Place == 1 ? 1 : 0), Name = s.IsPlayer ? playerName : s.Name };
        }

        run.Standings = Write(standings);
        run.RaceIndex++;
        if (run.RaceIndex < cup.TrackIdList().Count)
        {
            return null;
        }

        var ordered = Order(standings);
        var place = ordered.FindIndex(s => s.IsPlayer) + 1;
        var prize = place switch
        {
            1 => cup.Prize,
            2 => cup.Prize / 2,
            3 => cup.Prize / 4,
            _ => 0,
        };
        run.Status = CupRunStatus.Finished;
        run.Place = place;
        run.PrizeWon = prize;
        run.EndDate = DateTime.UtcNow;
        return (place, prize);
    }

    /// <summary>The standings ordered: points, then wins.</summary>
    public static List<CupStanding> Order(IEnumerable<CupStanding> standings) =>
        standings.OrderByDescending(s => s.Points).ThenByDescending(s => s.Wins).ThenBy(s => s.IsPlayer ? 0 : 1).ToList();
}

/// <summary>The bots: which cars they drive and how they are tuned.</summary>
public static class Bots
{
    /// <summary>A car for a bot of a skill (1 … 5): low skill takes the cheaper half of the catalogue, high skill the expensive half.</summary>
    public static Car PickCar(IReadOnlyList<Car> catalog, int skill, Random random)
    {
        var cars = catalog.Where(c => c.IsEnabled && c.UpdateState != UpdateState.Deleted).OrderBy(c => c.Price).ToList();
        if (cars.Count == 0)
        {
            return new Car { Key = "sparky", Name = "Sparky", Body = "buggy" };
        }

        var s = Math.Clamp(skill, 1, 5);
        var from = (int)Math.Floor((s - 1) / 5.0 * cars.Count * 0.8);
        var to = Math.Max(from + 1, (int)Math.Ceiling(Math.Min(cars.Count, (s + 1) / 5.0 * cars.Count)));
        return cars[random.Next(from, Math.Min(to, cars.Count))];
    }

    /// <summary>The tuning of a bot's car: skill 1 = none, skill 5 = level 4 everywhere.</summary>
    public static GarageCar TuningFor(Car car, int skill, Random random)
    {
        var level = Math.Clamp(skill - 1, 0, 4);
        return new GarageCar
        {
            CarId = car.Id,
            Engine = level,
            Tires = level,
            Armor = Math.Max(0, level - random.Next(2)),
            Turbo = level,
            Weapons = Math.Max(0, level - random.Next(2)),
            Paint = Looks.Paints[random.Next(Looks.Paints.Count)],
            Decal = Looks.Decals[1 + random.Next(Looks.Decals.Count - 1)],
            Number = random.Next(1, 99),
        };
    }
}
