using System.Globalization;
using MatGame.Sdk;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Web;

/// <summary>
/// The JSON interface of the player app under <c>/turbotoys/api</c>: session, home, catalogue, garage, tracks, cups, profile, leaderboard.
/// Accounts (sign-in, registration, guests) are MatGame's host API (<c>/api/matgame/...</c>). Every call goes through the business layer (which checks
/// the permission); <see cref="GameApi.ForGame"/> checks the app version and the antiforgery token of cookie requests. Errors: 400 <c>{ error, field }</c>,
/// 401 not signed in, 403 denied. The offline game of the app (TurboToys.Local) answers the same calls with the same shapes (docs/PROTOCOL.md).
/// </summary>
public static class Api
{
    public sealed record BuyRequest(long CarId);

    public sealed record UpgradeRequest(string? Part);

    public sealed record LookRequest(string? Paint, string? Decal, int? Number);

    public sealed record SelectRequest(long Id);

    public sealed record AvatarRequest(string? Face, string? Hair, string? Helmet, string? Color, string? Skin);

    public static void MapApi(this IEndpointRouteBuilder game, GameInfo info)
    {
        var api = game.MapGroup("/api").ForGame(info).AddEndpointFilter(Errors).AllowAnonymous();

        api.MapGet("/session", async (HttpContext http, AppDbContext db) =>
        {
            if (Players.ActorOf(http.User) is null)
            {
                return Results.Ok(new { signedIn = false, player = (object?)null, version = AppInfo.Version, offline = false });
            }

            var me = await Players.RequireAsync(http, db);
            var player = await PlayerLogic.GetAsync(db, me, me.PlayerId) ?? throw new AccessDeniedException();
            return Results.Ok(new { signedIn = true, player = Views.Player(player, me.IsAdmin), version = AppInfo.Version, offline = false });
        });

        api.MapGet("/home", async (HttpContext http, AppDbContext db) =>
        {
            var me = await Players.RequireAsync(http, db);
            var player = await PlayerLogic.GetAsync(db, me, me.PlayerId) ?? throw new AccessDeniedException();
            var settings = await SettingLogic.GetAsync(db);
            var garage = await GarageLogic.GarageAsync(db, me);
            return Results.Ok(new
            {
                player = Views.Player(player, me.IsAdmin),
                stats = Views.Stats(player, await PlayerLogic.RankAsync(db, player)),
                car = garage.Cars.FirstOrDefault(c => c.Id == garage.SelectedId) ?? garage.Cars.FirstOrDefault(),
                announcement = settings.Announcement,
                history = await RaceLogic.HistoryAsync(db, me, 8),
                settings = new { settings.MaxPlayers, guestsCreateRooms = settings.GuestsCreateRooms },
            });
        });

        api.MapGet("/catalog", async (AppDbContext db) => Results.Ok(await ContentLogic.CatalogAsync(db)));

        // ---- garage
        api.MapGet("/garage", async (HttpContext http, AppDbContext db) => Results.Ok(await GarageLogic.GarageAsync(db, await Players.RequireAsync(http, db))));
        api.MapPost("/garage/buy", async (BuyRequest body, HttpContext http, AppDbContext db) =>
            Results.Ok(await GarageLogic.BuyAsync(db, await Players.RequireAsync(http, db), body.CarId)));
        api.MapPost("/garage/{id:long}/upgrade", async (long id, UpgradeRequest body, HttpContext http, AppDbContext db) =>
        {
            if (!Enum.TryParse<Part>(body.Part, true, out var part))
            {
                throw new BusinessException("Dieses Teil gibt es nicht.", "part");
            }

            return Results.Ok(await GarageLogic.UpgradeAsync(db, await Players.RequireAsync(http, db), id, part));
        });
        api.MapPut("/garage/{id:long}/look", async (long id, LookRequest body, HttpContext http, AppDbContext db) =>
            Results.Ok(await GarageLogic.SetLookAsync(db, await Players.RequireAsync(http, db), id, body.Paint, body.Decal, body.Number)));
        api.MapPut("/garage/select", async (SelectRequest body, HttpContext http, AppDbContext db) =>
            Results.Ok(await GarageLogic.SelectAsync(db, await Players.RequireAsync(http, db), body.Id)));

        // ---- tracks and cups
        api.MapGet("/tracks", async (HttpContext http, AppDbContext db) =>
        {
            var me = await Players.RequireAsync(http, db);
            var best = await RaceLogic.BestLapsAsync(db, me);
            var tracks = await ContentLogic.TracksAsync(db, me);
            return Results.Ok(tracks.Select(t => new { track = t, bestLapMs = best.TryGetValue(t.Id, out var ms) ? ms : (int?)null }));
        });
        api.MapGet("/cups", async (HttpContext http, AppDbContext db) => Results.Ok(await CupLogic.CupsAsync(db, await Players.RequireAsync(http, db))));
        api.MapPost("/cups/{id:long}/enter", async (long id, HttpContext http, AppDbContext db) =>
            Results.Ok(await CupLogic.EnterAsync(db, await Players.RequireAsync(http, db), id)));
        api.MapPost("/cups/runs/{token:guid}/abandon", async (Guid token, HttpContext http, AppDbContext db) =>
        {
            await CupLogic.AbandonAsync(db, await Players.RequireAsync(http, db), token);
            return Results.Ok(new { ok = true });
        });

        // ---- profile and leaderboard
        api.MapGet("/profile", async (HttpContext http, AppDbContext db) => Results.Ok(await PlayerLogic.ProfileAsync(db, await Players.RequireAsync(http, db))));
        api.MapPut("/profile/avatar", async (AvatarRequest body, HttpContext http, AppDbContext db) =>
            Results.Ok(await PlayerLogic.SaveAvatarAsync(db, await Players.RequireAsync(http, db), body.Face, body.Hair, body.Helmet, body.Color, body.Skin)));
        api.MapGet("/leaderboard", async (HttpContext http, AppDbContext db) => Results.Ok(await PlayerLogic.LeaderboardAsync(db, await Players.RequireAsync(http, db))));
        api.MapGet("/history", async (HttpContext http, AppDbContext db) => Results.Ok(await RaceLogic.HistoryAsync(db, await Players.RequireAsync(http, db), 30)));

        // ---- the numbers of the server (portal, monitoring)
        api.MapGet("/info", (TurboToys.Game.RoomRegistry rooms) =>
            Results.Ok(new { game = "turbotoys", version = AppInfo.Version, rooms = rooms.Rooms.Count, racing = rooms.Rooms.Count(r => r.Status == TurboToys.Game.RoomStatus.Racing) }));
    }

    private static async ValueTask<object?> Errors(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        try
        {
            return await next(context);
        }
        catch (BusinessException e)
        {
            var field = string.IsNullOrEmpty(e.Field) ? null : char.ToLower(e.Field[0], CultureInfo.InvariantCulture) + e.Field[1..];
            return Results.BadRequest(new { error = e.Message, field });
        }
        catch (AccessDeniedException e)
        {
            var signedIn = context.HttpContext.User.Identity?.IsAuthenticated == true;
            return Results.Json(new { error = e.Message }, statusCode: signedIn ? 403 : 401);
        }
        catch (BadHttpRequestException)
        {
            return Results.BadRequest(new { error = "Die Anfrage ist unvollständig.", field = (string?)null });
        }
    }
}
