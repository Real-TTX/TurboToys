using TurboToys.Business;
using TurboToys.Data;
using TurboToys.Web;
using MatGame.Sdk;
using MatGame.Sdk.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace TurboToys.Pages;

/// <summary>
/// The base of every admin page of TurboToys (administrators of MatGame only): the database (handed to the business layer, never queried here), who is signed in as an <see cref="Actor"/>,
/// the list parameters of the query string, and the messages of the business layer as form errors.
/// </summary>
[Authorize(Policy = GameAccounts.AdminPolicy)]
public abstract class AppPageModel(AppDbContext db) : PageModel
{
    protected AppDbContext Db { get; } = db;

    public Actor Me => Players.ActorOf(User) ?? throw new AccessDeniedException("Bitte zuerst anmelden.");

    protected void Flash(string message) => TempData["Flash"] = message;

    protected void FlashError(string message) => TempData["FlashError"] = message;

    /// <summary>Search (q), filters, sort (sort, dir) and page of a list.</summary>
    protected ListRequest ReadList(IEnumerable<string> filters, int pageSize = 20, bool defaultDescending = false)
    {
        var values = filters.ToDictionary(f => f, f => ListQuery.Text(Request, f));
        return new ListRequest(ListQuery.Text(Request, "q"), values, ListQuery.Text(Request, "sort"), ListQuery.Descending(Request, defaultDescending), ListQuery.Page(Request),
            pageSize);
    }

    /// <summary>Runs a change; a broken rule becomes an error of the form (at its field) and the page is shown again.</summary>
    protected async Task<IActionResult> TryAsync(Func<Task<IActionResult>> action, Func<Task>? reload = null)
    {
        try
        {
            // a value the framework could not read (letters in a number field) is reported as it is, the business layer is not asked with a wrong value
            if (ModelState.IsValid)
            {
                return await action();
            }
        }
        catch (BusinessException e)
        {
            ModelState.AddModelError(e.Field ?? string.Empty, e.Message);
        }
        catch (AccessDeniedException e)
        {
            ModelState.AddModelError(string.Empty, e.Message);
        }

        if (reload is not null)
        {
            await reload();
        }

        return Page();
    }

    protected PagerModel BuildPager(ToolbarModel toolbar, int page, int pageSize, int matching)
        => new() { Page = page, PageSize = pageSize, Total = matching, Url = toolbar.UrlWithPage };
}
