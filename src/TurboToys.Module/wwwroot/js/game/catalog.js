// TurboToys · catalog.js – what the browser knows without asking the server: the seeded cars for the menu's background race (the real catalogue,
// prices and tuning come from the server: GET api/catalog, api/garage), the names of things, and formatting helpers.
// specOf mirrors TurboToys.Core Tuning.SpecOf for an untuned car (used only by the background race).

function specOf(car) {
    const drive = car.drive === 'Electric' ? [0.97, 1.08] : car.drive === 'Gas' ? [1.03, 0.97] : [1, 1];
    return {
        topSpeed: (40 + car.speed * 2.6) * drive[0],
        acceleration: (24 + car.accel * 3.4) * drive[1],
        grip: 0.62 + car.grip * 0.07,
        health: 70 + car.armor * 8,
        turboSeconds: 2.4 + car.turbo * 0.24,
        weight: car.weight,
        gunDamage: 3,
        gunAmmo: 60,
    };
}

const seed = [
    { key: 'sparky', name: 'Sparky', body: 'buggy', drive: 'Electric', speed: 4, accel: 7, grip: 6, armor: 4, weight: 3, turbo: 5, paint: '#f6c638' },
    { key: 'dusty', name: 'Dusty Digger', body: 'truck', drive: 'Gas', speed: 4, accel: 5, grip: 5, armor: 8, weight: 8, turbo: 4, paint: '#9bd23c' },
    { key: 'blitz', name: 'Blitz Bambino', body: 'rally', drive: 'Turbo', speed: 6, accel: 6, grip: 7, armor: 5, weight: 4, turbo: 6, paint: '#2f6fd0' },
    { key: 'nonna', name: 'Nitro Nonna', body: 'muscle', drive: 'Gas', speed: 7, accel: 6, grip: 4, armor: 6, weight: 6, turbo: 5, paint: '#e2392f' },
    { key: 'brick', name: 'Rumble Brick', body: 'van', drive: 'Gas', speed: 5, accel: 4, grip: 5, armor: 10, weight: 10, turbo: 4, paint: '#34373d' },
    { key: 'viper', name: 'Volt Viper', body: 'super', drive: 'Electric', speed: 8, accel: 8, grip: 7, armor: 4, weight: 3, turbo: 6, paint: '#2aa198' },
    { key: 'tornado', name: 'Torque Tornado', body: 'pickup', drive: 'Turbo', speed: 7, accel: 7, grip: 6, armor: 7, weight: 7, turbo: 8, paint: '#f28c28' },
    { key: 'pulse', name: 'Phantom Pulse', body: 'formula', drive: 'Electric', speed: 10, accel: 9, grip: 9, armor: 3, weight: 2, turbo: 7, paint: '#7a4bc4' },
];

/** The seeded cars as race loadouts (key, name, body, drive, paint, spec). */
export const SeedCars = seed.map(c => ({ key: c.key, name: c.name, body: c.body, drive: c.drive, paint: c.paint, decal: 'stripes', number: 7, spec: specOf(c) }));

export const DRIVE_NAMES = { Electric: 'Elektro', Gas: 'Benzin', Turbo: 'Turbo' };
export const DRIVE_HINTS = {
    Electric: 'Zieht sofort voll los, leise, etwas weniger Spitze.',
    Gas: 'Nitro-Motor: brüllt, dreht hoch, viel Spitze.',
    Turbo: 'Erst gemütlich – dann pfeift der Lader und es knallt.',
};
export const BODY_NAMES = { buggy: 'Buggy', truck: 'Monstertruck', muscle: 'Muscle-Car', rally: 'Rallye', super: 'Supersportler', van: 'Lieferwagen', formula: 'Formel', pickup: 'Pickup' };
export const TIME_NAMES = { Day: 'Tag', Dusk: 'Abend', Night: 'Nacht' };
export const DECAL_NAMES = { none: 'Ohne', stripes: 'Streifen', flames: 'Flammen', stars: 'Sterne', checker: 'Karo', bolt: 'Blitz' };

/** 1.234 Schrauben */
export function money(n) {
    return `${Number(n ?? 0).toLocaleString('de-DE')}`;
}

/** 1:23.45 */
export function lapTime(ms) {
    if (ms == null) return '–';
    const m = Math.floor(ms / 60000);
    const s = (ms / 1000) % 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
