using TurboToys.Business;
using TurboToys.Data;
using TurboToys.Game;

namespace TurboToys.Tests;

public sealed class RaceRoomTests
{
    private static readonly DateTime T0 = new(2026, 11, 18, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void The_host_starts_when_everyone_is_ready_and_bots_fill_the_grid()
    {
        var room = NewRoom(bots: 3);
        room.Join("a", Player(1, "Anna"), Car());
        room.Join("b", Player(2, "Ben"), Car());
        Assert.Throws<AccessDeniedException>(() => room.Start("b", T0));
        var waiting = Assert.Throws<BusinessException>(() => room.Start("a", T0));
        Assert.Contains("Ben", waiting.Message);

        room.SetReady("b", true);
        var messages = room.Start("a", T0);
        var start = Assert.IsType<RaceStartView>(Assert.Single(messages, m => m.Method == "RaceStart").Args[0]);
        Assert.Equal(5, start.Seats.Count);
        Assert.Equal(3, start.Seats.Count(s => s.Kind == "Bot"));
        Assert.Equal(1, start.BotDriver);
        Assert.Equal(RoomStatus.Countdown, room.Status);
        Assert.Equal(Enumerable.Range(0, 5), start.Seats.Select(s => s.Grid).Order());

        room.Tick(T0.AddMilliseconds(RaceRoom.CountdownMs + 10));
        Assert.Equal(RoomStatus.Racing, room.Status);
    }

    [Fact]
    public void Only_the_owner_reports_a_car_and_the_bot_driver_the_bots()
    {
        var room = Racing(out var now, bots: 1, humans: 2);
        var bot = room.Seats.First(s => s.Kind == SeatKind.Bot).Index;
        Assert.Empty(room.State("b", 0, Data()));
        Assert.Single(room.State("a", 0, Data()));
        Assert.Single(room.State("a", bot, Data()));
        Assert.Empty(room.State("b", bot, Data()));
        // the bot driver leaves: the next player drives the bots
        var left = room.Leave("a");
        Assert.Contains(left, m => m.Method == "BotDriver" && (long?)m.Args[0] == 2);
        Assert.Single(room.State("b", bot, Data()));
        _ = now;
    }

    [Fact]
    public void Hits_are_capped_and_a_wreck_pays_the_attacker()
    {
        var room = Racing(out var now, humans: 2);
        var rocket = room.WeaponRules.First(w => w.Kind == "Rocket").Damage;
        var target = room.Seats[1];
        var health = target.Hp;
        room.Hit("a", 0, 1, "Rocket", 999, now);
        Assert.Equal(health - rocket, target.Hp);

        // the target may not report a rocket of somebody else; a crash it reports itself
        Assert.Empty(room.Hit("b", 0, 1, "Rocket", 10, now));
        Assert.NotEmpty(room.Hit("b", 1, 1, "Crash", 5, now));

        // the machine gun: at most its damage per bullet and 14 bullets a second
        var before = target.Hp;
        for (var i = 0; i < 40; i++)
        {
            room.Hit("a", 0, 1, "MachineGun", 50, now);
        }

        Assert.InRange(before - target.Hp, 0.1, room.Seats[0].Car.Spec.GunDamage * 14 + 0.01);

        var later = now.AddSeconds(2);
        List<Outgoing> last = [];
        for (var i = 0; i < 20 && target.WreckedUntil is null; i++)
        {
            last = room.Hit("a", 0, 1, "Rocket", rocket, later.AddSeconds(i));
        }

        Assert.Contains(last, m => m.Method == "Wrecked");
        Assert.Equal(1, room.Seats[0].Kills);
        Assert.Equal(Economy.KillBonus, room.Seats[0].Money);
        Assert.Empty(room.Hit("a", 0, 1, "Rocket", rocket, later.AddSeconds(30)));
        var respawn = room.Tick(target.WreckedUntil!.Value.AddMilliseconds(1));
        Assert.Contains(respawn, m => m.Method == "Respawn");
        Assert.Equal(target.Car.Spec.Health, target.Hp);
    }

    [Fact]
    public void A_crate_is_gone_until_it_comes_back()
    {
        var room = Racing(out var now);
        var picked = room.Pickup("a", 0, 2, now);
        var content = Assert.IsType<PickupContent>(Assert.Single(picked).Args[2]);
        Assert.Contains(content.Kind, new[] { "weapon", "repair", "turbo", "ammo", "money" });
        Assert.Empty(room.Pickup("a", 0, 2, now.AddSeconds(1)));
        var back = room.Tick(now.AddMilliseconds(RaceRoom.SlotBackMs + 1));
        Assert.Contains(back, m => m.Method == "SlotBack" && (int)m.Args[0]! == 2);
        Assert.NotEmpty(room.Pickup("a", 0, 2, now.AddMilliseconds(RaceRoom.SlotBackMs + 2)));
    }

    [Fact]
    public void A_special_weapon_needs_to_be_held()
    {
        var room = Racing(out var now);
        Assert.Empty(room.Fire("a", 0, "Rocket", [1, 2, 3], now));
        room.Seats[0].Special = "Rocket";
        room.Seats[0].SpecialCount = 1;
        room.Fire("a", 0, "Rocket", [1, 2, 3], now);
        Assert.Null(room.Seats[0].Special);
        Assert.Empty(room.Fire("a", 0, "Rocket", [1, 2, 3], now.AddSeconds(2)));
    }

    [Fact]
    public void Too_fast_laps_do_not_count_and_the_race_ends_with_results()
    {
        var room = Racing(out var now, bots: 2);
        var start = now;
        Assert.Empty(room.Lap("a", 0, 1, start.AddSeconds(1)));
        var lapTime = TimeSpan.FromSeconds(30);
        var t = start;
        for (var lap = 1; lap <= room.Laps; lap++)
        {
            t = t.Add(lapTime);
            Assert.NotEmpty(room.Lap("a", 0, lap, t));
        }

        Assert.NotNull(room.Seats[0].FinishedMs);
        var end = room.Tick(t.AddMilliseconds(1));
        var results = Assert.IsType<ResultsView>(Assert.Single(end, m => m.Method == "Results").Args[0]);
        Assert.Equal(RoomStatus.Finished, room.Status);
        var mine = results.Results.First(r => !r.IsBot);
        Assert.Equal(1, mine.Place);
        Assert.True(mine.Finished);
        Assert.True(mine.Money >= Economy.PrizeFor(1, 3, RaceKind.Custom));
        Assert.True(mine.Xp > 0);
        Assert.Equal(new[] { 1, 2, 3 }, results.Results.Select(r => r.Place));
    }

    [Fact]
    public void The_room_closes_when_the_last_player_leaves()
    {
        var room = NewRoom();
        room.Join("a", Player(1, "Anna"), Car());
        room.Leave("a");
        Assert.Equal(RoomStatus.Closed, room.Status);
        Assert.True(room.IsStale(T0));
    }

    // ---- helpers

    internal static RaceRoom NewRoom(int bots = 0, RaceKind kind = RaceKind.Custom)
    {
        var weapons = Views.WeaponRules(SeedContent.AllWeapons());
        var track = new TrackRef(1, "kidsroom", "Kinderzimmer", "Day", 3);
        return new RaceRoom(Guid.NewGuid(), "ABCD", kind, new RoomSettings(null, 1, 3, 8, bots, 2, true, true), track, weapons, [Car()], seed: 7);
    }

    private static RaceRoom Racing(out DateTime now, int bots = 0, int humans = 1)
    {
        var room = NewRoom(bots);
        room.Join("a", Player(1, "Anna"), Car());
        if (humans > 1)
        {
            room.Join("b", Player(2, "Ben"), Car());
            room.SetReady("b", true);
        }

        room.Start("a", T0);
        now = T0.AddMilliseconds(RaceRoom.CountdownMs + 1);
        room.Tick(now);
        return room;
    }

    internal static SeatPlayer Player(long id, string name) => new(id, name, false, 1, new AvatarView("grin", "spiky", "racer", "#e2392f", "#f2c9a0"));

    internal static CarLoadout Car() => PlayerRules.LoadoutOf(SeedContent.AllCars()[0], null);

    private static double[] Data() => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1];
}
