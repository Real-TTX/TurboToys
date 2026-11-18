#!/usr/bin/env node
// Screenshots with the installed Edge (headless, WebGL through SwiftShader/ANGLE): node tools/shot.mjs <url> <out.png> [width] [height] [waitMs]
//   node tools/shot.mjs "http://localhost:2779/turbotoys/dev/world.html?layout=kidsroom&view=top" tmp/kidsroom-top.png
// Prints the console errors of the page. Needs `npm install` in tools/ once.
import { chromium } from 'playwright-core';

const [url, out, width = '1366', height = '768', wait = '2500'] = process.argv.slice(2);
if (!url || !out) {
    console.error('usage: node tools/shot.mjs <url> <out.png> [width] [height] [waitMs]');
    process.exit(1);
}

const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
const errors = [];
page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
} catch {
    errors.push('timeout: window.__ready never became true');
}
await page.waitForTimeout(Number(wait));
const info = await page.evaluate(() => document.getElementById('info')?.textContent ?? '');
await page.screenshot({ path: out });
await browser.close();
if (info) console.log(info);
for (const e of errors) console.log(e);
console.log(`saved ${out}`);
