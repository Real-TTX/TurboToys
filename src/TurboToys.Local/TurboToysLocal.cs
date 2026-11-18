using System.Globalization;
using System.Reflection;
using System.Text.Json;
using MatGame.Local;
using TurboToys.Business;
using TurboToys.Data;
using TurboToys.Game;

namespace TurboToys.Local;

/// <summary>
/// TurboToys offline, inside the app (MatGame.Shell): answers every call the player app makes online – the game API (<see cref="RequestAsync"/>, the same paths and
/// shapes as <c>/turbotoys/api</c>) and the hub (<see cref="InvokeAsync"/>, the same methods as GameHub) – with the same rules (<see cref="RaceRoom"/>, tuning, prizes,
/// cups) and sends the same hub messages through <see cref="ILocalHost.Emit"/>. The one local player is a guest; its profile is a JSON file. The catalogue is the seeded
/// one (<see cref="SeedContent"/>). A clock (like the server's GameTicker) runs the countdown, respawns, crates and the end of a race.
/// </summary>
public sealed class TurboToysLocal : ILocalGame
{
    public const long LocalPlayerId = 1;
    public const string Connection = "local";

    private static readonly TimeSpan Interval = TimeSpan.FromMilliseconds(100);
    private static readonly string Version =
        typeof(TurboToysLocal).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "local";

    private readonly object _gate = new();
    private ILocalHost _host = null!;
    private LocalProfile _profile = null!;
    private List<Car> _cars = [];
    private List<Weapon> _weapons = [];
    private List<Track> _tracks = [];
    private List<Cup> _cups = [];
    private RaceRoom? _room;
    private long _nextRace = 1;
    private CancellationTokenSource? _clock;
    private Task? _clockTask;

    public string GameId => "turbotoys";

    /// <summary>The current room (tests look at it).</summary>
    internal RaceRoom? Room => _room;

    internal LocalProfile Profile => _profile;

    public Task StartAsync(ILocalHost host, CancellationToken ct)
    {
        _host = host;
        Directory.CreateDirectory(host.DataDirectory);
        long id = 1;
        _cars = SeedContent.AllCars().Select(c =>
        {
            c.Id = id++;
            return c;
        }).ToList();
        id = 1;
        _weapons = SeedContent.AllWeapons().Select(w =>
        {
            w.Id = id++;
            return w;
        }).ToList();
        id = 1;
        _tracks = SeedContent.AllTracks().Select(t =>
        {
            t.Id = id++;
            return t;
        }).ToList();
        id = 1;
        _cups = SeedContent.AllCups().Select(pair =>
        {
            var cup = pair.Cup;
            cup.Id = id++;
            cup.TrackIds = string.Join(',', pair.Tracks.Select(l => _tracks.FirstOrDefault(t => t.Layout == l.Layout && t.TimeOfDay == l.Time)?.Id ?? 0).Where(x => x > 0));
            return cup;
        }).ToList();
        _profile = LocalProfile.Load(host.DataDirectory, host.PlayerName, _cars);
        _clock = new CancellationTokenSource();
        _clockTask = RunClockAsync(_clock.Token);
        return Task.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        if (_clock is null)
        {
            return;
        }

        await _clock.CancelAsync();
        try
        {
            if (_clockTask is not null)
            {
                await _clockTask;
            }
        }
        catch (OperationCanceledException)
        {
            // the clock stopped
        }

        _clock.Dispose();
        _clock = null;
    }

    // ---------------------------------------------------------------- the game API

    public Task<LocalResponse> RequestAsync(string method, string path, JsonElement? body, CancellationToken ct)
    {
        try
        {
            var route = path.Split('?', 2)[0];
            var s = route.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
            LocalResponse answer;
            lock (_gate)
            {
                answer = (method.ToUpperInvariant(), s) switch
                {
                    ("GET", ["session"]) => LocalResponse.Ok(new { signedIn = true, player = PlayerView(), version = Version, offline = true }),
                    ("GET", ["home"]) => Home(),
                    ("GET", ["catalog"]) => LocalResponse.Ok(Views.Catalog(_cars, _weapons)),
                    ("GET", ["garage"]) => LocalResponse.Ok(Garage()),
                    ("POST", ["garage", "buy"]) => Buy(Read<BuyBody>(body)),
                    ("POST", ["garage", var id, "upgrade"]) => Upgrade(Long(id), Read<UpgradeBody>(body)),
                    ("PUT", ["garage", var id, "look"]) => Look(Long(id), Read<LookBody>(body)),
                    ("PUT", ["garage", "select"]) => Select(Read<SelectBody>(body)),
                    ("GET", ["tracks"]) => LocalResponse.Ok(Tracks()),
                    ("GET", ["cups"]) => LocalResponse.Ok(Cups()),
                    ("POST", ["cups", var id, "enter"]) => Enter(Long(id)),
                    ("POST", ["cups", "runs", var token, "abandon"]) => Abandon(token),
                    ("GET", ["profile"]) => LocalResponse.Ok(Views.Profile(_profile.Player, false, null)),
                    ("PUT", ["profile", "avatar"]) => Avatar(Read<AvatarBody>(body)),
                    ("GET", ["leaderboard"]) => LocalResponse.Ok(Array.Empty<LeaderRow>()),
                    ("GET", ["history"]) => LocalResponse.Ok(_profile.History),
                    ("GET", ["info"]) => LocalResponse.Ok(new { game = "turbotoys", version = Version, rooms = _room is null ? 0 : 1, racing = _room?.Status == RoomStatus.Racing ? 1 : 0 }),
                    _ => LocalResponse.Error(404, "Das gibt es offline nicht."),
                };
            }

            return Task.FromResult(answer);
        }
        catch (BusinessException e)
        {
            var field = string.IsNullOrEmpty(e.Field) ? null : char.ToLower(e.Field[0], CultureInfo.InvariantCulture) + e.Field[1..];
            return Task.FromResult(LocalResponse.Error(400, e.Message, field));
        }
        catch (AccessDeniedException e)
        {
            return Task.FromResult(LocalResponse.Error(403, e.Message));
        }
        catch (Exception e) when (e is JsonException or FormatException)
        {
            return Task.FromResult(LocalResponse.Error(400, "Die Anfrage ist unvollständig."));
        }
    }

    private sealed record BuyBody(long CarId);

    private sealed record UpgradeBody(string? Part);

    private sealed record LookBody(string? Paint, string? Decal, int? Number);

    private sealed record SelectBody(long Id);

    private sealed record AvatarBody(string? Face, string? Hair, string? Helmet, string? Color, string? Skin);

    private PlayerView PlayerView() => Views.Player(_profile.Player, false);

    private GarageView Garage() => Views.Garage(_profile.Player, _profile.Garage, _cars);

    private LocalResponse Home()
    {
        var garage = Garage();
        return LocalResponse.Ok(new
        {
            player = PlayerView(),
            stats = Views.Stats(_profile.Player, null),
            car = garage.Cars.FirstOrDefault(c => c.Id == garage.SelectedId) ?? garage.Cars.FirstOrDefault(),
            announcement = string.Empty,
            history = _profile.History.Take(8),
            settings = new { maxPlayers = 8, guestsCreateRooms = true },
        });
    }

    private LocalResponse Buy(BuyBody body)
    {
        var car = _cars.FirstOrDefault(c => c.Id == body.CarId) ?? throw new BusinessException("Dieses Auto gibt es nicht.");
        var bought = PlayerRules.Buy(_profile.Player, _profile.Garage, car);
        bought.Id = _profile.NewId();
        bought.Car = null;
        _profile.Garage.Add(bought);
        _profile.Player.SelectedGarageCarId = bought.Id;
        _profile.Save();
        return LocalResponse.Ok(Garage());
    }

    private LocalResponse Upgrade(long id, UpgradeBody body)
    {
        if (!Enum.TryParse<Part>(body.Part, true, out var part))
        {
            throw new BusinessException("Dieses Teil gibt es nicht.", "part");
        }

        var garage = Own(id);
        PlayerRules.Upgrade(_profile.Player, garage, CarOf(garage), part);
        _profile.Save();
        return LocalResponse.Ok(Garage());
    }

    private LocalResponse Look(long id, LookBody body)
    {
        PlayerRules.SetLook(_profile.Player, Own(id), body.Paint, body.Decal, body.Number);
        _profile.Save();
        return LocalResponse.Ok(Garage());
    }

    private LocalResponse Select(SelectBody body)
    {
        PlayerRules.Select(_profile.Player, Own(body.Id));
        _profile.Save();
        return LocalResponse.Ok(Garage());
    }

    private LocalResponse Avatar(AvatarBody body)
    {
        PlayerRules.SetAvatar(_profile.Player, body.Face, body.Hair, body.Helmet, body.Color, body.Skin, isAdmin: false);
        _profile.Save();
        return LocalResponse.Ok(Views.Profile(_profile.Player, false, null));
    }

    private object Tracks()
    {
        var level = Progression.LevelOf(_profile.Player.Xp);
        return _tracks.Where(t => t.IsEnabled).OrderBy(t => t.SortOrder)
            .Select(t => new { track = Views.Track(t, level), bestLapMs = _profile.BestLaps.TryGetValue(t.Id, out var ms) ? ms : (int?)null })
            .ToList();
    }

    private IReadOnlyList<CupView> Cups()
    {
        var level = Progression.LevelOf(_profile.Player.Xp);
        var tracks = _tracks.ToDictionary(t => t.Id);
        return _cups.Where(c => c.IsEnabled).OrderBy(c => c.SortOrder).Select(c => Views.Cup(c, tracks, level,
            _profile.CupRuns.Where(r => r.CupId == c.Id && r.Status == CupRunStatus.Running).OrderByDescending(r => r.Id).FirstOrDefault()
            ?? _profile.CupRuns.Where(r => r.CupId == c.Id && r.Status == CupRunStatus.Finished && r.EndDate > DateTime.UtcNow.AddMinutes(-30)).OrderByDescending(r => r.Id).FirstOrDefault(),
            _profile.CupRuns.Count(r => r.CupId == c.Id && r.Status == CupRunStatus.Finished && r.Place == 1))).ToList();
    }

    private LocalResponse Enter(long cupId)
    {
        var cup = _cups.FirstOrDefault(c => c.Id == cupId) ?? throw new BusinessException("Diesen Pokal gibt es nicht.");
        var garage = PlayerRules.Selected(_profile.Player, _profile.Garage);
        foreach (var r in _profile.CupRuns.Where(r => r.Status == CupRunStatus.Running))
        {
            r.Status = CupRunStatus.Abandoned;
            r.EndDate = DateTime.UtcNow;
        }

        var standings = CupRules.Enter(_profile.Player, cup, _cars, garage, garage is null ? null : CarOf(garage), Random.Shared.Next());
        var run = new CupRun
        {
            Id = _profile.NewId(), Token = Guid.NewGuid(), PlayerId = LocalPlayerId, CupId = cup.Id, Status = CupRunStatus.Running, Standings = CupRules.Write(standings),
            StartDate = DateTime.UtcNow,
        };
        _profile.CupRuns.Add(run);
        _profile.CupRuns.RemoveAll(r => r.Status == CupRunStatus.Abandoned && r.EndDate < DateTime.UtcNow.AddDays(-30));
        _profile.Save();
        return LocalResponse.Ok(Views.CupRun(run, cup, _tracks.ToDictionary(t => t.Id), Progression.LevelOf(_profile.Player.Xp)));
    }

    private LocalResponse Abandon(string token)
    {
        var run = _profile.CupRuns.FirstOrDefault(r => r.Token.ToString() == token) ?? throw new BusinessException("Diesen Pokal fährst du nicht.");
        if (run.Status == CupRunStatus.Running)
        {
            run.Status = CupRunStatus.Abandoned;
            run.EndDate = DateTime.UtcNow;
            _profile.Save();
        }

        return LocalResponse.Ok(new { ok = true });
    }

    // ---------------------------------------------------------------- the hub

    public Task<JsonElement?> InvokeAsync(string method, IReadOnlyList<JsonElement> args, CancellationToken ct)
    {
        try
        {
            object? result;
            List<Outgoing> messages;
            lock (_gate)
            {
                (result, messages) = Invoke(method, args);
            }

            Emit(messages);
            return Task.FromResult<JsonElement?>(result is null ? null : JsonSerializer.SerializeToElement(result, LocalJson.Options));
        }
        catch (BusinessException e)
        {
            throw new InvalidOperationException(e.Message);
        }
        catch (AccessDeniedException e)
        {
            throw new InvalidOperationException(e.Message);
        }
    }

    private (object? Result, List<Outgoing> Messages) Invoke(string method, IReadOnlyList<JsonElement> args)
    {
        var now = DateTime.UtcNow;
        switch (method)
        {
            case "ListRooms":
                return (Array.Empty<RoomSummary>(), []);
            case "CreateRoom":
            {
                var r = Arg<CreateRoomBody>(args, 0);
                var room = NewRoom(RaceKind.Custom, r.TrackId, r.Laps, r.Bots, r.BotSkill, r.Weapons, null, r.Name);
                return (room.View(), Join(room));
            }

            case "QuickRace":
            {
                var r = Arg<QuickBody>(args, 0);
                var room = NewRoom(RaceKind.Quick, r.TrackId, r.Laps, r.Bots, r.BotSkill, r.Weapons, null, null);
                var messages = Join(room);
                messages.AddRange(room.Start(Connection, now));
                return (room.View(), messages);
            }

            case "StartCup":
            {
                var token = Arg<Guid>(args, 0);
                var run = _profile.CupRuns.FirstOrDefault(c => c.Token == token && c.Status == CupRunStatus.Running) ?? throw new BusinessException("Diesen Pokal fährst du nicht.");
                var cup = _cups.First(c => c.Id == run.CupId);
                var ids = cup.TrackIdList();
                if (run.RaceIndex >= ids.Count)
                {
                    throw new BusinessException("Dieser Pokal ist schon vorbei.");
                }

                var bots = Views.CupBots(CupRules.Read(run.Standings), _cars, (int)run.Id);
                var room = NewRoom(RaceKind.Cup, ids[run.RaceIndex], cup.Laps, bots.Count, cup.BotSkill, true, (run.Token, bots), $"{cup.Name} · Rennen {run.RaceIndex + 1}");
                var messages = Join(room);
                messages.AddRange(room.Start(Connection, now));
                return (room.View(), messages);
            }

            case "JoinRoom":
                throw new BusinessException("Offline gibt es keine fremden Räume.");
            case "LeaveRoom":
            {
                var room = _room;
                _room = null;
                return (null, room?.Leave(Connection) ?? []);
            }

            case "UpdateRoom":
            {
                var r = Arg<CreateRoomBody>(args, 0);
                var room = RequireRoom();
                var track = TrackOf(r.TrackId);
                return (null, room.UpdateSettings(Connection, new RoomSettings(r.Name, track.Id, r.Laps <= 0 ? track.Laps : r.Laps, 1, r.Bots, r.BotSkill, r.Weapons, false),
                    Views.TrackRef(track)));
            }

            case "SetReady":
                return (null, RequireRoom().SetReady(Connection, Arg<bool>(args, 0)));
            case "ChangeCar":
                return (null, RequireRoom().ChangeCar(Connection, Loadout()));
            case "StartRace":
                return (null, RequireRoom().Start(Connection, now));
            case "Chat":
                return (null, RequireRoom().Chat(Connection, Arg<string>(args, 0)));
            case "State":
                return (null, []); // offline nobody else needs the state
            case "Fire":
                return (null, _room?.Fire(Connection, Arg<int>(args, 0), Arg<string>(args, 1), Arg<double[]>(args, 2), now) ?? []);
            case "Hit":
                return (null, _room?.Hit(Connection, Arg<int>(args, 0), Arg<int>(args, 1), Arg<string>(args, 2), Arg<double>(args, 3), now) ?? []);
            case "Pickup":
                return (null, _room?.Pickup(Connection, Arg<int>(args, 0), Arg<int>(args, 1), now) ?? []);
            case "Lap":
                return (null, _room?.Lap(Connection, Arg<int>(args, 0), Arg<int>(args, 1), now) ?? []);
            default:
                throw new BusinessException("Das gibt es offline nicht.");
        }
    }

    private sealed record CreateRoomBody(string? Name, long TrackId, int Laps, int MaxPlayers, int Bots, int BotSkill, bool Weapons, bool IsPublic);

    private sealed record QuickBody(long TrackId, int Bots, int BotSkill, int Laps, bool Weapons = true);

    private RaceRoom NewRoom(RaceKind kind, long trackId, int laps, int bots, int skill, bool weapons, (Guid Run, IReadOnlyList<(string, CarLoadout, int)> Bots)? cup, string? name)
    {
        var track = TrackOf(trackId);
        var level = Progression.LevelOf(_profile.Player.Xp);
        if (track.UnlockLevel > level)
        {
            throw new BusinessException($"„{track.Name}“ gibt es ab Level {track.UnlockLevel}.", "trackId");
        }

        var settings = new RoomSettings(name, track.Id, laps <= 0 ? track.Laps : laps, 1, Math.Clamp(bots, 0, 7), Math.Clamp(skill, 1, 5), weapons, false);
        var code = "L" + (_nextRace++).ToString("000", CultureInfo.InvariantCulture);
        _room = new RaceRoom(Guid.NewGuid(), code, kind, settings, Views.TrackRef(track), Views.WeaponRules(_weapons),
            Views.BotCars(_cars, settings.BotSkill, Random.Shared.Next()), cup?.Bots, cup?.Run);
        return _room;
    }

    private List<Outgoing> Join(RaceRoom room)
    {
        var p = _profile.Player;
        var seat = new SeatPlayer(LocalPlayerId, p.DisplayName, true, Progression.LevelOf(p.Xp), PlayerRules.AvatarOf(p));
        return room.Join(Connection, seat, Loadout());
    }

    private CarLoadout Loadout()
    {
        var garage = PlayerRules.Selected(_profile.Player, _profile.Garage) ?? throw new BusinessException("Du hast noch kein Auto.");
        return PlayerRules.LoadoutOf(CarOf(garage), garage);
    }

    private RaceRoom RequireRoom() => _room ?? throw new BusinessException("Du bist in keinem Raum.");

    private Track TrackOf(long id) =>
        (id > 0 ? _tracks.FirstOrDefault(t => t.Id == id) : _tracks.OrderBy(t => t.SortOrder).FirstOrDefault()) ?? throw new BusinessException("Diese Strecke gibt es nicht.", "trackId");

    private GarageCar Own(long id) => _profile.Garage.FirstOrDefault(g => g.Id == id) ?? throw new BusinessException("Dieses Auto steht nicht in deiner Garage.");

    private Car CarOf(GarageCar garage) => _cars.FirstOrDefault(c => c.Id == garage.CarId) ?? throw new BusinessException("Dieses Auto gibt es nicht mehr.");

    // ---------------------------------------------------------------- the clock and the results

    private async Task RunClockAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(Interval);
        while (await timer.WaitForNextTickAsync(ct))
        {
            List<Outgoing> messages;
            lock (_gate)
            {
                messages = Tick(DateTime.UtcNow);
            }

            Emit(messages);
        }
    }

    /// <summary>One step of the clock (tests call it with their own time).</summary>
    internal List<Outgoing> Tick(DateTime now)
    {
        if (_room is null)
        {
            return [];
        }

        var messages = _room.Tick(now);
        if (_room.Results is not null && !_room.ResultsSaved)
        {
            _room.ResultsSaved = true;
            var cup = SaveResults(_room);
            messages.Add(Outgoing.ToAll("Saved", new { cupPlace = cup?.Place, cupPrize = cup?.Prize }));
        }

        return messages;
    }

    private (int Place, int Prize)? SaveResults(RaceRoom room)
    {
        var results = room.Results!;
        var mine = results.Results.FirstOrDefault(r => r.PlayerId == LocalPlayerId);
        if (mine is null)
        {
            return null;
        }

        PlayerRules.AddRace(_profile.Player, mine, results.Results.Count);
        if (mine.BestLapMs is { } best)
        {
            _profile.BestLaps[room.Track.Id] = _profile.BestLaps.TryGetValue(room.Track.Id, out var old) ? Math.Min(old, best) : best;
        }

        _profile.History.Insert(0, new HistoryItem(room.Token, room.Name, room.Track.Name, room.Track.Layout, room.Kind.ToString(), DateTime.UtcNow, mine.Place, results.Results.Count,
            mine.Finished, mine.TimeMs, mine.BestLapMs, mine.Kills, mine.Money, mine.Xp));
        if (_profile.History.Count > 30)
        {
            _profile.History.RemoveRange(30, _profile.History.Count - 30);
        }

        (int Place, int Prize)? outcome = null;
        if (room.CupRun is { } token && _profile.CupRuns.FirstOrDefault(r => r.Token == token && r.Status == CupRunStatus.Running) is { } run)
        {
            var cup = _cups.First(c => c.Id == run.CupId);
            outcome = CupRules.ApplyRace(run, cup, results.Results, _profile.Player.DisplayName);
            if (outcome is { } o)
            {
                _profile.Player.Money += o.Prize;
                _profile.Player.MoneyEarned += o.Prize;
                if (o.Place == 1)
                {
                    _profile.Player.CupsWon++;
                }
            }
        }

        _profile.Save();
        return outcome;
    }

    private void Emit(IEnumerable<Outgoing> messages)
    {
        foreach (var m in messages)
        {
            // offline there is only this player: messages "to the others" have nobody to go to
            if (m.Except == Connection)
            {
                continue;
            }

            _host.Emit(m.Method, m.Args);
        }
    }

    // ---------------------------------------------------------------- reading arguments

    private static T Read<T>(JsonElement? body) =>
        body is { ValueKind: not JsonValueKind.Null and not JsonValueKind.Undefined } b
            ? b.Deserialize<T>(LocalJson.Options) ?? throw new JsonException()
            : throw new JsonException();

    private static T Arg<T>(IReadOnlyList<JsonElement> args, int index) =>
        index < args.Count ? args[index].Deserialize<T>(LocalJson.Options)! : throw new BusinessException("Es fehlt eine Angabe.");

    private static long Long(string text) => long.Parse(text, CultureInfo.InvariantCulture);
}
