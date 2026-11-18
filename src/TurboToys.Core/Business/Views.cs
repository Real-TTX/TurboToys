using TurboToys.Data;
using TurboToys.Game;

namespace TurboToys.Business;

// The JSON shapes of the game API (online: TurboToys.Module Api; offline: TurboToys.Local) – built here once, so both send the same.

public sealed record CarView(long Id, string Key, string Name, string Description, string Body, string Drive, int Speed, int Acceleration, int Grip, int Armor, int Weight,
    int TurboCapacity, int Price, int UnlockLevel, string DefaultPaint);

public sealed record UpgradeOffer(string Part, string Name, string Description, int Level, int MaxLevel, int? Price);

public sealed record GarageCarView(long Id, long CarId, CarView Car, string Paint, string Decal, int Number, TuningLevels Levels, CarSpec Spec, IReadOnlyList<UpgradeOffer> Upgrades);

public sealed record ShopItem(CarView Car, bool Owned, bool Locked, CarSpec Spec);

public sealed record GarageView(int Money, int Level, long? SelectedId, IReadOnlyList<GarageCarView> Cars, IReadOnlyList<ShopItem> Shop, IReadOnlyList<string> Paints,
    IReadOnlyList<string> Decals);

public sealed record TrackView(long Id, string Layout, string Name, string Description, int Laps, string TimeOfDay, int UnlockLevel, bool Locked);

public sealed record CupRunView(Guid Token, long CupId, string CupName, int RaceIndex, int Races, string Status, IReadOnlyList<CupStanding> Standings, int? Place, int PrizeWon,
    TrackView? NextTrack);

public sealed record CupView(long Id, string Name, string Description, IReadOnlyList<TrackView> Tracks, int Laps, int EntryFee, int Prize, int Opponents, int BotSkill,
    int UnlockLevel, bool Locked, CupRunView? Run, int Wins);

public sealed record PlayerView(long Id, string DisplayName, bool IsGuest, bool IsAdmin, int Level, int Xp, int XpLevel, int XpNext, int Money, AvatarView Avatar);

public sealed record StatsView(int RacesPlayed, int RacesWon, int Podiums, int Kills, int Wrecks, int CupsWon, int MoneyEarned, int? Rank);

public sealed record AvatarPart(string Key, int Level, bool Locked);

public sealed record AvatarOptions(IReadOnlyList<AvatarPart> Faces, IReadOnlyList<AvatarPart> Hairs, IReadOnlyList<AvatarPart> Helmets, IReadOnlyList<string> Colors,
    IReadOnlyList<string> Skins);

public sealed record ProfileView(PlayerView Player, StatsView Stats, AvatarOptions Options);

public sealed record HistoryItem(Guid Token, string Name, string TrackName, string Layout, string Kind, DateTime? EndDate, int Place, int Cars, bool Finished, int? TimeMs,
    int? BestLapMs, int Kills, int Money, int Xp);

public sealed record LeaderRow(int Rank, long Id, string Name, int Level, int Xp, int RacesWon, int Podiums, int Kills, AvatarView Avatar);

public sealed record WeaponView(string Kind, string Name, string Description, int Damage, int Amount, int CooldownMs);

public sealed record CatalogView(IReadOnlyList<CarView> Cars, IReadOnlyList<WeaponView> Weapons, IReadOnlyList<UpgradeOffer> Parts, string Currency, int KillBonus);

/// <summary>Builds the views from entities.</summary>
public static class Views
{
    public static CarView Car(Car c) => new(c.Id, c.Key, c.Name, c.Description, c.Body, c.Drive.ToString(), c.Speed, c.Acceleration, c.Grip, c.Armor, c.Weight,
        c.TurboCapacity, c.Price, c.UnlockLevel, c.DefaultPaint);

    public static GarageCarView GarageCar(GarageCar g, Car car) => new(
        g.Id, car.Id, Car(car), g.Paint, g.Decal, g.Number,
        new TuningLevels(g.Engine, g.Tires, g.Armor, g.Turbo, g.Weapons),
        Tuning.SpecOf(car, g),
        Tuning.Parts.Select(p =>
        {
            var level = g.LevelOf(p);
            return new UpgradeOffer(p.ToString(), Tuning.NameOf(p), Tuning.DescriptionOf(p), level, Tuning.MaxLevel, level >= Tuning.MaxLevel ? null : Tuning.PriceOf(car, p, level + 1));
        }).ToList());

    public static GarageView Garage(Player player, IReadOnlyList<GarageCar> owned, IReadOnlyList<Car> catalog)
    {
        var level = Progression.LevelOf(player.Xp);
        var byId = catalog.ToDictionary(c => c.Id);
        var cars = owned.Where(g => byId.ContainsKey(g.CarId)).OrderBy(g => byId[g.CarId].SortOrder).ThenBy(g => g.Id).Select(g => GarageCar(g, byId[g.CarId])).ToList();
        var shop = catalog.Where(c => c.IsEnabled && c.UpdateState != UpdateState.Deleted).OrderBy(c => c.SortOrder).ThenBy(c => c.Price)
            .Select(c => new ShopItem(Car(c), owned.Any(g => g.CarId == c.Id), level < c.UnlockLevel, Tuning.SpecOf(c, null)))
            .ToList();
        var selected = PlayerRules.Selected(player, owned);
        return new GarageView(player.Money, level, selected?.Id, cars, shop, Looks.Paints, Looks.Decals);
    }

    public static TrackView Track(Track t, int level) =>
        new(t.Id, t.Layout, t.Name, t.Description, t.Laps, t.TimeOfDay.ToString(), t.UnlockLevel, level < t.UnlockLevel);

    public static TrackRef TrackRef(Track t) => new(t.Id, t.Layout, t.Name, t.TimeOfDay.ToString(), t.Laps);

    public static CupRunView CupRun(CupRun run, Cup cup, IReadOnlyDictionary<long, Track> tracks, int level)
    {
        var ids = cup.TrackIdList();
        var next = run.Status == CupRunStatus.Running && run.RaceIndex < ids.Count && tracks.TryGetValue(ids[run.RaceIndex], out var t) ? Track(t, level) : null;
        return new CupRunView(run.Token, cup.Id, cup.Name, run.RaceIndex, ids.Count, run.Status.ToString(), CupRules.Order(CupRules.Read(run.Standings)), run.Place, run.PrizeWon,
            next);
    }

    public static CupView Cup(Cup cup, IReadOnlyDictionary<long, Track> tracks, int level, CupRun? run, int wins) => new(
        cup.Id, cup.Name, cup.Description,
        cup.TrackIdList().Where(tracks.ContainsKey).Select(id => Track(tracks[id], level)).ToList(),
        cup.Laps, cup.EntryFee, cup.Prize, cup.Opponents, cup.BotSkill, cup.UnlockLevel, level < cup.UnlockLevel,
        run is null ? null : CupRun(run, cup, tracks, level), wins);

    public static PlayerView Player(Player p, bool isAdmin)
    {
        var level = Progression.LevelOf(p.Xp);
        return new PlayerView(p.Id, p.DisplayName, p.IsGuest, isAdmin, level, p.Xp, Progression.XpFor(level), Progression.XpFor(Math.Min(Progression.MaxLevel, level + 1)),
            p.Money, PlayerRules.AvatarOf(p));
    }

    public static StatsView Stats(Player p, int? rank) => new(p.RacesPlayed, p.RacesWon, p.Podiums, p.Kills, p.Wrecks, p.CupsWon, p.MoneyEarned, rank);

    public static AvatarOptions AvatarOptions(int level, bool isAdmin)
    {
        AvatarPart Part((string Key, int Level) item) => new(item.Key, item.Level, !isAdmin && item.Level > level);
        return new AvatarOptions(Avatars.Faces.Select(Part).ToList(), Avatars.Hairs.Select(Part).ToList(), Avatars.Helmets.Select(Part).ToList(), Avatars.Colors, Avatars.Skins);
    }

    public static ProfileView Profile(Player p, bool isAdmin, int? rank) =>
        new(Player(p, isAdmin), Stats(p, rank), AvatarOptions(Progression.LevelOf(p.Xp), isAdmin));

    public static WeaponView Weapon(Weapon w) => new(w.Kind.ToString(), w.Name, w.Description, w.Damage, w.Amount, w.CooldownMs);

    public static WeaponRule WeaponRule(Weapon w) => new(w.Kind.ToString(), w.Name, w.Damage, w.Amount, w.CooldownMs, w.CrateWeight);

    /// <summary>The weapons of a race: per kind the first enabled one by sort order.</summary>
    public static IReadOnlyList<WeaponRule> WeaponRules(IEnumerable<Weapon> weapons) =>
        weapons.Where(w => w.IsEnabled && w.UpdateState != UpdateState.Deleted).OrderBy(w => w.SortOrder).GroupBy(w => w.Kind).Select(g => WeaponRule(g.First())).ToList();

    public static CatalogView Catalog(IEnumerable<Car> cars, IEnumerable<Weapon> weapons) => new(
        cars.Where(c => c.IsEnabled && c.UpdateState != UpdateState.Deleted).OrderBy(c => c.SortOrder).Select(Car).ToList(),
        weapons.Where(w => w.IsEnabled && w.UpdateState != UpdateState.Deleted).OrderBy(w => w.SortOrder).Select(Weapon).ToList(),
        Tuning.Parts.Select(p => new UpgradeOffer(p.ToString(), Tuning.NameOf(p), Tuning.DescriptionOf(p), 0, Tuning.MaxLevel, null)).ToList(),
        Economy.Currency, Economy.KillBonus);

    /// <summary>The bot cars of a quick race around a skill (tuned by skill).</summary>
    public static IReadOnlyList<CarLoadout> BotCars(IReadOnlyList<Car> catalog, int skill, int seed)
    {
        var random = new Random(seed);
        var list = new List<CarLoadout>();
        for (var i = 0; i < 8; i++)
        {
            var car = Bots.PickCar(catalog, skill, random);
            list.Add(PlayerRules.LoadoutOf(car, Bots.TuningFor(car, skill, random)));
        }

        return list;
    }

    /// <summary>The bots of a cup race from the run's standings (same names and cars every race).</summary>
    public static IReadOnlyList<(string Name, CarLoadout Car, int Skill)> CupBots(IReadOnlyList<CupStanding> standings, IReadOnlyList<Car> catalog, int seed)
    {
        var random = new Random(seed);
        var result = new List<(string, CarLoadout, int)>();
        foreach (var s in standings.Where(s => !s.IsPlayer))
        {
            var car = catalog.FirstOrDefault(c => c.Key == s.CarKey) ?? Bots.PickCar(catalog, s.Skill, random);
            var tuning = Bots.TuningFor(car, s.Skill, random);
            tuning.Paint = s.Paint;
            result.Add((s.Name, PlayerRules.LoadoutOf(car, tuning), s.Skill));
        }

        return result;
    }
}
