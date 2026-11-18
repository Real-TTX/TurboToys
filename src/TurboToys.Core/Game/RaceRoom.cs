using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Game;

public enum RoomStatus
{
    Lobby = 0,
    Countdown = 1,
    Racing = 2,
    Finished = 3,
    Closed = 4,
}

public enum SeatKind
{
    Human = 0,
    Bot = 1,
}

/// <summary>A seat of a room and its race state.</summary>
public sealed class Seat
{
    public int Index { get; init; }

    public SeatKind Kind { get; init; }

    public long? PlayerId { get; set; }

    public string? Connection { get; set; }

    public string Name { get; set; } = string.Empty;

    public bool IsGuest { get; set; }

    public int Level { get; set; } = 1;

    public AvatarView? Avatar { get; set; }

    public CarLoadout Car { get; set; } = null!;

    public bool Ready { get; set; }

    public int Skill { get; set; }

    public int Grid { get; set; }

    // ---- the race
    public double Hp { get; set; }

    public int Lap { get; set; }

    public double Progress { get; set; }

    public DateTime LapStartedAt { get; set; }

    public int? FinishedMs { get; set; }

    public int? BestLapMs { get; set; }

    public int Kills { get; set; }

    public int Wrecks { get; set; }

    public int Money { get; set; }

    public DateTime? WreckedUntil { get; set; }

    public DateTime ShieldUntil { get; set; }

    public string? Special { get; set; }

    public int SpecialCount { get; set; }

    public DateTime LastSpecialAt { get; set; }

    public bool Left { get; set; }

    /// <summary>Machine-gun damage given in the current second (rate limit of reported hits).</summary>
    public double GunWindow { get; set; }

    public DateTime GunWindowStart { get; set; }

    public bool Connected => Kind == SeatKind.Bot || (Connection is not null && !Left);
}

/// <summary>
/// One race in memory, online (the plugin's RoomRegistry) and offline (TurboToys.Local): the lobby (players, settings, ready), the start (bots, grid,
/// countdown), the race (state relay, weapons, pickups, hits, wrecks, laps) and the results with prizes and experience.
/// The browsers simulate their own cars (and the bot driver – the host's browser – the bots); the room decides what counts: the hit points, the crates,
/// the laps (with a plausibility check) and the places. Everything happens under <see cref="LockAsync"/>; each method returns the messages to send.
/// Who reports a hit: machine gun, rocket and shock the shooter; mines, oil and crashes the car that drove into them.
/// </summary>
public sealed class RaceRoom
{
    public const int MaxSeats = 8;
    public const int CountdownMs = 4000;
    public const int RespawnMs = 2500;
    public const int SlotBackMs = 8000;
    public const int FinishGraceSeconds = 25;
    public const int ShieldMs = 4000;
    public const int RepairHp = 35;
    public const int AmmoPack = 40;
    public const int CrashMax = 15;
    public const int ShockRadius = 26;

    private readonly SemaphoreSlim _lock = new(1, 1);
    private readonly Random _random;
    private readonly IReadOnlyList<CarLoadout> _botCars;
    private readonly IReadOnlyList<(string Name, CarLoadout Car, int Skill)>? _fixedBots;
    private DateTime[] _slotBack = [];
    private LayoutInfo? _layout;
    private DateTime _startAt;
    private DateTime? _firstFinish;
    private DateTime _lastActivity;

    /// <param name="botCars">The cars bots may drive (a quick race picks from them by skill).</param>
    /// <param name="fixedBots">The bots of a cup run (names, cars and skill fixed), or null.</param>
    public RaceRoom(Guid token, string code, RaceKind kind, RoomSettings settings, TrackRef track, IReadOnlyList<WeaponRule> weapons,
        IReadOnlyList<CarLoadout> botCars, IReadOnlyList<(string Name, CarLoadout Car, int Skill)>? fixedBots = null, Guid? cupRun = null, int? seed = null)
    {
        Token = token;
        Code = code;
        Kind = kind;
        Track = track;
        _layout = Layouts.Info(track);
        WeaponRules = weapons;
        _botCars = botCars;
        _fixedBots = fixedBots;
        CupRun = cupRun;
        Seed = seed ?? Random.Shared.Next(1, int.MaxValue);
        _random = new Random(Seed);
        Name = string.IsNullOrWhiteSpace(settings.Name) ? track.Name : settings.Name.Trim()[..Math.Min(40, settings.Name.Trim().Length)];
        Laps = Math.Clamp(settings.Laps, 1, 9);
        MaxPlayers = Math.Clamp(settings.MaxPlayers, 1, MaxSeats);
        Bots = Math.Clamp(settings.Bots, 0, MaxSeats - 1);
        BotSkill = Math.Clamp(settings.BotSkill, 1, 5);
        Weapons = settings.Weapons;
        IsPublic = settings.IsPublic;
        Created = DateTime.UtcNow;
        _lastActivity = Created;
    }

    public Guid Token { get; }

    public string Code { get; }

    public RaceKind Kind { get; }

    public string Name { get; private set; }

    public TrackRef Track { get; private set; }

    public int Laps { get; private set; }

    public int MaxPlayers { get; private set; }

    public int Bots { get; private set; }

    public int BotSkill { get; private set; }

    public bool Weapons { get; private set; }

    public bool IsPublic { get; private set; }

    public Guid? CupRun { get; }

    public int Seed { get; }

    public DateTime Created { get; }

    public RoomStatus Status { get; private set; } = RoomStatus.Lobby;

    public IReadOnlyList<WeaponRule> WeaponRules { get; }

    public List<Seat> Seats { get; } = [];

    /// <summary>The player whose browser drives the bots (the host, or the next human when the host left).</summary>
    public long? BotDriver { get; private set; }

    public long? HostPlayerId { get; private set; }

    /// <summary>The results once the race ended (the registry saves them once: <see cref="ResultsSaved"/>).</summary>
    public ResultsView? Results { get; private set; }

    public bool ResultsSaved { get; set; }

    /// <summary>The id of the race record (set by the plugin when the race started).</summary>
    public long? RaceId { get; set; }

    public IEnumerable<string> Connections => Seats.Where(s => s.Kind == SeatKind.Human && s.Connection is not null && !s.Left).Select(s => s.Connection!);

    public int Humans => Seats.Count(s => s.Kind == SeatKind.Human && !s.Left);

    public async Task<IDisposable> LockAsync()
    {
        await _lock.WaitAsync();
        return new Releaser(_lock);
    }

    // ------------------------------------------------------------------ lobby

    /// <summary>A player sits down (or comes back to their seat with a new connection).</summary>
    public List<Outgoing> Join(string connection, SeatPlayer player, CarLoadout car)
    {
        Touch();
        var existing = Seats.FirstOrDefault(s => s.Kind == SeatKind.Human && s.PlayerId == player.PlayerId);
        if (existing is not null)
        {
            existing.Connection = connection;
            existing.Left = false;
            existing.Name = player.Name;
            if (Status == RoomStatus.Lobby)
            {
                existing.Car = car;
            }
        }
        else
        {
            if (Status != RoomStatus.Lobby)
            {
                throw new BusinessException("Das Rennen läuft schon.");
            }

            if (Seats.Count(s => s.Kind == SeatKind.Human) >= MaxPlayers)
            {
                throw new BusinessException("Der Raum ist voll.");
            }

            Seats.Add(new Seat
            {
                Index = Seats.Count,
                Kind = SeatKind.Human,
                PlayerId = player.PlayerId,
                Connection = connection,
                Name = player.Name,
                IsGuest = player.IsGuest,
                Level = player.Level,
                Avatar = player.Avatar,
                Car = car,
            });
            HostPlayerId ??= player.PlayerId;
            FitBots();
        }

        var messages = new List<Outgoing> { Outgoing.ToAll("Room", View()) };
        if (Status is RoomStatus.Countdown or RoomStatus.Racing && Results is null)
        {
            // back in a running race: the start again (the browser rebuilds the race and jumps to the live state)
            messages.Add(Outgoing.ToOne(connection, "RaceStart", StartView()));
        }

        return messages;
    }

    /// <summary>A player leaves (or the connection dropped). In the lobby the seat is freed; in a race the car stays, stopped.</summary>
    public List<Outgoing> Leave(string connection)
    {
        Touch();
        var seat = SeatOf(connection);
        if (seat is null)
        {
            return [];
        }

        var messages = new List<Outgoing>();
        if (Status == RoomStatus.Lobby)
        {
            Seats.Remove(seat);
            for (var i = 0; i < Seats.Count; i++)
            {
                Seats[i] = Renumber(Seats[i], i);
            }

            if (HostPlayerId == seat.PlayerId)
            {
                HostPlayerId = Seats.FirstOrDefault(s => s.Kind == SeatKind.Human)?.PlayerId;
            }
        }
        else
        {
            seat.Left = true;
            seat.Connection = null;
            if (BotDriver == seat.PlayerId)
            {
                BotDriver = Seats.FirstOrDefault(s => s.Kind == SeatKind.Human && !s.Left)?.PlayerId;
                if (BotDriver is not null)
                {
                    messages.Add(Outgoing.ToAll("BotDriver", BotDriver));
                }
            }

            if (HostPlayerId == seat.PlayerId)
            {
                HostPlayerId = BotDriver;
            }
        }

        if (Humans == 0)
        {
            Status = RoomStatus.Closed;
            return messages;
        }

        messages.Add(Outgoing.ToAll("Room", View()));
        return messages;
    }

    public List<Outgoing> UpdateSettings(string connection, RoomSettings settings, TrackRef track)
    {
        Touch();
        RequireHost(connection);
        RequireLobby();
        if (Kind == RaceKind.Cup)
        {
            throw new BusinessException("Ein Pokalrennen lässt sich nicht ändern.");
        }

        Name = string.IsNullOrWhiteSpace(settings.Name) ? track.Name : settings.Name.Trim()[..Math.Min(40, settings.Name.Trim().Length)];
        Track = track;
        _layout = Layouts.Info(track);
        Laps = Math.Clamp(settings.Laps, 1, 9);
        MaxPlayers = Math.Clamp(settings.MaxPlayers, Math.Max(1, Seats.Count(s => s.Kind == SeatKind.Human)), MaxSeats);
        Bots = Math.Clamp(settings.Bots, 0, MaxSeats - 1);
        BotSkill = Math.Clamp(settings.BotSkill, 1, 5);
        Weapons = settings.Weapons;
        IsPublic = settings.IsPublic;
        FitBots();
        foreach (var s in Seats.Where(s => s.Kind == SeatKind.Human && s.PlayerId != HostPlayerId))
        {
            s.Ready = false;
        }

        return [Outgoing.ToAll("Room", View())];
    }

    public List<Outgoing> SetReady(string connection, bool ready)
    {
        Touch();
        RequireLobby();
        var seat = SeatOf(connection) ?? throw new BusinessException("Du sitzt in keinem Raum.");
        seat.Ready = ready;
        return [Outgoing.ToAll("Room", View())];
    }

    public List<Outgoing> ChangeCar(string connection, CarLoadout car)
    {
        Touch();
        RequireLobby();
        var seat = SeatOf(connection) ?? throw new BusinessException("Du sitzt in keinem Raum.");
        seat.Car = car;
        return [Outgoing.ToAll("Room", View())];
    }

    public List<Outgoing> Chat(string connection, string text)
    {
        Touch();
        var seat = SeatOf(connection);
        var clean = (text ?? string.Empty).Trim();
        if (seat is null || clean.Length == 0)
        {
            return [];
        }

        return [Outgoing.ToAll("Chat", seat.Name, clean.Length > 200 ? clean[..200] : clean)];
    }

    /// <summary>The host starts: every human must be ready (the host counts as ready). Bots take the free seats, the grid is drawn, the countdown runs.</summary>
    public List<Outgoing> Start(string connection, DateTime now)
    {
        Touch();
        RequireHost(connection);
        RequireLobby();
        var waiting = Seats.Where(s => s.Kind == SeatKind.Human && !s.Ready && s.PlayerId != HostPlayerId).Select(s => s.Name).ToList();
        if (waiting.Count > 0)
        {
            throw new BusinessException($"Noch nicht bereit: {string.Join(", ", waiting)}.");
        }

        if (Seats.Count < 1)
        {
            throw new BusinessException("Niemand am Start.");
        }

        AddBots();
        // the grid: humans and bots mixed; in a quick or cup race the players start from the back (Death Rally: earn your place)
        var order = Seats.OrderBy(_ => _random.Next()).ToList();
        if (Kind != RaceKind.Custom)
        {
            order = Seats.Where(s => s.Kind == SeatKind.Bot).OrderBy(_ => _random.Next()).Concat(Seats.Where(s => s.Kind == SeatKind.Human)).ToList();
        }

        for (var i = 0; i < order.Count; i++)
        {
            order[i].Grid = i;
        }

        foreach (var s in Seats)
        {
            s.Hp = s.Car.Spec.Health;
            s.Lap = 0;
            s.Progress = -0.01 * (s.Grid + 1);
            s.FinishedMs = null;
            s.BestLapMs = null;
            s.Kills = 0;
            s.Wrecks = 0;
            s.Money = 0;
            s.Special = null;
            s.SpecialCount = 0;
            s.WreckedUntil = null;
        }

        var slots = _layout?.PickupSlots ?? 0;
        _slotBack = Enumerable.Repeat(DateTime.MinValue, slots).ToArray();
        BotDriver = HostPlayerId;
        Status = RoomStatus.Countdown;
        _startAt = now.AddMilliseconds(CountdownMs);
        foreach (var s in Seats)
        {
            s.LapStartedAt = _startAt;
        }

        return [Outgoing.ToAll("RaceStart", StartView())];
    }

    // ------------------------------------------------------------------ the race

    /// <summary>The state of a car (sent ~15× a second by the browser that drives it): relayed to the others. data[12] is the progress (laps + fraction).</summary>
    public List<Outgoing> State(string connection, int seatIndex, double[] data)
    {
        if (Status is not (RoomStatus.Countdown or RoomStatus.Racing) || data is null || data.Length < 13 || data.Length > 24)
        {
            return [];
        }

        var seat = OwnedSeat(connection, seatIndex);
        if (seat is null)
        {
            return [];
        }

        _lastActivity = DateTime.UtcNow;
        var progress = data[12];
        if (double.IsFinite(progress) && progress <= seat.Lap + 1.05 && progress >= seat.Lap - 1)
        {
            seat.Progress = Math.Max(seat.Lap, progress);
        }

        return [Outgoing.ToOthers(connection, "S", seatIndex, data)];
    }

    /// <summary>A special weapon is used (rocket, mine, oil, shock, shield): checked against what the seat holds, relayed to the others.</summary>
    public List<Outgoing> Fire(string connection, int seatIndex, string kind, double[] data, DateTime now)
    {
        if (Status != RoomStatus.Racing || !Weapons)
        {
            return [];
        }

        var seat = OwnedSeat(connection, seatIndex);
        if (seat is null || seat.WreckedUntil is not null || seat.Special != kind || seat.SpecialCount <= 0)
        {
            return [];
        }

        var rule = RuleOf(kind);
        if (rule is null || (now - seat.LastSpecialAt).TotalMilliseconds < rule.CooldownMs * 0.8)
        {
            return [];
        }

        seat.LastSpecialAt = now;
        seat.SpecialCount--;
        if (seat.SpecialCount <= 0)
        {
            seat.Special = null;
        }

        var messages = new List<Outgoing> { Outgoing.ToOthers(connection, "Fired", seatIndex, kind, data ?? []) };
        if (kind == nameof(WeaponKind.Shield))
        {
            seat.ShieldUntil = now.AddMilliseconds(ShieldMs);
        }

        return messages;
    }

    /// <summary>
    /// A hit: attacker → target with a weapon (MachineGun, Rocket, Mine, Shock, Oil, Crash) and its damage. Reported by the shooter (machine gun, rocket, shock)
    /// or by the car that was hit (mine, oil, crash). Checked (who may report it, the most a weapon can do, the machine gun's rate, shields), then applied.
    /// </summary>
    public List<Outgoing> Hit(string connection, int attackerIndex, int targetIndex, string kind, double amount, DateTime now)
    {
        if (Status != RoomStatus.Racing || attackerIndex < 0 || attackerIndex >= Seats.Count || targetIndex < 0 || targetIndex >= Seats.Count)
        {
            return [];
        }

        var attacker = Seats[attackerIndex];
        var target = Seats[targetIndex];
        var selfReported = kind is nameof(WeaponKind.Mine) or nameof(WeaponKind.Oil) or "Crash";
        var reporter = selfReported ? OwnedSeat(connection, targetIndex) : OwnedSeat(connection, attackerIndex);
        if (reporter is null || target.WreckedUntil is not null || target.FinishedMs is not null || !double.IsFinite(amount) || amount <= 0)
        {
            return [];
        }

        if (kind != "Crash" && !Weapons)
        {
            return [];
        }

        if (target.ShieldUntil > now && kind != "Crash")
        {
            return [];
        }

        double max;
        if (kind == "Crash")
        {
            max = CrashMax;
        }
        else if (kind == nameof(WeaponKind.MachineGun))
        {
            if ((now - attacker.GunWindowStart).TotalMilliseconds > 1000)
            {
                attacker.GunWindowStart = now;
                attacker.GunWindow = 0;
            }

            var perSecond = attacker.Car.Spec.GunDamage * 14;
            max = Math.Max(0, Math.Min(attacker.Car.Spec.GunDamage * 1.01, perSecond - attacker.GunWindow));
            attacker.GunWindow += Math.Min(amount, max);
        }
        else
        {
            max = RuleOf(kind)?.Damage ?? 0;
        }

        var damage = Math.Min(amount, max);
        if (damage <= 0)
        {
            return [];
        }

        target.Hp = Math.Max(0, target.Hp - damage);
        var messages = new List<Outgoing> { Outgoing.ToAll("Damage", targetIndex, Math.Round(target.Hp, 1), attackerIndex, kind) };
        if (target.Hp <= 0)
        {
            target.Wrecks++;
            target.WreckedUntil = now.AddMilliseconds(RespawnMs);
            target.Special = null;
            target.SpecialCount = 0;
            if (attackerIndex != targetIndex && kind != "Crash")
            {
                attacker.Kills++;
                attacker.Money += Economy.KillBonus;
            }

            messages.Add(Outgoing.ToAll("Wrecked", targetIndex, attackerIndex == targetIndex ? -1 : attackerIndex, kind, RespawnMs));
        }

        return messages;
    }

    /// <summary>A car drove through a crate: the room decides what was inside (weapons only when the room has them).</summary>
    public List<Outgoing> Pickup(string connection, int seatIndex, int slot, DateTime now)
    {
        if (Status != RoomStatus.Racing || slot < 0 || slot >= _slotBack.Length)
        {
            return [];
        }

        var seat = OwnedSeat(connection, seatIndex);
        if (seat is null || seat.WreckedUntil is not null || _slotBack[slot] > now)
        {
            return [];
        }

        _slotBack[slot] = now.AddMilliseconds(SlotBackMs);
        var content = Roll(seat);
        switch (content.Kind)
        {
            case "weapon":
                seat.Special = content.Weapon;
                seat.SpecialCount = content.Amount;
                seat.LastSpecialAt = DateTime.MinValue;
                break;
            case "repair":
                seat.Hp = Math.Min(seat.Car.Spec.Health, seat.Hp + content.Hp);
                content = content with { Hp = (int)Math.Round(seat.Hp) };
                break;
            case "money":
                seat.Money += content.Amount;
                break;
        }

        return [Outgoing.ToAll("Picked", seatIndex, slot, content)];
    }

    /// <summary>A lap is done (lap = the number of finished laps). Too fast laps are ignored. After the last lap the car has finished.</summary>
    public List<Outgoing> Lap(string connection, int seatIndex, int lap, DateTime now)
    {
        if (Status != RoomStatus.Racing)
        {
            return [];
        }

        var seat = OwnedSeat(connection, seatIndex);
        if (seat is null || seat.FinishedMs is not null || lap != seat.Lap + 1)
        {
            return [];
        }

        var lapMs = (int)(now - seat.LapStartedAt).TotalMilliseconds;
        if (lapMs < Layouts.MinLapMs(_layout, seat.Car.Spec.TopSpeed))
        {
            return [];
        }

        seat.Lap = lap;
        seat.Progress = lap;
        seat.LapStartedAt = now;
        seat.BestLapMs = seat.BestLapMs is null ? lapMs : Math.Min(seat.BestLapMs.Value, lapMs);
        var messages = new List<Outgoing> { Outgoing.ToAll("Lap", seatIndex, lap, lapMs) };
        if (lap >= Laps)
        {
            seat.FinishedMs = (int)(now - _startAt).TotalMilliseconds;
            var place = Seats.Count(s => s.FinishedMs is not null);
            _firstFinish ??= now;
            messages.Add(Outgoing.ToAll("Finished", seatIndex, place, seat.FinishedMs));
        }

        return messages;
    }

    /// <summary>The clock (online every 100 ms, offline the same): countdown → race, respawns, crates back, the end of the race.</summary>
    public List<Outgoing> Tick(DateTime now)
    {
        var messages = new List<Outgoing>();
        if (Status == RoomStatus.Countdown && now >= _startAt)
        {
            Status = RoomStatus.Racing;
            foreach (var s in Seats)
            {
                s.LapStartedAt = _startAt;
            }
        }

        if (Status != RoomStatus.Racing)
        {
            return messages;
        }

        foreach (var s in Seats.Where(s => s.WreckedUntil is not null && s.WreckedUntil <= now))
        {
            s.WreckedUntil = null;
            s.Hp = s.Car.Spec.Health;
            messages.Add(Outgoing.ToAll("Respawn", s.Index, s.Hp));
        }

        for (var i = 0; i < _slotBack.Length; i++)
        {
            if (_slotBack[i] != DateTime.MinValue && _slotBack[i] <= now)
            {
                _slotBack[i] = DateTime.MinValue;
                messages.Add(Outgoing.ToAll("SlotBack", i));
            }
        }

        var humans = Seats.Where(s => s.Kind == SeatKind.Human).ToList();
        var allHumansDone = humans.All(s => s.FinishedMs is not null || s.Left);
        var grace = _firstFinish is not null && now > _firstFinish.Value.AddSeconds(FinishGraceSeconds);
        var hardLimit = now > _startAt.AddMinutes(4 + Laps * 2);
        if (allHumansDone || grace || hardLimit)
        {
            messages.AddRange(Finish(now));
        }

        return messages;
    }

    /// <summary>True when nothing happened for a long time (the registry removes such rooms).</summary>
    public bool IsStale(DateTime now) =>
        Status == RoomStatus.Closed
        || (Status == RoomStatus.Finished && now - _lastActivity > TimeSpan.FromMinutes(10))
        || (Status == RoomStatus.Lobby && now - _lastActivity > TimeSpan.FromMinutes(30))
        || now - _lastActivity > TimeSpan.FromMinutes(20);

    private List<Outgoing> Finish(DateTime now)
    {
        Status = RoomStatus.Finished;
        var ordered = Seats.Where(s => s.FinishedMs is not null).OrderBy(s => s.FinishedMs)
            .Concat(Seats.Where(s => s.FinishedMs is null).OrderBy(s => s.Left).ThenByDescending(s => s.Progress))
            .ToList();
        var cars = Seats.Count;
        var results = new List<RaceSeatResult>();
        for (var i = 0; i < ordered.Count; i++)
        {
            var s = ordered[i];
            var place = i + 1;
            var finished = s.FinishedMs is not null;
            var prize = finished || !s.Left ? Economy.PrizeFor(place, cars, Kind) : 0;
            var xp = s.Left ? 0 : Progression.XpForRace(place, cars, s.Kills, finished);
            results.Add(new RaceSeatResult(s.Index, s.PlayerId, s.Name, s.Kind == SeatKind.Bot, place, finished, s.FinishedMs, s.BestLapMs, s.Kills, s.Wrecks,
                prize, prize + s.Money, xp));
        }

        Results = new ResultsView(Token, Kind.ToString(), Track, Laps, results, CupRun);
        _lastActivity = now;
        return [Outgoing.ToAll("Results", Results)];
    }

    // ------------------------------------------------------------------ views

    public RoomView View() => new(
        Token, Code, Name, Kind.ToString(), Status.ToString(), Track, Laps, MaxPlayers, Bots, BotSkill, Weapons, IsPublic, HostPlayerId, CupRun,
        Seats.Select(s => new SeatView(s.Index, s.Kind.ToString(), s.PlayerId, s.Name, s.IsGuest, s.Ready || s.PlayerId == HostPlayerId, s.Connected,
            s.PlayerId is not null && s.PlayerId == HostPlayerId, s.Level, s.Avatar, s.Car)).ToList());

    public RoomSummary Summary()
    {
        var host = Seats.FirstOrDefault(s => s.PlayerId == HostPlayerId)?.Name ?? "?";
        return new RoomSummary(Token, Code, Name, Track.Name, Track.Layout, Seats.Count(s => s.Kind == SeatKind.Human && !s.Left), MaxPlayers, Bots, Status.ToString(), host);
    }

    public RaceStartView StartView() => new(
        Token, Kind.ToString(), Track, Laps, Weapons, Math.Max(0, (int)(_startAt - DateTime.UtcNow).TotalMilliseconds), Seed, BotDriver, _slotBack.Length,
        WeaponRules, Seats.Select(s => new GridSeat(s.Index, s.Kind.ToString(), s.PlayerId, s.Name, s.Grid, s.Skill, s.Avatar, s.Car)).ToList());

    public Seat? SeatOf(string connection) => Seats.FirstOrDefault(s => s.Kind == SeatKind.Human && s.Connection == connection && !s.Left);

    public Seat? SeatOfPlayer(long playerId) => Seats.FirstOrDefault(s => s.Kind == SeatKind.Human && s.PlayerId == playerId);

    // ------------------------------------------------------------------ helpers

    /// <summary>The seat a connection may report for: its own, or a bot when it drives the bots.</summary>
    private Seat? OwnedSeat(string connection, int index)
    {
        if (index < 0 || index >= Seats.Count)
        {
            return null;
        }

        var seat = Seats[index];
        if (seat.Kind == SeatKind.Human)
        {
            return seat.Connection == connection && !seat.Left ? seat : null;
        }

        var driver = SeatOf(connection);
        return driver is not null && driver.PlayerId == BotDriver ? seat : null;
    }

    private WeaponRule? RuleOf(string kind) => WeaponRules.FirstOrDefault(w => w.Kind == kind);

    private PickupContent Roll(Seat seat)
    {
        var roll = _random.NextDouble();
        var specials = WeaponRules.Where(w => w.Kind != nameof(WeaponKind.MachineGun) && w.CrateWeight > 0).ToList();
        if (Weapons && specials.Count > 0 && roll < 0.55)
        {
            var total = specials.Sum(w => w.CrateWeight);
            var pick = _random.Next(total);
            foreach (var w in specials)
            {
                pick -= w.CrateWeight;
                if (pick < 0)
                {
                    return new PickupContent("weapon", w.Kind, Math.Max(1, w.Amount), 0);
                }
            }
        }

        roll = _random.NextDouble();
        if (seat.Hp < seat.Car.Spec.Health * 0.7 && roll < 0.45)
        {
            return new PickupContent("repair", null, 0, RepairHp);
        }

        return roll switch
        {
            < 0.35 => new PickupContent("turbo", null, 1, 0),
            < 0.6 when Weapons => new PickupContent("ammo", null, AmmoPack, 0),
            < 0.8 => new PickupContent("repair", null, 0, RepairHp),
            _ => new PickupContent("money", null, Economy.MoneyBag, 0),
        };
    }

    /// <summary>Lobby: the number of bots never takes a free human seat away (humans + bots ≤ 8).</summary>
    private void FitBots()
    {
        var humans = Seats.Count(s => s.Kind == SeatKind.Human);
        Bots = Math.Clamp(Bots, 0, MaxSeats - Math.Max(humans, 1));
    }

    private void AddBots()
    {
        Seats.RemoveAll(s => s.Kind == SeatKind.Bot);
        var names = SeedContent.BotNames.OrderBy(_ => _random.Next()).ToList();
        if (_fixedBots is not null)
        {
            foreach (var (name, car, skill) in _fixedBots.Take(MaxSeats - Seats.Count))
            {
                Seats.Add(new Seat { Index = Seats.Count, Kind = SeatKind.Bot, Name = name, Car = car, Skill = skill, Ready = true, Level = skill * 5 });
            }

            return;
        }

        for (var i = 0; i < Bots && Seats.Count < MaxSeats; i++)
        {
            var skill = Math.Clamp(BotSkill + (_random.Next(3) - 1), 1, 5);
            var car = _botCars.Count == 0 ? Seats[0].Car : _botCars[_random.Next(_botCars.Count)];
            Seats.Add(new Seat { Index = Seats.Count, Kind = SeatKind.Bot, Name = names[i % names.Count], Car = car, Skill = skill, Ready = true, Level = skill * 5 });
        }
    }

    private static Seat Renumber(Seat seat, int index) => seat.Index == index ? seat : new Seat
    {
        Index = index, Kind = seat.Kind, PlayerId = seat.PlayerId, Connection = seat.Connection, Name = seat.Name, IsGuest = seat.IsGuest, Level = seat.Level,
        Avatar = seat.Avatar, Car = seat.Car, Ready = seat.Ready, Skill = seat.Skill,
    };

    private void RequireHost(string connection)
    {
        var seat = SeatOf(connection);
        if (seat is null || seat.PlayerId != HostPlayerId)
        {
            throw new AccessDeniedException("Das darf nur, wer den Raum eröffnet hat.");
        }
    }

    private void RequireLobby()
    {
        if (Status != RoomStatus.Lobby)
        {
            throw new BusinessException("Das Rennen läuft schon.");
        }
    }

    private void Touch() => _lastActivity = DateTime.UtcNow;

    private sealed class Releaser(SemaphoreSlim semaphore) : IDisposable
    {
        private bool _done;

        public void Dispose()
        {
            if (_done)
            {
                return;
            }

            _done = true;
            semaphore.Release();
        }
    }
}
