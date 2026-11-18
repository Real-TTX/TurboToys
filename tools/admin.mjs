#!/usr/bin/env node
// Screenshots of the admin pages of TurboToys on a FRESH server (the first account that registers becomes the administrator):
//   node tools/admin.mjs http://localhost:2788
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:2788';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('response', r => r.status() >= 500 && errors.push(`${r.status()} ${r.url()}`));

// register through the game's sign-in panel
await page.goto(`${base}/turbotoys/`);
await page.waitForSelector('#tt-menu:not([hidden])', { timeout: 60000 });
await page.click('[data-tab=register]');
await page.fill('#register-form input[name=display]', 'Chefin');
await page.fill('#register-form input[name=login]', 'chefin');
await page.fill('#register-form input[name=password]', 'Turbo-Toys-2026!');
await page.click('#register-form button');
await page.waitForSelector('.main-menu', { timeout: 30000 });

const pages = [
    ['admin-index', '/Admin/TurboToys'],
    ['admin-players', '/Admin/TurboToys/Players'],
    ['admin-cars', '/Admin/TurboToys/Cars'],
    ['admin-car-edit', '/Admin/TurboToys/Cars/Edit?id=4'],
    ['admin-tracks', '/Admin/TurboToys/Tracks'],
    ['admin-track-edit', '/Admin/TurboToys/Tracks/Edit?id=1'],
    ['admin-cups', '/Admin/TurboToys/Cups'],
    ['admin-cup-edit', '/Admin/TurboToys/Cups/Edit?id=2'],
    ['admin-weapons', '/Admin/TurboToys/Weapons'],
    ['admin-weapon-edit', '/Admin/TurboToys/Weapons/Edit?id=2'],
    ['admin-races', '/Admin/TurboToys/Races'],
    ['admin-system', '/Admin/TurboToys/System'],
];
for (const [name, path] of pages) {
    const response = await page.goto(base + path);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `tmp/${name}.png`, fullPage: false });
    console.log(name, response.status(), await page.title());
}
// a player row exists for the admin: open it
await page.goto(`${base}/Admin/TurboToys/Players`);
const link = await page.$('table a[href*="Players/Edit"]');
if (link) {
    await link.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'tmp/admin-player-edit.png' });
    console.log('player edit', page.url());
}
// save a car (round trip through the business layer)
await page.goto(`${base}/Admin/TurboToys/Cars/Edit?id=4`);
await page.click('button[type=submit]:not([formaction])');
await page.waitForTimeout(800);
console.log('car saved:', await page.evaluate(() => document.body.innerText.includes('Gespeichert')));
await browser.close();
for (const e of errors) console.log(e);
