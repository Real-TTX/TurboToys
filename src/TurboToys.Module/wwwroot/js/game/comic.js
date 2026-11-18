// TurboToys · comic.js – the comic layer over the 3D picture (the XIII touch):
//   pop(text)      a sound word in a jagged burst at a point of the world or the screen ("KAWUMM!", "ZOOM!", "KLING!")
//   shout(text)    a big caption across the screen (countdown, "LETZTE RUNDE!", "ZIEL!")
//   caption(text)  a narrator box at the top ("Runde 2 von 3 …")
//   inset(...)     a comic panel inside the picture that shows another camera for a moment (a wreck, a hit) – drawn by race.js into the frame's rectangle
// The words are drawn with SVG (burst + lettering), so they stay sharp; they are DOM elements in #tt-comic.

import * as THREE from 'three';

let layer = null;
const v = new THREE.Vector3();

function root() {
    if (!layer) {
        layer = document.getElementById('tt-comic');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'tt-comic';
            layer.className = 'comic-layer';
            document.body.appendChild(layer);
        }
    }
    return layer;
}

/** A jagged burst outline (points of a star with uneven spikes), as an SVG path in a 200×120 box. */
function burstPath(seed, spikes = 13) {
    let s = seed;
    const rnd = () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
    };
    const pts = [];
    for (let k = 0; k < spikes * 2; k++) {
        const a = (k / (spikes * 2)) * Math.PI * 2;
        const outer = k % 2 === 0;
        const r = outer ? 0.92 + rnd() * 0.12 : 0.66 + rnd() * 0.1;
        pts.push([100 + Math.cos(a) * 98 * r, 60 + Math.sin(a) * 58 * r]);
    }
    return 'M' + pts.map(p => p.map(n => n.toFixed(1)).join(' ')).join(' L') + ' Z';
}

const palettes = {
    boom: ['#ffd23a', '#e2392f', '#14100c'],
    hit: ['#fff4d6', '#e2392f', '#14100c'],
    turbo: ['#58c8ff', '#2f6fd0', '#14100c'],
    good: ['#9bd23c', '#2aa198', '#14100c'],
    money: ['#ffd23a', '#3f9b4b', '#14100c'],
    plain: ['#fff4d6', '#14100c', '#14100c'],
};

export const comic = {
    /**
     * A sound word in a burst.
     * @param {string} text
     * @param {{ at?: THREE.Vector3, camera?: THREE.Camera, x?: number, y?: number, style?: keyof palettes, size?: number, life?: number }} options
     */
    pop(text, { at = null, camera = null, x = null, y = null, style = 'boom', size = 1, life = 1100 } = {}) {
        let px = x ?? innerWidth / 2;
        let py = y ?? innerHeight / 2;
        if (at && camera) {
            v.copy(at).project(camera);
            if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return;
            px = (v.x * 0.5 + 0.5) * innerWidth;
            py = (-v.y * 0.5 + 0.5) * innerHeight - 40;
        }
        const [fill, text1, ink] = palettes[style] ?? palettes.boom;
        const seed = Math.floor(Math.random() * 10000);
        const tilt = (Math.random() - 0.5) * 24;
        const el = document.createElement('div');
        el.className = 'comic-pop';
        const w = Math.round(Math.max(150, 30 + text.length * 26) * size);
        el.style.cssText = `left:${px}px;top:${py}px;width:${w}px;--tilt:${tilt}deg;--life:${life}ms`;
        el.innerHTML = `<svg viewBox="0 0 200 120" aria-hidden="true">
            <path d="${burstPath(seed)}" transform="translate(5 6)" fill="${ink}"/>
            <path d="${burstPath(seed)}" fill="${fill}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
            <text x="100" y="74" text-anchor="middle" font-family="Bangers, Impact, sans-serif" font-size="${Math.min(52, 340 / Math.max(4, text.length))}"
                  fill="${text1}" stroke="${ink}" stroke-width="7" paint-order="stroke" letter-spacing="1">${escape(text)}</text>
        </svg>`;
        root().appendChild(el);
        setTimeout(() => el.remove(), life + 50);
    },

    /** A huge caption in the middle (countdown, "ZIEL!"). */
    shout(text, { style = 'boom', life = 900, sub = null } = {}) {
        const el = document.createElement('div');
        el.className = `comic-shout comic-shout--${style}`;
        el.style.setProperty('--life', `${life}ms`);
        el.innerHTML = `<span class="word">${escape(text)}</span>${sub ? `<span class="sub">${escape(sub)}</span>` : ''}`;
        root().appendChild(el);
        setTimeout(() => el.remove(), life + 50);
    },

    /** A narrator box at the top left, like a comic caption. */
    caption(text, { life = 2600 } = {}) {
        const el = document.createElement('div');
        el.className = 'comic-caption';
        el.style.setProperty('--life', `${life}ms`);
        el.textContent = text;
        root().appendChild(el);
        setTimeout(() => el.remove(), life + 50);
    },

    /** The frame of an inset panel (race.js draws the 3D view into its rectangle). Returns { rect, close }. */
    insetFrame(title, { life = 2400 } = {}) {
        const el = document.createElement('div');
        el.className = 'comic-inset';
        el.style.setProperty('--life', `${life}ms`);
        el.innerHTML = `<span class="tag">${escape(title)}</span>`;
        root().appendChild(el);
        const close = () => el.remove();
        setTimeout(close, life);
        return {
            el,
            close,
            rect() {
                const r = el.getBoundingClientRect();
                return { x: r.left, y: r.top, w: r.width, h: r.height };
            },
        };
    },

    clear() {
        if (layer) layer.innerHTML = '';
    },
};

function escape(text) {
    return String(text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

/** The sound words of the game (random pick per event). */
export const WORDS = {
    explosion: ['KAWUMM!', 'BOOOM!', 'KRAWUMM!', 'BAMM!', 'WUMMS!'],
    hit: ['PENG!', 'ZACK!', 'BÄNG!', 'KLONK!'],
    gun: ['RATATAT!', 'TAKTAKTAK!'],
    turbo: ['WHOOSH!', 'ZOOM!', 'WROOOM!', 'FWOOSH!'],
    pickup: ['KLING!', 'BLING!', 'PLING!'],
    crash: ['KRACH!', 'RUMMS!', 'SCHEPPER!', 'BONK!'],
    land: ['WUMP!', 'PLONK!', 'BUMM!'],
    shock: ['BZZZT!', 'ZAPP!', 'KNISTER!'],
    oil: ['SCHLITTER!', 'FLUTSCH!'],
    shield: ['BOING!', 'PLOPP!'],
    rocket: ['FFFSSSHH!', 'ZISCH!'],
    mine: ['KLACK!'],
    kill: ['ERWISCHT!', 'VERSCHROTTET!', 'SCHROTT!'],
};

export function word(kind) {
    const list = WORDS[kind] ?? ['!'];
    return list[Math.floor(Math.random() * list.length)];
}
