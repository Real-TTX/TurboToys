using MatGame.Sdk.Web;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Pages.Admin.Cups;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public IReadOnlyList<Cup> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    public async Task OnGetAsync()
    {
        var request = ReadList(["status"]);
        var result = await ContentLogic.ListCupsAsync(Db, Me, request);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "cups", Action = "/Admin/TurboToys/Cups", Label = "Pokale", Search = request.Search, SearchField = true, SearchPlaceholder = "Name oder Beschreibung",
            Filters = [new FilterField("status", "Status", [new FilterOption("enabled", "Offen"), new FilterOption("disabled", "Aus")], request.Filter("status"))],
            SortOptions = [new SortOption("order", "Reihenfolge"), new SortOption("name", "Name"), new SortOption("prize", "Preis"), new SortOption("level", "Level")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "order",
            Total = result.Total, Matching = result.Matching, Noun = "Pokale", NounOne = "Pokal",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
