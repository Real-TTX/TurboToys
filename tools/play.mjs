#!/usr/bin/env node
// A smoke test of the player app against a running MatGame (default http://localhost:2770): guest sign-in, main menu, garage, a quick race
// (drives with the keyboard for a while), screenshots of each step into tmp/play-*.png. Prints the console errors of the page.
//   node tools/play.mjs [base] [seconds]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:2770';
const seconds = Number(process.argv[3] ?? 25);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
const shot = async name => {
    await page.screenshot({ path: `tmp/play-${name}.png` });
    console.log(`tmp/play-${name}.png`);
};

await page.goto(`${base}/turbotoys/`, { waitUntil: 'load' });
await page.waitForSelector('#tt-menu:not([hidden])', { timeout: 60000 });
await page.waitForTimeout(4000);
await shot('1-auth');
if (await page.$('#guest-form')) {
    await page.fill('#guest-form input[name=name]', 'Testfahrer');
    await page.click('#guest-form button');
}
await page.waitForSelector('.main-menu', { timeout: 30000 });
await page.waitForTimeout(3500);
await shot('2-main');
await page.click('[data-go=garage]');
await page.waitForSelector('.garage', { timeout: 20000 });
await page.waitForTimeout(2000);
await shot('3-garage');
await page.click('[data-tab=shop]');
await page.waitForTimeout(1500);
await shot('4-shop');
await page.click('.logo-btn');
await page.waitForSelector('.main-menu');
await page.click('[data-go=quick]');
await page.waitForSelector('#go', { timeout: 20000 });
await page.waitForTimeout(800);
await shot('5-quick');
await page.click('#go');
await page.waitForSelector('#tt-hud:not([hidden])', { timeout: 60000 });
await page.waitForTimeout(1500);
await shot('6-countdown');
await page.keyboard.down('KeyW');
await page.waitForTimeout(5000);
await shot('7-race');
await page.keyboard.down('ShiftLeft');
await page.waitForTimeout(1500);
await page.keyboard.up('ShiftLeft');
await page.keyboard.down('ControlLeft');
await page.waitForTimeout(1500);
await shot('8-race-boost-gun');
await page.keyboard.up('ControlLeft');
const end = Date.now() + seconds * 1000;
let n = 0;
while (Date.now() < end) {
    // a crude driver: steer a little left and right
    const key = n % 2 ? 'KeyA' : 'KeyD';
    await page.keyboard.down(key);
    await page.waitForTimeout(350);
    await page.keyboard.up(key);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(1200);
    if (n === 4) await shot('9-race-later');
    n++;
}
await shot('10-race-end');
const info = await page.evaluate(() => document.getElementById('hud-pos')?.textContent + ' ' + document.getElementById('hud-lap')?.textContent);
console.log('hud:', info);
await browser.close();
for (const e of errors) console.log(e);
