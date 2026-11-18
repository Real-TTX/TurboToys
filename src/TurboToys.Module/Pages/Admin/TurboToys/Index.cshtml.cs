using TurboToys.Business;
using TurboToys.Data;
using TurboToys.Game;

namespace TurboToys.Pages.Admin;

public sealed class IndexModel(AppDbContext db, RoomRegistry registry) : AppPageModel(db)
{
    public PlayerLogic.Dashboard Numbers { get; private set; } = null!;

    public IReadOnlyList<RaceRoom> Rooms { get; private set; } = [];

    public int Racing => Rooms.Count(r => r.Status is RoomStatus.Racing or RoomStatus.Countdown);

    public int Lobbies => Rooms.Count(r => r.Status == RoomStatus.Lobby);

    public int Drivers => Rooms.Sum(r => r.Humans);

    public async Task OnGetAsync()
    {
        Numbers = await PlayerLogic.DashboardAsync(Db, Me);
        Rooms = registry.Rooms.Where(r => r.Status != RoomStatus.Closed).OrderByDescending(r => r.Created).ToList();
    }

    public static string StatusName(RoomStatus status) => status switch
    {
        RoomStatus.Lobby => "Lobby",
        RoomStatus.Countdown => "Start",
        RoomStatus.Racing => "Rennen",
        RoomStatus.Finished => "Siegerehrung",
        _ => "Geschlossen",
    };
}
