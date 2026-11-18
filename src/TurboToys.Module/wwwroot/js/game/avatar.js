// TurboToys driver portraits: comic head-and-shoulders SVGs (thick ink outlines, flat colours, a little halftone shading).
// The look keys (face / hair / helmet) are a contract with the server: never rename one.
// Layers: background → hair (back) → suit → neck → ears → head → face → hair (front or, under cap/viking, the sides) → helmet → frame.

const INK = '#14100c';

/** Labels in German for the menu (the keys are the contract). */
export const AVATAR_LABELS = {
    face: { grin: 'Grinsen', cool: 'Lässig', angry: 'Wütend', wink: 'Zwinkern', shock: 'Schock', smirk: 'Schmunzeln', crazy: 'Verrückt' },
    hair: { spiky: 'Stachelig', bob: 'Bob', bald: 'Glatze', mohawk: 'Irokese', afro: 'Afro', ponytail: 'Zopf', quiff: 'Tolle' },
    helmet: { none: 'Ohne', racer: 'Rennhelm', cap: 'Kappe', goggles: 'Fliegerbrille', bandana: 'Bandana', crown: 'Krone', viking: 'Wikinger', headset: 'Headset' },
};

// ---------------------------------------------------------------- colours

function normHex(c, fallback) {
    if (typeof c !== 'string') return fallback;
    const m = c.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return fallback;
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    return '#' + h;
}
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = a => '#' + a.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
const lum = h => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

const HAIR_LIGHT = ['#2a211c', '#5b3a22', '#8a5a2b', '#e8b64a', '#d8692a', '#3b2a20', '#f0d67a'];
const HAIR_DARK = ['#1f1a17', '#2a211c', '#3b2a20', '#2a211c', '#5b3a22'];
/** Hair colour: derived from the skin (stable while changing face/hair/helmet), overridable with look.hairColor. */
function hairColorFor(skin) {
    let h = 7;
    for (const ch of skin) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const list = lum(skin) < 0.45 ? HAIR_DARK : HAIR_LIGHT;
    return list[h % list.length];
}

// ---------------------------------------------------------------- svg helpers

const MIRROR = 'matrix(-1 0 0 1 100 0)';
const fmt = n => (Math.round(n * 100) / 100).toString();

/** filled shape without stroke */
const fillP = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="none"${extra}/>`;
/** ink outline only */
const lineP = (d, w = 3, extra = '') => `<path d="${d}" fill="none" stroke-width="${w}"${extra}/>`;
/** fill + ink outline */
const shapeP = (d, fill, w = 3, extra = '') => `<path d="${d}" fill="${fill}" stroke-width="${w}"${extra}/>`;

class Svg {
    constructor() {
        this.id = 'tta' + (++Svg.uid).toString(36);
        this.defs = [];
        this.clips = 0;
    }
    clip(d) {
        const id = `${this.id}c${++this.clips}`;
        this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
        return `url(#${id})`;
    }
    /** A shape with flat fill, a shaded crescent (darker colour + halftone dots) away from the light (top-left), ink outline. */
    shaded(d, fill, { cx = 46, cy = 41, rx = 24, ry = 27, w = 3, dark = 0.22, dots = 0.3 } = {}) {
        const shade = mix(fill, '#2a0f1e', dark);
        const hole = `M${fmt(cx - rx)} ${fmt(cy)}a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(2 * rx)} 0a${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(-2 * rx)} 0Z`;
        const crescent = `M-20 -20H120V120H-20Z${hole}`;
        return fillP(d, fill)
            + `<g clip-path="${this.clip(d)}" stroke="none"><path d="${crescent}" fill="${shade}" fill-rule="evenodd"/>`
            + `<path d="${crescent}" fill="url(#${this.id}dots)" fill-rule="evenodd" opacity="${dots}"/></g>`
            + lineP(d, w);
    }
}
Svg.uid = 0;

// ---------------------------------------------------------------- head geometry (viewBox 0 0 100 100)

const HEAD = 'M50 17C64 17 73 27 73 42C73 57 66 69 50 71C34 69 27 57 27 42C27 27 36 17 50 17Z';
const EAR = 'M28 40C22 38 20.5 44 22 49C23 53 26 55 29 53';

// ---------------------------------------------------------------- hair
// back: drawn behind the head (clipped below a helmet line), front: over the forehead (only without a covering helmet),
// sides: what peeks out under a cap / viking helmet, top: highest point (crown / headset placement).

function afroCloud(cx, cy, rx, ry, n) {
    let d = '';
    for (let i = 0; i <= n; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        if (i === 0) d += `M${fmt(x)} ${fmt(y)}`;
        else {
            const am = a - Math.PI / n;
            d += `Q${fmt(cx + Math.cos(am) * rx * 1.24)} ${fmt(cy + Math.sin(am) * ry * 1.24)} ${fmt(x)} ${fmt(y)}`;
        }
    }
    return d + 'Z';
}

const HAIR = {
    spiky: {
        top: 2,
        front: (s, hc, hl) => s.shaded('M26 47C24 40 23 34 25 29L17 25L26 20L21 9L34 14L35 2L44 11L50 0L56 10L66 2L67 14L79 9L74 20L83 25L75 29C77 34 76 40 74 47L70 37L65 34L61 38L56 32L51 37L46 32L41 37L36 33L31 37Z', hc, { cx: 44, cy: 34, rx: 32, ry: 34 })
            + lineP('M40 10L44 19M57 9L55 18M30 18L35 24', 2, ` stroke="${hl}"`),
        sides: (s, hc) => { const d = 'M27.5 49C26.5 44 26 40 27 36L21.5 33L27.5 31L31.5 34L30.5 47Z'; return shapeP(d, hc, 2.5) + `<g transform="${MIRROR}">${shapeP(d, hc, 2.5)}</g>`; },
    },
    bob: {
        top: 11,
        back: (s, hc) => s.shaded('M22 66C16 46 18 12 50 11C82 12 84 46 78 66C74 70 68 68 67 64L33 64C32 68 26 70 22 66Z', mix(hc, '#000', 0.12), { cx: 44, cy: 34, rx: 32, ry: 36 }),
        front: (s, hc, hl) => s.shaded('M25 64C22 50 23 28 30 21C36 14 44 12 50 12C64 12 74 18 76 30C78 42 77 54 75 64C73 66 70 65 69 63C70 52 70 44 69 38C67 35 65 33 63 31C58 35 52 35 48 32C44 35 38 36 34 33C32 38 31 46 31 63C29 66 26 66 25 64Z', hc, { cx: 44, cy: 32, rx: 30, ry: 32 })
            + lineP('M38 17C43 15 50 15 56 16M26.5 40C26 46 26.5 52 27 58', 2, ` stroke="${hl}"`),
        sides: (s, hc) => { const d = 'M24 64C22 52 23 40 27 31L33 32C31 42 31 52 31 63C29 66 26 66 24 64Z'; return shapeP(d, hc) + `<g transform="${MIRROR}">${shapeP(d, hc)}</g>`; },
    },
    bald: {
        top: 17,
        front: () => lineP('M35 27Q40 21 47 20', 2.6, ' stroke="#fff" opacity=".75"') + '<circle cx="53" cy="20.5" r="1.3" fill="#fff" stroke="none" opacity=".75"/>',
        sides: () => '',
    },
    mohawk: {
        top: 0,
        front: (s, hc, hl) => fillP('M28 40C28 26 36 18 50 18C64 18 72 26 72 40C66 33 34 33 28 40Z', hc, ' opacity=".3"')
            + s.shaded('M43 34C41 25 40 17 41 10L37 5L44.5 6L46 0L51.5 5L57 0L58 7L64 6C60 13 60 24 57 34C53 31 47 31 43 34Z', hc, { cx: 46, cy: 20, rx: 12, ry: 22 })
            + lineP('M48 9L48.5 20M53 8L52.5 18', 1.8, ` stroke="${hl}"`),
        sides: (s, hc) => { const d = 'M27.5 45C27 39 28 35 31 32L32 45Z'; return fillP(d, hc, ' opacity=".35"') + `<g transform="${MIRROR}">${fillP(d, hc, ' opacity=".35"')}</g>`; },
    },
    afro: {
        top: 0,
        back: (s, hc) => {
            const cloud = afroCloud(50, 32, 29.5, 26.5, 17);
            const curls = [[30, 20], [40, 10], [58, 9], [70, 19], [24, 36], [76, 36], [22, 50], [78, 50], [49, 6]]
                .map(([x, y]) => `M${x - 2.5} ${y + 1}q2.5 -3.5 5 0`).join('');
            return s.shaded(cloud, hc, { cx: 44, cy: 26, rx: 34, ry: 32 }) + lineP(curls, 1.6, ` stroke="${mix(hc, '#fff', 0.25)}"`);
        },
        front: (s, hc) => s.shaded('M27 44C25 34 28 24 36 20C42 17 58 17 64 20C72 24 75 34 73 44C71 38 68 34 64 32Q61 35 57 32.5Q54 35 50 32Q46 35 43 32.5Q39 35 36 32C32 34 29 38 27 44Z', hc, { cx: 44, cy: 26, rx: 30, ry: 22 }),
        sides: () => '',
    },
    ponytail: {
        top: 14,
        back: (s, hc, hl, look) => s.shaded('M64 22C80 17 89 30 86 47C84 57 84 66 79 76C77 70 77 64 77 56C78 47 75 39 64 31Z', mix(hc, '#000', 0.1), { cx: 74, cy: 40, rx: 14, ry: 28 })
            + shapeP('M64.5 21.5L70 20L71.5 30.5L66 32Z', look.color, 2.5),
        front: (s, hc, hl) => s.shaded('M27 46C24 28 36 14 52 14C66 14 76 24 73 46C71 38 68 32 62 29C56 31 50 30 45 27C41 31 34 33 30 37C28 40 27 43 27 46Z', hc, { cx: 44, cy: 32, rx: 30, ry: 30 })
            + lineP('M45 27C48 22 52 18 56 15', 2) + lineP('M33 24C36 20 40 18 43 17', 2, ` stroke="${hl}"`),
        sides: (s, hc) => { const d = 'M27.5 48C26 40 28 34 32 31L32.5 44Z'; return shapeP(d, hc, 2.5) + `<g transform="${MIRROR}">${shapeP(d, hc, 2.5)}</g>`; },
    },
    quiff: {
        top: 3,
        front: (s, hc, hl) => s.shaded('M27 46C25 32 29 22 38 18C34 10 42 3 56 3C68 3 79 9 77 18C73 16 68 16 65 18C71 22 75 32 73 46C71 38 67 33 61 31C53 30 44 31 36 34C31 37 28 41 27 46Z', hc, { cx: 46, cy: 30, rx: 30, ry: 28 })
            + lineP('M42 10C50 6 61 6 70 10M40 19C47 15 56 15 63 17', 2, ` stroke="${hl}"`),
        sides: (s, hc) => { const d = 'M27.5 48L27 36C29 34 31 33 32 33L31.5 48Z'; return shapeP(d, hc, 2.5) + `<g transform="${MIRROR}">${shapeP(d, hc, 2.5)}</g>`; },
    },
};

// ---------------------------------------------------------------- faces (eyes at y 46: x 41 / 59, mouth around y 60)

function eye(cx, cy, rx, ry, px = 0, py = 0, pr = 2.3) {
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fffaf0" stroke-width="2.2"/>`
        + `<circle cx="${fmt(cx + px)}" cy="${fmt(cy + py)}" r="${pr}" fill="${INK}" stroke="none"/>`
        + `<circle cx="${fmt(cx + px - pr * 0.35)}" cy="${fmt(cy + py - pr * 0.4)}" r="${fmt(pr * 0.35)}" fill="#fff" stroke="none"/>`;
}
const MOUTH = '#5a1620', TONGUE = '#ff5d6c', TEETH = '#fffaf0';
const NOSE = lineP('M49 49Q46.3 53.5 49.5 54.6Q51.6 55.1 53.2 53.6', 2.2);
const blush = (op = 0.4) => `<g stroke="none" fill="#ff6f7d" opacity="${op}"><ellipse cx="34" cy="56" rx="4" ry="2.6"/><ellipse cx="66" cy="56" rx="4" ry="2.6"/></g>`;
/** open mouth: dark shape, teeth (top band), tongue, clipped to the mouth */
function openMouth(s, d, { teeth = '', tongue = '' } = {}) {
    const cp = s.clip(d);
    return fillP(d, MOUTH) + `<g clip-path="${cp}" stroke="none">${teeth ? fillP(teeth, TEETH) : ''}${tongue ? fillP(tongue, TONGUE) : ''}</g>` + lineP(d, 2.5);
}

const FACES = {
    grin: s => lineP('M34 38Q40 33.5 46 36.5M54 36.5Q60 33.5 66 38', 3)
        + eye(41, 46, 4.2, 5, 0.6, 0.5) + eye(59, 46, 4.2, 5, -0.2, 0.5)
        + blush(0.45) + NOSE
        + openMouth(s, 'M36 57.5Q50 61.5 64 57.5Q61.5 69.5 50 69.5Q38.5 69.5 36 57.5Z', { teeth: 'M30 50H70V61Q50 64.5 30 61Z', tongue: 'M40 72Q44 64.5 51 65Q58 64.5 61 72Z' })
        + lineP('M33.5 55Q34.5 58 37 58.5M66.5 55Q65.5 58 63 58.5', 2),
    cool: s => {
        const lens = 'M32.5 41H47.2Q48.2 41 47.9 42.6L46.5 48.2Q45.6 51.2 42 51.2H37.6Q34 51.2 33.4 48.2L32.2 42.6Q32 41 32.5 41Z';
        const one = shapeP(lens, '#1d2230', 2.6) + lineP('M36 43.5L39 49M40.5 43.5L42 46', 1.6, ' stroke="#fff" opacity=".8"');
        return lineP('M34 37.5L46 37M54 36.5Q60 32.5 66 35', 3)
            + lineP('M32.5 42.2L27.5 41M67.5 42.2L72.5 41', 2.4)
            + one + `<g transform="${MIRROR}">${one}</g>` + lineP('M47.6 42.8Q50 41.2 52.4 42.8', 2.4)
            + NOSE + blush(0.25)
            + lineP('M40.5 60.5Q50 64.5 59 59.2', 2.8) + lineP('M58.6 59.4L61.2 57.4', 2.2);
    },
    angry: s => fillP('M33 36.5L47.5 42L46.8 44.8L32.6 39.6Z', INK) + fillP('M67 36.5L52.5 42L53.2 44.8L67.4 39.6Z', INK)
        + shapeP('M35.5 44.6L46.5 46.8Q46 51.2 41 51.2Q36 51.2 35.5 44.6Z', '#fffaf0', 2.2) + '<circle cx="42.5" cy="48.6" r="1.9" fill="#14100c" stroke="none"/>'
        + shapeP('M64.5 44.6L53.5 46.8Q54 51.2 59 51.2Q64 51.2 64.5 44.6Z', '#fffaf0', 2.2) + '<circle cx="57.5" cy="48.6" r="1.9" fill="#14100c" stroke="none"/>'
        + NOSE
        + shapeP('M38 58.5Q50 55.8 62 58.5L61 65.5Q50 63.5 39 65.5Z', TEETH, 2.5)
        + lineP('M38.6 62Q50 59.8 61.4 62M44 57.6L44 64.6M50 57L50 64M56 57.6L56 64.6', 1.5)
        + lineP('M35.5 61.5L38.5 60M64.5 61.5L61.5 60', 2),
    wink: s => lineP('M34 36.5Q40 32 46 35M54 40Q59.5 38.5 65 40.5', 3)
        + eye(41, 46, 4.2, 5, 0.8, 0.3)
        + lineP('M53.5 47.5Q59 42.5 64.5 47.5', 3) + lineP('M64.3 47.3L66.6 45.6', 2)
        + blush(0.45) + NOSE
        + openMouth(s, 'M39.5 58Q51 60.5 62 56.5Q59 66.5 50 66.5Q42.5 66.5 39.5 58Z', { teeth: 'M30 50H70V58.2Q51 62 30 59.6Z', tongue: 'M46 70Q51 61.5 58 63Q61 66 60 70Z' })
        + `<path d="M70 37l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z" fill="#fff6a8" stroke-width="1.4"/>`,
    shock: s => lineP('M34 35Q40 30 46 33.5M54 33.5Q60 30 66 35', 3)
        + eye(41, 46, 5.2, 6.2, 0, 0, 1.5) + eye(59, 46, 5.2, 6.2, 0, 0, 1.5)
        + NOSE
        + openMouth(s, 'M50 56.5C55 56.5 55.5 60 55.5 63C55.5 66.5 53.5 69 50 69C46.5 69 44.5 66.5 44.5 63C44.5 60 45 56.5 50 56.5Z', { tongue: 'M44 70Q47 64.5 50 64.8Q53 64.5 56 70Z' })
        + shapeP('M69 31Q72.5 36.5 69 38.6Q65.5 36.5 69 31Z', '#9fe0ff', 1.8) + shapeP('M31 30Q33.4 34 31 35.4Q28.6 34 31 30Z', '#9fe0ff', 1.6),
    smirk: (s, skin) => lineP('M34 35.5Q40 31 46 35M54 39.2L66 37.8', 3)
        + eye(41, 46.5, 4.4, 4.8, 1.6, 0.9, 2.2) + fillP('M35 46.2H47V40H35Z', skin) + lineP('M36.2 46.2H45.8', 2.6)
        + eye(59, 46.5, 4.4, 4.8, 1.6, 0.9, 2.2) + fillP('M53 46.2H65V40H53Z', skin) + lineP('M54.2 46.2H63.8', 2.6)
        + NOSE + blush(0.3)
        + lineP('M41.5 61Q52 62.8 59.2 57', 2.8) + lineP('M58.8 56.6Q61.8 57.4 61 60.4', 2),
    crazy: s => lineP('M31.5 35Q37 29 45 34M55 41.5Q58 38.5 61 40.5T66.5 40', 3)
        + eye(40, 45, 6.4, 6.6, 0.8, -0.8, 1.5) + eye(60, 47, 3.8, 4.1, -0.9, 0.6, 2.3)
        + NOSE + blush(0.4)
        + openMouth(s, 'M35 57Q50 62.5 65 56Q62 67 50 67Q38 67 35 57Z', { teeth: 'M30 50H70V59.5Q50 64 30 60Z' })
        + shapeP('M45 63.5Q44 73.5 50.5 74Q57 73.5 56 63.5Z', TONGUE, 2.2) + lineP('M50.5 65.5V70.5', 1.4),
};

// ---------------------------------------------------------------- helmets
// hairClip: null = full hair; number = only the back hair below that y (front hair hidden, the 'sides' shown)

const HELMETS = {
    none: { hairClip: null, draw: () => '' },
    racer: {
        hairClip: 60, hideEars: true, noSides: true,
        draw: (s, look) => {
            const shell = 'M21 66C15 36 27 7 50 7C73 7 85 36 79 66C76 70 71 70 69 68C70 56 70 44 68 37C64 31 58 30 50 30C42 30 36 31 32 37C30 44 30 56 31 68C29 70 24 70 21 66Z';
            const stripe = 'M45 7.4C44.4 12 44.4 17 44.8 22.5H55.2C55.6 17 55.6 12 55 7.4Z';
            const visor = 'M26.5 33C29 20 71 20 73.5 33C73 36 70.5 37 68.5 35.6C63 27 37 27 31.5 35.6C29.5 37 27 36 26.5 33Z';
            return lineP('M31 68C38 80 62 80 69 68', 2.2, ' stroke="#3a3330"')
                + s.shaded(shell, look.color, { cx: 44, cy: 34, rx: 34, ry: 34 })
                + shapeP(stripe, '#fff', 2.2)
                + shapeP(visor, '#2c3a4c', 2.6) + lineP('M33 27.5C40 24.5 52 24 60 25', 1.8, ' stroke="#9fd4ff" opacity=".85"')
                + lineP('M24.5 47C24 38 26 28 31 21', 2.6, ' stroke="#fff" opacity=".7"')
                + `<circle cx="25" cy="54" r="3.6" fill="#fff" stroke-width="2"/><circle cx="75" cy="54" r="3.6" fill="#fff" stroke-width="2"/>`;
        },
    },
    cap: {
        hairClip: 31,
        draw: (s, look) => {
            const dome = 'M27 33.5C26 16 36 9 50 9C64 9 74 16 73 33.5C64 29 36 29 27 33.5Z';
            const brim = 'M22.5 33.8C34 26.5 66 26.5 77.5 33.8C79.5 36.6 78.5 38.6 75.5 38.6C64 33.6 36 33.6 24.5 38.6C21.5 38.6 20.5 36.6 22.5 33.8Z';
            const bolt = 'M51.4 14.6L46.4 21.2H49.8L48.2 25.6L53.8 18.8H50.2Z';
            return fillP('M28 37C38 34.5 62 34.5 72 37L72 40C62 37.5 38 37.5 28 40Z', INK, ' opacity=".18"')
                + s.shaded(dome, look.color, { cx: 44, cy: 26, rx: 30, ry: 22 })
                + lineP('M50 10.5C44.5 15 41 22 40 29.6M50 10.5C55.5 15 59 22 60 29.6', 1.5, ` stroke="${mix(look.color, INK, 0.5)}"`)
                + `<circle cx="50" cy="20" r="6" fill="#fff" stroke-width="2"/>` + shapeP(bolt, look.color, 1.2)
                + `<circle cx="50" cy="9.6" r="2.2" fill="${mix(look.color, INK, 0.25)}" stroke-width="1.8"/>`
                + shapeP(brim, mix(look.color, INK, 0.18), 2.8);
        },
    },
    goggles: {
        hairClip: null,
        draw: (s, look) => {
            const lens = (cx) => `<circle cx="${cx}" cy="29.5" r="7.4" fill="${look.color}" stroke-width="2.8"/>`
                + `<circle cx="${cx}" cy="29.5" r="4.9" fill="#a8ecff" stroke-width="2"/>`
                + lineP(`M${cx - 2.6} 28.4Q${cx - 2} ${26.6} ${cx - 0.2} 26.4`, 1.6, ' stroke="#fff"');
            return shapeP('M25.5 30.5C36 25 64 25 74.5 30.5L74.5 35.5C64 30 36 30 25.5 35.5Z', '#6b4426', 2.6)
                + lens(40.2) + lens(59.8) + lineP('M47.4 29.2Q50 26.6 52.6 29.2', 3);
        },
    },
    bandana: {
        hairClip: null,
        draw: (s, look) => {
            const band = 'M25.5 36C35 30 65 30 74.5 36L75 28C65 21 35 21 25 28Z';
            const dots = [[32, 29], [41, 26], [50, 25.5], [59, 26], [68, 29], [36.5, 32], [46, 29.5], [55, 29.5], [63.5, 32]]
                .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.25"/>`).join('');
            return shapeP('M74 30.5C80 26 86 24 92 26C89 29.5 84.5 31.5 79.5 33Z', mix(look.color, INK, 0.15), 2.4)
                + shapeP('M74 33.5C80 36 85 40 88 46.5C83.5 45.5 78.5 42 75 37.5Z', mix(look.color, INK, 0.15), 2.4)
                + s.shaded(band, look.color, { cx: 46, cy: 20, rx: 30, ry: 12, w: 2.8 })
                + `<g fill="#fff" stroke="none" clip-path="${s.clip(band)}">${dots}</g>`
                + `<ellipse cx="75" cy="32" rx="3.6" ry="4" fill="${look.color}" stroke-width="2.4"/>`;
        },
    },
    crown: {
        hairClip: null,
        draw: (s, look, hair) => {
            const b = Math.max(19, HAIR[hair].top + 12);
            const body = `M35 ${b}L33 ${b - 13}L40.5 ${b - 6}L50 ${b - 17}L59.5 ${b - 6}L67 ${b - 13}L65 ${b}Z`;
            return `<g transform="rotate(-9 50 ${b})">`
                + s.shaded(body, '#ffcc33', { cx: 46, cy: b - 10, rx: 16, ry: 12, w: 2.6, dots: 0.25 })
                + shapeP(`M34.6 ${b - 4.2}H65.4L65 ${b}H35Z`, '#f0a81c', 2.4)
                + `<circle cx="50" cy="${b - 2.1}" r="2.1" fill="${look.color}" stroke-width="1.6"/>`
                + `<circle cx="41" cy="${b - 2.1}" r="1.4" fill="#fff" stroke-width="1.4"/><circle cx="59" cy="${b - 2.1}" r="1.4" fill="#fff" stroke-width="1.4"/>`
                + [[33, b - 13], [50, b - 17], [67, b - 13]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#ffcc33" stroke-width="1.8"/>`).join('')
                + lineP(`M38 ${b - 7}L37.2 ${b - 10.5}`, 1.6, ' stroke="#fff6c9"')
                + '</g>';
        },
    },
    viking: {
        hairClip: 31,
        draw: (s, look) => {
            const horn = 'M28.5 30C16 30 8 20 9.5 4C13 14 19 19.5 28.5 20Z';
            const hornG = shapeP(horn, '#f6ecc8', 2.6) + lineP('M17.6 27.4L20.6 20.4M12.8 21.8L16.6 17', 1.8)
                + fillP('M9.5 4C11 11 14.5 15.5 19 18L20.6 20.4C14 18.5 10 12 9.5 4Z', '#d8c99a');
            const dome = 'M27 34C26 15 37 7 50 7C63 7 74 15 73 34Z';
            const band = 'M25.6 29C36 25 64 25 74.4 29L74.4 36C64 32 36 32 25.6 36Z';
            const rivets = [[30.5, 30.8], [40, 28.9], [50, 28.4], [60, 28.9], [69.5, 30.8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2" fill="#fff" stroke-width="1"/>`).join('');
            return hornG + `<g transform="${MIRROR}">${hornG}</g>`
                + s.shaded(dome, '#c9d0da', { cx: 44, cy: 22, rx: 26, ry: 22 })
                + lineP('M50 7.5V26', 2) + lineP('M33 25C34 18 39 13 44 11.5', 2.2, ' stroke="#fff" opacity=".8"')
                + shapeP(band, look.color, 2.6) + rivets
                + shapeP('M47 33.4H53L52.2 46.6Q50 48.4 47.8 46.6Z', '#c9d0da', 2.2);
        },
    },
    headset: {
        hairClip: null,
        draw: (s, look, hair) => {
            const apex = Math.max(1.5, HAIR[hair].top - 2);
            const T = fmt((apex - 10) / 0.75);
            const band = `M25.5 40C23.5 ${T} 76.5 ${T} 74.5 40`;
            const cup = x => `<rect x="${x}" y="38" width="10.5" height="18" rx="4.5" fill="${look.color}" stroke-width="2.8"/>`
                + `<rect x="${x + 2.6}" y="41.5" width="5.3" height="11" rx="2.4" fill="${mix(look.color, INK, 0.35)}" stroke="none"/>`;
            return `<path d="${band}" fill="none" stroke-width="6.5"/>` + `<path d="${band}" fill="none" stroke="#5d5a63" stroke-width="3"/>`
                + cup(20.2) + cup(69.3)
                + `<path d="M25 55.5C25 63 30 66.5 36.5 66" fill="none" stroke-width="3.8"/>` + `<path d="M25 55.5C25 63 30 66.5 36.5 66" fill="none" stroke="#5d5a63" stroke-width="1.6"/>`
                + `<ellipse cx="38" cy="65.8" rx="2.8" ry="2.4" fill="#3a3740" stroke-width="2"/>`;
        },
    },
};

// ---------------------------------------------------------------- portrait

function burst(cx, cy, n, r1, r2) {
    let d = '';
    for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2 + 0.2;
        const r = i % 2 ? r2 : r1;
        d += `${i ? 'L' : 'M'}${fmt(cx + Math.cos(a) * r)} ${fmt(cy + Math.sin(a) * r)}`;
    }
    return d + 'Z';
}

const pick = (v, table) => (Object.prototype.hasOwnProperty.call(table, v) ? v : Object.keys(table)[0]);

/**
 * An SVG string (viewBox 0 0 100 100) of the head-and-shoulders portrait.
 * @param {{ face?: string, hair?: string, helmet?: string, color?: string, skin?: string, hairColor?: string }} look
 */
export function avatarSvg(look = {}, { size = 96, frame = true, background = true } = {}) {
    const face = pick(look.face, FACES), hair = pick(look.hair, HAIR), helmet = pick(look.helmet, HELMETS);
    const color = normHex(look.color, '#e8322b'), skin = normHex(look.skin, '#f2c29b');
    const hc = normHex(look.hairColor, hairColorFor(skin));
    const hl = mix(hc, '#ffffff', lum(hc) > 0.6 ? 0.55 : 0.32);
    const L = { color, skin };
    const s = new Svg();
    const H = HAIR[hair], M = HELMETS[helmet];
    const parts = [];

    // background: a comic burst in tints of the accent colour on halftone dots
    if (background) {
        const back = mix(color, '#ffffff', 0.5), ray = mix(color, '#ffffff', 0.78);
        parts.push(`<rect x="-5" y="-5" width="110" height="110" fill="${back}" stroke="none"/>`,
            `<rect x="-5" y="-5" width="110" height="110" fill="url(#${s.id}bgdots)" stroke="none" opacity=".55"/>`,
            fillP(burst(50, 44, 13, 66, 40), ray), `<circle cx="50" cy="44" r="34" fill="#fffdf4" stroke="none" opacity=".55"/>`);
    }

    // hair behind the head
    if (H.back) {
        const back = H.back(s, hc, hl, L);
        parts.push(M.hairClip == null ? back : `<g clip-path="${s.clip(`M-10 ${M.hairClip}H110V110H-10Z`)}">${back}</g>`);
    }

    // racing suit: shoulders, white piping, standing collar, zip and badge
    const suit = 'M3 104C5 87 19 80 37 77.5L63 77.5C81 80 95 87 97 104Z';
    const darker = mix(color, INK, 0.22);
    parts.push(s.shaded(suit, color, { cx: 40, cy: 98, rx: 50, ry: 24 }),
        fillP('M7 98C11 89 19 84.5 30 82L31.6 85.2C21.6 87.4 14.6 91.6 11.4 99Z', '#fff'), `<g transform="${MIRROR}">${fillP('M7 98C11 89 19 84.5 30 82L31.6 85.2C21.6 87.4 14.6 91.6 11.4 99Z', '#fff')}</g>`,
        lineP('M50 88V104', 2.2, ` stroke="${mix(color, INK, 0.55)}"`),
        `<circle cx="32.5" cy="92" r="4.6" fill="#fff" stroke-width="2"/>`,
        `<path d="M32.5 88.8l.95 2.05 2.25.25-1.68 1.52.47 2.2-1.99-1.13-1.99 1.13.47-2.2-1.68-1.52 2.25-.25z" fill="${color}" stroke="none"/>`);
    // neck + collar
    const neckSkin = mix(skin, '#5a2a1a', 0.2);
    parts.push(shapeP('M41.5 62L41.5 81L58.5 81L58.5 62Z', neckSkin, 2.6),
        fillP('M41.5 64C46 69 54 69 58.5 64L58.5 70C54 73 46 73 41.5 70Z', mix(skin, '#3a1410', 0.35), ' opacity=".55"'),
        shapeP('M36.5 73.5C42 80.5 58 80.5 63.5 73.5L66.5 81.5C60 89 40 89 33.5 81.5Z', darker, 2.8),
        lineP('M35.5 79C42 85 58 85 64.5 79', 1.8, ' stroke="#fff"'));

    // ears + head
    if (!M.hideEars) {
        const ear = shapeP(EAR + 'C28 50 29 46 28 40Z', skin, 2.6) + lineP('M26.5 44C24.5 44 24 47 25.5 49.5', 1.8);
        parts.push(ear, `<g transform="${MIRROR}">${ear}</g>`);
    }
    parts.push(s.shaded(HEAD, skin, { cx: 46, cy: 41, rx: 24.5, ry: 27.5, dark: 0.18, dots: 0.22 }));

    // face
    parts.push(FACES[face](s, skin));

    // hair over the head
    if (M.hairClip == null) parts.push(H.front ? H.front(s, hc, hl, L) : '');
    else if (!M.noSides) parts.push(H.sides(s, hc, hl, L));

    // helmet / headgear
    parts.push(M.draw(s, L, hair));

    // frame
    const R = 'M18 2H82Q98 2 98 18V82Q98 98 82 98H18Q2 98 2 82V18Q2 2 18 2Z';
    const clipped = background || frame;
    const body = clipped ? `<g clip-path="${s.clip(R)}">${parts.join('')}</g>` : parts.join('');
    const border = frame ? `<path d="${R}" fill="none" stroke-width="4.2"/>` : '';

    const defs = `<defs><pattern id="${s.id}dots" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="1.6" cy="1.6" r=".72" fill="${INK}"/></pattern>`
        + `<pattern id="${s.id}bgdots" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="2.5" cy="2.5" r="1.25" fill="${mix(color, '#ffffff', 0.2)}"/></pattern>`
        + s.defs.join('') + '</defs>';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${defs}`
        + `<g stroke="${INK}" stroke-linejoin="round" stroke-linecap="round">${body}${border}</g></svg>`;
}

/** Convenience: an <img>-ready data URL. */
export function avatarUrl(look, options) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(avatarSvg(look, options));
}
