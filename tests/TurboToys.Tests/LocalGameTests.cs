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
