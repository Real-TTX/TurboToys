using MatGame.Sdk.Web;
using TurboToys.Business;
using TurboToys.Data;
using TurboToys.Game;

namespace TurboToys.Pages.Admin.Tracks;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public IReadOnlyList<Track> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    public async Task OnGetAsync()
    {
        var request = ReadList(["layout", "time"]);
        var result = await ContentLogic.ListTracksAsync(Db, Me, request);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "tracks", Action = "/Admin/TurboToys/Tracks", Label = "Strecken", Search = request.Search, SearchField = true, SearchPlaceholder = "Name oder Beschreibung",
            Filters =
            [
                new FilterField("layout", "Welt", Layouts.List.Select(l => new FilterOption(l.Key, l.Name)).ToList(), request.Filter("layout")),
                new FilterField("time", "Tageszeit", Enum.GetValues<TimeOfDay>().Select(t => new FilterOption(t.ToString(), ContentLogic.TimeName(t))).ToList(), request.Filter("time")),
            ],
            SortOptions = [new SortOption("order", "Reihenfolge"), new SortOption("name", "Name"), new SortOption("level", "Level")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "order",
            Total = result.Total, Matching = result.Matching, Noun = "Strecken", NounOne = "Strecke",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
