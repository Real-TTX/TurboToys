using Microsoft.EntityFrameworkCore;
using TurboToys.Data;
using TurboToys.Game;

namespace TurboToys.Business;

/// <summary>The garage of a player: buying cars, tuning, paint, choosing the car for the next race.</summary>
public static class GarageLogic
{
    public static async Task<GarageView> GarageAsync(AppDbContext db, Actor actor)
    {
        Guard.Player(actor);
        var player = await db.Players.AsNoTracking().FirstAsync(p => p.Id == actor.PlayerId);
        var owned = await db.GarageCars.AsNoTracking().Where(g => g.PlayerId == actor.PlayerId).ToListAsync();
        var catalog = await db.Cars.AsNoTracking().ToListAsync();
        return Views.Garage(player, owned, catalog);
    }

    public static async Task<GarageView> BuyAsync(AppDbContext db, Actor actor, long carId)
    {
        Guard.Player(actor);
        var player = await db.Players.FirstAsync(p => p.Id == actor.PlayerId);
        var owned = await db.GarageCars.Where(g => g.PlayerId == actor.PlayerId).ToListAsync();
        var car = await db.Cars.AsNoTracking().FirstOrDefaultAsync(c => c.Id == carId) ?? throw new BusinessException("Dieses Auto gibt es nicht.");
        var bought = PlayerRules.Buy(player, owned, car);
        bought.Car = null;
        db.GarageCars.Add(bought);
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        player.SelectedGarageCarId = bought.Id;
        await db.SaveChangesAsync();
        return await GarageAsync(db, actor);
    }

    public static async Task<GarageView> UpgradeAsync(AppDbContext db, Actor actor, long garageCarId, Part part)
    {
        Guard.Player(actor);
        var player = await db.Players.FirstAsync(p => p.Id == actor.PlayerId);
        var garage = await db.GarageCars.Include(g => g.Car).FirstOrDefaultAsync(g => g.Id == garageCarId && g.PlayerId == actor.PlayerId)
                     ?? throw new BusinessException("Dieses Auto steht nicht in deiner Garage.");
        PlayerRules.Upgrade(player, garage, garage.Car!, part);
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        return await GarageAsync(db, actor);
    }

    public static async Task<GarageView> SetLookAsync(AppDbContext db, Actor actor, long garageCarId, string? paint, string? decal, int? number)
    {
        Guard.Player(actor);
        var player = await db.Players.FirstAsync(p => p.Id == actor.PlayerId);
        var garage = await db.GarageCars.FirstOrDefaultAsync(g => g.Id == garageCarId && g.PlayerId == actor.PlayerId)
                     ?? throw new BusinessException("Dieses Auto steht nicht in deiner Garage.");
        PlayerRules.SetLook(player, garage, paint, decal, number);
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        return await GarageAsync(db, actor);
    }

    public static async Task<GarageView> SelectAsync(AppDbContext db, Actor actor, long garageCarId)
    {
        Guard.Player(actor);
        var player = await db.Players.FirstAsync(p => p.Id == actor.PlayerId);
        var garage = await db.GarageCars.FirstOrDefaultAsync(g => g.Id == garageCarId && g.PlayerId == actor.PlayerId)
                     ?? throw new BusinessException("Dieses Auto steht nicht in deiner Garage.");
        PlayerRules.Select(player, garage);
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
        return await GarageAsync(db, actor);
    }

    /// <summary>The car the actor drives in the next race (its loadout) and who sits down (name, level, avatar).</summary>
    public static async Task<(SeatPlayer Player, CarLoadout Car)> SeatAsync(AppDbContext db, Actor actor, bool isGuest)
    {
        Guard.Player(actor);
        var player = await db.Players.AsNoTracking().FirstAsync(p => p.Id == actor.PlayerId);
        var owned = await db.GarageCars.AsNoTracking().Include(g => g.Car).Where(g => g.PlayerId == actor.PlayerId).ToListAsync();
        var garage = PlayerRules.Selected(player, owned) ?? throw new BusinessException("Du hast noch kein Auto.");
        var seat = new SeatPlayer(player.Id, player.DisplayName, isGuest, Progression.LevelOf(player.Xp), PlayerRules.AvatarOf(player));
        return (seat, PlayerRules.LoadoutOf(garage.Car!, garage));
    }

    /// <summary>Administration: takes a car away from a player.</summary>
    public static async Task RemoveAsync(AppDbContext db, Actor actor, long garageCarId)
    {
        Guard.Admin(actor);
        var garage = await db.GarageCars.FirstOrDefaultAsync(g => g.Id == garageCarId) ?? throw new BusinessException("Dieses Auto gibt es nicht.");
        var player = await db.Players.FirstAsync(p => p.Id == garage.PlayerId);
        if (player.SelectedGarageCarId == garage.Id)
        {
            player.SelectedGarageCarId = null;
        }

        db.GarageCars.Remove(garage);
        db.ActingAs(actor.AuditId);
        await db.SaveChangesAsync();
    }
}
