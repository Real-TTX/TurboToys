using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Routing;

namespace TurboToys.Web;

/// <summary>
/// The player app: one static page (<c>wwwroot/index.html</c>, the same file the app shell loads from its own files) for <c>/turbotoys/</c>
/// (invitations: <c>/turbotoys/?raum=ABCD</c>). On the master the page gets the version of the plugin in its meta tag <c>matgame-version</c> (the app shell names its own).
/// Everything else (scripts, styles, pictures) is a static web asset of the plugin under <c>/turbotoys/</c>.
/// </summary>
public static class PlayerApp
{
    private const string VersionPlaceholder = "<meta name=\"matgame-version\" content=\"\" />";

    public static void Map(IEndpointRouteBuilder game, string basePath)
    {
        game.MapGet("/", (HttpContext http, IWebHostEnvironment env) => Serve(http, env, basePath)).AllowAnonymous();
    }

    private static IResult Serve(HttpContext http, IWebHostEnvironment env, string basePath)
    {
        // the page uses addresses relative to <base href="/turbotoys/">: "/turbotoys" alone becomes "/turbotoys/"
        var path = http.Request.Path.Value ?? string.Empty;
        if (path.Equals(basePath, StringComparison.OrdinalIgnoreCase))
        {
            return Results.Redirect(basePath + "/" + http.Request.QueryString);
        }

        var file = env.WebRootFileProvider.GetFileInfo(basePath.TrimStart('/') + "/index.html");
        if (!file.Exists)
        {
            return Results.NotFound("TurboToys: index.html fehlt.");
        }

        using var reader = new StreamReader(file.CreateReadStream(), Encoding.UTF8);
        var html = reader.ReadToEnd().Replace(VersionPlaceholder, $"<meta name=\"matgame-version\" content=\"{System.Net.WebUtility.HtmlEncode(AppInfo.Version)}\" />",
            StringComparison.Ordinal);
        http.Response.Headers.CacheControl = "no-cache";
        return Results.Content(html, "text/html; charset=utf-8");
    }
}
