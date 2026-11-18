using System.Text.Json;
using TurboToys.Business;

namespace TurboToys.Game;

// The messages of the hub (online: TurboToys.Module GameHub; offline: TurboToys.Local) – docs/PROTOCOL.md. Enums travel as strings.

/// <summary>A hub message to send: to everyone in the room, to one connection, or to everyone but one.</summary>
public sealed record Outgoing(string Method, object?[] Args, string? Connection = null, string? Except = null)
{
    public static Outgoing ToAll(string method, params object?[] args) => new(method, args);

    public static Outgoing ToOne(string connection, string method, params object?[] args) => new(method, args, connection);

    public static Outgoing ToOthers(string except, string method, params object?[] args) => new(method, args, null, except);
}

/// <summary>The tuning levels of a car.</summary>
public sealed record TuningLevels(int Engine, int Tires, int Armor, int Turbo, int Weapons);

/// <summary>The car a seat drives: catalogue, look and the numbers of the physics.</summary>
public sealed record CarLoadout(string Key, string Name, string Body, string Drive, string Paint, string Decal, int Number, CarSpec Spec, TuningLevels Levels);

/// <summary>The comic avatar of a player.</summary>
public sealed record AvatarView(string Face, string Hair, string Helmet, string Color, string Skin);

/// <summary>Who sits down in a room.</summary>
public sealed record SeatPlayer(long PlayerId, string Name, bool IsGuest, int Level, AvatarView Avatar);

/// <summary>
/// The track of a room. <see cref="Design"/> is the layout JSON of a designed track (null for a layout of data/layouts.json), so every browser in the room builds
/// the same track; <see cref="Layout"/> is then the key of its world.
/// </summary>
public sealed record TrackRef(long Id, string Layout, string Name, string TimeOfDay, int Laps, JsonElement? Design = null);

/// <summary>What the host may change in the lobby.</summary>
public sealed record RoomSettings(string? Name, long TrackId, int Laps, int MaxPlayers, int Bots, int BotSkill, bool Weapons, bool IsPublic);

/// <summary>A weapon as the race uses it.</summary>
public sealed record WeaponRule(string Kind, string Name, int Damage, int Amount, int CooldownMs, int CrateWeight);

/// <summary>A seat in the lobby view.</summary>
public sealed record SeatView(int Index, string Kind, long? PlayerId, string Name, bool IsGuest, bool Ready, bool Connected, bool IsHost, int Level, AvatarView? Avatar, CarLoadout? Car);

/// <summary>The room (lobby) as everyone in it sees it.</summary>
public sealed record RoomView(Guid Token, string Code, string Name, string Kind, string Status, TrackRef Track, int Laps, int MaxPlayers, int Bots, int BotSkill, bool Weapons,
    bool IsPublic, long? HostPlayerId, Guid? CupRun, IReadOnlyList<SeatView> Seats);

/// <summary>A room in the list of open rooms.</summary>
public sealed record RoomSummary(Guid Token, string Code, string Name, string TrackName, string Layout, int Players, int MaxPlayers, int Bots, string Status, string HostName);

/// <summary>A car on the grid at the start.</summary>
public sealed record GridSeat(int Index, string Kind, long? PlayerId, string Name, int Grid, int Skill, AvatarView? Avatar, CarLoadout Car);

/// <summary>The start of a race: everything the browsers need to build it.</summary>
public sealed record RaceStartView(Guid Token, string Kind, TrackRef Track, int Laps, bool Weapons, int CountdownMs, int Seed, long? BotDriver, int PickupSlots,
    IReadOnlyList<WeaponRule> WeaponRules, IReadOnlyList<GridSeat> Seats);

/// <summary>What a crate contained: kind weapon (with the weapon kind and amount), repair (hp), turbo, ammo (amount), money (amount).</summary>
public sealed record PickupContent(string Kind, string? Weapon, int Amount, int Hp);

/// <summary>The end of a race.</summary>
public sealed record ResultsView(Guid Token, string Kind, TrackRef Track, int Laps, IReadOnlyList<RaceSeatResult> Results, Guid? CupRun);
