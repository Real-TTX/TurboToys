using System.Text.Json;
using TurboToys.Business;
using TurboToys.Data;
using TurboToys.Game;

namespace TurboToys.Tests;

/// <summary>The layouts of the server: reading the browser's layouts and the players' designs (track editor), and what a design may be.</summary>
public sealed class LayoutTests
{
    /// <summary>
    /// A square of side <paramref name="size"/> with 8 points (a lap of 4 × size), 2 crate rows, a looping of radius 10 and – optionally – a straight shortcut
    /// through the middle from the middle of the first side (fraction 0.125) to the middle of the opposite side (0.625), with one crate row.
    /// </summary>
    internal static object Square(double size = 200, string theme = "kidsroom", bool shortcut = true, bool loop = true)
    {
        var h = size / 2;
        return new
        {
            key = "draft",
            name = "Entwurf",
            theme,
            width = 18,
            points = new[]
            {
                new[] { 0.0, 0 }, [h, 0], [size, 0], [size, h], [size, size], [h, size], [0, size], [0, h, 2, 16],
            },
            jumps = new[] { new { at = 0.3, height = 4, length = 20 } },
            boosts = new[] { new { at = 0.5, side = 0 } },
            pickups = new[] { new { at = 0.2 }, new { at = 0.7 } },
            loops = loop ? new[] { new { at = 0.9, radius = 10 } } : [],
            branches = shortcut ? new[] { new { from = 0.125, to = 0.625, points = new[] { new[] { h, h } }, pickups = new[] { new { at = 0.5 } }, surface = "water" } } : [],
            pieces = new[] { new { kind = "straight", length = 4 } },
        };
    }

    internal static JsonElement Element(object value) => JsonSerializer.SerializeToElement(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    [Fact]
    public void A_design_is_read_like_a_layout_with_loops_shortcuts_and_crates()
    {
        var info = Layouts.Parse(Element(Square()));
        var loop = 2 * Math.PI * 10;
        Assert.Equal(800 + loop, info.Length, 6);
        // the shortcut saves half the lap (400) minus its own way (2 × 100)
        Assert.Equal(800 + loop - 200, info.Shortest, 6);
        // 2 rows on the lap and 1 on the shortcut, 3 crates each
        Assert.Equal(9, info.PickupSlots);
        Assert.Equal("kidsroom", info.Theme);
        Assert.Equal("draft", info.Key);
    }

    [Fact]
    public void A_shortcut_across_the_start_line_and_one_longer_than_the_lap_are_counted_right()
    {
        // from 0.875 (0, 100) over the start to 0.125 (100, 0): the lap between is 200, the shortcut a diagonal of about 141
        var design = Element(new
        {
            theme = "garden",
            points = new[] { new[] { 0, 0 }, new[] { 100, 0 }, new[] { 200, 0 }, new[] { 200, 100 }, new[] { 200, 200 }, new[] { 100, 200 }, new[] { 0, 200 }, new[] { 0, 100 } },
            branches = new object[]
            {
                new { from = 0.875, to = 0.125, points = new[] { new[] { 50, 50 } } },
                // a detour is never a shortcut
                new { from = 0.25, to = 0.375, points = new[] { new[] { 600, -400 } } },
            },
        });
        var info = Layouts.Parse(design);
        Assert.Equal(800, info.Length, 6);
        Assert.Equal(800 - (200 - (2 * Math.Sqrt(5000))), info.Shortest, 6);
        Assert.Equal(0, info.PickupSlots);
    }

    [Fact]
    public void The_lap_check_uses_the_shortest_way()
    {
        var withShortcut = Layouts.Parse(Element(Square()));
        var without = Layouts.Parse(Element(Square(shortcut: false)));
        Assert.True(Layouts.MinLapMs(withShortcut, 60) < Layouts.MinLapMs(without, 60));
        Assert.Equal(3000, Layouts.MinLapMs((LayoutInfo?)null, 60));
    }

    [Fact]
    public void A_good_design_is_accepted()
    {
        Assert.True(Layouts.Validate(Element(Square()), out var error), error);
    }

    [Theory]
    [InlineData(100, "kidsroom", "zu kurz")]
    [InlineData(200, "moon", "Welt")]
    [InlineData(200, "test", "Welt")]
    public void A_bad_design_is_refused(double size, string theme, string expected)
    {
        Assert.False(Layouts.Validate(Element(Square(size, theme, shortcut: false, loop: false)), out var error));
        Assert.Contains(expected, error);
    }

    [Fact]
    public void A_shortcut_may_not_make_the_lap_tiny()
    {
        // a lap of 480 whose shortcut saves 120: 360 left
        Assert.False(Layouts.Validate(Element(Square(120, shortcut: true, loop: false)), out var error));
        Assert.Contains("zu kurz", error);
    }

    [Fact]
    public void Broken_designs_are_refused()
    {
        string? error;
        Assert.False(Layouts.Validate(Element(new[] { 1, 2 }), out error));
        Assert.False(Layouts.Validate(Element(new { theme = "garden", points = new[] { new[] { 0, 0 }, new[] { 100, 0 } } }), out error));
        Assert.Contains("Punkte", error);
        Assert.False(Layouts.Validate(Element(new
        {
            theme = "garden",
            points = Enumerable.Range(0, 8).Select(i => new[] { i * 100.0, i % 2 == 0 ? 0 : 5000 }).ToArray(),
        }), out error));
        Assert.Contains("3000", error);
        Assert.False(Layouts.Validate(Element(new
        {
            theme = "garden",
            points = Enumerable.Range(0, 16).Select(i => new[] { 200 * Math.Cos(i * Math.PI / 8), 200 * Math.Sin(i * Math.PI / 8) }).ToArray(),
            loops = Enumerable.Range(0, 7).Select(i => new { at = i / 10.0, radius = 10 }).ToArray(),
        }), out error));
        Assert.Contains("Loopings", error);
        Assert.False(Layouts.Validate(Element(new
        {
            theme = "garden",
            points = Enumerable.Range(0, 16).Select(i => new[] { 200 * Math.Cos(i * Math.PI / 8), 200 * Math.Sin(i * Math.PI / 8) }).ToArray(),
            pickups = new[] { new { at = 1.5 } },
        }), out error));
        Assert.Contains("(0)", error);
        Assert.False(Layouts.Validate(JsonDocument.Parse("{\"theme\":\"garden\",\"points\":[],\"pad\":\"" + new string('x', 70_000) + "\"}").RootElement, out error));
        Assert.Contains("64 KB", error);
    }

    [Fact]
    public void The_track_of_a_room_uses_its_design()
    {
        var track = new Track { Id = 42, Layout = "garden", Name = "Meine Piste", Laps = 2, OwnerId = 7 };
        DesignRules.Apply(track, new DesignInput(null, "Meine Piste", "garden", "Night", 2, Element(Square())), 0);
        var reference = Views.TrackRef(track);
        Assert.Equal("garden", reference.Layout);
        Assert.Equal("custom-42", reference.Design!.Value.GetProperty("key").GetString());
        Assert.Equal("Meine Piste", reference.Design.Value.GetProperty("name").GetString());
        Assert.Equal("garden", reference.Design.Value.GetProperty("theme").GetString());
        // the editor's own data stays
        Assert.Equal(1, reference.Design.Value.GetProperty("pieces").GetArrayLength());
        Assert.Equal(9, Layouts.Info(reference)!.PickupSlots);
        Assert.Equal(Layouts.Find("garden"), Layouts.Info(reference with { Design = null }));
        Assert.True(Views.Track(track, 1).Custom);
    }

    [Fact]
    public void Only_the_builder_races_on_a_track_until_it_is_released()
    {
        var track = new Track { Id = 5, Layout = "kitchen", OwnerId = 7, Design = "{}" };
        var builder = new Actor(7, "Bauer", false);
        var other = new Actor(8, "Andere", false);
        var admin = new Actor(9, "Chefin", true);
        Assert.True(DesignRules.CanRace(track, builder));
        Assert.False(DesignRules.CanRace(track, other));
        Assert.True(DesignRules.CanRace(track, admin));
        Assert.False(DesignRules.CanSeeDesign(track, other));
        track.OwnerId = null;
        Assert.True(DesignRules.CanRace(track, other));
        Assert.True(DesignRules.CanSeeDesign(track, other));
    }

    [Fact]
    public void The_editor_input_is_checked()
    {
        var design = Element(Square());
        Assert.Equal("name", Assert.Throws<BusinessException>(() => DesignRules.Apply(new Track(), new DesignInput(null, " ", "garden", "Day", 3, design), 0)).Field);
        Assert.Equal("laps", Assert.Throws<BusinessException>(() => DesignRules.Apply(new Track(), new DesignInput(null, "A", "garden", "Day", 12, design), 0)).Field);
        Assert.Equal("timeOfDay", Assert.Throws<BusinessException>(() => DesignRules.Apply(new Track(), new DesignInput(null, "A", "garden", "Noon", 3, design), 0)).Field);
        Assert.Equal("theme", Assert.Throws<BusinessException>(() => DesignRules.Apply(new Track(), new DesignInput(null, "A", "moon", "Day", 3, design), 0)).Field);
        Assert.Equal("design", Assert.Throws<BusinessException>(() => DesignRules.Apply(new Track(), new DesignInput(null, "A", "garden", "Day", 3, null), 0)).Field);
        Assert.Throws<BusinessException>(() => DesignRules.Apply(new Track(), new DesignInput(null, "A", "garden", "Day", 3, design), DesignRules.MaxPerPlayer));
        // a change of an own track is no new one
        DesignRules.Apply(new Track { Id = 3 }, new DesignInput(3, "A", "garden", "Day", 3, design), DesignRules.MaxPerPlayer);
    }
}
