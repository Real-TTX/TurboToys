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
| `GET /tracks` | – | `[{ track: TrackView, bestLapMs }]` |
| `GET /cups` | – | `CupView[]` (with the running run or one finished in the last 30 minutes) |
| `POST /cups/{id}/enter` | – | `CupRunView` (pays the entry, draws the bots; a running run is given up) |
| `POST /cups/runs/{token}/abandon` | – | `{ ok }` |
| `GET /profile` | – | `ProfileView { player, stats, options }` |
| `PUT /profile/avatar` | `{ face?, hair?, helmet?, color?, skin? }` | ProfileView |
| `GET /leaderboard` | – | `LeaderRow[]` (accounts only; offline empty) |
| `GET /history` | – | `HistoryItem[]` |
| `GET /info` | – | `{ game, version, rooms, racing }` |

Shapes: `TurboToys.Core/Business/Views.cs`. `GarageCarView.spec` (`CarSpec`: topSpeed, acceleration, grip, health, turboSeconds, weight, gunDamage, gunAmmo) is what
the browser's physics uses (`js/game/race/physics.js`). The avatar keys (`Avatars` in Rules.cs) and decals/paints/bodies (`Looks`) are contracts with
`js/game/avatar.js` and `js/game/cars/models.js`: never rename one, add new ones at the end.

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
  - `Lap` counts only when it is the next lap and not faster than `Layouts.MinLapMs` (80 % of the layout's polyline at 1.6× top speed).
  - Crate contents are drawn by the room (weapons only with `weapons` on); a slot comes back after 8 s.
  - The race ends when every human finished or left, 25 s after the first finish, or after `4 + 2 × laps` minutes. Places: finishers by time, then by progress (`data[12]`).
- Prizes, experience and cup points: `Economy`, `Progression`, `CupRules` in `TurboToys.Core` – the same online and offline. Online the plugin saves them (`RaceLogic.FinishedAsync`), offline the profile file.

### Flags of `State`

`1` brake · `2` boost · `4` machine gun · `8` drift · `16` air · `32` wrecked · `64` lights · `128` shield.

## Offline (`TurboToys.Local`)

Answers every API call above and every hub method (except `JoinRoom`: "Offline gibt es keine fremden Räume", `ListRooms`: empty, `State`: nothing to relay).
The local player (id 1) is a guest with `profile.json` in the app's data folder; the catalogue is `SeedContent`; a clock ticks the room every 100 ms.
