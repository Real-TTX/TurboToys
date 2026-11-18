using MatGame.Sdk;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using TurboToys.Business;
using TurboToys.Data;
using TurboToys.Web;

namespace TurboToys.Game;

public sealed record CreateRoomRequest(string? Name, long TrackId, int Laps, int MaxPlayers, int Bots, int BotSkill, bool Weapons, bool IsPublic);

public sealed record QuickRaceRequest(long TrackId, int Bots, int BotSkill, int Laps, bool Weapons = true);

/// <summary>
/// The hub of TurboToys (<c>/turbotoys/hub</c>): lobbies, quick races, cup races and the race itself (state relay, weapons, crates, hits, laps).
/// Signed in with MatGame's cookie (browser) or device token (apps); the version of an app is checked on connect. Every method runs under the room's lock
/// and sends the room's messages in order. Protocol: docs/PROTOCOL.md. The offline game (TurboToys.Local) has the same methods.
/// </summary>
[Authorize(AuthenticationSchemes = GameAccounts.AnyScheme)]
public sealed class GameHub(RoomRegistry registry, AppDbContext db) : Hub
{
    public override async Task OnConnectedAsync()
    {
        var http = Context.GetHttpContext();
        if (http is not null && GameApi.ClientProblem(http.Request, TurboToysModule.Information) is { } problem)
        {
            await Clients.Caller.SendAsync("Closed", problem);
            Context.Abort();
            return;
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await LeaveRoom();
        await base.OnDisconnectedAsync(exception);
    }

    public IReadOnlyList<RoomSummary> ListRooms() =>
        registry.Rooms.Where(r => r.IsPublic && r.Status == RoomStatus.Lobby && r.Kind == Data.RaceKind.Custom).OrderByDescending(r => r.Created).Select(r => r.Summary()).ToList();

    public async Task<RoomView> CreateRoom(CreateRoomRequest request)
    {
        var me = await MeAsync();
        await LeaveRoom();
        var settings = await SettingLogic.GetAsync(db);
        if (request.IsPublic && Players.IsGuest(Context.User!) && !settings.GuestsCreateRooms)
        {
            throw new HubException("Gäste dürfen hier keine öffentlichen Räume eröffnen.");
        }

        var track = await ContentLogic.PlayableTrackAsync(db, me, request.TrackId);
        var weapons = await ContentLogic.WeaponRulesAsync(db);
        var catalog = await ContentLogic.CarsAsync(db);
        var skill = Math.Clamp(request.BotSkill, 1, 5);
        var roomSettings = new RoomSettings(request.Name, track.Id, request.Laps <= 0 ? track.Laps : request.Laps, Math.Min(request.MaxPlayers, settings.MaxPlayers),
            request.Bots, skill, request.Weapons, request.IsPublic);
        var room = registry.Add(code => new RaceRoom(Guid.NewGuid(), code, Data.RaceKind.Custom, roomSettings, Views.TrackRef(track), weapons,
            Views.BotCars(catalog, skill, Random.Shared.Next())));
        return await JoinAsync(room, me);
    }

    /// <summary>A race against bots right away (a private room that starts at once).</summary>
    public async Task<RoomView> QuickRace(QuickRaceRequest request)
    {
        var me = await MeAsync();
        await LeaveRoom();
        var track = await ContentLogic.PlayableTrackAsync(db, me, request.TrackId);
        var weapons = await ContentLogic.WeaponRulesAsync(db);
        var catalog = await ContentLogic.CarsAsync(db);
        var skill = Math.Clamp(request.BotSkill, 1, 5);
        var settings = new RoomSettings(null, track.Id, request.Laps <= 0 ? track.Laps : request.Laps, 1, Math.Clamp(request.Bots, 0, 7), skill, request.Weapons, false);
        var room = registry.Add(code => new RaceRoom(Guid.NewGuid(), code, Data.RaceKind.Quick, settings, Views.TrackRef(track), weapons,
            Views.BotCars(catalog, skill, Random.Shared.Next())));
        var view = await JoinAsync(room, me);
        await StartAsync(room, null);
        return view;
    }

    /// <summary>The next race of a cup run.</summary>
    public async Task<RoomView> StartCup(Guid run)
    {
        var me = await MeAsync();
        await LeaveRoom();
        var (cupRun, cup, track, bots) = await CupLogic.NextRaceAsync(db, me, run);
        var weapons = await ContentLogic.WeaponRulesAsync(db);
        var settings = new RoomSettings($"{cup.Name} · Rennen {cupRun.RaceIndex + 1}", track.Id, cup.Laps, 1, bots.Count, cup.BotSkill, true, false);
        var room = registry.Add(code => new RaceRoom(Guid.NewGuid(), code, Data.RaceKind.Cup, settings, Views.TrackRef(track), weapons, [], bots, cupRun.Token));
        var view = await JoinAsync(room, me);
        await StartAsync(room, cupRun.Id);
        return view;
    }

    public async Task<RoomView> JoinRoom(string code)
    {
        var me = await MeAsync();
        var room = registry.ByCode(code) ?? throw new HubException("Diesen Raum gibt es nicht (mehr).");
        if (registry.OfConnection(Context.ConnectionId) is { } current && current != room)
        {
            await LeaveRoom();
        }

        return await JoinAsync(room, me);
    }

    public async Task LeaveRoom()
    {
        var room = registry.OfConnection(Context.ConnectionId);
        registry.Unbind(Context.ConnectionId);
        if (room is null)
        {
            return;
        }

        using (await room.LockAsync())
        {
            await registry.SendAsync(room, room.Leave(Context.ConnectionId));
        }
    }

    public async Task UpdateRoom(CreateRoomRequest request)
    {
        var me = await MeAsync();
        var room = Room();
        var track = await ContentLogic.PlayableTrackAsync(db, me, request.TrackId);
        var settings = await SettingLogic.GetAsync(db);
        await RunAsync(room, () => room.UpdateSettings(Context.ConnectionId,
            new RoomSettings(request.Name, track.Id, request.Laps <= 0 ? track.Laps : request.Laps, Math.Min(request.MaxPlayers, settings.MaxPlayers), request.Bots,
                request.BotSkill, request.Weapons, request.IsPublic), Views.TrackRef(track)));
    }

    public async Task SetReady(bool ready)
    {
        var room = Room();
        await RunAsync(room, () => room.SetReady(Context.ConnectionId, ready));
    }

    /// <summary>The player chose another car in the garage: the seat takes it.</summary>
    public async Task ChangeCar()
    {
        var me = await MeAsync();
        var room = Room();
        var (_, car) = await GarageLogic.SeatAsync(db, me, Players.IsGuest(Context.User!));
        await RunAsync(room, () => room.ChangeCar(Context.ConnectionId, car));
    }

    public async Task StartRace()
    {
        var room = Room();
        await StartAsync(room, null);
    }

    public async Task Chat(string text)
    {
        var room = Room();
        await RunAsync(room, () => room.Chat(Context.ConnectionId, text));
    }

    // ---- the race (called often: no database, no exceptions for the caller)

    public async Task State(int seat, double[] data)
    {
        if (registry.OfConnection(Context.ConnectionId) is not { } room)
        {
            return;
        }

        using (await room.LockAsync())
        {
            await registry.SendAsync(room, room.State(Context.ConnectionId, seat, data));
        }
    }

    public async Task Fire(int seat, string kind, double[] data)
    {
        if (registry.OfConnection(Context.ConnectionId) is not { } room)
        {
            return;
        }

        using (await room.LockAsync())
        {
            await registry.SendAsync(room, room.Fire(Context.ConnectionId, seat, kind, data, DateTime.UtcNow));
        }
    }

    public async Task Hit(int attacker, int target, string kind, double amount)
    {
        if (registry.OfConnection(Context.ConnectionId) is not { } room)
        {
            return;
        }

        using (await room.LockAsync())
        {
            await registry.SendAsync(room, room.Hit(Context.ConnectionId, attacker, target, kind, amount, DateTime.UtcNow));
        }
    }

    public async Task Pickup(int seat, int slot)
    {
        if (registry.OfConnection(Context.ConnectionId) is not { } room)
        {
            return;
        }

        using (await room.LockAsync())
        {
            await registry.SendAsync(room, room.Pickup(Context.ConnectionId, seat, slot, DateTime.UtcNow));
        }
    }

    public async Task Lap(int seat, int lap)
    {
        if (registry.OfConnection(Context.ConnectionId) is not { } room)
        {
            return;
        }

        using (await room.LockAsync())
        {
            await registry.SendAsync(room, room.Lap(Context.ConnectionId, seat, lap, DateTime.UtcNow));
        }
    }

    // ---- helpers

    private async Task<Actor> MeAsync()
    {
        var http = Context.GetHttpContext() ?? throw new HubException("Keine Verbindung.");
        try
        {
            return await Players.RequireAsync(http, db);
        }
        catch (AccessDeniedException e)
        {
            throw new HubException(e.Message);
        }
    }

    private RaceRoom Room() => registry.OfConnection(Context.ConnectionId) ?? throw new HubException("Du bist in keinem Raum.");

    private async Task<RoomView> JoinAsync(RaceRoom room, Actor me)
    {
        var (player, car) = await Guarded(() => GarageLogic.SeatAsync(db, me, Players.IsGuest(Context.User!)));
        using (await room.LockAsync())
        {
            var messages = Guarded(() => room.Join(Context.ConnectionId, player, car));
            registry.Bind(Context.ConnectionId, room);
            await registry.SendAsync(room, messages);
            return room.View();
        }
    }

    private async Task StartAsync(RaceRoom room, long? cupRunId)
    {
        using (await room.LockAsync())
        {
            await registry.SendAsync(room, Guarded(() => room.Start(Context.ConnectionId, DateTime.UtcNow)));
        }

        await registry.StartedAsync(room, cupRunId);
    }

    private async Task RunAsync(RaceRoom room, Func<List<Outgoing>> action)
    {
        using (await room.LockAsync())
        {
            await registry.SendAsync(room, Guarded(action));
        }
    }

    private static T Guarded<T>(Func<T> action)
    {
        try
        {
            return action();
        }
        catch (BusinessException e)
        {
            throw new HubException(e.Message);
        }
        catch (AccessDeniedException e)
        {
            throw new HubException(e.Message);
        }
    }

    private static async Task<T> Guarded<T>(Func<Task<T>> action)
    {
        try
        {
            return await action();
        }
        catch (BusinessException e)
        {
            throw new HubException(e.Message);
        }
        catch (AccessDeniedException e)
        {
            throw new HubException(e.Message);
        }
    }
}

/// <summary>Turns the business layer's errors into messages the browser can show (a <see cref="HubException"/> keeps its text).</summary>
public sealed class HubErrors : IHubFilter
{
    public async ValueTask<object?> InvokeMethodAsync(HubInvocationContext context, Func<HubInvocationContext, ValueTask<object?>> next)
    {
        try
        {
            return await next(context);
        }
        catch (BusinessException e)
        {
            throw new HubException(e.Message);
        }
        catch (AccessDeniedException e)
        {
            throw new HubException(e.Message);
        }
    }
}
