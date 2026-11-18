using TurboToys.Data;

namespace TurboToys.Business;

/// <summary>
/// The content a new database (and the offline game) starts with: the cars, weapons, tracks and cups. The seed adds missing ones to existing
/// databases by their key (cars), kind (weapons), layout + time (tracks) and name (cups); what an administrator changed stays.
/// </summary>
public static class SeedContent
{
    public static IReadOnlyList<Car> AllCars() =>
    [
        Car("sparky", "Sparky", "buggy", CarDrive.Electric, 4, 7, 6, 4, 3, 5, 0, 1, "#f6c638", 10,
            "Der flinke Elektro-Buggy für den Anfang: zieht sofort los, verzeiht viel."),
        Car("dusty", "Dusty Digger", "truck", CarDrive.Gas, 4, 5, 5, 8, 8, 4, 1800, 1, "#9bd23c", 20,
            "Monstertruck mit Nitro-Motor: schwer, robust, schiebt alles weg."),
        Car("blitz", "Blitz Bambino", "rally", CarDrive.Turbo, 6, 6, 7, 5, 4, 6, 3200, 2, "#2f6fd0", 30,
            "Kleiner Rallye-Flitzer mit Turbo: erst gemütlich, dann ab die Post."),
        Car("nonna", "Nitro Nonna", "muscle", CarDrive.Gas, 7, 6, 4, 6, 6, 5, 4800, 3, "#e2392f", 40,
            "Altes Muscle-Car mit dicker Haube. Laut, schnell auf der Geraden, störrisch in Kurven."),
        Car("brick", "Rumble Brick", "van", CarDrive.Gas, 5, 4, 5, 10, 10, 4, 6500, 4, "#34373d", 50,
            "Gepanzerter Lieferwagen: steckt Raketen weg wie andere Krümel."),
        Car("viper", "Volt Viper", "super", CarDrive.Electric, 8, 8, 7, 4, 3, 6, 7500, 5, "#2aa198", 60,
            "Flacher Elektro-Supersportler mit riesigem Flügel. Schnell und leise."),
        Car("tornado", "Torque Tornado", "pickup", CarDrive.Turbo, 7, 7, 6, 7, 7, 8, 11000, 7, "#f28c28", 70,
            "Pickup mit Doppel-Turbo und Überrollbügel. Der Turbo-Tank ist riesig."),
        Car("pulse", "Phantom Pulse", "formula", CarDrive.Electric, 10, 9, 9, 3, 2, 7, 18000, 10, "#7a4bc4", 80,
            "Der Formel-Renner der Profis: unfassbar schnell, aber aus Papier."),
    ];

    public static IReadOnlyList<Weapon> AllWeapons() =>
    [
        Weapon(WeaponKind.MachineGun, "Knallerbsen-MG", "Das Bord-MG jedes Autos. Munition hängt vom Waffen-Tuning ab.", 3, 0, 90, 0, 10),
        Weapon(WeaponKind.Rocket, "Feuerwerksrakete", "Sucht sich das nächste Auto vor dir. KAWUMM!", 34, 2, 700, 26, 20),
        Weapon(WeaponKind.Mine, "Reißzwecken-Mine", "Fällt hinten raus und wartet auf Verfolger.", 28, 3, 400, 24, 30),
        Weapon(WeaponKind.Oil, "Ölpfütze", "Wer drüberfährt, dreht sich wie ein Kreisel.", 0, 2, 600, 20, 40),
        Weapon(WeaponKind.Shock, "Batterie-Schock", "Ein Blitz trifft alle Autos in der Nähe und bremst sie aus.", 14, 1, 1500, 14, 50),
        Weapon(WeaponKind.Shield, "Gummischild", "Vier Sekunden lang prallt alles ab.", 0, 1, 4000, 16, 60),
    ];

    public static IReadOnlyList<Track> AllTracks() =>
    [
        Track("kidsroom", "Kinderzimmer", "Zwischen Bauklötzen, Bett und Bücherberg – mit Sprung vom Bücherstapel.", 3, TimeOfDay.Day, 1, 10),
        Track("garden", "Gartenparty", "Über Kiesweg und Rasen, am Teich vorbei und durch die Party.", 3, TimeOfDay.Day, 1, 20),
        Track("kitchen", "Küchen-Chaos", "Enge Kurven zwischen Stuhlbeinen, Müsli auf dem Boden.", 4, TimeOfDay.Day, 2, 30),
        Track("workshop", "Werkstatt-Wahnsinn", "Volle Kanne über die Werkbank – Ölflecken inklusive.", 3, TimeOfDay.Day, 3, 40),
        Track("supermarket", "Supermarkt-Sprint", "Nach Ladenschluss durch die Regalreihen.", 3, TimeOfDay.Night, 4, 50),
        Track("attic", "Dachboden bei Nacht", "Gruselig, staubig, dunkel. Wer hat Angst vorm Laken?", 3, TimeOfDay.Night, 5, 60),
        Track("garden", "Gartenparty am Abend", "Die Party geht weiter – im Licht der Lampions.", 3, TimeOfDay.Dusk, 6, 70),
        Track("kidsroom", "Kinderzimmer – Licht aus!", "Schlafenszeit? Nicht für ferngesteuerte Autos.", 3, TimeOfDay.Night, 8, 80),
    ];

    /// <summary>The cups: their tracks are named by layout + time (resolved to ids when seeding).</summary>
    public static IReadOnlyList<(Cup Cup, IReadOnlyList<(string Layout, TimeOfDay Time)> Tracks)> AllCups() =>
    [
        (Cup("Bronze-Pokal", "Der Einstieg: drei Rennen gegen gemütliche Gegner.", 3, 0, 1500, 5, 1, 1, 10),
            [("kidsroom", TimeOfDay.Day), ("garden", TimeOfDay.Day), ("kitchen", TimeOfDay.Day)]),
        (Cup("Silber-Pokal", "Vier Rennen, die Gegner haben aufgerüstet.", 3, 300, 4000, 5, 2, 3, 20),
            [("garden", TimeOfDay.Day), ("workshop", TimeOfDay.Day), ("kitchen", TimeOfDay.Day), ("supermarket", TimeOfDay.Night)]),
        (Cup("Gold-Pokal", "Nur für echte Raser: harte Gegner, dunkle Strecken.", 3, 800, 9000, 7, 3, 6, 30),
            [("workshop", TimeOfDay.Day), ("supermarket", TimeOfDay.Night), ("attic", TimeOfDay.Night), ("kidsroom", TimeOfDay.Night)]),
        (Cup("Turbo-Meisterschaft", "Sechs Rennen, sieben Profis. Wer hier gewinnt, ist der König des Teppichs.", 3, 2000, 25000, 7, 5, 10, 40),
            [("kidsroom", TimeOfDay.Night), ("garden", TimeOfDay.Dusk), ("kitchen", TimeOfDay.Day), ("workshop", TimeOfDay.Day), ("supermarket", TimeOfDay.Night), ("attic", TimeOfDay.Night)]),
    ];

    /// <summary>The names of the bots (comic racers).</summary>
    public static readonly IReadOnlyList<string> BotNames =
    [
        "Rasender Rudi", "Turbo-Tina", "Kalle Kolben", "Lotte Lötzinn", "Benno Blech", "Vroni Vollgas", "Schrauben-Sepp", "Mia Mini", "Atze Akku",
        "Frieda Funke", "Paule Pleuel", "Kiki Kardan", "Ede Endrohr", "Nina Nitro", "Bodo Boxenstopp", "Gabi Gaspedal",
    ];

    private static Car Car(string key, string name, string body, CarDrive drive, int speed, int accel, int grip, int armor, int weight, int turbo, int price,
        int level, string paint, int order, string description) => new()
    {
        Key = key, Name = name, Body = body, Drive = drive, Speed = speed, Acceleration = accel, Grip = grip, Armor = armor, Weight = weight,
        TurboCapacity = turbo, Price = price, UnlockLevel = level, DefaultPaint = paint, SortOrder = order, Description = description, IsEnabled = true,
    };

    private static Weapon Weapon(WeaponKind kind, string name, string description, int damage, int amount, int cooldown, int weight, int order) => new()
    {
        Kind = kind, Name = name, Description = description, Damage = damage, Amount = amount, CooldownMs = cooldown, CrateWeight = weight, SortOrder = order, IsEnabled = true,
    };

    private static Track Track(string layout, string name, string description, int laps, TimeOfDay time, int level, int order) => new()
    {
        Layout = layout, Name = name, Description = description, Laps = laps, TimeOfDay = time, UnlockLevel = level, SortOrder = order, IsEnabled = true,
    };

    private static Cup Cup(string name, string description, int laps, int fee, int prize, int opponents, int skill, int level, int order) => new()
    {
        Name = name, Description = description, Laps = laps, EntryFee = fee, Prize = prize, Opponents = opponents, BotSkill = skill, UnlockLevel = level,
        SortOrder = order, IsEnabled = true,
    };
}
