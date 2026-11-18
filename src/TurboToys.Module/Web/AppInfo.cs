using System.Reflection;

namespace TurboToys.Web;

/// <summary>The version of the plugin (release 0.1.42-20261117, nightly-42-20261117 or local-20261117; see Directory.Build.props).</summary>
public static class AppInfo
{
    public static readonly string Version =
        typeof(AppInfo).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "local";

    public static readonly DateTime Started = DateTime.UtcNow;
}
