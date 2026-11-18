using MatGame.Sdk.Web;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Pages.Admin.Players;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public IReadOnlyList<PlayerLogic.PlayerRow> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    public async Task OnGetAsync()
    {
        var request = ReadList(["kind"]);
        var result = await PlayerLogic.ListAsync(Db, Me, request);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "players", Action = "/Admin/TurboToys/Players", Label = "Spieler", Search = request.Search, SearchField = true, SearchPlaceholder = "Name",
            Filters = [new FilterField("kind", "Art", [new FilterOption("account", "Konten"), new FilterOption("guest", "Gäste")], request.Filter("kind"))],
            SortOptions = [new SortOption("name", "Name"), new SortOption("xp", "Erfahrung"), new SortOption("money", "Schrauben"), new SortOption("races", "Rennen"), new SortOption("last", "Zuletzt")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "name",
            Total = result.Total, Matching = result.Matching, Noun = "Spieler", NounOne = "Spieler",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
