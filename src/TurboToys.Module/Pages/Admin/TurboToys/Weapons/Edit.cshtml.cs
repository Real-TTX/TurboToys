using MatGame.Sdk.Controls;
using Microsoft.AspNetCore.Mvc;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Pages.Admin.Weapons;

public sealed class EditModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty(SupportsGet = true)]
    public long Id { get; set; }

    [BindProperty]
    public string Name { get; set; } = string.Empty;

    [BindProperty]
    public string? Description { get; set; }

    [BindProperty]
    public WeaponKind Kind { get; set; } = WeaponKind.Rocket;

    [BindProperty]
    public int Damage { get; set; } = 30;

    [BindProperty]
    public int Amount { get; set; } = 1;

    [BindProperty]
    public int CooldownMs { get; set; } = 600;

    [BindProperty]
    public int CrateWeight { get; set; } = 20;

    [BindProperty]
    public int SortOrder { get; set; } = 100;

    [BindProperty]
    public bool IsEnabled { get; set; } = true;

    public bool IsNew => Id == 0;

    public IReadOnlyList<Choice> Kinds { get; } =
    [
        new(nameof(WeaponKind.MachineGun), ContentLogic.KindName(WeaponKind.MachineGun), "jedes Auto, Dauerfeuer"),
        new(nameof(WeaponKind.Rocket), ContentLogic.KindName(WeaponKind.Rocket), "sucht das Auto vor dir"),
        new(nameof(WeaponKind.Mine), ContentLogic.KindName(WeaponKind.Mine), "fällt hinten raus"),
        new(nameof(WeaponKind.Oil), ContentLogic.KindName(WeaponKind.Oil), "lässt Verfolger schleudern"),
        new(nameof(WeaponKind.Shock), ContentLogic.KindName(WeaponKind.Shock), "trifft alle in der Nähe"),
        new(nameof(WeaponKind.Shield), ContentLogic.KindName(WeaponKind.Shield), "kurz unverwundbar"),
    ];

    public async Task<IActionResult> OnGetAsync()
    {
        if (IsNew)
        {
            return Page();
        }

        var weapon = await ContentLogic.GetWeaponAsync(Db, Me, Id);
        if (weapon is null)
        {
            return NotFound();
        }

        Name = weapon.Name;
        Description = weapon.Description;
        Kind = weapon.Kind;
        Damage = weapon.Damage;
        Amount = Math.Max(1, weapon.Amount);
        CooldownMs = weapon.CooldownMs;
        CrateWeight = weapon.CrateWeight;
        SortOrder = weapon.SortOrder;
        IsEnabled = weapon.IsEnabled;
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            var id = await ContentLogic.SaveWeaponAsync(Db, Me, new WeaponInput(Id, Kind, Name, Description ?? string.Empty, Damage, Amount, CooldownMs, CrateWeight, SortOrder, IsEnabled));
            Flash(IsNew ? "Die Waffe wurde angelegt." : "Gespeichert.");
            return RedirectToPage(new { id });
        });

    public async Task<IActionResult> OnPostDeleteAsync()
        => await TryAsync(async () =>
        {
            await ContentLogic.DeleteWeaponAsync(Db, Me, Id);
            Flash("Die Waffe wurde gelöscht.");
            return RedirectToPage("Index");
        });
}
