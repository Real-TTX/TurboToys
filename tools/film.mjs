#!/usr/bin/env node
// A series of screenshots of a page (e.g. a bots-only race): node tools/film.mjs <url> <out-prefix> [count] [everyMs] [width] [height] [startMs]
//   node tools/film.mjs "http://localhost:2779/turbotoys/dev/race.html?layout=test" tmp/test-race 6 2500
// Saves <out-prefix>-1.png …, prints the text of #info after every shot and the console errors.
import { chromium } from 'playwright-core';

const [url, prefix, count = '6', every = '2500', width = '1100', height = '640', startMs = '0'] = process.argv.slice(2);
if (!url || !prefix) {
    console.error('usage: node tools/film.mjs <url> <out-prefix> [count] [everyMs] [width] [height] [startMs]');
    process.exit(1);
}
const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
const errors = [];
page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', e => errors.push(`pageerror: ${e.message}\n${e.stack ?? ''}`));
await page.goto(url, { waitUntil: 'load' });
try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
} catch {
    errors.push('timeout: window.__ready never became true');
}
await page.waitForTimeout(Number(startMs));
for (let k = 1; k <= Number(count); k++) {
    await page.waitForTimeout(Number(every));
    const file = `${prefix}-${k}.png`;
    await page.screenshot({ path: file });
    const info = await page.evaluate(() => document.getElementById('info')?.textContent ?? '');
    console.log(`--- ${file}\n${info}`);
}
await browser.close();
if (errors.length) console.log(errors.slice(0, 20).join('\n'));
