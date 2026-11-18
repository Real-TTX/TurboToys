using System.Text.Json;

namespace TurboToys.Game;

/// <summary>A track layout as the server needs it: its key, name, the length of a lap (the polyline of its control points) and its pickup slots.</summary>
public sealed record LayoutInfo(string Key, string Name, string Theme, double Length, int PickupSlots);

/// <summary>
/// The layouts of data/layouts.json (the browser's file, embedded in this assembly). The server uses them to check lap times
/// (nobody drives a lap faster than <see cref="MinLapMs"/>) and to know how many pickup crates a track has.
/// </summary>
public static class Layouts
{
    private static readonly Lazy<IReadOnlyDictionary<string, LayoutInfo>> All = new(Load);

    public static IReadOnlyCollection<LayoutInfo> List => All.Value.Values.ToList();

    public static IReadOnlyCollection<string> Keys => All.Value.Keys.ToList();

    public static LayoutInfo? Find(string? key) => key is not null && All.Value.TryGetValue(key, out var info) ? info : null;

    public static bool Exists(string? key) => Find(key) is not null;

    /// <summary>The fastest plausible lap (ms) of a layout for a car with that top speed: 80 % of the polyline at 1.6× top speed (turbo all the way).</summary>
    public static int MinLapMs(string layout, double topSpeed)
    {
        var info = Find(layout);
        if (info is null)
        {
            return 3000;
        }

        return (int)(info.Length * 0.8 / Math.Max(10, topSpeed * 1.6) * 1000);
    }

    private static IReadOnlyDictionary<string, LayoutInfo> Load()
    {
        using var stream = typeof(Layouts).Assembly.GetManifestResourceStream("TurboToys.layouts.json")
                           ?? throw new InvalidOperationException("layouts.json is not embedded.");
        using var doc = JsonDocument.Parse(stream);
        var result = new Dictionary<string, LayoutInfo>(StringComparer.Ordinal);
        foreach (var layout in doc.RootElement.GetProperty("layouts").EnumerateArray())
        {
            var key = layout.GetProperty("key").GetString()!;
            var points = layout.GetProperty("points").EnumerateArray()
                .Select(p => (X: p[0].GetDouble(), Z: p[1].GetDouble()))
                .ToList();
            var length = 0.0;
            for (var i = 0; i < points.Count; i++)
            {
                var a = points[i];
                var b = points[(i + 1) % points.Count];
                length += Math.Sqrt(((b.X - a.X) * (b.X - a.X)) + ((b.Z - a.Z) * (b.Z - a.Z)));
            }

            var pickups = layout.TryGetProperty("pickups", out var p) ? p.GetArrayLength() * 3 : 0;
            result[key] = new LayoutInfo(key, layout.GetProperty("name").GetString() ?? key, layout.GetProperty("theme").GetString() ?? key, length, pickups);
        }

        return result;
    }
}
