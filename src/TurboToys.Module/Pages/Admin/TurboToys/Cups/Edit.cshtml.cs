using System.Globalization;
using MatGame.Sdk.Controls;
using Microsoft.AspNetCore.Mvc;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Pages.Admin.Cups;

public sealed class EditModel(AppDbContext db) : AppPageModel(db)
{
    /// <summary>How many races a cup can have.</summary>
    public const int Slots = 8;

    [BindProperty(SupportsGet = true)]
    public long Id { get; set; }

    [BindProperty]
    public string Name { get; set; } = string.Empty;

    [BindProperty]
    public string? Description { get; set; }

    [BindProperty]
    public long? Track1 { get; set; }

    [BindProperty]
    public long? Track2 { get; set; }

    [BindProperty]
    public long? Track3 { get; set; }

    [BindProperty]
    public long? Track4 { get; set; }

    [BindProperty]
    public long? Track5 { get; set; }

    [BindProperty]
    public long? Track6 { get; set; }

    [BindProperty]
    public long? Track7 { get; set; }

    [BindProperty]
    public long? Track8 { get; set; }

    [BindProperty]
    public int Laps { get; set; } = 3;

    [BindProperty]
    public int EntryFee { get; set; }

    [BindProperty]
    public int Prize { get; set; } = 2000;

    [BindProperty]
    public int Opponents { get; set; } = 5;

    [BindProperty]
    public int BotSkill { get; set; } = 2;

    [BindProperty]
    public int UnlockLevel { get; set; } = 1;

    [BindProperty]
    public int SortOrder { get; set; } = 100;

    [BindProperty]
    public bool IsEnabled { get; set; } = true;

    public bool IsNew => Id == 0;

    public IReadOnlyList<Choice> TrackChoices { get; private set; } = [];

    private long?[] Tracks => [Track1, Track2, Track3, Track4, Track5, Track6, Track7, Track8];

    public string TrackAt(int index) => Tracks[index]?.ToString(CultureInfo.InvariantCulture) ?? string.Empty;

    public async Task<IActionResult> OnGetAsync()
    {
        await LoadChoicesAsync();
        if (IsNew)
        {
            return Page();
        }

        var cup = await ContentLogic.GetCupAsync(Db, Me, Id);
        if (cup is null)
        {
            return NotFound();
        }

        Name = cup.Name;
        Description = cup.Description;
        var ids = cup.TrackIdList();
        long? At(int i) => i < ids.Count ? ids[i] : null;
        (Track1, Track2, Track3, Track4, Track5, Track6, Track7, Track8) = (At(0), At(1), At(2), At(3), At(4), At(5), At(6), At(7));
        Laps = cup.Laps;
        EntryFee = cup.EntryFee;
        Prize = cup.Prize;
        Opponents = cup.Opponents;
        BotSkill = cup.BotSkill;
        UnlockLevel = cup.UnlockLevel;
        SortOrder = cup.SortOrder;
        IsEnabled = cup.IsEnabled;
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            var ids = Tracks.Where(t => t is > 0).Select(t => t!.Value).ToList();
            var id = await ContentLogic.SaveCupAsync(Db, Me, new CupInput(Id, Name, Description ?? string.Empty, ids, Laps, EntryFee, Prize, Opponents, BotSkill, UnlockLevel, SortOrder,
                IsEnabled));
            Flash(IsNew ? "Der Pokal wurde angelegt." : "Gespeichert.");
            return RedirectToPage(new { id });
        }, LoadChoicesAsync);

    public async Task<IActionResult> OnPostDeleteAsync()
        => await TryAsync(async () =>
        {
            await ContentLogic.DeleteCupAsync(Db, Me, Id);
            Flash("Der Pokal wurde gelöscht.");
            return RedirectToPage("Index");
        }, LoadChoicesAsync);

    private async Task LoadChoicesAsync()
    {
        var tracks = await ContentLogic.AllTracksAsync(Db, Me);
        TrackChoices = [new Choice(string.Empty, "–"), .. tracks.Select(t => new Choice(t.Id.ToString(CultureInfo.InvariantCulture), $"{t.Name} ({ContentLogic.TimeName(t.TimeOfDay)})"))];
    }
}
