using MatGame.Sdk.Controls;
using Microsoft.AspNetCore.Mvc;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Pages.Admin.Cars;

public sealed class EditModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty(SupportsGet = true)]
    public long Id { get; set; }

    [BindProperty]
    public string Name { get; set; } = string.Empty;

    [BindProperty]
    public string Key { get; set; } = string.Empty;

    [BindProperty]
    public string? Description { get; set; }

    [BindProperty]
    public string Body { get; set; } = "buggy";

    [BindProperty]
    public CarDrive Drive { get; set; }

    [BindProperty]
    public string DefaultPaint { get; set; } = "#e2392f";

    [BindProperty]
    public int Speed { get; set; } = 5;

    [BindProperty]
    public int Acceleration { get; set; } = 5;

    [BindProperty]
    public int Grip { get; set; } = 5;

    [BindProperty]
    public int Armor { get; set; } = 5;

    [BindProperty]
    public int Weight { get; set; } = 5;

    [BindProperty]
    public int TurboCapacity { get; set; } = 5;

    [BindProperty]
    public int Price { get; set; } = 2500;

    [BindProperty]
    public int UnlockLevel { get; set; } = 1;

    [BindProperty]
    public int SortOrder { get; set; } = 100;

    [BindProperty]
    public bool IsEnabled { get; set; } = true;

    public bool IsNew => Id == 0;

    public CarSpec? Spec { get; private set; }

    public IReadOnlyList<Choice> Bodies { get; } = Looks.Bodies.Select(b => new Choice(b, ContentLogic.BodyName(b))).ToList();

    public IReadOnlyList<Choice> Drives { get; } =
    [
        new(nameof(CarDrive.Electric), "Elektro", "sofort voller Schub, etwas weniger Spitze"),
        new(nameof(CarDrive.Gas), "Benzin", "Drehmoment mit der Drehzahl, mehr Spitze"),
        new(nameof(CarDrive.Turbo), "Turbo", "erst träge, dann kickt der Lader"),
    ];

    public IReadOnlyList<Choice> Paints { get; } = Looks.Paints.Select(p => new Choice(p, p)).ToList();

    public async Task<IActionResult> OnGetAsync()
    {
        if (IsNew)
        {
            return Page();
        }

        var car = await ContentLogic.GetCarAsync(Db, Me, Id);
        if (car is null)
        {
            return NotFound();
        }

        Name = car.Name;
        Key = car.Key;
        Description = car.Description;
        Body = car.Body;
        Drive = car.Drive;
        DefaultPaint = car.DefaultPaint;
        Speed = car.Speed;
        Acceleration = car.Acceleration;
        Grip = car.Grip;
        Armor = car.Armor;
        Weight = car.Weight;
        TurboCapacity = car.TurboCapacity;
        Price = car.Price;
        UnlockLevel = car.UnlockLevel;
        SortOrder = car.SortOrder;
        IsEnabled = car.IsEnabled;
        Spec = Tuning.SpecOf(car, null);
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            var id = await ContentLogic.SaveCarAsync(Db, Me, new CarInput(Id, Key, Name, Description ?? string.Empty, Body, Drive, Speed, Acceleration, Grip, Armor, Weight,
                TurboCapacity, Price, UnlockLevel, DefaultPaint, SortOrder, IsEnabled));
            Flash(IsNew ? "Das Auto wurde angelegt." : "Gespeichert.");
            return RedirectToPage(new { id });
        });

    public async Task<IActionResult> OnPostDeleteAsync()
        => await TryAsync(async () =>
        {
            await ContentLogic.DeleteCarAsync(Db, Me, Id);
            Flash("Das Auto wurde gelöscht.");
            return RedirectToPage("Index");
        });
}
