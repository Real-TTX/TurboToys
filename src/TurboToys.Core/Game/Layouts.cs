using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace TurboToys.Game;

/// <summary>
/// A track layout as the server needs it: its key, name and world, the length of a lap (the polyline of its control points plus its loopings), the shortest
/// way round (taking every shortcut) and its pickup slots (3 per crate row: the main lap's rows first, then each branch's rows – the browser's order).
/// </summary>
public sealed record LayoutInfo(string Key, string Name, string Theme, double Length, double Shortest, int PickupSlots);

/// <summary>
/// The layouts of data/layouts.json (the browser's file, embedded in this assembly) and the designs of the players' own tracks (the same JSON object). The server
/// uses them to check lap times (nobody drives a lap faster than <see cref="MinLapMs(LayoutInfo?, double)"/>) and to know how many pickup crates a track has.
/// A layout: <c>{ key, name, theme, width, points: [[x, z, y?, width?] …] (closed centre line), jumps: [{ at, height, length }], boosts: [{ at, side }],
/// pickups: [{ at }] (a row of 3 crates each), loops: [{ at, radius }], tunnels: [{ at, length, style }], branches: [{ from, to, points, pickups?, boosts?, jumps?,
/// tunnels?, surface?, width? }] }</c>; <c>at</c>, <c>from</c> and <c>to</c> are fractions 0 … 1 of the lap (docs/PROTOCOL.md).
/// </summary>
public static class Layouts
{
    /// <summary>The biggest design a player may save (the JSON as sent).</summary>
    public const int MaxDesignBytes = 64 * 1024;

    /// <summary>The shortest lap of a design (units, 1 unit = 10 cm): no tiny money-farming ovals.</summary>
    public const double MinDesignLength = 450;

    public const int MinPoints = 8;
    public const int MaxPoints = 800;
    public const int MaxBranchPoints = 200;
    public const double MaxCoordinate = 3000;
    public const double MaxHeight = 80;
    public const double MinWidth = 10;
    public const double MaxWidth = 30;
    public const int MaxLoops = 6;
    public const double MinLoopRadius = 8;
    public const double MaxLoopRadius = 20;
    public const int MaxTunnels = 8;
    public const int MaxJumps = 10;
    public const int MaxBoosts = 10;
    public const int MaxPickupRows = 10;
    public const int MaxBranches = 4;

    private static readonly Lazy<IReadOnlyDictionary<string, LayoutInfo>> All = new(Load);

    /// <summary>The worlds a player's track may stand in (each is also the key of an official layout: thumbnails, filters and history use it).</summary>
    public static IReadOnlyList<string> Themes { get; } = ["kidsroom", "garden", "kitchen", "workshop", "supermarket", "attic"];

    public static IReadOnlyCollection<LayoutInfo> List => All.Value.Values.ToList();

    public static IReadOnlyCollection<string> Keys => All.Value.Keys.ToList();

    public static LayoutInfo? Find(string? key) => key is not null && All.Value.TryGetValue(key, out var info) ? info : null;

    public static bool Exists(string? key) => Find(key) is not null;

    /// <summary>The layout of a room's track: its design when it is a player's track, else the layout of data/layouts.json.</summary>
    public static LayoutInfo? Info(TrackRef track) => track.Design is { } design ? Parse(design) : Find(track.Layout);

    /// <summary>The fastest plausible lap (ms) of a layout for a car with that top speed: 80 % of the shortest way round at 1.6× top speed (turbo all the way).</summary>
    public static int MinLapMs(LayoutInfo? info, double topSpeed)
    {
        if (info is null)
        {
            return 3000;
        }

        return (int)(info.Shortest * 0.8 / Math.Max(10, topSpeed * 1.6) * 1000);
    }

    /// <summary>The fastest plausible lap (ms) of a layout of data/layouts.json.</summary>
    public static int MinLapMs(string layout, double topSpeed) => MinLapMs(Find(layout), topSpeed);

    /// <summary>Reads a layout (an entry of layouts.json or a player's design). The design must be valid (<see cref="Validate"/>).</summary>
    public static LayoutInfo Parse(JsonElement layout)
    {
        var key = Text(layout, "key") ?? "custom";
        var main = Points(layout.GetProperty("points"));
        var lap = Polyline(main, closed: true);
        var length = lap + Items(layout, "loops").Sum(l => 2 * Math.PI * Number(l, "radius"));
        var saved = 0.0;
        var rows = Items(layout, "pickups").Count;
        foreach (var branch in Items(layout, "branches"))
        {
            var from = Number(branch, "from");
            var to = Number(branch, "to");
            var stretch = Wrap(to - from) * lap;
            var path = new List<(double X, double Z)> { PointAt(main, lap, from) };
            if (branch.TryGetProperty("points", out var points))
            {
                path.AddRange(Points(points));
            }

            path.Add(PointAt(main, lap, to));
            saved += Math.Max(0, stretch - Polyline(path, closed: false));
            rows += Items(branch, "pickups").Count;
        }

        return new LayoutInfo(key, Text(layout, "name") ?? key, Text(layout, "theme") ?? key, length, Math.Max(0, length - saved), rows * 3);
    }

    /// <summary>
    /// Checks a player's design (the track editor's JSON object): its size, the numbers, the world, the points, the loopings, tunnels, jumps, boost arrows,
    /// crate rows and shortcuts, and that a lap is long enough. The error is a sentence for the player.
    /// </summary>
    public static bool Validate(JsonElement design, out string? error)
    {
        error = Check(design);
        return error is null;
    }

    /// <summary>The design as it goes to the browsers: the same object with the key, the name and the world of its track.</summary>
    public static JsonElement Stamp(string design, string key, string name, string theme)
    {
        var node = JsonNode.Parse(design) as JsonObject ?? [];
        node["key"] = key;
        node["name"] = name;
        node["theme"] = theme;
        return JsonSerializer.SerializeToElement(node);
    }

    private static string? Check(JsonElement design)
    {
        if (design.ValueKind != JsonValueKind.Object)
        {
            return "Der Streckenplan fehlt.";
        }

        if (Encoding.UTF8.GetByteCount(design.GetRawText()) > MaxDesignBytes)
        {
            return "Der Streckenplan ist zu groß (höchstens 64 KB).";
        }

        if (!AllFinite(design))
        {
            return "Der Streckenplan enthält ungültige Zahlen.";
        }

        if (Text(design, "theme") is not { } theme || !Themes.Contains(theme))
        {
            return "Diese Welt gibt es nicht.";
        }

        if (!WidthOk(design))
        {
            return $"Die Straße ist {MinWidth:0} bis {MaxWidth:0} breit.";
        }

        if (!design.TryGetProperty("points", out var points) || points.ValueKind != JsonValueKind.Array || points.GetArrayLength() is < MinPoints or > MaxPoints)
        {
            return $"Eine Strecke hat {MinPoints} bis {MaxPoints} Punkte.";
        }

        if (CheckPoints(points) is { } pointError)
        {
            return pointError;
        }

        if (!TryItems(design, "loops", out var loops) || !TryItems(design, "tunnels", out var tunnels) || !TryItems(design, "jumps", out var jumps)
            || !TryItems(design, "boosts", out var boosts) || !TryItems(design, "pickups", out var pickups) || !TryItems(design, "branches", out var branches))
        {
            return "Der Streckenplan ist unvollständig.";
        }

        if (loops.Count > MaxLoops)
        {
            return $"Höchstens {MaxLoops} Loopings.";
        }

        if (loops.Any(l => !FractionOk(l, "at") || Number(l, "radius") is < MinLoopRadius or > MaxLoopRadius))
        {
            return $"Ein Looping hat einen Radius von {MinLoopRadius:0} bis {MaxLoopRadius:0}.";
        }

        if (branches.Count > MaxBranches)
        {
            return $"Höchstens {MaxBranches} Abkürzungen.";
        }

        foreach (var branch in branches)
        {
            if (!FractionOk(branch, "from") || !FractionOk(branch, "to"))
            {
                return "Eine Abkürzung beginnt und endet auf der Strecke (0 … 1).";
            }

            if (!branch.TryGetProperty("points", out var path) || path.ValueKind != JsonValueKind.Array || path.GetArrayLength() is < 1 or > MaxBranchPoints)
            {
                return $"Eine Abkürzung hat 1 bis {MaxBranchPoints} Punkte.";
            }

            if (CheckPoints(path) is { } branchError)
            {
                return branchError;
            }

            if (!WidthOk(branch))
            {
                return $"Die Straße ist {MinWidth:0} bis {MaxWidth:0} breit.";
            }

            if (Text(branch, "surface") is { } surface && surface is not ("road" or "water"))
            {
                return "Eine Abkürzung ist Straße oder Wasser.";
            }

            if (!TryItems(branch, "tunnels", out var t) || !TryItems(branch, "jumps", out var j) || !TryItems(branch, "boosts", out var b) || !TryItems(branch, "pickups", out var p))
            {
                return "Der Streckenplan ist unvollständig.";
            }

            tunnels.AddRange(t);
            jumps.AddRange(j);
            boosts.AddRange(b);
            pickups.AddRange(p);
        }

        if (tunnels.Count > MaxTunnels)
        {
            return $"Höchstens {MaxTunnels} Tunnel.";
        }

        if (jumps.Count > MaxJumps)
        {
            return $"Höchstens {MaxJumps} Sprungschanzen.";
        }

        if (boosts.Count > MaxBoosts)
        {
            return $"Höchstens {MaxBoosts} Turbo-Pfeile.";
        }

        if (pickups.Count > MaxPickupRows)
        {
            return $"Höchstens {MaxPickupRows} Kistenreihen.";
        }

        if (tunnels.Concat(jumps).Concat(boosts).Concat(pickups).Any(item => !FractionOk(item, "at")))
        {
            return "Alles auf der Strecke liegt zwischen Start (0) und Ziel (1).";
        }

        var info = Parse(design);
        if (info.Length < MinDesignLength || info.Shortest < MinDesignLength)
        {
            return $"Die Runde ist zu kurz ({Math.Min(info.Length, info.Shortest) / 10:0} m) – mindestens {MinDesignLength / 10:0} m, auch über die Abkürzungen.";
        }

        return null;
    }

    private static string? CheckPoints(JsonElement points)
    {
        foreach (var p in points.EnumerateArray())
        {
            if (p.ValueKind != JsonValueKind.Array || p.GetArrayLength() is < 2 or > 4
                || p.EnumerateArray().Select((v, i) => (v, i)).Any(x => x.v.ValueKind != JsonValueKind.Number && !(x.i >= 2 && x.v.ValueKind == JsonValueKind.Null)))
            {
                return "Ein Punkt der Strecke ist [x, z, Höhe?, Breite?].";
            }

            if (Math.Abs(p[0].GetDouble()) > MaxCoordinate || Math.Abs(p[1].GetDouble()) > MaxCoordinate)
            {
                return $"Die Strecke liegt innerhalb von ±{MaxCoordinate:0}.";
            }

            if (p.GetArrayLength() > 2 && p[2].ValueKind == JsonValueKind.Number && p[2].GetDouble() is < 0 or > MaxHeight)
            {
                return $"Die Strecke liegt 0 bis {MaxHeight:0} hoch.";
            }

            if (p.GetArrayLength() > 3 && p[3].ValueKind == JsonValueKind.Number && p[3].GetDouble() is < MinWidth or > MaxWidth)
            {
                return $"Die Straße ist {MinWidth:0} bis {MaxWidth:0} breit.";
            }
        }

        return null;
    }

    private static bool AllFinite(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.Number => element.TryGetDouble(out var value) && double.IsFinite(value),
        JsonValueKind.Object => element.EnumerateObject().All(p => AllFinite(p.Value)),
        JsonValueKind.Array => element.EnumerateArray().All(AllFinite),
        _ => true,
    };

    private static bool WidthOk(JsonElement owner) =>
        !owner.TryGetProperty("width", out var width) || width.ValueKind == JsonValueKind.Null
        || (width.ValueKind == JsonValueKind.Number && width.GetDouble() is >= MinWidth and <= MaxWidth);

    private static bool FractionOk(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.GetDouble() is >= 0 and <= 1;

    /// <summary>The objects of an optional list (missing or null = none); false when it is something else.</summary>
    private static bool TryItems(JsonElement owner, string name, out List<JsonElement> items)
    {
        items = [];
        if (!owner.TryGetProperty(name, out var list) || list.ValueKind == JsonValueKind.Null)
        {
            return true;
        }

        if (list.ValueKind != JsonValueKind.Array || list.EnumerateArray().Any(i => i.ValueKind != JsonValueKind.Object))
        {
            return false;
        }

        items = list.EnumerateArray().ToList();
        return true;
    }

    private static List<JsonElement> Items(JsonElement owner, string name) => TryItems(owner, name, out var items) ? items : [];

    private static string? Text(JsonElement owner, string name) =>
        owner.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static double Number(JsonElement owner, string name) =>
        owner.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number ? value.GetDouble() : 0;

    private static List<(double X, double Z)> Points(JsonElement points) =>
        points.EnumerateArray().Select(p => (p[0].GetDouble(), p[1].GetDouble())).ToList();

    private static double Polyline(IReadOnlyList<(double X, double Z)> points, bool closed)
    {
        var length = 0.0;
        var count = closed ? points.Count : points.Count - 1;
        for (var i = 0; i < count; i++)
        {
            length += Distance(points[i], points[(i + 1) % points.Count]);
        }

        return length;
    }

    /// <summary>The point at a fraction of the closed polyline (by its length).</summary>
    private static (double X, double Z) PointAt(IReadOnlyList<(double X, double Z)> points, double lap, double fraction)
    {
        var left = Wrap(fraction) * lap;
        for (var i = 0; i < points.Count; i++)
        {
            var a = points[i];
            var b = points[(i + 1) % points.Count];
            var segment = Distance(a, b);
            if (left <= segment && segment > 0)
            {
                var t = left / segment;
                return (a.X + ((b.X - a.X) * t), a.Z + ((b.Z - a.Z) * t));
            }

            left -= segment;
        }

        return points[0];
    }

    private static double Distance((double X, double Z) a, (double X, double Z) b) =>
        Math.Sqrt(((b.X - a.X) * (b.X - a.X)) + ((b.Z - a.Z) * (b.Z - a.Z)));

    /// <summary>A fraction of the lap into 0 … 1 (a branch from 0.9 to 0.1 runs over the start line).</summary>
    private static double Wrap(double fraction) => ((fraction % 1) + 1) % 1;

    private static IReadOnlyDictionary<string, LayoutInfo> Load()
    {
        using var stream = typeof(Layouts).Assembly.GetManifestResourceStream("TurboToys.layouts.json")
                           ?? throw new InvalidOperationException("layouts.json is not embedded.");
        using var doc = JsonDocument.Parse(stream);
        var result = new Dictionary<string, LayoutInfo>(StringComparer.Ordinal);
        foreach (var layout in doc.RootElement.GetProperty("layouts").EnumerateArray())
        {
            var info = Parse(layout);
            result[info.Key] = info;
        }

        return result;
    }
}
