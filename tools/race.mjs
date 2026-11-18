#!/usr/bin/env node
// A whole race against a running MatGame with the developer autopilot: guest, quick race (1 lap, bots), the results page.
//   node tools/race.mjs [base] [track index] [bots]
// Screenshots tmp/race-*.png; prints console errors and the results.
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:2770';
const trackIndex = Number(process.argv[3] ?? 0);
const bots = Number(process.argv[4] ?? 3);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
await page.addInitScript(() => localStorage.setItem('turbotoys.autopilot', '1'));
await page.goto(`${base}/turbotoys/`, { waitUntil: 'load' });
await page.waitForSelector('#tt-menu:not([hidden])', { timeout: 60000 });
if (await page.$('#guest-form')) {
    await page.fill('#guest-form input[name=name]', `Auto${Math.floor(Math.random() * 1000)}`);
    await page.click('#guest-form button');
}
await page.waitForSelector('.main-menu', { timeout: 30000 });
await page.click('[data-go=quick]');
await page.waitForSelector('[data-track]');
const tracks = await page.$$('[data-track]:not([disabled])');
await tracks[Math.min(trackIndex, tracks.length - 1)].click();
await page.$eval('#bots', (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); }, String(bots));
await page.$eval('#laps', el => { el.value = '1'; el.dispatchEvent(new Event('input')); });
await page.click('#go');
await page.waitForSelector('#tt-hud:not([hidden])', { timeout: 60000 });
const started = Date.now();
let k = 0;
while (Date.now() - started < 150000) {
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `tmp/race-${String(k++).padStart(2, '0')}.png` });
    if (await page.$('#results-close')) break;
}
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tmp/race-results.png' });
const text = await page.evaluate(() => document.querySelector('.results-page')?.innerText ?? 'keine Ergebnisse');
console.log(text.replace(/\n+/g, ' | '));
if (await page.$('#results-close')) {
    await page.click('#results-close');
    await page.waitForSelector('.main-menu', { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'tmp/race-after.png' });
}
await browser.close();
for (const e of errors) console.log(e);
