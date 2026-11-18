using MatGame.Sdk.Web;
using TurboToys.Business;
using TurboToys.Data;

namespace TurboToys.Pages.Admin.Weapons;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public IReadOnlyList<Weapon> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    public async Task OnGetAsync()
    {
        var request = ReadList(["kind"]);
        var result = await ContentLogic.ListWeaponsAsync(Db, Me, request);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "weapons", Action = "/Admin/TurboToys/Weapons", Label = "Waffen", Search = request.Search, SearchField = true, SearchPlaceholder = "Name oder Beschreibung",
            Filters = [new FilterField("kind", "Art", Enum.GetValues<WeaponKind>().Select(k => new FilterOption(k.ToString(), ContentLogic.KindName(k))).ToList(), request.Filter("kind"))],
            SortOptions = [new SortOption("order", "Reihenfolge"), new SortOption("name", "Name"), new SortOption("damage", "Schaden")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "order",
            Total = result.Total, Matching = result.Matching, Noun = "Waffen", NounOne = "Waffe",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
