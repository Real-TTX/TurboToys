using TurboToys.Business;
using TurboToys.Data;
using TurboToys.Game;

namespace TurboToys.Tests;

public sealed class RulesTests
{
    [Fact]
    public void Every_layout_of_the_browser_is_known_to_the_server()
    {
        var keys = Layouts.Keys;
        foreach (var key in new[] { "kidsroom", "garden", "kitchen", "workshop", "supermarket", "attic" })
        {
            Assert.Contains(key, keys);
            var info = Layouts.Find(key)!;
            Assert.InRange(info.Length, 400, 2000);
            Assert.True(info.PickupSlots >= 6);
            Assert.True(info.Shortest <= info.Length);
        }

        // the worlds of the players' tracks are official layouts (thumbnails, filters and history use the key)
        Assert.All(Layouts.Themes, theme => Assert.True(Layouts.Exists(theme), theme));
    }

    [Fact]
    public void Every_seeded_track_and_cup_uses_a_known_layout()
    {
        Assert.All(SeedContent.AllTracks(), t => Assert.True(Layouts.Exists(t.Layout), t.Layout));
        Assert.All(SeedContent.AllCups().SelectMany(c => c.Tracks), t => Assert.True(Layouts.Exists(t.Layout), t.Layout));
        Assert.All(SeedContent.AllCars(), c => Assert.Contains(c.Body, Looks.Bodies));
        Assert.Single(SeedContent.AllCars(), c => c.Price == 0);
    }

    [Fact]
    public void Tuning_makes_a_car_better_and_costs_more_each_level()
    {
        var car = SeedContent.AllCars().First(c => c.Key == "nonna");
        var plain = Tuning.SpecOf(car, null);
        var tuned = Tuning.SpecOf(car, new GarageCar { Engine = 5, Tires = 5, Armor = 5, Turbo = 5, Weapons = 5 });
        Assert.True(tuned.TopSpeed > plain.TopSpeed);
        Assert.True(tuned.Acceleration > plain.Acceleration);
        Assert.True(tuned.Grip > plain.Grip);
        Assert.True(tuned.Health > plain.Health);
        Assert.True(tuned.TurboSeconds > plain.TurboSeconds);
        Assert.True(tuned.GunAmmo > plain.GunAmmo);
        for (var level = 2; level <= Tuning.MaxLevel; level++)
        {
            Assert.True(Tuning.PriceOf(car, Part.Engine, level) > Tuning.PriceOf(car, Part.Engine, level - 1));
        }
    }

    [Fact]
    public void Drive_types_feel_different()
    {
        var electric = Tuning.SpecOf(new Car { Speed = 5, Acceleration = 5, Drive = CarDrive.Electric }, null);
        var gas = Tuning.SpecOf(new Car { Speed = 5, Acceleration = 5, Drive = CarDrive.Gas }, null);
        Assert.True(electric.Acceleration > gas.Acceleration);
        Assert.True(gas.TopSpeed > electric.TopSpeed);
    }

    [Fact]
    public void Levels_grow_with_experience()
    {
        Assert.Equal(1, Progression.LevelOf(0));
        Assert.Equal(2, Progression.LevelOf(Progression.XpFor(2)));
        Assert.Equal(1, Progression.LevelOf(Progression.XpFor(2) - 1));
        for (var level = 2; level < Progression.MaxLevel; level++)
        {
            Assert.True(Progression.XpFor(level + 1) > Progression.XpFor(level));
        }

        Assert.True(Progression.XpForRace(1, 6, 2, true) > Progression.XpForRace(4, 6, 0, true));
    }

    [Fact]
    public void Prizes_fall_with_the_place()
    {
        for (var place = 2; place <= 8; place++)
        {
            Assert.True(Economy.PrizeFor(place, 8, RaceKind.Quick) < Economy.PrizeFor(place - 1, 8, RaceKind.Quick));
        }

        Assert.Equal(0, Economy.PrizeFor(9, 8, RaceKind.Quick));
        Assert.True(Economy.PrizeFor(1, 8, RaceKind.Cup) > Economy.PrizeFor(1, 8, RaceKind.Quick));
    }

    [Fact]
    public void Buying_needs_money_and_level()
    {
        var cars = Catalog();
        var player = PlayerRules.NewPlayer(5, "Rita", false);
        var garage = new List<GarageCar>();
        var starter = PlayerRules.EnsureStarterCar(player, garage, cars)!;
        Assert.Equal(0, cars.First(c => c.Id == starter.CarId).Price);
        garage.Add(starter);

        var expensive = cars.First(c => c.Key == "pulse");
        var tooLow = Assert.Throws<BusinessException>(() => PlayerRules.Buy(player, garage, expensive));
        Assert.Contains("Level", tooLow.Message);

        var dusty = cars.First(c => c.Key == "dusty");
        player.Money = 100;
        Assert.Throws<BusinessException>(() => PlayerRules.Buy(player, garage, dusty));
        player.Money = 5000;
        var bought = PlayerRules.Buy(player, garage, dusty);
        Assert.Equal(5000 - dusty.Price, player.Money);
        garage.Add(bought);
        Assert.Throws<BusinessException>(() => PlayerRules.Buy(player, garage, dusty));
    }

    [Fact]
    public void Upgrading_stops_at_the_last_level()
    {
        var car = Catalog().First(c => c.Key == "sparky");
        var player = PlayerRules.NewPlayer(5, "Rita", false);
        player.Money = 1_000_000;
        var garage = new GarageCar { PlayerId = 5, CarId = car.Id };
        for (var i = 0; i < Tuning.MaxLevel; i++)
        {
            PlayerRules.Upgrade(player, garage, car, Part.Turbo);
        }

        Assert.Equal(Tuning.MaxLevel, garage.Turbo);
        Assert.Throws<BusinessException>(() => PlayerRules.Upgrade(player, garage, car, Part.Turbo));
        Assert.Throws<AccessDeniedException>(() => PlayerRules.Upgrade(PlayerRules.NewPlayer(6, "Other", false), garage, car, Part.Engine));
    }

    [Fact]
    public void Locked_avatar_parts_are_refused()
    {
        var player = PlayerRules.NewPlayer(5, "Rita", false);
        Assert.Throws<BusinessException>(() => PlayerRules.SetAvatar(player, null, null, "crown", null, null, isAdmin: false));
        PlayerRules.SetAvatar(player, "cool", "afro", "crown", "#2f6fd0", "#8a5a32", isAdmin: true);
        Assert.Equal("crown", player.AvatarHelmet);
        Assert.Throws<BusinessException>(() => PlayerRules.SetAvatar(player, "nope", null, null, null, null, isAdmin: true));
    }

    [Fact]
    public void A_cup_adds_points_and_pays_the_winner()
    {
        var cars = Catalog();
        var cup = new Cup { Id = 1, Name = "Test", TrackIds = "1,2", Opponents = 3, BotSkill = 2, EntryFee = 100, Prize = 1000, IsEnabled = true };
        var player = PlayerRules.NewPlayer(5, "Rita", false);
        player.Money = 150;
        var standings = CupRules.Enter(player, cup, cars, null, null, 42);
        Assert.Equal(50, player.Money);
        Assert.Equal(4, standings.Count);
        var run = new CupRun { Standings = CupRules.Write(standings), Status = CupRunStatus.Running };
        var bots = standings.Where(s => !s.IsPlayer).ToList();
        RaceSeatResult Result(string name, bool bot, int place) => new(0, bot ? null : 5, name, bot, place, true, 1000, 900, 0, 0, 0, 0, 0);
        var race = new List<RaceSeatResult> { Result("Rita", false, 1), Result(bots[0].Name, true, 2), Result(bots[1].Name, true, 3), Result(bots[2].Name, true, 4) };

        Assert.Null(CupRules.ApplyRace(run, cup, race, "Rita"));
        var outcome = CupRules.ApplyRace(run, cup, race, "Rita");
        Assert.Equal((1, 1000), outcome);
        Assert.Equal(CupRunStatus.Finished, run.Status);
        Assert.Equal(20, CupRules.Read(run.Standings).First(s => s.IsPlayer).Points);
    }

    internal static List<Car> Catalog()
    {
        long id = 1;
        return SeedContent.AllCars().Select(c =>
        {
            c.Id = id++;
            return c;
        }).ToList();
    }
}
