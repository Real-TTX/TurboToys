using MatGame.Sdk.Web;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Pages.Admin.Races;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public IReadOnlyList<RaceLogic.RaceRow> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    public async Task OnGetAsync()
    {
        var request = ReadList(["status", "kind"], defaultDescending: true);
        var result = await RaceLogic.ListAsync(Db, Me, request);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "races", Action = "/Admin/TurboToys/Races", Label = "Rennen", Search = request.Search, SearchField = true, SearchPlaceholder = "Name oder Fahrer",
            Filters =
            [
                new FilterField("status", "Status", Enum.GetValues<RaceStatus>().Select(s => new FilterOption(s.ToString(), RaceLogic.StatusName(s))).ToList(), request.Filter("status")),
                new FilterField("kind", "Art", Enum.GetValues<RaceKind>().Select(k => new FilterOption(k.ToString(), RaceLogic.KindName(k))).ToList(), request.Filter("kind")),
            ],
            SortOptions = [new SortOption("start", "Start"), new SortOption("name", "Name"), new SortOption("players", "Fahrer")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "start",
            Total = result.Total, Matching = result.Matching, Noun = "Rennen", NounOne = "Rennen",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
