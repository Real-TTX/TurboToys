using System.Text;
using Microsoft.AspNetCore.Hosting;

namespace TurboToys.Web;

/// <summary>The game's own icon sprite (img/app-icons.svg), inline in its admin pages for <c>&lt;use href="#mat-i-car"&gt;</c>.</summary>
public static class AdminAssets
{
    private static string? _sprite;

    public static string Sprite(IWebHostEnvironment env)
    {
        if (_sprite is not null)
        {
            return _sprite;
        }

        var file = env.WebRootFileProvider.GetFileInfo("turbotoys/img/app-icons.svg");
        if (!file.Exists)
        {
            return string.Empty;
        }

        using var reader = new StreamReader(file.CreateReadStream(), Encoding.UTF8);
        return _sprite = reader.ReadToEnd();
    }
}
