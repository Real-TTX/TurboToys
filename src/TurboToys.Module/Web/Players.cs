using System.Security.Claims;
using TurboToys.Business;
using TurboToys.Data;
using MatGame.Sdk;

namespace TurboToys.Web;

/// <summary>From the account MatGame signed in to the <see cref="Actor"/> of the business layer (the player id is the account id).</summary>
public static class Players
{
    public static Actor? ActorOf(ClaimsPrincipal user)
        => user.ToAccount() is { } account ? new Actor(account.Id, account.Name, account.IsAdmin) : null;

    public static bool IsGuest(ClaimsPrincipal user) => user.ToAccount()?.IsGuest ?? false;

    /// <summary>The actor of a request whose player row exists (created at the first visit); throws when nobody is signed in or the player was removed.</summary>
    public static async Task<Actor> RequireAsync(HttpContext http, AppDbContext db)
    {
        if (http.Items[typeof(Players)] is Actor known)
        {
            return known;
        }

        var actor = ActorOf(http.User) ?? throw new AccessDeniedException("Bitte zuerst anmelden.");
        _ = await PlayerLogic.EnsureAsync(db, actor, IsGuest(http.User)) ?? throw new AccessDeniedException("Dein Spieler wurde aus TurboToys entfernt.");
        http.Items[typeof(Players)] = actor;
        return actor;
    }
}
