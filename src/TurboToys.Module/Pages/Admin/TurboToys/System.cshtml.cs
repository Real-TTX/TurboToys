using Microsoft.AspNetCore.Mvc;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Pages.Admin;

public sealed class SystemModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty]
    public int MaxPlayers { get; set; } = 8;

    [BindProperty]
    public int StartMoney { get; set; } = Economy.StartMoney;

    [BindProperty]
    public bool GuestsCreateRooms { get; set; } = true;

    [BindProperty]
    public string? Announcement { get; set; }

    public async Task OnGetAsync()
    {
        var s = await SettingLogic.GetAsync(Db);
        MaxPlayers = s.MaxPlayers;
        StartMoney = s.StartMoney;
        GuestsCreateRooms = s.GuestsCreateRooms;
        Announcement = s.Announcement;
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            await SettingLogic.SaveAsync(Db, Me, new GameSettings(Announcement ?? string.Empty, MaxPlayers, GuestsCreateRooms, StartMoney));
            Flash("Gespeichert.");
            return RedirectToPage();
        });
}
