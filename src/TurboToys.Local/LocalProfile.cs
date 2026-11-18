using System.Text.Json;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Local;

/// <summary>
/// The offline profile on the device (profile.json in the app's data folder): the local player with money, experience and avatar, the garage, the cup runs and
/// the last races. Offline progress counts only on this device (it is never uploaded).
/// </summary>
public sealed class LocalProfile
{
    public const string FileName = "profile.json";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    public Player Player { get; set; } = new();

    public List<GarageCar> Garage { get; set; } = [];

    public List<CupRun> CupRuns { get; set; } = [];

    public List<HistoryItem> History { get; set; } = [];

    public Dictionary<long, int> BestLaps { get; set; } = [];

    public long NextId { get; set; } = 1;

    [System.Text.Json.Serialization.JsonIgnore]
    public string? Path { get; private set; }

    public long NewId() => NextId++;

    public static LocalProfile Load(string directory, string playerName, IReadOnlyList<Car> catalog)
    {
        var path = System.IO.Path.Combine(directory, FileName);
        LocalProfile profile;
        try
        {
            profile = File.Exists(path) ? JsonSerializer.Deserialize<LocalProfile>(File.ReadAllText(path), Json) ?? new LocalProfile() : new LocalProfile();
        }
        catch (JsonException)
        {
            // a broken file: keep it aside and start again
            File.Copy(path, path + ".broken", overwrite: true);
            profile = new LocalProfile();
        }

        profile.Path = path;
        if (profile.Player.Id == 0)
        {
            profile.Player = PlayerRules.NewPlayer(TurboToysLocal.LocalPlayerId, string.IsNullOrWhiteSpace(playerName) ? "Gast" : playerName, isGuest: true);
        }

        if (profile.Garage.Count == 0 && PlayerRules.EnsureStarterCar(profile.Player, [], catalog) is { } starter)
        {
            starter.Id = profile.NewId();
            starter.Car = null;
            profile.Garage.Add(starter);
            profile.Player.SelectedGarageCarId = starter.Id;
        }

        profile.Save();
        return profile;
    }

    public void Save()
    {
        if (Path is null)
        {
            return;
        }

        var temp = Path + ".tmp";
        File.WriteAllText(temp, JsonSerializer.Serialize(this, Json));
        File.Move(temp, Path, overwrite: true);
    }
}
