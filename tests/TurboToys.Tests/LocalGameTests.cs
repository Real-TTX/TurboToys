using System.Text.Json;
using MatGame.Local;
using TurboToys.Game;
using TurboToys.Local;

namespace TurboToys.Tests;

/// <summary>The offline game answers every call of the player app (docs/PROTOCOL.md) with the same shapes as online.</summary>
public sealed class LocalGameTests : IAsyncLifetime
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), "turbotoys-test-" + Guid.NewGuid().ToString("n"));
    private readonly TurboToysLocal _game = new();
    private FakeHost _host = null!;

    public async Task InitializeAsync()
    {
        _host = new FakeHost(_folder);
        await _game.StartAsync(_host, CancellationToken.None);
    }

    public async Task DisposeAsync()
    {
        await _game.DisposeAsync();
        Directory.Delete(_folder, recursive: true);
    }

    [Theory]
    [InlineData("GET", "/session")]
    [InlineData("GET", "/home")]
    [InlineData("GET", "/catalog")]
    [InlineData("GET", "/garage")]
    [InlineData("GET", "/tracks")]
    [InlineData("GET", "/designs")]
    [InlineData("GET", "/cups")]
    [InlineData("GET", "/profile")]
    [InlineData("GET", "/leaderboard")]
    [InlineData("GET", "/history")]
    [InlineData("GET", "/info")]
    public async Task Every_read_of_the_app_is_answered(string method, string path)
    {
        var answer = await _game.RequestAsync(method, path, null, CancellationToken.None);
        Assert.Equal(200, answer.Status);
    }

    [Fact]
    public async Task The_new_player_has_the_starter_car_and_can_tune_and_paint_it()
    {
        var garage = await Json("GET", "/garage");
        var car = garage.GetProperty("cars")[0];
        var id = car.GetProperty("id").GetInt64();
        Assert.Equal(id, garage.GetProperty("selectedId").GetInt64());

        var tuned = await Json("POST", $"/garage/{id}/upgrade", new { part = "Engine" });
        Assert.Equal(1, tuned.GetProperty("cars")[0].GetProperty("levels").GetProperty("engine").GetInt32());
        Assert.True(tuned.GetProperty("money").GetInt32() < garage.GetProperty("money").GetInt32());

        var painted = await Json("PUT", $"/garage/{id}/look", new { paint = "#2f6fd0", decal = "flames", number = 42 });
        Assert.Equal("flames", painted.GetProperty("cars")[0].GetProperty("decal").GetString());

        var wrong = await _game.RequestAsync("PUT", $"/garage/{id}/look", Body(new { decal = "unicorns" }), CancellationToken.None);
        Assert.Equal(400, wrong.Status);
        Assert.Equal("decal", wrong.Body!.Value.GetProperty("field").GetString());

        // it is saved
        Assert.Contains("flames", await File.ReadAllTextAsync(Path.Combine(_folder, LocalProfile.FileName)));
    }

    [Fact]
    public async Task A_quick_race_starts_finishes_and_pays()
    {
        var before = _game.Profile.Player.Money;
        await _game.InvokeAsync("QuickRace", [JsonSerializer.SerializeToElement(new { trackId = 1, bots = 3, botSkill = 1, laps = 1 })], CancellationToken.None);
        Assert.Contains(_host.Sent, m => m.Name == "RaceStart");
        var room = _game.Room!;
        Assert.Equal(4, room.Seats.Count);

        var go = DateTime.UtcNow.AddMilliseconds(RaceRoom.CountdownMs + 50);
        _game.Tick(go);
        Assert.Equal(RoomStatus.Racing, room.Status);
        var lap = room.Lap(TurboToysLocal.Connection, 0, 1, go.AddSeconds(40));
        Assert.Contains(lap, m => m.Method == "Finished");
        var end = _game.Tick(go.AddSeconds(41));
        Assert.Contains(end, m => m.Method == "Results");
        Assert.Contains(end, m => m.Method == "Saved");
        Assert.True(_game.Profile.Player.Money > before);
        Assert.Equal(1, _game.Profile.Player.RacesPlayed);
        Assert.Single(_game.Profile.History);
    }

    [Fact]
    public async Task A_cup_run_starts_its_first_race()
    {
        var run = await Json("POST", "/cups/1/enter", new { });
        var token = run.GetProperty("token").GetGuid();
        await _game.InvokeAsync("StartCup", [JsonSerializer.SerializeToElement(token)], CancellationToken.None);
        var room = _game.Room!;
        Assert.Equal(Data.RaceKind.Cup, room.Kind);
        Assert.Equal(token, room.CupRun);
        Assert.True(room.Seats.Count > 1);
    }

    [Fact]
    public async Task Own_tracks_are_saved_listed_changed_and_deleted()
    {
        var saved = await Json("POST", "/designs", new { name = "Meine Piste", theme = "garden", timeOfDay = "Dusk", laps = 2, design = LayoutTests.Square() });
        var id = saved.GetProperty("id").GetInt64();
        Assert.True(id >= LocalProfile.TrackIdBase);
        Assert.Equal("garden", saved.GetProperty("theme").GetString());
        Assert.Equal("Dusk", saved.GetProperty("timeOfDay").GetString());
        Assert.Equal($"custom-{id}", saved.GetProperty("design").GetProperty("key").GetString());
        Assert.Equal("Meine Piste", saved.GetProperty("design").GetProperty("name").GetString());

        var list = await Json("GET", "/designs");
        Assert.Equal(id, list[0].GetProperty("id").GetInt64());
        var tracks = await Json("GET", "/tracks");
        var mine = tracks.EnumerateArray().Single(t => t.GetProperty("track").GetProperty("id").GetInt64() == id).GetProperty("track");
        Assert.True(mine.GetProperty("custom").GetBoolean());
        Assert.Equal("garden", mine.GetProperty("layout").GetString());
        Assert.False(tracks[0].GetProperty("track").GetProperty("custom").GetBoolean());
        var design = await Json("GET", $"/tracks/{id}/design");
        Assert.Equal(1, design.GetProperty("pieces").GetArrayLength());

        var renamed = await Json("POST", "/designs", new { id, name = "Neuer Name", theme = "kitchen", timeOfDay = "Day", laps = 3, design = LayoutTests.Square() });
        Assert.Equal(id, renamed.GetProperty("id").GetInt64());
        Assert.Equal("kitchen", renamed.GetProperty("design").GetProperty("theme").GetString());
        Assert.Single((await Json("GET", "/designs")).EnumerateArray());

        var tooShort = await _game.RequestAsync("POST", "/designs", Body(new { name = "Mini", theme = "garden", timeOfDay = "Day", laps = 3, design = LayoutTests.Square(100, shortcut: false, loop: false) }),
            CancellationToken.None);
        Assert.Equal(400, tooShort.Status);
        Assert.Equal("design", tooShort.Body!.Value.GetProperty("field").GetString());
        Assert.Equal(400, (await _game.RequestAsync("GET", "/tracks/1/design", null, CancellationToken.None)).Status);

        await Json("DELETE", $"/designs/{id}");
        Assert.Empty((await Json("GET", "/designs")).EnumerateArray());
        Assert.DoesNotContain("Neuer Name", await File.ReadAllTextAsync(Path.Combine(_folder, LocalProfile.FileName)));
    }

    [Fact]
    public async Task A_quick_race_on_an_own_track_uses_its_design()
    {
        var saved = await Json("POST", "/designs", new { name = "Meine Piste", theme = "attic", timeOfDay = "Night", laps = 1, design = LayoutTests.Square() });
        var id = saved.GetProperty("id").GetInt64();
        await _game.InvokeAsync("QuickRace", [JsonSerializer.SerializeToElement(new { trackId = id, bots = 2, botSkill = 1, laps = 1 })], CancellationToken.None);
        var start = (RaceStartView)_host.Sent.Last(m => m.Name == "RaceStart").Args[0]!;
        Assert.Equal(id, start.Track.Id);
        Assert.Equal("attic", start.Track.Layout);
        Assert.Equal($"custom-{id}", start.Track.Design!.Value.GetProperty("key").GetString());
        // 2 crate rows on the lap and 1 on the shortcut
        Assert.Equal(9, start.PickupSlots);

        var room = _game.Room!;
        var go = DateTime.UtcNow.AddMilliseconds(RaceRoom.CountdownMs + 50);
        _game.Tick(go);
        var picked = room.Pickup(TurboToysLocal.Connection, 0, 8, go.AddSeconds(1));
        Assert.Contains(picked, m => m.Method == "Picked");
        var lap = room.Lap(TurboToysLocal.Connection, 0, 1, go.AddSeconds(40));
        Assert.Contains(lap, m => m.Method == "Finished");
        var end = _game.Tick(go.AddSeconds(41));
        Assert.Contains(end, m => m.Method == "Saved");
        Assert.Equal("attic", _game.Profile.History[0].Layout);
    }

    [Fact]
    public async Task Joining_a_foreign_room_is_refused_offline()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(() => _game.InvokeAsync("JoinRoom", [JsonSerializer.SerializeToElement("ABCD")], CancellationToken.None));
    }

    private async Task<JsonElement> Json(string method, string path, object? body = null)
    {
        var answer = await _game.RequestAsync(method, path, body is null ? null : Body(body), CancellationToken.None);
        Assert.True(answer.Status == 200, answer.Body?.ToString());
        return answer.Body!.Value;
    }

    private static JsonElement Body(object value) => JsonSerializer.SerializeToElement(value, LocalJson.Options);

    private sealed class FakeHost(string folder) : ILocalHost
    {
        public List<(string Name, object?[] Args)> Sent { get; } = [];

        public string DataDirectory => folder;

        public string PlayerName => "Testfahrer";

        public void Emit(string name, params object?[] args)
        {
            lock (Sent)
            {
                Sent.Add((name, args));
            }
        }

        public void Log(string message)
        {
        }
    }
}
