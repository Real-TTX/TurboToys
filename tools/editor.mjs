#!/usr/bin/env node
// A smoke test of the track editor against a running MatGame (default http://localhost:2770): guest sign-in, "Streckenbau", plug pieces with the keys,
// close the track automatically, save, the 3D preview, then a test drive with the developer autopilot. Screenshots into tmp/editor-*.png, console errors printed.
//   node tools/editor.mjs [base]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:2770';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
const shot = async name => {
    await page.screenshot({ path: `tmp/editor-${name}.png` });
    console.log(`tmp/editor-${name}.png`);
};

await page.goto(`${base}/turbotoys/`, { waitUntil: 'load' });
await page.evaluate(() => localStorage.setItem('turbotoys.autopilot', '1'));
await page.waitForSelector('#tt-menu:not([hidden])', { timeout: 60000 });
await page.waitForTimeout(2500);
if (await page.$('#guest-form')) {
    await page.fill('#guest-form input[name=name]', 'Baumeister');
    await page.click('#guest-form button');
}
await page.waitForSelector('.main-menu', { timeout: 30000 });
await page.click('[data-go=build]');
await page.waitForSelector('.builder-palette', { timeout: 20000 });
await page.waitForTimeout(800);
// two straights with the keys, then pieces from the palette
await page.keyboard.press('1');
await page.keyboard.press('1');
for (const piece of ['loop', 'straight', 'wideRight', 'up', 'up', 'tunnel', 'right', 'straight', 'right', 'jump', 'boost', 'crates']) {
    await page.click(`[data-piece=${piece}]`);
    await page.waitForTimeout(120);
}
await shot('1-open');
await page.click('#build-close');
await page.waitForTimeout(600);
await page.fill('#build-name', 'Testbahn');
await shot('2-closed');
await page.click('#build-save');
await page.waitForTimeout(1500);
await shot('3-saved');
await page.click('#build-preview');
await page.waitForTimeout(9000);
await shot('4-preview');
await page.click('#preview-back');
await page.waitForSelector('.builder-palette', { timeout: 20000 });
await page.click('#build-drive');
await page.waitForSelector('#tt-hud:not([hidden])', { timeout: 60000 });
await page.waitForTimeout(12000);
await shot('5-drive');
await page.waitForTimeout(12000);
await shot('6-drive');
await browser.close();
if (errors.length) console.log(errors.slice(0, 20).join('\n'));
