using Microsoft.AspNetCore.Mvc;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Pages.Admin.Players;

public sealed class EditModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty(SupportsGet = true)]
    public long Id { get; set; }

    [BindProperty(SupportsGet = true)]
    public string Tab { get; set; } = "progress";

    [BindProperty]
    public int Money { get; set; }

    [BindProperty]
    public int Xp { get; set; }

    public PlayerLogic.PlayerDetail? Detail { get; private set; }

    public async Task<IActionResult> OnGetAsync()
    {
        Detail = await PlayerLogic.DetailAsync(Db, Me, Id);
        if (Detail is null)
        {
            return NotFound();
        }

        Money = Detail.Player.Money;
        Xp = Detail.Player.Xp;
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            await PlayerLogic.SaveAsync(Db, Me, Id, Money, Xp);
            Flash("Gespeichert.");
            return RedirectToPage(new { id = Id });
        }, ReloadAsync);

    public async Task<IActionResult> OnPostRemoveCarAsync(long car)
        => await TryAsync(async () =>
        {
            await GarageLogic.RemoveAsync(Db, Me, car);
            Flash("Das Auto wurde aus der Garage genommen.");
            return RedirectToPage(new { id = Id, tab = "garage" });
        }, ReloadAsync);

    public async Task<IActionResult> OnPostDeleteAsync()
        => await TryAsync(async () =>
        {
            await PlayerLogic.DeleteAsync(Db, Me, Id);
            Flash("Der Spieler wurde aus TurboToys entfernt.");
            return RedirectToPage("Index");
        }, ReloadAsync);

    private async Task ReloadAsync() => Detail = await PlayerLogic.DetailAsync(Db, Me, Id);
}
