using MatGame.Sdk.Controls;
using Microsoft.AspNetCore.Mvc;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Pages.Admin.Tracks;

public sealed class EditModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty(SupportsGet = true)]
    public long Id { get; set; }

    [BindProperty]
    public string Name { get; set; } = string.Empty;

    [BindProperty]
    public string? Description { get; set; }

    [BindProperty]
    public string Layout { get; set; } = "kidsroom";

    [BindProperty]
    public TimeOfDay TimeOfDay { get; set; }

    [BindProperty]
    public int Laps { get; set; } = 3;

    [BindProperty]
    public int UnlockLevel { get; set; } = 1;

    [BindProperty]
    public int SortOrder { get; set; } = 100;

    [BindProperty]
    public bool IsEnabled { get; set; } = true;

    public bool IsNew => Id == 0;

    public IReadOnlyList<Choice> Layouts { get; } = Game.Layouts.List.Select(l => new Choice(l.Key, l.Name)).ToList();

    public IReadOnlyList<Choice> Times { get; } =
    [
        new(nameof(TimeOfDay.Day), "Tag", "hell, Sonne"),
        new(nameof(TimeOfDay.Dusk), "Abend", "warmes Licht, lange Schatten"),
        new(nameof(TimeOfDay.Night), "Nacht", "dunkel, Scheinwerfer an"),
    ];

    public async Task<IActionResult> OnGetAsync()
    {
        if (IsNew)
        {
            return Page();
        }

        var track = await ContentLogic.GetTrackAsync(Db, Me, Id);
        if (track is null)
        {
            return NotFound();
        }

        Name = track.Name;
        Description = track.Description;
        Layout = track.Layout;
        TimeOfDay = track.TimeOfDay;
        Laps = track.Laps;
        UnlockLevel = track.UnlockLevel;
        SortOrder = track.SortOrder;
        IsEnabled = track.IsEnabled;
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            var id = await ContentLogic.SaveTrackAsync(Db, Me, new TrackInput(Id, Layout, Name, Description ?? string.Empty, Laps, TimeOfDay, UnlockLevel, SortOrder, IsEnabled));
            Flash(IsNew ? "Die Strecke wurde angelegt." : "Gespeichert.");
            return RedirectToPage(new { id });
        });

    public async Task<IActionResult> OnPostDeleteAsync()
        => await TryAsync(async () =>
        {
            await ContentLogic.DeleteTrackAsync(Db, Me, Id);
            Flash("Die Strecke wurde gelöscht.");
            return RedirectToPage("Index");
        });
}
