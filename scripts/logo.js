#!/usr/bin/env node
// Writes the logo of TurboToys in its levels of detail (docs/logo and src/TurboToys.Module/wwwroot/img/logo, the favicon of wwwroot):
//   mark      the full mark (64 x 64): a chunky RC buggy (whip antenna with ball tip, rear wing, lightning decal, turbo flame) bursting
//             out of a jagged yellow comic burst on a sky-blue halftone tile, speed lines behind it - thick ink outlines, flat colours
//   favicon   the small mark (32 x 32) for 16-32 px: tile, burst with 8 spikes, car body, two wheels and the antenna ball only, thicker lines
//   maskable  full-bleed tile, the burst and the car inside the safe zone (the inner 80 % circle of Android adaptive icons)
//   mono      one colour (currentColor): the burst as a ring, the car cut out of it, for places that tint it
//   logo      the mark with the word mark "TURBO TOYS" (Bangers as paths, ink outline, ink extrusion) for light surfaces,
//   logo-dark the same with a paper sticker edge for dark surfaces
//   hero      the large wide picture (1200 x 630): halftone sky, focus lines, the burst with the car, "VROOM!", the word mark, the tagline box
// It also writes the line icons of the game (24 x 24 like Lucide, ids mat-i-*): wwwroot/img/app-icons.svg (the game's sprite) and
// wwwroot/img/admin-icons.svg (MatGame merges <game>/img/admin-icons.svg into the admin sprite; there it leaves out the toolkit's icons).
// The word mark is converted to paths with fontkit (npm install in tools/ once), so the SVGs need no web font.
// The PNG icons, the Windows icon and the hero PNG are made from these files with scripts/icons.ps1 (Edge headless).
//   node scripts/logo.js
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.join(__dirname, '..');
const fontkit = createRequire(path.join(root, 'tools', 'package.json'))('fontkit');
const bangers = fontkit.openSync(path.join(root, 'src', 'TurboToys.Module', 'wwwroot', 'fonts', 'bangers-latin-400-normal.woff2'));

const red = '#e2392f';        // comic red, the accent
const redShade = '#a9221b';   // the shadow side of red
const yellow = '#f6c638';     // turbo yellow
const yellowShade = '#e39a1c';// the shadow side of yellow
const ink = '#14100c';        // the ink of the outlines
const paper = '#f4ead2';      // paper
const sky = '#2f6fd0';        // sky blue, the tile
const skyDots = '#255bb0';    // the halftone dots on sky
const skyLight = '#8fb8f0';   // glass
const steel = '#c9c2b0';      // the hubs' rim

// ---- small helpers ----
const n = v => String(Math.round(v * 100) / 100);
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// a jagged comic burst: n spikes between rIn and rOut, a little irregular (the same seed, the same burst)
function burst(cx, cy, rOut, rIn, spikes, seed, turn = 0, squash = 1) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const outer = i % 2 === 0;
    const a = turn * Math.PI / 180 + (i + (r() - 0.5) * 0.35) * Math.PI / spikes;
    const rad = outer ? rOut * (0.84 + r() * 0.16) : rIn * (0.9 + r() * 0.12);
    pts.push(`${n(cx + Math.cos(a) * rad)} ${n(cy + Math.sin(a) * rad * squash)}`);
  }
  return `M${pts.join(' L')} Z`;
}

// halftone: a grid of dots whose radius comes from size(x, y) (0 = no dot), one path
function halftone(x0, y0, w, h, step, size) {
  let d = '';
  for (let y = y0, row = 0; y <= y0 + h; y += step * 0.866, row++) {
    for (let x = x0 + (row % 2 ? step / 2 : 0); x <= x0 + w; x += step) {
      const r = size(x, y);
      if (r > step * 0.04) d += `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0`;
    }
  }
  return d;
}

// ---- the word mark: Bangers glyphs as paths ----
// 2 x 3 affine matrices [a b c d e f] (x' = a x + c y + e, y' = b x + d y + f)
const mul = (m, k) => [m[0] * k[0] + m[2] * k[1], m[1] * k[0] + m[3] * k[1], m[0] * k[2] + m[2] * k[3], m[1] * k[2] + m[3] * k[3],
  m[0] * k[4] + m[2] * k[5] + m[4], m[1] * k[4] + m[3] * k[5] + m[5]];
const translate = (x, y) => [1, 0, 0, 1, x, y];
const rotate = deg => { const a = deg * Math.PI / 180; return [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]; };
const skewX = deg => [1, 0, Math.tan(deg * Math.PI / 180), 1, 0, 0];

function glyphPath(glyph, m) {
  const p = (x, y) => `${n(m[0] * x + m[2] * y + m[4])} ${n(m[1] * x + m[3] * y + m[5])}`;
  return glyph.path.commands.map(c => {
    const a = c.args;
    switch (c.command) {
      case 'moveTo': return 'M' + p(a[0], a[1]);
      case 'lineTo': return 'L' + p(a[0], a[1]);
      case 'quadraticCurveTo': return 'Q' + p(a[0], a[1]) + ' ' + p(a[2], a[3]);
      case 'bezierCurveTo': return 'C' + p(a[0], a[1]) + ' ' + p(a[2], a[3]) + ' ' + p(a[4], a[5]);
      default: return 'Z';
    }
  }).join('');
}

// lays out text at (x, baseline) in px: each letter can bounce (dy, in em), turn (deg) and grow (scale); returns the paths per letter and the width
function lettering(text, size, x, baseline, { tracking = 0, skew = -4, bounce = [] } = {}) {
  const run = bangers.layout(text);
  const unit = size / bangers.unitsPerEm;
  const cap = bangers.capHeight * unit;
  const letters = [];
  let pen = x;
  run.glyphs.forEach((g, i) => {
    const b = bounce[i % (bounce.length || 1)] || {};
    const adv = run.positions[i].xAdvance * unit;
    if (g.path.commands.length) {
      const s = b.scale || 1;
      const cx = pen + adv / 2, cy = baseline - cap / 2;
      let m = translate(cx, cy + (b.dy || 0) * size);
      m = mul(m, rotate(b.rot || 0));
      m = mul(m, skewX(skew));
      m = mul(m, [s * unit, 0, 0, -s * unit, -adv / 2 * s, cap / 2 * s]);
      letters.push(glyphPath(g, m));
    }
    pen += adv + tracking * size;
  });
  return { letters, width: pen - x - tracking * size, cap };
}

// comic lettering: (sticker edge), ink extrusion to the lower right, ink outline, the fill in two tones (the lower part darker)
// colors: [fill, shade] per letter; id: a prefix for the clip path (unique per file)
function comicText(letters, colors, { outline, depth, sticker = null, id, shadeFrom }) {
  const all = letters.join('');
  const steps = Math.max(2, Math.round(depth / (outline * 0.35)));
  let out = '';
  if (sticker) {
    let edge = '';
    for (let k = 0; k <= steps; k++) edge += `<path transform="translate(${n(depth * k / steps)} ${n(depth * k / steps)})" d="${all}"/>`;
    out += `<g fill="${sticker}" stroke="${sticker}" stroke-width="${n(outline + outline * 1.3)}" stroke-linejoin="round">${edge}</g>`;
  }
  let extrude = '';
  for (let k = 1; k <= steps; k++) extrude += `<path transform="translate(${n(depth * k / steps)} ${n(depth * k / steps)})" d="${all}"/>`;
  out += `<g fill="${ink}" stroke="${ink}" stroke-width="${n(outline)}" stroke-linejoin="round">${extrude}<path d="${all}"/></g>`;
  const shade = letters.map((d, i) => `<path fill="${colors[i][1]}" d="${d}"/>`).join('');
  const fill = letters.map((d, i) => `<path fill="${colors[i][0]}" d="${d}"/>`).join('');
  out += `<clipPath id="${id}-top"><rect x="-9999" y="-9999" width="19999" height="${n(9999 + shadeFrom)}"/></clipPath>`;
  out += shade + `<g clip-path="url(#${id}-top)">${fill}</g>`;
  return out;
}

// ---- the car (side view, facing right) in the 64 x 64 grid of the mark; the ground is at y = 52 ----
const W = 2.2; // the ink line of the mark
const carOutline = 'M11.5 43.5 L10.4 35.6 Q10.2 32.6 13.2 32.2 L20.2 31.4 C21.4 26 24.8 23.6 29.6 23.6 L33.4 23.6 C36.6 23.6 38.6 26 40.6 30 L52 32.6 Q57.2 34 57.6 38.6 L57.4 41.6 Q57.2 43.5 55 43.5 Z';
const canopy = 'M22.6 31 C23.4 27.6 25.8 25.9 29.6 25.9 L33 25.9 C35 25.9 36.6 27.6 38 30.6 Z';
const decal = 'M34.6 32.6 L29.6 37.4 L32.6 37.4 L30 42 L37 36 L34 36 L36.4 32.6 Z';
const flame = 'M10.5 35.8 C6 33.4 3.5 30.6 -2 31.6 C1.4 33.6 1.6 34.8 -1.4 36.2 C2.4 36.9 3.4 38.4 -0.2 41 C4.6 41.4 7.5 40.4 10.8 39.6 Z';
const antenna = 'M18.5 31.5 C16.5 24 12.5 15.5 6.8 9.6';

// k thickens the ink lines (a car drawn smaller needs heavier lines); tread: knobby tyres; wing: the rear wing (too busy for the small mark)
function car({ tread = false, k = 1, wing = false } = {}) {
  const w = v => n(v * k);
  const wheel = (cx, cy, r) =>
    (tread ? `<circle cx="${cx}" cy="${cy}" r="${n(r + 0.35)}" fill="none" stroke="${ink}" stroke-width="1.6" stroke-dasharray="1.5 1.25"/>` : '') +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${ink}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${n(r * 0.5)}" fill="${yellow}" stroke="${steel}" stroke-width="0.9"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${n(r * 0.16)}" fill="${ink}"/>` +
    `<path d="M${n(cx - r * 0.62)} ${n(cy - r * 0.32)}A${n(r * 0.7)} ${n(r * 0.7)} 0 0 1 ${n(cx - r * 0.1)} ${n(cy - r * 0.7)}" stroke="${paper}" stroke-width="1" stroke-linecap="round" fill="none" opacity=".75"/>`;
  return [
    // turbo flame out of the exhaust (behind the car)
    `<path d="${flame}" fill="${red}" stroke="${ink}" stroke-width="${w(W)}" stroke-linejoin="round"/>`,
    `<path d="M10.5 36.7 C7.6 35.5 6 34.6 3.6 34.8 C5.2 35.9 5.2 36.9 3.6 37.9 C6.2 38.3 8 38.8 10.5 38.6 Z" fill="${yellow}"/>`,
    // the whip antenna, bent back by the speed, with its ball tip
    `<path d="${antenna}" stroke="${ink}" stroke-width="${w(1.7)}" stroke-linecap="round" fill="none"/>`,
    `<circle cx="6.2" cy="9" r="3" fill="${red}" stroke="${ink}" stroke-width="${w(1.8)}"/>`,
    `<circle cx="5.3" cy="8.1" r=".9" fill="${paper}"/>`,
    // rear wing on its post
    wing ? `<path d="M13.6 32 L12.4 27.4" stroke="${ink}" stroke-width="${w(2.4)}" stroke-linecap="round"/>` +
      `<path d="M4.6 25.8 L17.4 24.6 Q18.2 24.6 18 25.4 L17.6 27.2 Q17.4 27.8 16.6 27.9 L5.6 28.9 Q4.2 29 4.2 27.6 Z" fill="${red}" stroke="${ink}" stroke-width="${w(W)}" stroke-linejoin="round"/>` : '',
    // the body: deck, canopy, hood, round nose
    `<path d="${carOutline}" fill="${red}" stroke="${ink}" stroke-width="${w(W)}" stroke-linejoin="round"/>`,
    // the shadow side (lower body) and the shine on the top edge
    `<path d="M12.6 40.2 L56.6 40.2 L56.4 41.6 Q56.2 42.4 55 42.4 L12.7 42.4 Z" fill="${redShade}"/>`,
    `<path d="M14 34 L20.8 33.3 M42 31.6 L51.5 33.8" stroke="${paper}" stroke-width="1.3" stroke-linecap="round" opacity=".9"/>`,
    // the canopy
    `<path d="${canopy}" fill="${skyLight}" stroke="${ink}" stroke-width="${w(1.5)}" stroke-linejoin="round"/>`,
    `<path d="M26 29.4 L28.6 27.2" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`,
    // the lightning decal between the wheels
    `<path d="${decal}" fill="${yellow}" stroke="${ink}" stroke-width="${w(1)}" stroke-linejoin="round"/>`,
    // the bumper
    `<path d="M55.4 43.5 L58.4 43.5" stroke="${ink}" stroke-width="${w(2.4)}" stroke-linecap="round"/>`,
    // the wheels (the rear one bigger)
    wheel(19.2, 44.6, 7.6),
    wheel(47.2, 45.4, 6.8),
  ].join('');
}

// the inside of the 64 x 64 mark: the burst, the speed lines, the car (a little smaller, nose up, centred on the burst)
const carPlace = 'translate(32.5 37.5) scale(.84) rotate(-6) translate(-30 -37)';
const markBurst = burst(33, 34.5, 29, 19.5, 12, 5, -10);
const speedLines = 'M5.5 46.5 H13 M4.5 51.5 H15';
const markInside = () => [
  `<path d="${markBurst}" fill="${yellow}" stroke="${ink}" stroke-width="${W}" stroke-linejoin="round"/>`,
  `<path d="${speedLines}" stroke="${ink}" stroke-width="${W}" stroke-linecap="round"/>`,
  `<g transform="${carPlace}">${car({ k: 1.25 })}</g>`,
].join('');

const tileClip = id => `<clipPath id="${id}"><rect x="1.2" y="1.2" width="61.6" height="61.6" rx="13"/></clipPath>`;
const tileDots = halftone(0, 0, 64, 64, 4, (x, y) => Math.max(0, 1.5 * (1 - Math.hypot(x - 64, y - 64) / 60)) + Math.max(0, 1.3 * (1 - Math.hypot(x, y) / 44)));
const markShapes = (id) =>
  `<defs>${tileClip(id + '-tile')}</defs>` +
  `<rect x="1.2" y="1.2" width="61.6" height="61.6" rx="13" fill="${sky}"/>` +
  `<g clip-path="url(#${id}-tile)"><path d="${tileDots}" fill="${skyDots}"/>${markInside()}</g>` +
  `<rect x="1.2" y="1.2" width="61.6" height="61.6" rx="13" fill="none" stroke="${ink}" stroke-width="2.4"/>`;

// ---- the small mark (32 x 32): a burst with 7 big spikes, the car bigger and without flame, decal and shine, thicker lines ----
const faviconShapes =
  `<defs><clipPath id="tt-fav-tile"><rect x="1" y="1" width="30" height="30" rx="6.5"/></clipPath></defs>` +
  `<rect x="1" y="1" width="30" height="30" rx="6.5" fill="${sky}"/>` +
  `<g clip-path="url(#tt-fav-tile)">` +
  `<path d="${burst(16.5, 16, 16, 10.5, 7, 9, -100)}" fill="${yellow}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>` +
  `<g transform="rotate(-5 16 19)">` +
  `<path d="M8.8 15.6 C8 12.2 6.8 9.4 5.2 7.4" stroke="${ink}" stroke-width="1.5" stroke-linecap="round" fill="none"/>` +
  `<circle cx="5" cy="7" r="2.3" fill="${red}" stroke="${ink}" stroke-width="1.4"/>` +
  `<path d="M4.2 22.4 L3.8 18 Q3.8 16 5.8 15.8 L9.6 15.3 C10.4 12.6 12 11.4 14.6 11.4 L16.4 11.4 C18.2 11.4 19.4 12.6 20.6 15 L25.6 16.1 Q28.4 16.9 28.4 19.6 L28.3 21.2 Q28.2 22.4 26.9 22.4 Z" fill="${red}" stroke="${ink}" stroke-width="1.7" stroke-linejoin="round"/>` +
  `<path d="M12 15 C12.6 13.8 13.6 13.3 14.8 13.3 L16.2 13.3 C17 13.3 17.6 14 18.2 15 Z" fill="${skyLight}"/>` +
  `<circle cx="9.2" cy="22.8" r="4.1" fill="${ink}"/><circle cx="9.2" cy="22.8" r="1.3" fill="${paper}"/>` +
  `<circle cx="23.2" cy="23.1" r="3.7" fill="${ink}"/><circle cx="23.2" cy="23.1" r="1.2" fill="${paper}"/>` +
  `</g></g>` +
  `<rect x="1" y="1" width="30" height="30" rx="6.5" fill="none" stroke="${ink}" stroke-width="2"/>`;

// ---- one colour: the burst as a ring, the car (silhouette with window, hubs and decal cut out) inside it with a gap, the speed lines ----
const carSilhouette =
  `<path d="${carOutline}"/><circle cx="19.2" cy="44.6" r="7.6"/><circle cx="47.2" cy="45.4" r="6.8"/>` +
  `<path d="${antenna}" stroke-width="1.7" fill="none"/><circle cx="6.2" cy="9" r="3"/><path d="${flame}"/>`;
const monoShapes =
  `<defs>` +
  `<mask id="tt-mono-ring" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/>` +
  `<path d="${markBurst}" transform="translate(33 34.5) scale(.8) translate(-33 -34.5)" fill="#000"/>` +
  `<g transform="${carPlace}" fill="#000" stroke="#000" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">${carSilhouette}</g></mask>` +
  `<mask id="tt-mono-car" maskUnits="userSpaceOnUse" x="-4" y="0" width="72" height="64"><rect x="-4" width="72" height="64" fill="#fff"/>` +
  `<g transform="${carPlace}" fill="#000">` +
  `<path d="${canopy}"/><path d="${decal}"/>` +
  `<circle cx="19.2" cy="44.6" r="3.2"/><circle cx="47.2" cy="45.4" r="2.8"/>` +
  `<path d="M12.4 41.4 H57" stroke="#000" stroke-width="1.4"/><path d="M10.6 37.4 H4.5" stroke="#000" stroke-width="1.6" stroke-linecap="round"/>` +
  `</g></mask></defs>` +
  `<path d="${markBurst}" mask="url(#tt-mono-ring)"/>` +
  `<g transform="${carPlace}" stroke="currentColor" stroke-linecap="round" mask="url(#tt-mono-car)">${carSilhouette}</g>` +
  `<path d="${speedLines}" stroke="currentColor" stroke-width="${W}" stroke-linecap="round"/>`;

function svg(viewBox, body, extra = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${extra} role="img" aria-label="TurboToys">\n  ${body}\n</svg>\n`;
}

// ---- mark + word mark ----
const bounce = [{ dy: 0.02, rot: -3 }, { dy: -0.03, rot: 2 }, { dy: 0.01, rot: -2 }, { dy: -0.02, rot: 3 }, { dy: 0.02, rot: -1 }];
function logo(dark) {
  const size = 52, base = 51;
  const turbo = lettering('TURBO', size, 76, base, { bounce, tracking: 0.02 });
  const toys = lettering('TOYS', size, 76 + turbo.width + size * 0.2, base, { bounce: bounce.slice(1), tracking: 0.02 });
  const width = Math.ceil(76 + turbo.width + size * 0.2 + toys.width + 14);
  const colors = [...turbo.letters.map(() => [yellow, yellowShade]), ...toys.letters.map(() => [red, redShade])];
  const id = dark ? 'tt-logo-dark' : 'tt-logo';
  const text = comicText([...turbo.letters, ...toys.letters], colors,
    { outline: 4.4, depth: 4, sticker: dark ? paper : null, id, shadeFrom: base - turbo.cap * 0.36 });
  const mark = dark
    ? `<rect x="2" y="4" width="64" height="64" rx="14" fill="${paper}"/><g transform="translate(2 4)">${markShapes(id + '-mark')}</g>`
    : `<g transform="translate(2 4)">${markShapes(id + '-mark')}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 72" width="${width}" height="72" role="img" aria-label="TurboToys">\n  ${mark}\n  ${text}\n</svg>\n`;
}

// ---- the hero (1200 x 630) ----
function hero() {
  const Wd = 1200, H = 630;
  const cx = 318, cy = 322;
  // focus lines out of the burst's centre
  const r = rng(11);
  let rays = '';
  for (let i = 0; i < 64; i++) {
    const a = (i + r() * 0.6) * Math.PI * 2 / 64, a2 = a + 0.012 + r() * 0.03;
    const r0 = 280 + r() * 60, r1 = 1400;
    rays += `M${n(cx + Math.cos(a) * r0)} ${n(cy + Math.sin(a) * r0)}L${n(cx + Math.cos(a) * r1)} ${n(cy + Math.sin(a) * r1)}L${n(cx + Math.cos(a2) * r1)} ${n(cy + Math.sin(a2) * r1)}Z`;
  }
  const dots = halftone(0, 0, Wd, H, 16, (x, y) => Math.min(6.4, Math.max(0, (Math.hypot(x - cx, (y - cy) * 1.2) - 300) / 95)));
  // the word mark in two lines, sticker edge, ink extrusion; the lower part of each line darker
  const size = 172, x0 = 628, base1 = 238, base2 = 404;
  const turbo = lettering('TURBO', size, x0, base1, { bounce, tracking: 0.015, skew: -5 });
  const toys = lettering('TOYS', size, x0 + 72, base2, { bounce: bounce.slice(2), tracking: 0.015, skew: -5 });
  const word = comicText([...turbo.letters, ...toys.letters],
    [...turbo.letters.map(() => [yellow, yellowShade]), ...toys.letters.map(() => [red, redShade])],
    { outline: 14, depth: 13, sticker: paper, id: 'tt-hero-word', shadeFrom: 0 })
    .replace(/<clipPath id="tt-hero-word-top">.*?<\/clipPath>/, '');
  const clip = `<clipPath id="tt-hero-word-top"><rect x="0" y="0" width="${Wd}" height="${n(base1 - turbo.cap * 0.36)}"/><rect x="0" y="${base1 + 10}" width="${Wd}" height="${n(base2 - base1 - 10 - toys.cap * 0.36)}"/></clipPath>`;
  // the sound: paper letters, ink outline, a red extrusion
  const vroom = lettering('VROOM!', 96, 40, 586, { bounce: [{ rot: -4 }, { rot: 3, dy: -0.04 }, { rot: -2 }, { rot: 4, dy: -0.03 }, { rot: -3, dy: 0.02 }, { rot: 6 }], skew: -8, tracking: 0.01 });
  let sfx = '';
  for (let k = 1; k <= 6; k++) sfx += `<path transform="translate(${n(k * 1.6)} ${n(k * 1.6)})" d="${vroom.letters.join('')}"/>`;
  sfx = `<g fill="${ink}" stroke="${ink}" stroke-width="16" stroke-linejoin="round">${sfx}</g>` +
    `<g fill="${red}" stroke="${red}" stroke-width="5" stroke-linejoin="round" transform="translate(5 5)"><path d="${vroom.letters.join('')}"/></g>` +
    `<g fill="${ink}" stroke="${ink}" stroke-width="8" stroke-linejoin="round"><path d="${vroom.letters.join('')}"/></g>` +
    `<path fill="${paper}" d="${vroom.letters.join('')}"/>`;
  // the tagline in a caption box (as wide as the word mark)
  const tagSize = 33;
  const tag = lettering('Ferngesteuert. Frisiert. Furchtlos.', tagSize, 0, 0, { skew: -2, tracking: 0.04 });
  const boxW = tag.width + 44, boxH = 60;
  const box = `<g transform="translate(${x0 + 6} 462) rotate(-2)">` +
    `<rect x="9" y="9" width="${n(boxW)}" height="${boxH}" fill="${ink}"/>` +
    `<rect x="0" y="0" width="${n(boxW)}" height="${boxH}" fill="${paper}" stroke="${ink}" stroke-width="6" stroke-linejoin="round"/>` +
    `<g transform="translate(22 ${n(boxH / 2 + tag.cap / 2)})" fill="${ink}"><path d="${tag.letters.join('')}"/></g></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wd} ${H}" width="${Wd}" height="${H}" role="img" aria-label="TurboToys - Ferngesteuert. Frisiert. Furchtlos.">\n` +
    `  <defs><clipPath id="tt-hero-frame"><rect width="${Wd}" height="${H}"/></clipPath>${clip}</defs>\n` +
    `  <g clip-path="url(#tt-hero-frame)">\n` +
    `  <rect width="${Wd}" height="${H}" fill="${sky}"/>\n` +
    `  <path d="${rays}" fill="#3f80de"/>\n` +
    `  <path d="${dots}" fill="${skyDots}"/>\n` +
    `  <path d="${burst(cx + 4, cy + 4, 318, 222, 14, 21, 4)}" fill="${red}" stroke="${ink}" stroke-width="10" stroke-linejoin="round"/>\n` +
    `  <path d="${burst(cx, cy, 272, 192, 13, 5, -6)}" fill="${yellow}" stroke="${ink}" stroke-width="10" stroke-linejoin="round"/>\n` +
    `  <path d="${halftone(cx - 300, cy - 300, 600, 600, 12, (x, y) => { const d = Math.hypot(x - cx, y - cy); return d < 240 ? Math.max(0, (d - 140) / 40) : 0; })}" fill="${yellowShade}" opacity=".5"/>\n` +
    `  <path d="M40 402 H150 M18 446 H132" stroke="${ink}" stroke-width="12" stroke-linecap="round"/>\n` +
    `  <g transform="translate(${cx + 8} ${cy + 10}) scale(7.2) rotate(-6) translate(-31 -38)">${car({ tread: true })}</g>\n` +
    `  <g transform="rotate(-7 200 550)">${sfx}</g>\n` +
    `  ${word}\n` +
    `  ${box}\n` +
    `  </g>\n` +
    `  <rect x="5" y="5" width="${Wd - 10}" height="${H - 10}" fill="none" stroke="${ink}" stroke-width="10"/>\n` +
    `</svg>\n`;
}

const files = {
  'turbotoys-mark.svg': svg('0 0 64 64', markShapes('tt-mark')),
  'turbotoys-favicon.svg': svg('0 0 32 32', faviconShapes),
  'turbotoys-maskable.svg': svg('0 0 64 64',
    `<rect width="64" height="64" fill="${sky}"/><path d="${halftone(0, 0, 64, 64, 4, (x, y) => Math.max(0, 1.5 * (1 - Math.hypot(x - 64, y - 64) / 60)) + Math.max(0, 1.3 * (1 - Math.hypot(x, y) / 44)))}" fill="${skyDots}"/>\n` +
    `  <g transform="translate(32 32) scale(.76) translate(-32.5 -33.5)">${markInside()}</g>`),
  'turbotoys-mono.svg': svg('0 0 64 64', monoShapes, ' fill="currentColor"'),
  'turbotoys-logo.svg': logo(false),
  'turbotoys-logo-dark.svg': logo(true),
  'turbotoys-hero.svg': hero(),
};

const module_ = path.join(root, 'src', 'TurboToys.Module', 'wwwroot');
for (const dir of [path.join(root, 'docs', 'logo'), path.join(module_, 'img', 'logo')]) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
}

fs.writeFileSync(path.join(module_, 'favicon.svg'), files['turbotoys-favicon.svg']);

// ---- the line icons: 24 x 24 (stroke currentColor, width 2, round caps and joins), ids mat-i-* next to the toolkit's ----
const line = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const solid = 'fill="currentColor" stroke="none"';
const symbols = {
  // the mark: the RC buggy with its whip antenna and ball tip, speed lines behind it
  turbotoys:
    `<path d="M7 18H5.5A1.5 1.5 0 0 1 4 16.5V14l3-.5 2.5-3h4.5l2.5 3 3 .8a2 2 0 0 1 1.5 2V16.5a1.5 1.5 0 0 1-1.5 1.5H19"/>` +
    `<path d="M11 18h4"/><circle cx="9" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/>` +
    `<path d="M7.5 13.2 5 5.5"/><circle cx="4.6" cy="4" r="1.5"/><path d="M1 11h1.5M1 14.5h.5"/>`,
  car:
    `<path d="M5 17H3.5A1.5 1.5 0 0 1 2 15.5V13a1 1 0 0 1 .7-1l3.8-1.2L9 7.5A1 1 0 0 1 9.8 7h4.8a1 1 0 0 1 .8.4l2.6 3.4 2.8.9A1.5 1.5 0 0 1 22 13.1v2.4a1.5 1.5 0 0 1-1.5 1.5H19"/>` +
    `<path d="M9 17h6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M6.5 10.8H18"/>`,
  wrench:
    `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>`,
  trophy:
    `<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/>` +
    `<path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.8 18.8 7 20.2 7 22"/><path d="M14 14.7V17c0 .6.5 1 1 1.2 1.2.6 2 2 2 3.8"/>` +
    `<path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>`,
  flag:
    `<path d="M4 22V3"/><path d="M4 4h16v10H4"/>` +
    `<path ${solid} d="M4 4h4v3.33H4zM12 4h4v3.33h-4zM8 7.33h4v3.34H8zM16 7.33h4v3.34h-4zM4 10.67h4V14H4zM12 10.67h4V14h-4z"/>`,
  track:
    `<path d="M3 22c1.5-4 6-5 7-8.5S7.5 7 9 4.5 12 2 12 2"/><path d="M13 22c1.5-4 6.5-5.5 7-9S16.5 7 16 4.5 15 2 15 2"/>` +
    `<path d="M8 22c1.4-3.8 5.8-5 6.6-8.6" stroke-dasharray="2.5 3"/><path d="M13.6 10.5c-.8-2.4-1.4-4.7-.6-7.5" stroke-dasharray="2.5 3"/>`,
  weapon:
    `<path d="M20.5 3.5c-2.6-.2-5.4.6-7.5 2.7L7.6 11.6l4.8 4.8 5.4-5.4c2.1-2.1 2.9-4.9 2.7-7.5z"/>` +
    `<path d="M7.6 11.6 4.4 11 2.8 12.6l3.4 1.6"/><path d="m12.4 16.4.6 3.2-1.6 1.6-1.6-3.4"/>` +
    `<path d="M6.5 17.5 3 21M5 15.8 2.8 18M8.2 19 6 21.2"/><circle cx="15.8" cy="8.2" r="1.3"/>`,
  bolt:
    `<path d="M13 2 4 14h7.5L10 22l10-12h-7.5L13 2z"/>`,
  gauge:
    `<path d="M4.2 18.5a9 9 0 1 1 15.6 0"/><path d="m12 14 4.5-5"/><circle cx="12" cy="14" r="1.6"/>` +
    `<path d="M12 5.5V7M6.3 8l1 1M17.7 8l-1 1M4 13h1.5M18.5 13H20"/>`,
  coin:
    `<circle cx="12" cy="12" r="9.5"/><path d="M12 6.8l4.5 2.6v5.2L12 17.2l-4.5-2.6V9.4z"/><circle cx="12" cy="12" r="1.8"/>`,
  helmet:
    `<path d="M21 12c-.4-4.2-3.8-7-8.5-7C7.3 5 3 9 3 14.5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/>` +
    `<path d="M21 10h-7.5a1.5 1.5 0 0 0-1.5 1.5v1a1.5 1.5 0 0 0 1.5 1.5H21"/><path d="M3.6 12.5c2 1.5 4.4 1.8 6.4 1.5"/>`,
  turbo:
    `<path d="M11 21a8 8 0 1 1 8-8"/><path d="M19 13V4h3"/><path d="M11 3v2"/>` +
    `<path d="M11 13a1 1 0 0 1 2 0 3 3 0 0 1-3 3 4 4 0 0 1-4-4 5 5 0 0 1 5-5"/><path d="M11 21h-3"/>`,
  fuel:
    `<path d="M9 3h9a2 2 0 0 1 2 2v15a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 5 20V7z"/>` +
    `<path d="M13 3v3h4V3"/><path d="m9 11 6 6M15 11l-6 6"/><path d="M5 7 3 5l2-2 2 2"/>`,
  battery:
    `<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/><path d="m11 9.5-2.5 3h4l-2.5 3"/>`,
};

const sprite = names => `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n` +
  names.map(name => `  <symbol id="mat-i-${name}" viewBox="0 0 24 24" ${line}>${symbols[name]}</symbol>`).join('\n') + `\n</svg>\n`;
fs.writeFileSync(path.join(module_, 'img', 'app-icons.svg'), sprite(Object.keys(symbols)));

// the admin sprite of MatGame already has the toolkit's icons (matui-icons.svg) in the same page: do not repeat an id it has (wrench)
const toolkitIcons = ['wrench'];
fs.writeFileSync(path.join(module_, 'img', 'admin-icons.svg'), sprite(Object.keys(symbols).filter(name => !toolkitIcons.includes(name))));

console.log('logo and sprites written');
