# TurboToys protocol

The contract between the player app (browser on a MatGame master, or the app shell), the plugin (`TurboToys.Module`) and the offline game of the app
(`TurboToys.Local`, which answers the same calls with the same shapes). JSON is camelCase; enums travel as strings. Accounts, sign-in, guests and devices are
MatGame's host API (`../MatGame/docs/PROTOCOL.md`). Game protocol: **1** (`TurboToysModule.Protocol`). Errors: `400 { error, field }`, `401`, `403`.
**Update this file with every change of Api.cs, GameHub.cs, Dtos.cs, Views.cs or TurboToysLocal.**

## Game API (`/turbotoys/api`)

| Call | Body | Answer |
|---|---|---|
| `GET /session` | – | `{ signedIn, player: PlayerView, version, offline }` (anonymous: `signedIn: false`) |
| `GET /home` | – | `{ player, stats: StatsView, car: GarageCarView, announcement, history: HistoryItem[], settings: { maxPlayers, guestsCreateRooms } }` |
| `GET /catalog` | – | `{ cars: CarView[], weapons: WeaponView[], parts: UpgradeOffer[], currency, killBonus }` |
| `GET /garage` | – | `GarageView { money, level, selectedId, cars: GarageCarView[], shop: ShopItem[], paints, decals }` |
| `POST /garage/buy` | `{ carId }` | GarageView (the bought car is selected) |
| `POST /garage/{id}/upgrade` | `{ part }` (Engine, Tires, Armor, Turbo, Weapons) | GarageView |
| `PUT /garage/{id}/look` | `{ paint?, decal?, number? }` | GarageView |
| `PUT /garage/select` | `{ id }` | GarageView |
| `GET /tracks` | – | `[{ track: TrackView, bestLapMs }]` – the open official tracks, then the player's own (`track.custom: true`) |
| `GET /tracks/{id}/design` | – | the layout JSON of a designed track (builder, admins; everyone once it is official) – the preview `dev/world.html?track={id}` |
| `GET /designs` | – | `DesignView[]` – the player's own tracks (track editor), the last changed first |
| `POST /designs` | `{ id?, name, theme, timeOfDay, laps, design }` | `DesignView` (no id = new; only own tracks; at most 20 per player; guests too) |
| `DELETE /designs/{id}` | – | `{ ok }` (own tracks only) |
| `GET /cups` | – | `CupView[]` (with the running run or one finished in the last 30 minutes) |
| `POST /cups/{id}/enter` | – | `CupRunView` (pays the entry, draws the bots; a running run is given up) |
| `POST /cups/runs/{token}/abandon` | – | `{ ok }` |
| `GET /profile` | – | `ProfileView { player, stats, options }` |
| `PUT /profile/avatar` | `{ face?, hair?, helmet?, color?, skin? }` | ProfileView |
| `GET /leaderboard` | – | `LeaderRow[]` (accounts only; offline empty) |
| `GET /history` | – | `HistoryItem[]` |
| `GET /info` | – | `{ game, version, rooms, racing }` |

Shapes: `TurboToys.Core/Business/Views.cs` (and `DesignView` in `DesignRules.cs`). `GarageCarView.spec` (`CarSpec`: topSpeed, acceleration, grip, health, turboSeconds, weight, gunDamage, gunAmmo) is what
the browser's physics uses (`js/game/race/physics.js`). The avatar keys (`Avatars` in Rules.cs) and decals/paints/bodies (`Looks`) are contracts with
`js/game/avatar.js` and `js/game/cars/models.js`: never rename one, add new ones at the end.

## Track layouts and the players' tracks

A layout (an entry of `data/layouts.json`, or the `design` of a player's track) is one JSON object; 1 unit = 10 cm, `at`/`from`/`to` are fractions 0 … 1 of the lap:

```
{ key, name, theme, width,
  points:   [[x, z, y?, width?], …]          closed centre line
  jumps:    [{ at, height, length }]
  boosts:   [{ at, side }]
  pickups:  [{ at }]                          a row of 3 crates each
  loops:    [{ at, radius }]                  a vertical looping spliced into the lap (+2πR)
  tunnels:  [{ at, length, style }]
  branches: [{ from, to, points: [[x, z, y?, width?], …], pickups?, boosts?, jumps?, tunnels?, surface?: "road" | "water", width? }]   shortcuts (open paths)
  … }                                         the editor's own data (e.g. pieces) is kept as it is
```

The server reads it with `Layouts.Parse` (`TurboToys.Core/Game/Layouts.cs`): the lap = the closed polyline of `points` + Σ 2π·radius of the loops; the shortest way =
the lap − Σ over the branches of max(0, the main stretch from → to − the branch's polyline from the main point at `from` through its points to the main point at `to`);
the pickup slots = 3 × (the main rows, then each branch's rows – the browser numbers the slots in this order).

**A player's track** (`POST /designs`, `Layouts.Validate`): an object of at most 64 KB, only finite numbers, `theme` one of kidsroom, garden, kitchen, workshop,
supermarket, attic, 8 … 800 points (a branch 1 … 200), |x|, |z| ≤ 3000, 0 ≤ y ≤ 80, widths 10 … 30, ≤ 6 loops (radius 8 … 20), all fractions within 0 … 1, at most 4 branches
and – lap and branches together – ≤ 8 tunnels, ≤ 10 jumps, ≤ 10 boosts, ≤ 10 crate rows; the lap and the shortest way at least 450 (45 m). Errors: 400 with `field`
`name` (1 … 40 characters), `theme`, `timeOfDay` (Day, Dusk, Night), `laps` (1 … 9) or `design`. The server stores the object as sent and hands it out with
`key = "custom-{id}"`, `name` = the track's name and `theme` = its world.

`DesignView { id, name, theme, timeOfDay, laps, updatedAt, design }`. A designed track is a `Track` with `Design` (and `Layout` = its world, so thumbnails,
filters and history work); `OwnerId` = its builder until an administrator releases it for everyone (`/Admin/TurboToys/Tracks` "Für alle freigeben"), then it is an
official track (`custom: false`, `design` still set). Players' tracks are raced by their builder (and admins) only and never count for cups.
`TrackView { id, layout, name, description, laps, timeOfDay, unlockLevel, locked, custom }`; `TrackRef { id, layout, name, timeOfDay, laps, design }` (room, start,
results): `design` is the design of a designed track (null for an official layout), so every browser in a room builds the same track.

## Hub (`/turbotoys/hub`)

Signed in like the API (cookie or device token as `access_token`); an app sends `mgp`/`mgc` and is checked on connect (`Closed(message)` when too old).

**Client → server**

| Method | Arguments | Result |
|---|---|---|
| `ListRooms` | – | `RoomSummary[]` (public custom rooms in the lobby) |
| `CreateRoom` | `{ name, trackId, laps, maxPlayers, bots, botSkill, weapons, isPublic }` | `RoomView` (the caller sits down and hosts) |
| `QuickRace` | `{ trackId, bots, botSkill, laps, weapons }` | `RoomView` – a private room that starts at once (`RaceStart` follows) |
| `StartCup` | run token | `RoomView` – the next race of a cup run, starts at once |
| `JoinRoom` | code (`ABCD`) | `RoomView` (also back into a running race: `RaceStart` again) |
| `LeaveRoom` / `SetReady(bool)` / `ChangeCar()` / `StartRace()` / `Chat(text)` / `UpdateRoom(settings)` | | – |
| `State` | seat, `[x, y, z, yaw, pitch, roll, vx, vy, vz, steer, speed, flags, progress]` | – (~15×/s, own car and the bots the caller drives) |
| `Fire` | seat, kind (Rocket, Mine, Oil, Shock, Shield), data | – (only what the seat holds) |
| `Hit` | attacker, target, kind (MachineGun, Rocket, Mine, Shock, Crash), amount | – |
| `Pickup` | seat, slot | – |
| `Lap` | seat, finished laps | – |

**Server → client**: `Room(RoomView)`, `RaceStart(RaceStartView)`, `S(seat, data)` (the others' states), `Fired(seat, kind, data)`,
`Damage(target, hp, attacker, kind)`, `Wrecked(target, attacker | -1, kind, respawnMs)`, `Respawn(target, hp)`, `Picked(seat, slot, PickupContent)`,
`SlotBack(slot)`, `Lap(seat, lap, lapMs)`, `Finished(seat, place, timeMs)`, `Results(ResultsView)`, `Saved({ cupPlace, cupPrize })`, `BotDriver(playerId)`,
`Chat(name, text)`, `Closed(message)`.

### Who decides what

- Every browser simulates its own car; the **bot driver** (the host, `RaceStartView.botDriver`; `BotDriver` when it changes) also simulates the bots. The others are drawn from their states (110 ms behind).
- The room (`RaceRoom`, server or `TurboToys.Local`) decides **hit points, wrecks, crates, laps and places**:
  - `Hit` is reported by the shooter for MachineGun, Rocket and Shock, and by the car that touched it for Mine, Oil (no damage) and Crash. The room checks the reporter, caps the damage (weapon damage; machine gun per bullet and 14 bullets/s; crash 15), ignores shields.
  - `Lap` counts only when it is the next lap and not faster than `Layouts.MinLapMs` (80 % of the layout's shortest way round at 1.6× top speed; for a designed track its design).
  - Crate contents are drawn by the room (weapons only with `weapons` on); a slot comes back after 8 s.
  - The race ends when every human finished or left, 25 s after the first finish, or after `4 + 2 × laps` minutes. Places: finishers by time, then by progress (`data[12]`).
- Prizes, experience and cup points: `Economy`, `Progression`, `CupRules` in `TurboToys.Core` – the same online and offline. Online the plugin saves them (`RaceLogic.FinishedAsync`), offline the profile file.

### Flags of `State`

`1` brake · `2` boost · `4` machine gun · `8` drift · `16` air · `32` wrecked · `64` lights · `128` shield.

## Offline (`TurboToys.Local`)

Answers every API call above and every hub method (except `JoinRoom`: "Offline gibt es keine fremden Räume", `ListRooms`: empty, `State`: nothing to relay).
The local player (id 1) is a guest with `profile.json` in the app's data folder; the catalogue is `SeedContent`; a clock ticks the room every 100 ms.
The player's own tracks live in `profile.json` too (ids from 1 000 000, the seeded tracks count from 1); deleting one removes it.
