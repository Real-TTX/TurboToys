# CLAUDE.md

Guidance for working in this repository. Keep it in sync with the code.

## What TurboToys is

A 3D racing game of radio-controlled toy cars in the browser, in a **comic look** (cel shading with thick ink lines and halftone like the comic style of XIII,
sound words like "KAWUMM!", inset comic panels): electric, gas and turbo cars, a turbo boost, weapons from crates (Death-Rally-like mechanics: prize money,
kill bonus, buying and tuning cars), tournaments ("Pokale"), a profile with a comic avatar and levels, six detailed worlds (kids' room, garden, kitchen,
workshop, supermarket, attic), bots, online multiplayer. Genre like classic RC racers – **the names, worlds, cars and art are our own: never copy another game**.

TurboToys is a **plugin of MatGame** (`../MatGame`: portal, accounts/guests, device sign-in, `/Admin`, discovery for the apps; read `../MatGame/CLAUDE.md`).
It runs in four ways from one code base:
- **On a MatGame master** (Docker, port 2770, every game): the player app at `/turbotoys/`, API `/turbotoys/api`, hub `/turbotoys/hub`, admin `/Admin/TurboToys`.
- **Its own image** (`ghcr.io/real-ttx/turbotoys`, port **2773**): the MatGame host with only TurboToys (`Dockerfile`, `MATGAME_PORT=2773`, `MATGAME_GAMES=turbotoys`).
- **In the Windows app** (MatGame.Shell) online against a master the player chooses (default `MatGameDefaultServer` in `Directory.Build.props`).
- **In the app offline**: `TurboToys.Local` plays the server's part (local guest, bots, `profile.json`).

Stack: .NET 10, Razor class library, SignalR, EF Core + PostgreSQL 17 (MatGame's database, schema `turbotoys`), three.js r187 (vendored, no build step).

## Build / run / test

- The repositories live side by side: `../MatGame` is required (project references to `../MatGame/src/MatGame.Sdk`, `MatGame.Local`, `MatGame.Shell`).
- `dotnet build TurboToys.slnx`, `dotnet test TurboToys.slnx` (rules, race room, offline game; no database).
- `./scripts/redeploy.ps1` rebuilds and starts **MatGame's** local stack with every game: http://localhost:2770/turbotoys/ – how every change is tested.
- Own image: `docker compose -f docker-compose.local.yml up -d --build` → http://localhost:2773/turbotoys/ (pgAdmin 2776, Postgres 2777).
- Previews without a server: `node scripts/serve.mjs 2779` → `/turbotoys/dev/world.html?layout=kidsroom&view=chase|top|orbit&at=0.3&speed=0&time=day|dusk|night` (orbit = a drone above the road; also served by the plugin: the admin's track preview links to it),
  `dev/cars.html`, `dev/sound-avatar.html`, `dev/cover.html`.
- Browser checks (Playwright with the installed Edge, `cd tools && npm install` once): `node tools/shot.mjs <url> <png>`, `node tools/play.mjs` (guest, menu,
  garage, race), `node tools/race.mjs` (a whole race with the developer autopilot `localStorage turbotoys.autopilot = 1`), `node tools/admin.mjs <fresh server>`.
  Screenshots go to `tmp/` (git-ignored) – look at them.
- Migrations: `dotnet tool restore`, `dotnet ef migrations add <Name> --project src/TurboToys.Module --output-dir Data/Migrations` (design-time factory: MatGame's
  local Postgres 2775, `TURBOTOYS_DESIGN_DB` overrides it). The plugin migrates its schema at start and seeds missing content (`SeedLogic`).
- JS check: `node --check --input-type=module < file.js` for every module under `wwwroot/js`.
- The MatGame JS SDK in `wwwroot/js/matgame` is a **copy**: change `../MatGame/sdk/js`, then `node ../MatGame/tools/sdk-copy.js src/TurboToys.Module/wwwroot/js/matgame`.
- Logo: `node scripts/logo.js` (all SVG levels), `./scripts/icons.ps1` (PNG icons, `turbotoys.ico`). Portal card: `img/cover.png` (`tools/cover.mjs`).
- Windows app: `dotnet run --project src/TurboToys.App`; publish `dotnet publish src/TurboToys.App -c Release -r win-x64` (one self-installing `TurboToys.exe`).

## Rules (from the owner's guidelines — keep them)

- **Git:** branches `main` (release) and `dev` (nightly). Commits only under the owner's name; **no Co-Authored-By or other contributor lines**, no generated-by lines in PRs.
- **Versions:** release `<major>.<minor>.<build>-<date>`, nightly `nightly-<build>-<date>`, local `local-<date>` (`Directory.Build.props`, CI sets Channel/BuildNumber/BuildDate).
  `TurboToysModule.Protocol` rises only with a change of the API or hub old apps cannot follow.
- **Docker:** `Dockerfile` (own image, ASP.NET Core base, port 2773), compose files for release/dev/local, no `${VARIABLES}`, no `.env`, always a stack (`name:`), volumes `web-data`, `db-data`.
- **CI** (`.github/workflows/build.yml`): build + tests + script checks, the own image for every branch (tags by channel), the Windows app (release-channel/nightly-channel), and a dispatch to MatGame (secret `MATGAME_DISPATCH_TOKEN`).
- **C#:** Microsoft conventions, readable names, flat code. **Business layer = static classes** (`Business/`), every method takes an `Actor` and **checks the permission itself** (`Guard`). **No database queries in pages or models.**
- **Accounts are MatGame's** (`Web/Players.cs`: account → `Actor`; the player row `Player.Id` = account id is made at the first request with start money and the starter car). Guests play and progress, but are not in the leaderboard.
- **Database:** schema `turbotoys`, PascalCase singular tables, `Id bigint`, audit columns (`AppDbContext.SaveChangesAsync`), soft delete (`UpdateState`) for players, cars, weapons, tracks, cups; tokens in links (`Race.Token`, `CupRun.Token`).
- **Admin pages** (`Pages/Admin/TurboToys/...`): MatUi through MatGame's admin shell and the SDK's admin kit; lists = toolbar, table, pager, actions below left; edit pages with `md-buttons` (Save, Back, space, Delete); areas are tabs; fields only when they make sense (`show-if`). Every page includes `<partial name="_Assets" />`.
- **The player app** (`wwwroot/index.html`, `js/game`, `css/play.css`, `css/comic.css`) is game UI in the comic look (Bangers + Nunito, paper panels with thick ink, halftone), not MatUi. It talks to the server only through `js/game/api.js` (the SDK). Base path `/turbotoys/` everywhere (relative URLs only, no CDN).
- **Offline rule:** `TurboToys.Local` answers every API call and hub method with the same shapes (docs/PROTOCOL.md); a new endpoint needs its offline answer and a test in `LocalGameTests`.

## Map

```
src/TurboToys.Core      Data/Entities.cs (POCOs), Business/ Common (Actor, Guard, exceptions, ListRequest), Rules (Tuning + CarSpec, Economy, Progression, Avatars, Looks),
                        PlayerRules (garage, avatar, race rewards, CupRules, Bots), SeedContent, Views (the JSON shapes), Game/ RaceRoom (the race in memory), Dtos, Layouts
                        (reads the browser's data/layouts.json, embedded: lap plausibility, crate slots)
src/TurboToys.Module    TurboToysModule (IGameModule), Data/AppDbContext + Migrations, Business/ PlayerLogic, GarageLogic, ContentLogic (cars, weapons, tracks, cups),
                        RaceLogic, CupLogic, SettingLogic + SeedLogic, Game/ GameHub (+ HubErrors), RoomRegistry + GameTicker, Web/ Api, PlayerApp, Players, AppInfo,
                        AdminAssets, Pages/Admin/TurboToys (Übersicht, Spieler, Rennen, Autos, Strecken, Pokale, Waffen, Einstellungen)
src/TurboToys.Module/wwwroot
  data/layouts.json     the six track layouts (centre line, widths, kicker ramps, boost arrows, crate rows) – shared with the server
  js/game               main (entry), api (SDK glue), menu (all screens), ui, comic (sound words, captions, inset frames), hud, input, audio (WebAudio synth), avatar (SVG),
                        catalog, showcase (menu background race, garage scene), world (track + theme + light)
    render/             toon.js (materials, modelling kit, merging), postfx.js (the comic pass: ink from depth + normals, halftone, grain), stage.js (renderer, loop)
    tracks/             track.js (sampling, locate, progress), builder.js (road, curbs, barriers, skirts, kickers, boost arrows, gantry)
    themes/             one world per layout (+ <key>-props.js) and common.js (theme contract and helpers)
    cars/               models.js (8 bodies × 3 drives, paint/decals), parts.js
    race/               race.js (one race), physics.js (arcade car physics, engine curves, turbo), bot.js, vehicle.js (the car as seen), weapons.js, fx.js (particles)
  dev/                  previews (world, cars, sound/avatar, cover)
src/TurboToys.Local     TurboToysLocal (ILocalGame: API + hub + clock), LocalProfile
src/TurboToys.App       the Windows app (MatGame.Shell + wwwroot embedded + TurboToysLocal)
tests/TurboToys.Tests   RulesTests, RaceRoomTests, LocalGameTests
docs/PROTOCOL.md        API, hub, who decides what, offline
```

## Game rules in code

- The browser simulates its own car (and the bot driver the bots); the room decides hit points, crates, laps and places (docs/PROTOCOL.md "Who decides what").
- `CarSpec` (Tuning.SpecOf) is the only source of the car numbers; `js/game/catalog.js specOf` mirrors it only for the menu's background race.
- Track geometry: `data/layouts.json` → `Track` (Catmull-Rom, one sample per unit, heights clamped ≥ 0, kicker ramps added on top). Layout keys are a contract (DB `Track.Layout`, themes, CSS thumbs): never rename one.
- The physics' wall offset follows `BARRIER_OFFSET` of builder.js; themes must keep `track.isNearRoad(x, z, ≥ 4)` free.
- Scale: 1 unit = 10 cm, a car ≈ 4.2 long; speed in km/h on the HUD = units/s × 2.2.
