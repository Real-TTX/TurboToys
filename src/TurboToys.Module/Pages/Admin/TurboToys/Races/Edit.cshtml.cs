using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Pages.Admin.Races;

public sealed class EditModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty(SupportsGet = true)]
    public long Id { get; set; }

    public Race? Race { get; private set; }

    public async Task<IActionResult> OnGetAsync()
    {
        Race = await RaceLogic.GetAsync(Db, Me, Id);
        return Race is null ? NotFound() : Page();
    }

    public async Task<IActionResult> OnPostDeleteAsync()
        => await TryAsync(async () =>
        {
            await RaceLogic.DeleteAsync(Db, Me, Id);
            Flash("Das Rennen wurde gelöscht.");
            return RedirectToPage("Index");
        }, async () => Race = await RaceLogic.GetAsync(Db, Me, Id));

    /// <summary>1:23.456</summary>
    public static string Time(int? ms) =>
        ms is null ? "–" : $"{ms.Value / 60000}:{(ms.Value / 1000 % 60).ToString("00", CultureInfo.InvariantCulture)}.{(ms.Value % 1000).ToString("000", CultureInfo.InvariantCulture)}";
}
