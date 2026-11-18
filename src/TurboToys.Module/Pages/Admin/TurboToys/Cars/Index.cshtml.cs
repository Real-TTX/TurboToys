using MatGame.Sdk.Web;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Pages.Admin.Cars;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public IReadOnlyList<Car> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    public async Task OnGetAsync()
    {
        var request = ReadList(["drive", "status"]);
        var result = await ContentLogic.ListCarsAsync(Db, Me, request);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "cars", Action = "/Admin/TurboToys/Cars", Label = "Autos", Search = request.Search, SearchField = true, SearchPlaceholder = "Name, Schlüssel oder Beschreibung",
            Filters =
            [
                new FilterField("drive", "Antrieb", Enum.GetValues<CarDrive>().Select(d => new FilterOption(d.ToString(), ContentLogic.DriveName(d))).ToList(), request.Filter("drive")),
                new FilterField("status", "Status", [new FilterOption("enabled", "Im Handel"), new FilterOption("disabled", "Aus")], request.Filter("status")),
            ],
            SortOptions = [new SortOption("order", "Reihenfolge"), new SortOption("name", "Name"), new SortOption("price", "Preis"), new SortOption("level", "Level"), new SortOption("speed", "Tempo")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "order",
            Total = result.Total, Matching = result.Matching, Noun = "Autos", NounOne = "Auto",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
