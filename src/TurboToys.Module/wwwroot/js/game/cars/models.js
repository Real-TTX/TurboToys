// TurboToys · cars/models.js – the radio-controlled toy cars: 8 bodies × 3 drives × paint/decal/number, comic (XIII) look.
//   buildCar(body, options)         → { group, body, wheels, exhausts, headlights, taillights, turbo, antenna, gunMount, gun, size }
//   buildShowroomCar(body, options) → the same on a round display base (menus)
// The car faces +z, its left side is +x, the origin is on the ground under the centre. 1 unit = 10 cm.
// `body` (the sprung part) sits at the origin of `group` with no transform, so every returned point is valid in both.
// Each car: one merged mesh per material (≈ 30 meshes incl. wheels, gun, antenna), one canvas texture for paint + decals.

import * as THREE from 'three';
import { toon, flat } from '../render/toon.js';
import { G, Parts, place, arch, wheelParts, streakGeometry, buildGun, buildAntenna, addDrive, decalAtlas, WHITE } from './parts.js';

export const BODIES = ['buggy', 'truck', 'muscle', 'rally', 'super', 'van', 'formula', 'pickup'];
export const DECALS = ['none', 'stripes', 'flames', 'stars', 'checker', 'bolt'];
export const PAINTS = ['#e2392f', '#f28c28', '#f6c638', '#9bd23c', '#2aa198', '#2f6fd0', '#7a4bc4', '#e86aa6', '#f7f3ea', '#34373d'];
export const DRIVES = ['electric', 'gas', 'turbo'];

const PI = Math.PI;
const CHROME = '#cfd6dd';

// ------------------------------------------------------------------ options & colours

function hex(value) {
    return '#' + new THREE.Color(value).getHexString();
}

function rgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

function lum(h) {
    const [r, g, b] = rgb(h);
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

function distance(a, b) {
    const A = rgb(a), B = rgb(b);
    return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

function normalize(body, options) {
    const paint = hex(options.paint ?? PAINTS[BODIES.indexOf(body) % PAINTS.length]);
    const accent = hex(options.accent ?? (lum(paint) < 0.32 ? '#f6c638' : '#26282e'));
    // the colour of stars, bolts, mud flaps, the antenna tip: bright and different from the paint
    const pop = lum(accent) > 0.35 && distance(accent, paint) > 0.45
        ? accent
        : ['#f6c638', '#f7f3ea', '#e2392f', '#3fd8ff'].reduce((best, c) => (distance(c, paint) > distance(best, paint) ? c : best));
    const number = options.number === undefined || options.number === null || !Number.isFinite(Number(options.number))
        ? null : Math.max(0, Math.floor(Number(options.number))) % 100;
    return {
        paint, accent, pop, number,
        decal: DECALS.includes(options.decal) ? options.decal : 'none',
        drive: DRIVES.includes(options.drive) ? options.drive : 'gas',
        quality: ['high', 'medium', 'low'].includes(options.quality) ? options.quality : 'high',
    };
}

function materials(o) {
    const glow = { electric: '#3fd8ff', gas: '#d4581f', turbo: '#ff7a1a' }[o.drive];
    return {
        paint: toon(o.paint),
        accent: toon(o.accent),
        pop: toon(o.pop),
        dark: toon('#30333a'),
        metal: toon('#737a84'),
        chrome: toon(CHROME),
        hub: toon('#e4e8ec'),
        ink: toon('#1d1a16'),
        tyre: toon('#2c2c31'),
        glass: toon('#3e5570'),
        shine: flat('#f2f8ff', { side: THREE.DoubleSide }),
        lamp: flat('#fff4c8'),
        white: toon(WHITE),
        red: toon('#e2392f'),
        yellow: toon('#f6c638'),
        fuel: toon(distance(o.paint, '#e2392f') < 0.3 ? '#3f9b4b' : '#e2392f'),
        battery: toon('#26282e'),
        batteryCap: toon('#2f6fd0'),
        sticker: flat('#f6c638', { side: THREE.DoubleSide }),
        scoop: toon(lum(o.accent) < 0.3 && lum(o.paint) < 0.3 ? '#f6c638' : o.accent),
        gunBody: toon('#4a4f58'),
        tail: flat('#d42a20', { unique: true }),
        turbo: flat(glow, { unique: true }),
    };
}

/** Pitch (rotation.x) of a surface from (zA, yA) at the rear to (zB, yB) at the front. */
function slope(zA, yA, zB, yB) {
    return -Math.atan2(yB - yA, zB - zA);
}

// ------------------------------------------------------------------ the modelling kit of one car

function kit(o) {
    const detail = o.quality === 'low' ? 0.5 : o.quality === 'medium' ? 0.75 : 1;
    const M = materials(o);
    const P = new Parts();
    const T = new Parts();
    const L = new Parts();
    const shells = [];
    const headlights = [];
    const segs = detail < 0.75 ? 1 : 2;
    const fillet = detail < 0.75 ? 2 : 3;
    const seg = n => Math.max(6, Math.round(n * detail));
    const k = {
        o, M, P, T, L, detail, headlights, shells, seg,
        /** a painted body part that carries the decals (paint canvas) */
        shell(points, width, opts = {}, at = null) {
            const g = G.extrude(points, width, { segs, fillet, ...opts });
            if (at) place(g, at);
            shells.push(g);
            return g;
        },
        ext(points, width, mat, opts = {}, at = null) {
            P.add(G.extrude(points, width, { segs, fillet, ...opts }), mat, at);
        },
        box(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
            P.add(G.box(w, h, d), mat, { x, y, z, rx, ry, rz });
        },
        rbox(w, h, d, r, mat, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
            P.add(G.rbox(w, h, d, r, detail < 0.75 ? 0 : s), mat, { x, y, z, rx, ry, rz });
        },
        cyl(rt, rb, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, n = 14) {
            P.add(G.cyl(rt, rb, h, seg(n)), mat, { x, y, z, rx, ry, rz });
        },
        tube(a, b, r, mat, n = 8) {
            P.add(G.tube(a, b, r, Math.max(5, Math.round(n * detail))), mat);
        },
        /** both sides: fn(+1) and fn(-1) */
        pair(fn) {
            fn(1);
            fn(-1);
        },
        /** a pair of round headlights facing +z (chrome bezel, glowing lens) */
        headlight(x, y, z, r) {
            k.pair(s => {
                P.add(G.cyl(r * 1.3, r * 1.3, 0.08, seg(14)), M.chrome, { x: s * x, y, z: z - 0.02, rx: PI / 2 });
                P.add(G.cyl(r, r, 0.08, seg(14)), M.lamp, { x: s * x, y, z: z + 0.03, rx: PI / 2 });
                headlights.push(new THREE.Vector3(s * x, y, z + 0.08));
            });
        },
        /** a pair of rectangular lamps (rx tilts them) */
        lampBar(x, y, z, w, h, rx = 0) {
            k.pair(s => {
                P.add(G.rbox(w, h, 0.12, Math.min(w, h) * 0.3, detail < 0.75 ? 0 : 1), M.lamp, { x: s * x, y, z, rx });
                headlights.push(new THREE.Vector3(s * x, y, z + 0.08));
            });
        },
        taillight(x, y, z, w, h) {
            k.pair(s => L.add(G.rbox(w, h, 0.1, Math.min(w, h) * 0.3, detail < 0.75 ? 0 : 1), M.tail, { x: s * x, y, z }));
        },
        /** a fender flare around a wheel (pair) */
        flare(wheel, ra, thick, ySill, width, x, mat = null) {
            k.pair(s => {
                const g = G.flare(wheel.z, wheel.r, ra, thick, ySill, width, seg(8));
                place(g, { x: s * x });
                if (mat) P.add(g, mat);
                else shells.push(g);
            });
        },
        /**
         * The greenhouse: a dark glass block (side profile trapezoid) with white highlight streaks, and a painted roof slab on top.
         * zr0/zf0 = rear/front at the base y0, zr1/zf1 = rear/front at the top y1, w = width.
         */
        cabin({ zr0, zf0, y0, zr1, zf1, y1, w, roof = true, roofT = 0.09, over = 0.05 }) {
            P.add(G.extrude([[zr0, y0], [zf0, y0], [zf1, y1, 0.05], [zr1, y1, 0.05]], w, { bevel: 0.05, segs: 1, fillet: 2, crease: 30 }), M.glass);
            if (roof) {
                k.shell([[zr1 - over, y1 - 0.05], [zf1 + over, y1 - 0.05], [zf1 + over * 0.2, y1 + roofT, 0.05], [zr1 - over * 0.6, y1 + roofT, 0.05]],
                    w + 0.08, { bevel: 0.04, segs: 1, fillet: 2 });
            }
            // windscreen streaks
            const along = new THREE.Vector3(0, y1 - y0, zf1 - zf0);
            const len = along.length();
            along.normalize();
            const n = new THREE.Vector3(0, -(zf1 - zf0), y1 - y0).normalize();
            const c = new THREE.Vector3(0, (y0 + y1) / 2, (zf0 + zf1) / 2);
            P.add(streakGeometry(c, new THREE.Vector3(w * 0.36, 0, 0), along.multiplyScalar(len * 0.36), n), M.shine);
            // side window streaks
            const zm = ((zr0 + zr1) / 2 + (zf0 + zf1) / 2) / 2;
            const half = ((zf0 + zf1) / 2 - (zr0 + zr1) / 2) / 2;
            k.pair(s => P.add(streakGeometry(new THREE.Vector3(s * w / 2, (y0 + y1) / 2 + 0.02, zm), new THREE.Vector3(0, 0, half * 0.5), new THREE.Vector3(0, (y1 - y0) * 0.3, 0), new THREE.Vector3(s, 0, 0)), M.shine));
        },
    };
    return k;
}

// ------------------------------------------------------------------ the bodies

const BUILDERS = {
    /** Muscle car: long hood, wide rear haunches with flares, ducktail, chrome bumpers, hood scoop. */
    muscle(k) {
        const { M, o } = k;
        const front = { z: 1.38, r: 0.45, w: 0.48, x: 0.84, tread: 'road', rim: 'spoke', spokes: 5, rimColor: CHROME };
        const rear = { z: -1.3, r: 0.53, w: 0.62, x: 0.81, tread: 'road', rim: 'spoke', spokes: 5, rimColor: CHROME };
        const sill = 0.34, W = 1.8;
        k.shell([
            [-2.08, 0.4, 0.1], [-2.16, 0.96, 0.08], [-2.12, 1.14, 0.02], [-1.65, 1.15, 0.15], [-1.2, 1.25, 0.2], [-0.45, 1.16, 0.3], [0.6, 1.1, 0.25],
            [1.95, 1.02, 0.16], [2.18, 0.9, 0.08], [2.22, 0.5, 0.1], [2.06, 0.36, 0.05],
            ...arch(front.z, front.r, front.r + 0.06, sill, k.seg(9)),
            ...arch(rear.z, rear.r, rear.r + 0.07, sill, k.seg(9)),
        ], W, { bevel: 0.1, taper: z => (z > 1.7 ? 1 - (z - 1.7) * 0.12 : 1) });
        k.flare(rear, rear.r + 0.07, 0.13, sill, 0.2, W / 2 - 0.01);
        k.flare(front, front.r + 0.06, 0.09, sill, 0.14, W / 2 - 0.02);
        k.cabin({ zr0: -1.18, zf0: 0.5, y0: 1.06, zr1: -0.62, zf1: -0.06, y1: 1.52, w: 1.42 });
        // nose: grille, lights, chrome bumpers; tail: ducktail spoiler, lamps
        k.rbox(1.34, 0.32, 0.1, 0.04, M.ink, 0, 0.7, 2.2);
        k.headlight(0.6, 0.7, 2.22, 0.12);
        k.rbox(1.9, 0.13, 0.22, 0.06, M.chrome, 0, 0.42, 2.17);
        k.rbox(1.9, 0.13, 0.22, 0.06, M.chrome, 0, 0.44, -2.1);
        k.ext([[-2.22, 1.12], [-1.86, 1.14], [-1.9, 1.24, 0.03], [-2.24, 1.22, 0.02]], 1.7, M.paint, { bevel: 0.03, segs: 1 });
        k.taillight(0.5, 0.86, -2.15, 0.56, 0.16);
        k.rbox(0.5, 0.12, 0.08, 0.03, M.ink, 0, 0.86, -2.15);
        if (o.drive === 'electric') {
            k.rbox(0.62, 0.2, 0.8, 0.08, M.paint, 0, 1.1, 1.18, 0.06);
            k.box(0.46, 0.11, 0.06, M.ink, 0, 1.12, 1.58);
        }
        const hood = slope(0.6, 1.1, 1.95, 1.02);
        return {
            wheels: { front, rear },
            bay: { y: 1.06, z: 1.18, pitch: hood },
            deck: { y: 1.14, z: -1.66, w: 1.0, len: 0.56 },
            pipes: { y: 0.27, z: -2.3, xs: [0.42, -0.42], xs2: [0.56, -0.56] },
            length: 4.3,
            fuel: { x: W / 2 + 0.02, y: 0.96, z: -1.98 },
            antenna: [-0.68, 1.15, -1.95, 1.35],
            gun: [0, 1.61, -0.34],
            panel: { z0: -0.7, z1: 0.86, y0: 0.42, y1: 1.06 },
            door: { z: -0.02, y: 0.74, r: 0.27 },
            topNumber: { z: 1.8, r: 0.22 },
            topFlames: { z1: 2.18, len: 1.4 },
        };
    },

    /** Supercar: low wedge, long glass bubble, side intakes, huge rear wing, diffuser, light strip tail. */
    super(k) {
        const { M } = k;
        const front = { z: 1.42, r: 0.42, w: 0.5, x: 0.86, tread: 'road', rim: 'star', spokes: 10, rimColor: '#e9edf0', rimRatio: 0.66 };
        const rear = { z: -1.32, r: 0.47, w: 0.64, x: 0.8, tread: 'road', rim: 'star', spokes: 10, rimColor: '#e9edf0', rimRatio: 0.66 };
        const sill = 0.28, W = 1.96;
        k.shell([
            [-2.2, 0.34, 0.06], [-2.26, 0.86, 0.06], [-1.8, 1.08, 0.2], [-1.0, 1.1, 0.1], [0.75, 1.0, 0.1], [1.45, 0.98, 0.3], [2.2, 0.66, 0.1],
            [2.28, 0.44, 0.06], [2.12, 0.3, 0.04],
            ...arch(front.z, front.r, front.r + 0.06, sill, k.seg(9)),
            ...arch(rear.z, rear.r, rear.r + 0.07, sill, k.seg(9)),
        ], W, { bevel: 0.12, taper: z => (z > 1.5 ? 1 - (z - 1.5) * 0.22 : z < -1.9 ? 1 - (-1.9 - z) * 0.2 : 1) });
        k.cabin({ zr0: -1.05, zf0: 0.82, y0: 0.94, zr1: -0.62, zf1: -0.1, y1: 1.36, w: 1.42, roofT: 0.08 });
        // side intakes
        k.pair(s => k.ext([[-0.98, 0.42], [-0.28, 0.9, 0.04], [-0.98, 0.92, 0.04]], 0.06, M.ink, { bevel: 0.02, segs: 1 }, { x: s * (W / 2 - 0.005) }));
        // nose
        k.rbox(1.9, 0.05, 0.34, 0.02, M.dark, 0, 0.29, 2.08);
        k.rbox(0.9, 0.16, 0.08, 0.04, M.ink, 0, 0.46, 2.27);
        k.lampBar(0.6, 0.68, 2.1, 0.4, 0.09, 0.45);
        // tail: diffuser, light strip, louvres, the big wing
        k.rbox(1.5, 0.2, 0.24, 0.04, M.dark, 0, 0.36, -2.17);
        for (const x of [-0.45, -0.15, 0.15, 0.45]) k.box(0.04, 0.2, 0.26, M.ink, x, 0.34, -2.2);
        k.L.add(G.rbox(1.5, 0.13, 0.08, 0.04, k.detail < 0.75 ? 0 : 1), M.tail, { y: 0.8, z: -2.24 });
        for (const z of [-1.86, -2.0]) k.box(1.1, 0.03, 0.06, M.ink, 0, 1.03 - (z + 1.86) * 0.4, z);
        k.pair(s => k.box(0.08, 0.52, 0.24, M.dark, s * 0.52, 1.28, -1.98, 0.2));
        k.ext([[-2.42, 1.5], [-1.8, 1.56, 0.04], [-1.84, 1.66, 0.05], [-2.42, 1.62, 0.02]], 2.04, M.paint, { bevel: 0.03, segs: 1 });
        k.pair(s => k.rbox(0.05, 0.4, 0.76, 0.02, M.accent, s * 1.02, 1.52, -2.1));
        return {
            wheels: { front, rear },
            bay: { y: 1.09, z: -1.38, pitch: 0 },
            deck: { y: 1.09, z: -1.38, w: 1.0, len: 0.6 },
            pipes: { y: 0.52, z: -2.34, xs: [0.24, -0.24], xs2: [0.3, -0.3] },
            length: 4.4,
            fuel: { x: W / 2 + 0.02, y: 0.84, z: -2.0 },
            antenna: [-0.72, 1.1, -1.12, 1.3],
            gun: [0, 1.44, -0.36],
            panel: { z0: -0.24, z1: 0.92, y0: 0.36, y1: 0.92 },
            door: { z: 0.34, y: 0.62, r: 0.23 },
            topNumber: { z: 1.62, r: 0.22 },
            topFlames: { z1: 2.2, len: 1.35 },
        };
    },

    /** Rally hatchback: compact and upright, boxy black flares, mud flaps, roof scoop, roof light pod, spoiler. */
    rally(k) {
        const { M } = k;
        const front = { z: 1.26, r: 0.48, w: 0.5, x: 0.85, tread: 'rally', rim: 'dish', spokes: 6, rimColor: WHITE };
        const rear = { z: -1.22, r: 0.48, w: 0.52, x: 0.85, tread: 'rally', rim: 'dish', spokes: 6, rimColor: WHITE };
        const sill = 0.42, W = 1.74;
        k.shell([
            [-1.9, 0.48, 0.08], [-1.96, 1.14, 0.06], [-1.4, 1.18, 0.1], [0.82, 1.2, 0.2], [1.82, 1.1, 0.15], [2.0, 0.92, 0.08], [2.02, 0.52, 0.08], [1.9, 0.42, 0.04],
            ...arch(front.z, front.r, front.r + 0.07, sill, k.seg(8)),
            ...arch(rear.z, rear.r, rear.r + 0.07, sill, k.seg(8)),
        ], W, { bevel: 0.1 });
        k.flare(front, front.r + 0.07, 0.13, sill, 0.22, W / 2 + 0.01, M.dark);
        k.flare(rear, rear.r + 0.07, 0.13, sill, 0.22, W / 2 + 0.01, M.dark);
        k.cabin({ zr0: -1.9, zf0: 0.86, y0: 1.12, zr1: -1.82, zf1: 0.06, y1: 1.7, w: 1.5 });
        // roof: scoop, light pod, spoiler
        k.rbox(0.44, 0.17, 0.56, 0.07, M.accent, 0, 1.86, -0.45);
        k.box(0.32, 0.09, 0.04, M.ink, 0, 1.87, -0.17);
        k.rbox(1.24, 0.22, 0.16, 0.05, M.dark, 0, 1.9, 0.02);
        for (const x of [-0.45, -0.16, 0.16, 0.45]) {
            k.cyl(0.1, 0.1, 0.06, M.chrome, x, 1.9, 0.1, PI / 2);
            k.cyl(0.08, 0.08, 0.06, M.lamp, x, 1.9, 0.13, PI / 2);
        }
        k.ext([[-2.04, 1.72], [-1.62, 1.76], [-1.66, 1.86, 0.03], [-2.06, 1.84, 0.02]], 1.52, M.accent, { bevel: 0.03, segs: 1 });
        // nose & tail
        k.rbox(1.8, 0.2, 0.22, 0.06, M.dark, 0, 0.5, 1.98);
        k.box(0.72, 0.2, 0.06, M.ink, 0, 0.8, 2.01);
        k.headlight(0.56, 0.8, 2.02, 0.14);
        k.pair(s => k.cyl(0.07, 0.07, 0.06, M.lamp, s * 0.55, 0.5, 2.1, PI / 2));
        k.rbox(1.8, 0.2, 0.2, 0.06, M.dark, 0, 0.5, -1.92);
        k.taillight(0.64, 0.92, -1.97, 0.2, 0.28);
        // mud flaps behind the wheels
        for (const wheel of [front, rear]) k.pair(s => k.box(0.4, 0.34, 0.04, M.pop, s * wheel.x, 0.25, wheel.z - 0.6));
        const hood = slope(0.82, 1.2, 1.82, 1.1);
        return {
            wheels: { front, rear },
            bay: { y: 1.15, z: 1.3, pitch: hood },
            deck: { y: 1.15, z: 1.3, pitch: hood, w: 0.95, len: 0.6 },
            pipes: { y: 0.3, z: -2.08, xs: [-0.36, -0.56], xs2: [0.5, -0.5] },
            length: 4.1,
            fuel: { x: W / 2 + 0.02, y: 0.96, z: -1.84 },
            antenna: [-0.6, 1.79, -1.62, 1.25],
            gun: [0, 1.79, -1.1],
            panel: { z0: -0.62, z1: 0.66, y0: 0.5, y1: 1.1 },
            door: { z: 0.02, y: 0.78, r: 0.26 },
            topNumber: null,
            topFlames: { z1: 1.98, len: 1.1 },
        };
    },

    /** Delivery van: tall box, short sloped hood, armoured bumper with push bar, side skirts, roof rails. */
    van(k) {
        const { M } = k;
        const front = { z: 1.5, r: 0.5, w: 0.52, x: 0.86, tread: 'offroad', rim: 'dish', spokes: 5, rimColor: '#a3aab3' };
        const rear = { z: -1.45, r: 0.5, w: 0.56, x: 0.84, tread: 'offroad', rim: 'dish', spokes: 5, rimColor: '#a3aab3' };
        const sill = 0.44, W = 1.96;
        k.shell([
            [-2.3, 0.5, 0.08], [-2.36, 1.98, 0.14], [1.18, 1.98, 0.1], [1.16, 1.86, 0], [0.5, 1.86, 0], [0.5, 1.22, 0], [1.75, 1.2, 0.12], [2.32, 1.04, 0.12],
            [2.36, 0.52, 0.08], [2.22, 0.44, 0.04],
            ...arch(front.z, front.r, front.r + 0.07, sill, k.seg(8)),
            ...arch(rear.z, rear.r, rear.r + 0.07, sill, k.seg(8)),
        ], W, { bevel: 0.12 });
        k.cabin({ zr0: 0.45, zf0: 1.8, y0: 1.12, zr1: 0.45, zf1: 1.2, y1: 1.9, w: 1.84, roof: false });
        // armoured bumper with bolts and a push bar
        k.rbox(2.08, 0.38, 0.34, 0.06, M.dark, 0, 0.6, 2.38);
        for (const x of [-0.8, -0.3, 0.3, 0.8]) k.cyl(0.05, 0.05, 0.06, M.chrome, x, 0.6, 2.56, PI / 2, 0, 0, 8);
        k.pair(s => k.tube([s * 0.5, 0.75, 2.46], [s * 0.46, 1.2, 2.42], 0.06, M.metal));
        k.tube([0.52, 1.2, 2.42], [-0.52, 1.2, 2.42], 0.06, M.metal);
        k.box(0.78, 0.32, 0.06, M.ink, 0, 0.86, 2.33);
        k.headlight(0.66, 0.86, 2.34, 0.14);
        // side skirts, roof rails, rear doors
        k.pair(s => k.rbox(0.1, 0.2, 1.62, 0.04, M.metal, s * 1.0, 0.56, 0.0));
        k.pair(s => {
            k.tube([s * 0.78, 2.1, -2.1], [s * 0.78, 2.1, 0.95], 0.05, M.dark);
            for (const z of [-2.0, -0.6, 0.85]) k.box(0.08, 0.14, 0.08, M.dark, s * 0.78, 2.03, z);
        });
        k.box(0.04, 1.28, 0.03, M.ink, 0, 1.2, -2.37);
        k.pair(s => k.box(0.16, 0.05, 0.05, M.chrome, s * 0.16, 1.2, -2.38));
        k.rbox(2.04, 0.24, 0.26, 0.06, M.dark, 0, 0.56, -2.34);
        k.taillight(0.8, 1.12, -2.37, 0.18, 0.44);
        const hood = slope(1.75, 1.2, 2.32, 1.04);
        return {
            wheels: { front, rear },
            bay: { y: 1.1, z: 2.02, pitch: hood },
            deck: { y: 1.98, z: -1.0, w: 1.1, len: 0.76 },
            pipes: { y: 0.32, z: -2.52, xs: [-0.6, -0.42], xs2: [0.6, -0.6] },
            length: 4.7,
            fuel: { x: W / 2 + 0.02, y: 1.08, z: -2.08 },
            antenna: [-0.55, 1.98, -2.08, 1.3],
            gun: [0, 1.98, 0.5],
            panel: { z0: -2.1, z1: 0.42, y0: 0.66, y1: 1.84 },
            door: { z: -0.86, y: 1.28, r: 0.34 },
            topNumber: { z: -1.35, r: 0.3 },
            topFlames: { z1: 1.12, len: 2.6 },
        };
    },

    /** Monster truck: giant wheels, high ladder frame, solid axles, coil-over shocks, tube bumpers, roof light bar. */
    truck(k) {
        const { M } = k;
        const front = { z: 1.42, r: 0.76, w: 0.66, x: 0.77, tread: 'offroad', rim: 'spoke', spokes: 6, rimColor: CHROME, rimRatio: 0.52 };
        const rear = { ...front, z: -1.42 };
        const sill = 1.36, W = 1.56;
        k.shell([
            [-2.12, 1.42, 0.06], [-2.16, 1.98, 0.05], [-0.6, 1.98, 0], [-0.6, 2.04, 0], [0.62, 2.04, 0.1], [1.96, 1.95, 0.14], [2.15, 1.8, 0.08],
            [2.16, 1.46, 0.06], [2.05, 1.36, 0.04],
            ...arch(front.z, front.r, front.r + 0.08, sill, k.seg(8)),
            ...arch(rear.z, rear.r, rear.r + 0.08, sill, k.seg(8)),
        ], W, { bevel: 0.1 });
        k.cabin({ zr0: -0.62, zf0: 0.64, y0: 1.98, zr1: -0.52, zf1: 0.12, y1: 2.48, w: 1.36 });
        // frame, axles, shocks, bumpers
        k.pair(s => k.box(0.14, 0.18, 3.7, M.dark, s * 0.36, 1.2, 0));
        for (const wheel of [front, rear]) {
            k.tube([-0.56, wheel.r, wheel.z], [0.56, wheel.r, wheel.z], 0.09, M.metal);
            k.P.add(G.sphere(0.22, k.seg(12), k.seg(8)), M.metal, { x: 0.08, y: wheel.r, z: wheel.z, sz: 0.8 });
            k.box(0.86, 0.12, 0.16, M.dark, 0, 1.2, wheel.z);
            k.pair(s => {
                for (const dz of [-0.3, 0.3]) {
                    k.tube([s * 0.5, wheel.r + 0.06, wheel.z + dz], [s * 0.4, 1.5, wheel.z + dz * 1.3], 0.045, M.chrome, 6);
                    k.tube([s * 0.47, wheel.r + 0.3, wheel.z + dz * 1.08], [s * 0.42, 1.3, wheel.z + dz * 1.25], 0.11, M.pop, 8);
                }
            });
        }
        for (const s of [1, -1]) {
            const z = s * 2.22;
            k.tube([0.72, 1.42, z], [-0.72, 1.42, z], 0.07, M.chrome);
            k.pair(x => k.tube([x * 0.36, 1.2, s * 1.84], [x * 0.44, 1.42, z], 0.06, M.chrome));
        }
        // nose, tail, roof lights
        k.rbox(0.66, 0.28, 0.08, 0.04, M.ink, 0, 1.64, 2.16);
        k.headlight(0.56, 1.7, 2.17, 0.13);
        k.taillight(0.58, 1.72, -2.17, 0.24, 0.2);
        k.box(0.04, 0.5, 0.03, M.ink, 0, 1.68, -2.17);
        k.rbox(1.1, 0.12, 0.14, 0.04, M.dark, 0, 2.62, 0.04);
        for (const x of [-0.39, -0.13, 0.13, 0.39]) k.cyl(0.075, 0.075, 0.06, M.lamp, x, 2.62, 0.12, PI / 2);
        const hood = slope(0.62, 2.04, 1.96, 1.95);
        return {
            wheels: { front, rear },
            bay: { y: 2.0, z: 1.3, pitch: hood },
            deck: { y: 1.98, z: -1.38, w: 1.1, len: 0.72 },
            pipes: { y: 1.62, z: -2.32, xs: [0.36, -0.36], xs2: [0.46, -0.46] },
            length: 4.7,
            fuel: { x: W / 2 + 0.02, y: 1.72, z: -1.15 },
            antenna: [-0.6, 1.98, -2.0, 1.25],
            gun: [0, 2.57, -0.22],
            panel: { z0: -0.76, z1: 0.76, y0: 1.42, y1: 1.98 },
            door: { z: 0.0, y: 1.7, r: 0.22 },
            topNumber: { z: 1.84, r: 0.2 },
            topFlames: { z1: 2.12, len: 1.4 },
        };
    },

    /** Pickup: lifted, cab + open bed with walls and tailgate, roll bar with spot lamps, chrome grille. */
    pickup(k) {
        const { M } = k;
        const front = { z: 1.45, r: 0.56, w: 0.54, x: 0.84, tread: 'offroad', rim: 'spoke', spokes: 6, rimColor: '#c68a4e' };
        const rear = { ...front, z: -1.35 };
        const sill = 0.52, W = 1.86;
        k.shell([
            [-2.22, 0.58, 0.08], [-2.27, 1.28, 0.04], [-0.62, 1.28, 0], [-0.62, 1.36, 0], [0.62, 1.36, 0.12], [2.04, 1.28, 0.14], [2.24, 1.16, 0.06],
            [2.27, 0.62, 0.08], [2.12, 0.54, 0.04],
            ...arch(front.z, front.r, front.r + 0.07, sill, k.seg(8)),
            ...arch(rear.z, rear.r, rear.r + 0.07, sill, k.seg(8)),
        ], W, { bevel: 0.1 });
        // the bed: walls, front wall, tailgate, dark liner
        k.pair(s => k.shell([[-2.27, 1.24], [-0.66, 1.24], [-0.66, 1.66, 0.04], [-2.27, 1.66, 0.04]], 0.14, { bevel: 0.04, segs: 1 }, { x: s * (W / 2 - 0.07) }));
        k.rbox(1.62, 0.38, 0.12, 0.04, M.paint, 0, 1.46, -0.7);
        k.rbox(1.62, 0.36, 0.1, 0.04, M.paint, 0, 1.46, -2.22);
        k.box(1.6, 0.03, 1.5, M.dark, 0, 1.29, -1.46);
        k.cabin({ zr0: -0.64, zf0: 0.64, y0: 1.3, zr1: -0.58, zf1: 0.02, y1: 1.92, w: 1.64 });
        // roll bar with two spot lamps
        k.pair(s => {
            k.tube([s * 0.72, 1.28, -0.95], [s * 0.64, 2.12, -0.95], 0.06, M.dark);
            k.tube([s * 0.64, 2.12, -0.95], [s * 0.7, 1.28, -1.7], 0.05, M.dark);
            k.cyl(0.15, 0.15, 0.14, M.dark, s * 0.32, 2.14, -0.88, PI / 2);
            k.cyl(0.11, 0.11, 0.05, M.lamp, s * 0.32, 2.14, -0.8, PI / 2);
        });
        k.tube([0.66, 2.12, -0.95], [-0.66, 2.12, -0.95], 0.06, M.dark);
        // nose: chrome bumper, big grille with bars; tail
        k.rbox(1.96, 0.2, 0.24, 0.06, M.chrome, 0, 0.6, 2.24);
        k.rbox(1.2, 0.38, 0.08, 0.04, M.ink, 0, 0.95, 2.25);
        for (const y of [0.86, 0.95, 1.04]) k.box(1.1, 0.035, 0.04, M.chrome, 0, y, 2.29);
        k.headlight(0.7, 0.95, 2.26, 0.14);
        k.rbox(1.96, 0.18, 0.22, 0.06, M.chrome, 0, 0.62, -2.26);
        k.taillight(0.84, 1.1, -2.28, 0.14, 0.3);
        const hood = slope(0.62, 1.36, 2.04, 1.28);
        return {
            wheels: { front, rear },
            bay: { y: 1.33, z: 1.32, pitch: hood },
            deck: { y: 1.3, z: -1.55, w: 1.2, len: 0.74 },
            pipes: { y: 0.38, z: -2.42, xs: [0.5, -0.5], xs2: [0.56, -0.56] },
            length: 4.5,
            fuel: { x: W / 2 + 0.01, y: 1.46, z: -1.85 },
            antenna: [-(W / 2 - 0.07), 1.66, -2.1, 1.25],
            gun: [0, 2.01, -0.26],
            panel: { z0: -0.6, z1: 0.8, y0: 0.62, y1: 1.3 },
            door: { z: 0.06, y: 0.96, r: 0.27 },
            topNumber: { z: 1.88, r: 0.22 },
            topFlames: { z1: 2.22, len: 1.3 },
        };
    },

    /** Dune buggy: open tube frame and roll cage, a little driver, small front wheels, huge knobbly rear tyres, high wing. */
    buggy(k) {
        const { M, o } = k;
        const front = { z: 1.48, r: 0.42, w: 0.36, x: 0.88, tread: 'rally', rim: 'dish', spokes: 4, rimColor: '#f6c638' };
        const rear = { z: -1.28, r: 0.66, w: 0.62, x: 0.8, tread: 'knobby', rim: 'dish', spokes: 5, rimColor: '#f6c638', rimRatio: 0.55 };
        const cage = toon(o.accent);
        // chassis pan, nose panel, side pods
        k.ext([[-1.85, 0.3], [1.7, 0.3], [2.0, 0.48, 0.08], [1.9, 0.52], [-1.85, 0.44]], 0.9, M.dark, { bevel: 0.03, segs: 1 });
        k.shell([[0.4, 0.42], [1.95, 0.46, 0.06], [2.06, 0.66, 0.06], [1.3, 0.9, 0.2], [0.4, 0.98, 0.1]], 0.92, { bevel: 0.08, taper: z => (z > 1.0 ? 1 - (z - 1.0) * 0.28 : 1) });
        k.shell([[-0.55, 0.4], [0.62, 0.4], [0.72, 0.62, 0.08], [0.45, 0.82, 0.12], [-0.55, 0.84, 0.1]], 1.34, { bevel: 0.08 });
        // seat and driver
        k.rbox(0.6, 0.18, 0.6, 0.06, M.dark, 0, 0.88, -0.2);
        k.rbox(0.6, 0.66, 0.16, 0.06, M.dark, 0, 1.14, -0.5, -0.1);
        k.rbox(0.5, 0.42, 0.34, 0.12, M.white, 0, 1.12, -0.24);
        k.P.add(G.sphere(0.26, k.seg(16), k.seg(12)), M.pop, { y: 1.5, z: -0.2 });
        k.rbox(0.38, 0.13, 0.1, 0.04, M.ink, 0, 1.52, 0.02);
        // roll cage
        const r = 0.055;
        const hoop = (pts) => { for (let i = 0; i < pts.length - 1; i++) k.tube(pts[i], pts[i + 1], r, cage); };
        hoop([[0.52, 0.8, -0.56], [0.44, 1.76, -0.5], [-0.44, 1.76, -0.5], [-0.52, 0.8, -0.56]]);
        hoop([[0.56, 0.8, 0.62], [0.4, 1.58, 0.2], [-0.4, 1.58, 0.2], [-0.56, 0.8, 0.62]]);
        k.pair(s => {
            k.tube([s * 0.44, 1.76, -0.5], [s * 0.4, 1.58, 0.2], r, cage);
            k.tube([s * 0.44, 1.76, -0.5], [s * 0.3, 0.46, -1.72], r, cage);
            k.P.add(G.sphere(r * 1.6, 8, 6), cage, { x: s * 0.44, y: 1.76, z: -0.5 });
            k.P.add(G.sphere(r * 1.6, 8, 6), cage, { x: s * 0.4, y: 1.58, z: 0.2 });
        });
        k.rbox(0.56, 0.06, 0.5, 0.03, M.dark, 0, 1.74, -0.36, -0.2);
        // bumpers, suspension
        k.tube([-0.62, 0.46, 2.08], [0.62, 0.46, 2.08], 0.06, cage);
        k.pair(s => k.tube([s * 0.62, 0.46, 2.08], [s * 0.4, 0.4, 1.8], 0.06, cage));
        k.tube([-0.46, 0.52, -1.94], [0.46, 0.52, -1.94], 0.06, cage);
        k.pair(s => {
            k.tube([s * 0.4, 0.42, 1.36], [s * 0.76, 0.42, 1.48], 0.04, M.dark, 6);
            k.tube([s * 0.4, 0.42, 1.62], [s * 0.76, 0.42, 1.48], 0.04, M.dark, 6);
            k.tube([s * 0.38, 0.98, 1.28], [s * 0.7, 0.46, 1.46], 0.07, M.pop, 8);
            k.tube([s * 0.3, 1.0, -0.95], [s * 0.42, 0.62, -1.24], 0.08, M.pop, 8);
            k.tube([s * 0.3, 0.44, -1.0], [s * 0.45, 0.62, -1.28], 0.05, M.dark, 6);
        });
        // rear wing on struts
        k.pair(s => k.box(0.06, 0.96, 0.12, M.dark, s * 0.32, 0.92, -1.78));
        k.ext([[-2.16, 1.36], [-1.52, 1.42, 0.04], [-1.56, 1.5, 0.04], [-2.16, 1.46, 0.02]], 1.5, M.paint, { bevel: 0.03, segs: 1 });
        // the engine / battery deck between the rear tyres
        k.rbox(0.9, 0.06, 0.82, 0.02, M.dark, 0, 0.66, -1.12);
        k.pair(s => { for (const z of [-1.45, -0.8]) k.box(0.06, 0.24, 0.06, M.dark, s * 0.36, 0.54, z); });
        k.pair(s => k.rbox(0.05, 0.32, 0.72, 0.02, M.accent, s * 0.76, 1.42, -1.84));
        // lamps on the cage, taillights on the rear bumper
        k.pair(s => k.box(0.06, 0.1, 0.06, M.dark, s * 0.25, 1.63, 0.2));
        k.headlight(0.25, 1.72, 0.24, 0.09);
        k.taillight(0.3, 0.62, -1.93, 0.14, 0.1);
        return {
            wheels: { front, rear },
            bay: { y: 0.69, z: -1.12, pitch: 0, tank: [0, 0.52] },
            deck: { y: 0.69, z: -1.12, w: 0.9, len: 0.62 },
            pipes: { y: 0.76, z: -2.0, xs: [0.18, -0.18], xs2: [0.24, -0.24] },
            length: 4.2,
            fuel: null,
            antenna: [-0.55, 0.84, -0.42, 1.3],
            gun: [0, 1.77, -0.36],
            panel: { z0: -0.5, z1: 0.62, y0: 0.44, y1: 0.8 },
            door: { z: 0.06, y: 0.62, r: 0.17 },
            topNumber: { z: 1.3, r: 0.2 },
            topFlames: { z1: 2.02, len: 1.5 },
        };
    },

    /** Formula racer: open wheels, needle nose with a wide front wing, side pods, airbox, high rear wing, very low. */
    formula(k) {
        const { M } = k;
        const front = { z: 1.45, r: 0.42, w: 0.42, x: 0.86, tread: 'slick', rim: 'spoke', spokes: 6, rimColor: WHITE, stripe: '#f6c638' };
        const rear = { z: -1.25, r: 0.48, w: 0.6, x: 0.8, tread: 'slick', rim: 'spoke', spokes: 6, rimColor: WHITE, stripe: '#f6c638' };
        // tub (nose → gearbox), airbox, side pods
        k.shell([[-1.78, 0.22, 0.04], [-1.82, 0.56, 0.06], [-0.45, 0.8, 0.2], [0.75, 0.74, 0.25], [2.1, 0.44, 0.1], [2.16, 0.3, 0.06], [1.95, 0.2, 0.04], [0.0, 0.16]], 0.7,
            { bevel: 0.1, taper: z => (z > 0.7 ? 1 - (z - 0.7) * 0.3 : z < -1.0 ? 1 - (-1.0 - z) * 0.3 : 1) });
        k.shell([[-0.9, 0.7], [-0.45, 0.78], [-0.28, 1.08, 0.08], [-0.62, 1.12, 0.12], [-0.9, 0.86, 0.1]], 0.36, { bevel: 0.06 });
        k.shell([[-0.75, 0.18], [0.42, 0.18], [0.5, 0.5, 0.06], [0.2, 0.58, 0.12], [-0.75, 0.5, 0.15]], 1.18, { bevel: 0.08 });
        k.box(0.2, 0.12, 0.04, M.ink, 0, 1.0, -0.27);
        k.pair(s => k.rbox(0.22, 0.24, 0.05, 0.04, M.ink, s * 0.42, 0.36, 0.47));
        // cockpit: opening, driver helmet
        k.rbox(0.48, 0.04, 0.78, 0.02, M.ink, 0, 0.78, 0.2, 0.04);
        k.P.add(G.sphere(0.22, k.seg(16), k.seg(12)), M.pop, { y: 0.92, z: 0.02 });
        k.rbox(0.32, 0.11, 0.1, 0.04, M.ink, 0, 0.94, 0.2);
        // wings
        k.ext([[1.82, 0.12], [2.36, 0.12], [2.36, 0.18, 0.03], [1.88, 0.24, 0.04]], 2.1, M.paint, { bevel: 0.03, segs: 1 });
        k.pair(s => k.rbox(0.05, 0.26, 0.6, 0.02, M.accent, s * 1.06, 0.22, 2.08));
        k.ext([[-2.25, 1.0], [-1.72, 1.06, 0.04], [-1.76, 1.15, 0.05], [-2.25, 1.1, 0.02]], 1.5, M.paint, { bevel: 0.03, segs: 1 });
        k.ext([[-2.2, 0.8], [-1.86, 0.84], [-1.88, 0.9, 0.02], [-2.2, 0.88]], 1.5, M.accent, { bevel: 0.02, segs: 1 });
        k.pair(s => k.rbox(0.05, 0.52, 0.66, 0.02, M.accent, s * 0.77, 0.9, -1.98));
        k.box(0.08, 0.5, 0.2, M.dark, 0, 0.74, -1.9);
        k.rbox(0.5, 0.28, 0.42, 0.05, M.dark, 0, 0.32, -1.86);
        // wishbones
        k.pair(s => {
            for (const [z, wz] of [[front.z, 0.12], [rear.z, 0.14]]) {
                const x0 = z > 0 ? 0.22 : 0.3;
                k.tube([s * x0, 0.34, z - wz], [s * 0.66, 0.42, z], 0.035, M.dark, 6);
                k.tube([s * x0, 0.34, z + wz], [s * 0.66, 0.42, z], 0.035, M.dark, 6);
                k.tube([s * x0, 0.56, z], [s * 0.66, 0.5, z], 0.035, M.dark, 6);
            }
        });
        k.pair(s => k.cyl(0.07, 0.07, 0.06, M.lamp, s * 0.36, 0.42, 0.5, PI / 2));
        k.headlights.push(new THREE.Vector3(0.36, 0.42, 0.55), new THREE.Vector3(-0.36, 0.42, 0.55));
        k.L.add(G.rbox(0.26, 0.12, 0.06, 0.03, k.detail < 0.75 ? 0 : 1), M.tail, { y: 0.58, z: -2.08 });
        const cover = slope(-1.82, 0.56, -0.45, 0.8);
        return {
            wheels: { front, rear },
            bay: { y: 0.66, z: -1.3, pitch: cover },
            deck: { y: 0.66, z: -1.3, pitch: cover, w: 0.8, len: 0.56 },
            pipes: { y: 0.56, z: -2.12, xs: [0.14, -0.14], xs2: [0.2, -0.2] },
            length: 4.3,
            fuel: null,
            antenna: [-0.42, 0.56, -0.62, 1.2],
            gun: [0, 0.7, 1.0],
            panel: { z0: -0.7, z1: 0.42, y0: 0.22, y1: 0.54 },
            door: { z: -0.16, y: 0.37, r: 0.14 },
            topNumber: { z: 1.6, r: 0.16 },
            topFlames: { z1: 2.1, len: 1.3 },
        };
    },
};

// ------------------------------------------------------------------ assembly

function addWheels(group, spec, k) {
    const cache = new Map();
    const wheels = [];
    for (const [front, left] of [[true, true], [true, false], [false, true], [false, false]]) {
        const s = front ? spec.front : spec.rear;
        const key = JSON.stringify(s);
        let parts = cache.get(key);
        if (!parts) {
            parts = wheelParts(s, { ...k.M, rim: toon(s.rimColor) }, k.detail).meshes();
            cache.set(key, parts);
        }
        const pivot = new THREE.Group();
        pivot.name = `wheel${front ? 'F' : 'R'}${left ? 'L' : 'R'}`;
        pivot.position.set(left ? s.x : -s.x, s.r, s.z);
        const spin = new THREE.Group();
        const holder = new THREE.Group();
        if (!left) holder.rotation.y = PI;
        for (const m of parts) {
            const mesh = new THREE.Mesh(m.geometry, m.material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            holder.add(mesh);
        }
        spin.add(holder);
        pivot.add(spin);
        group.add(pivot);
        wheels.push({ pivot, spin, front, left, radius: s.r });
    }
    return wheels;
}

/**
 * Builds a radio-controlled toy car.
 * @param {string} body one of BODIES
 * @param {{ paint?: string, accent?: string, decal?: string, number?: number, drive?: 'electric'|'gas'|'turbo', quality?: 'high'|'medium'|'low' }} options
 */
export function buildCar(body, options = {}) {
    const key = BODIES.includes(body) ? body : BODIES[0];
    const o = normalize(key, options ?? {});
    const k = kit(o);
    const a = BUILDERS[key](k);
    const exhausts = addDrive(o.drive, k.P, k.T, k.M, a, k.detail);

    // paint + decals: one canvas per car, mapped onto all shells
    const box = new THREE.Box3();
    for (const g of k.shells) {
        g.computeBoundingBox();
        box.union(g.boundingBox);
    }
    const atlas = decalAtlas({
        size: o.quality === 'high' ? 1024 : 512,
        paint: o.paint, accent: o.accent, pop: o.pop, decal: o.decal, number: o.number, drive: o.drive,
        box: { zmin: box.min.z, zmax: box.max.z, ymin: box.min.y, ymax: box.max.y, w: box.max.x - box.min.x },
        panel: a.panel, door: a.door, topNumber: a.topNumber, topFlames: a.topFlames,
    });
    const skin = toon(0xffffff, { map: atlas.texture });
    for (const g of k.shells) k.P.add(atlas.map(g), skin);

    // antenna socket
    const [ax, ay, az, aHeight] = a.antenna;
    k.cyl(0.07, 0.09, 0.12, k.M.dark, ax, ay + 0.05, az, 0, 0, 0, 10);

    const bodyGroup = new THREE.Group();
    bodyGroup.name = 'body';
    k.P.into(bodyGroup);
    const turbo = k.T.meshes({ cast: false })[0] ?? null;
    if (turbo) {
        turbo.name = 'turbo';
        bodyGroup.add(turbo);
    }
    const taillights = k.L.meshes({ cast: false });
    taillights.forEach((m, i) => {
        m.name = `taillight${i}`;
        bodyGroup.add(m);
    });
    const gun = buildGun(k.M, k.detail);
    gun.position.set(a.gun[0], a.gun[1], a.gun[2]);
    bodyGroup.add(gun);
    const antenna = buildAntenna(k.M, aHeight, o.pop);
    antenna.position.set(ax, ay + 0.1, az);
    bodyGroup.add(antenna);

    const group = new THREE.Group();
    group.name = `car-${key}`;
    group.add(bodyGroup);
    const wheels = addWheels(group, a.wheels, k);

    const car = {
        group,
        body: bodyGroup,
        wheels,
        exhausts,
        headlights: k.headlights,
        taillights,
        turbo,
        antenna,
        gunMount: new THREE.Vector3(a.gun[0], a.gun[1], a.gun[2]),
        gun,
        size: null,
    };
    // every body has its own length (≈ 4.2, truck/van up to 4.8): the design is scaled down to it
    const length = measure(car).length;
    if (length > a.length) rescale(car, a.length / length);
    car.size = measure(car);
    group.userData.car = { body: key, ...o };
    return car;
}

/** Bounds of the car without antenna and gun (the solid toy): { length, width, height }. */
function measure(car) {
    car.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    const skip = new Set();
    car.antenna.traverse(c => skip.add(c));
    car.gun.traverse(c => skip.add(c));
    const tmp = new THREE.Box3();
    car.group.traverse(m => {
        if (!m.isMesh || skip.has(m)) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        bounds.union(tmp.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
    });
    return { length: bounds.max.z - bounds.min.z, width: bounds.max.x - bounds.min.x, height: bounds.max.y - bounds.min.y };
}

/** Scales a finished car about its origin (geometry of the body baked, wheels/gun/antenna by their holders). */
function rescale(car, s) {
    for (const m of car.body.children) {
        if (!m.isMesh) continue;
        m.geometry.scale(s, s, s);
        m.geometry.computeBoundingBox();
        m.geometry.computeBoundingSphere();
    }
    car.gun.position.multiplyScalar(s);
    car.gun.children.forEach(c => c.geometry?.scale(s, s, s));
    car.gun.userData.muzzle.multiplyScalar(s);
    car.antenna.position.multiplyScalar(s);
    car.antenna.children[0].scale.setScalar(s);
    car.antenna.userData.tip.multiplyScalar(s);
    for (const w of car.wheels) {
        w.pivot.position.multiplyScalar(s);
        w.spin.children[0].scale.setScalar(s);
        w.radius *= s;
    }
    for (const p of [...car.exhausts, ...car.headlights, car.gunMount]) p.multiplyScalar(s);
}

/**
 * The car on a round display base for menus. `group` holds the base and `car` (the car's own group, lifted onto the base);
 * all points (exhausts, headlights, gunMount …) are local to `car`.
 */
export function buildShowroomCar(body, options = {}) {
    const car = buildCar(body, options);
    const o = car.group.userData.car;
    const P = new Parts();
    P.add(G.cyl(3.0, 3.1, 0.24, 48), toon(WHITE), { y: 0.12 });
    P.add(G.cyl(3.14, 3.16, 0.1, 48), toon(o.accent), { y: 0.06 });
    const base = P.into(new THREE.Group());
    base.name = 'showroom-base';
    const group = new THREE.Group();
    group.name = `showroom-${o.body}`;
    car.group.position.y = 0.24;
    group.add(base, car.group);
    return { ...car, group, car: car.group, base };
}
