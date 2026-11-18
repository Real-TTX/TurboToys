using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Game;

/// <summary>
/// The races in memory (online): the rooms by token and code, which connection sits where, sending a room's messages, and the database work around a
/// race (its record at the start, the results at the end). A restart of the server ends every room (<see cref="RaceLogic.AbortStaleAsync"/>).
/// </summary>
public sealed class RoomRegistry(IHubContext<GameHub> hub, IServiceScopeFactory scopes, ILogger<RoomRegistry> log)
{
    private const string Letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private readonly ConcurrentDictionary<Guid, RaceRoom> _rooms = new();
    private readonly ConcurrentDictionary<string, Guid> _byConnection = new();

    public IReadOnlyCollection<RaceRoom> Rooms => _rooms.Values.ToList();

    public RaceRoom Add(Func<string, RaceRoom> create)
    {
        string code;
        do
        {
            code = new string(Enumerable.Range(0, 4).Select(_ => Letters[Random.Shared.Next(Letters.Length)]).ToArray());
        }
        while (_rooms.Values.Any(r => r.Code == code));

        var room = create(code);
        _rooms[room.Token] = room;
        return room;
    }

    public RaceRoom? ByCode(string? code) =>
        string.IsNullOrWhiteSpace(code) ? null : _rooms.Values.FirstOrDefault(r => r.Code.Equals(code.Trim(), StringComparison.OrdinalIgnoreCase) && r.Status != RoomStatus.Closed);

    public RaceRoom? OfConnection(string connection) =>
        _byConnection.TryGetValue(connection, out var token) && _rooms.TryGetValue(token, out var room) ? room : null;

    public void Bind(string connection, RaceRoom room) => _byConnection[connection] = room.Token;

    public void Unbind(string connection) => _byConnection.TryRemove(connection, out _);

    /// <summary>Sends the messages of a room in their order (call while holding the room's lock).</summary>
    public async Task SendAsync(RaceRoom room, IEnumerable<Outgoing> messages)
    {
        foreach (var m in messages)
        {
            IClientProxy target;
            if (m.Connection is not null)
            {
                target = hub.Clients.Client(m.Connection);
            }
            else
            {
                var list = room.Connections.Where(c => c != m.Except).ToList();
                if (list.Count == 0)
                {
                    continue;
                }

                target = hub.Clients.Clients(list);
            }

            await target.SendCoreAsync(m.Method, m.Args);
        }
    }

    /// <summary>The race started: its record in the database.</summary>
    public async Task StartedAsync(RaceRoom room, long? cupRunId)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            room.RaceId = await RaceLogic.StartedAsync(db, Actor.System, room, cupRunId);
        }
        catch (Exception e)
        {
            log.LogError(e, "TurboToys: the start of race {Token} was not saved", room.Token);
        }
    }

    /// <summary>The race has results: money, experience, statistics and cup points go to the database (once); then everyone is told.</summary>
    public async Task SaveResultsAsync(RaceRoom room)
    {
        if (room.Results is null || room.ResultsSaved)
        {
            return;
        }

        room.ResultsSaved = true;
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var cup = await RaceLogic.FinishedAsync(db, Actor.System, room);
            using (await room.LockAsync())
            {
                await SendAsync(room, [Outgoing.ToAll("Saved", new { cupPlace = cup?.Place, cupPrize = cup?.Prize })]);
            }
        }
        catch (Exception e)
        {
            log.LogError(e, "TurboToys: the results of race {Token} were not saved", room.Token);
        }
    }

    /// <summary>Removes rooms nobody uses any more; a race that ended without results is marked aborted.</summary>
    public async Task SweepAsync(DateTime now)
    {
        foreach (var room in _rooms.Values.Where(r => r.IsStale(now)).ToList())
        {
            _rooms.TryRemove(room.Token, out _);
            foreach (var pair in _byConnection.Where(p => p.Value == room.Token).ToList())
            {
                _byConnection.TryRemove(pair.Key, out _);
            }

            if (room.RaceId is not null && room.Results is null)
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    await RaceLogic.AbortAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), Actor.System, room.Token);
                }
                catch (Exception e)
                {
                    log.LogWarning(e, "TurboToys: race {Token} could not be marked aborted", room.Token);
                }
            }
        }
    }
}

/// <summary>The clock of the races: every 100 ms each room ticks (countdown, respawns, crates, the end); results are saved; old rooms are swept.</summary>
public sealed class GameTicker(RoomRegistry registry, ILogger<GameTicker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(100));
        var sweep = DateTime.UtcNow;
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var now = DateTime.UtcNow;
            foreach (var room in registry.Rooms)
            {
                try
                {
                    using (await room.LockAsync())
                    {
                        var messages = room.Tick(now);
                        if (messages.Count > 0)
                        {
                            await registry.SendAsync(room, messages);
                        }
                    }

                    if (room.Results is not null && !room.ResultsSaved)
                    {
                        await registry.SaveResultsAsync(room);
                    }
                }
                catch (Exception e)
                {
                    log.LogError(e, "TurboToys: the clock of room {Code} failed", room.Code);
                }
            }

            if (now - sweep > TimeSpan.FromSeconds(30))
            {
                sweep = now;
                await registry.SweepAsync(now);
            }
        }
    }
}
