// TurboToys · themes/kidsroom-props.js – the toys and the furniture of the kid's room (kidsroom.js places them).
// Every factory returns a THREE.Group standing on y = 0 around its origin; colours come from a small palette (few merged draw calls).

import * as THREE from 'three';
import { toon, flat, box, roundBox, roundBoxGeometry, cyl, sphere, cone, torus, shape, lathe, at, group, canvasTexture, mergeByMaterial, PALETTE } from '../render/toon.js';

export const C = {
    ink: '#2a2420',
    cream: '#f4ead2',
    paper: '#fbf6e8',
    white: '#f7f3ea',
    red: '#e2392f',
    orange: '#f28c28',
    yellow: '#f6c638',
    lime: '#9bd23c',
    green: '#3f9b4b',
    teal: '#2aa198',
    sky: '#5cb7e6',
    blue: '#2f6fd0',
    navy: '#1d3263',
    purple: '#7a4bc4',
    pink: '#e86aa6',
    wood: '#d9a066',
    woodLight: '#ecc48e',
    woodDark: '#9a6136',
    fur: '#b9773f',
    furLight: '#ecc795',
    grey: '#8a8f96',
    dark: '#34373d',
    black: '#1c1a1a',
    glow: '#fff2b0',
};

export const TOY_COLORS = [C.red, C.yellow, C.blue, C.green, C.orange, C.purple, C.teal, C.pink];

const rot = (o, x = 0, y = 0, z = 0) => {
    o.rotation.set(x, y, z);
    return o;
};
const scl = (o, x, y = x, z = x) => {
    o.scale.set(x, y, z);
    return o;
};

// ------------------------------------------------------------------ textures (each one material: made once)

let letterMaterial = null;
/** The alphabet-block atlas: 4×4 coloured faces with a big letter, number or symbol. */
function letters() {
    if (letterMaterial) return letterMaterial;
    const glyphs = ['A', 'B', 'C', '1', '2', '3', '★', '♥', 'K', 'Z', 'X', 'O', 'M', 'T', '5', '7'];
    const colors = ['#e2392f', '#f6c638', '#2f6fd0', '#3f9b4b', '#f28c28', '#7a4bc4', '#2aa198', '#e86aa6'];
    const tex = canvasTexture(512, 512, (ctx, w, h) => {
        const s = w / 4;
        glyphs.forEach((g, k) => {
            const x = (k % 4) * s;
            const y = Math.floor(k / 4) * s;
            ctx.fillStyle = '#f2d7a6';
            ctx.fillRect(x, y, s, s);
            ctx.fillStyle = colors[k % colors.length];
            ctx.fillRect(x + 10, y + 10, s - 20, s - 20);
            ctx.font = `${Math.round(s * 0.72)}px Bangers, Impact, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 8;
            ctx.strokeStyle = '#14100c';
            ctx.fillStyle = '#fbf6e8';
            ctx.strokeText(g, x + s / 2, y + s / 2 + 6);
            ctx.fillText(g, x + s / 2, y + s / 2 + 6);
        });
    });
    letterMaterial = toon(0xffffff, { map: tex });
    return letterMaterial;
}

/** A wooden alphabet block (edge s) showing atlas cell k on every face. */
export function letterBlock(s, k) {
    const g = roundBoxGeometry(s, s, s, s * 0.08, 1);
    const uv = g.attributes.uv;
    const cx = k % 4;
    const cy = 3 - Math.floor(k / 4);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + 0.02 + uv.getX(i) * 0.96) / 4, (cy + 0.02 + uv.getY(i) * 0.96) / 4);
    const mesh = new THREE.Mesh(g, letters());
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
}

// ------------------------------------------------------------------ small toys

/** A plain coloured wooden block (cube, long beam, cylinder or roof prism). */
export function woodBlock(kind, color, s = 6) {
    if (kind === 'beam') return roundBox(s * 2, s * 0.5, s * 0.5, s * 0.06, color, 1);
    if (kind === 'pillar') return cyl(s * 0.35, s * 0.35, s * 1.4, color, 14);
    if (kind === 'roof') {
        const m = cyl(s * 0.62, s * 0.62, s, color, 3);
        return rot(m, Math.PI / 2, 0, 0);
    }
    return roundBox(s, s, s, s * 0.08, color, 1);
}

/** A tower of blocks (letters and plain) with a roof or a ball on top. */
export function blockTower(rng, s = 6) {
    const g = new THREE.Group();
    const levels = rng.int(2, 5);
    let y = 0;
    for (let k = 0; k < levels; k++) {
        const b = rng() < 0.55 ? letterBlock(s, rng.int(0, 15)) : woodBlock('cube', rng.pick(TOY_COLORS), s);
        at(b, (rng() - 0.5) * s * 0.18, y + s / 2, (rng() - 0.5) * s * 0.18, (rng() - 0.5) * 0.5);
        g.add(b);
        y += s;
    }
    if (rng() < 0.6) {
        const roof = woodBlock('roof', rng.pick([C.red, C.blue, C.green]), s);
        roof.position.set(0, y + s * 0.31, 0);
        g.add(roof);
    }
    return g;
}

/** A gate: two pillars and a beam (or two towers of cubes and a beam). */
export function blockGate(rng, s = 6) {
    const g = new THREE.Group();
    const h = rng.int(1, 3);
    for (const side of [-1, 1]) {
        for (let k = 0; k < h; k++) g.add(at(rng() < 0.5 ? letterBlock(s * 0.8, rng.int(0, 15)) : woodBlock('cube', rng.pick(TOY_COLORS), s * 0.8), side * s * 0.8, s * 0.4 + k * s * 0.8, 0));
    }
    g.add(at(woodBlock('beam', rng.pick(TOY_COLORS), s * 1.1), 0, h * s * 0.8 + s * 0.27, 0));
    g.add(at(woodBlock('roof', rng.pick(TOY_COLORS), s * 0.8), 0, h * s * 0.8 + s * 0.55 + s * 0.25, 0));
    return g;
}

/** A few loose blocks lying around. */
export function looseBlocks(rng, s = 6) {
    const g = new THREE.Group();
    const n = rng.int(2, 5);
    for (let k = 0; k < n; k++) {
        const kind = rng.pick(['cube', 'cube', 'letter', 'letter', 'beam', 'pillar', 'roof']);
        let b;
        if (kind === 'letter') b = letterBlock(s, rng.int(0, 15));
        else b = woodBlock(kind, rng.pick(TOY_COLORS), s);
        const y = kind === 'beam' ? s * 0.25 : kind === 'pillar' ? s * 0.7 : kind === 'roof' ? s * 0.31 : s / 2;
        b.position.set(rng.range(-s * 2, s * 2), y, rng.range(-s * 2, s * 2));
        if (kind !== 'roof') b.rotation.y = rng() * Math.PI;
        if (kind === 'pillar' && rng() < 0.5) {
            b.rotation.z = Math.PI / 2;
            b.position.y = s * 0.35;
        }
        g.add(b);
    }
    return g;
}

/** A generic building brick (no logo): nx × nz studs, pitch p. */
export function brick(nx, nz, color, p = 1.6) {
    const g = new THREE.Group();
    const h = p * 1.2;
    g.add(at(roundBox(nx * p, h, nz * p, 0.12, color, 1), 0, h / 2, 0));
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) g.add(at(cyl(p * 0.3, p * 0.3, p * 0.22, color, 8), (i - (nx - 1) / 2) * p, h + p * 0.11, (j - (nz - 1) / 2) * p));
    }
    return g;
}

/** A heap of bricks (some stacked, most tumbled). */
export function brickPile(rng, count = 18, radius = 9) {
    const g = new THREE.Group();
    for (let k = 0; k < count; k++) {
        const size = rng.pick([[2, 4], [2, 2], [2, 3], [1, 4], [2, 6], [1, 2]]);
        const b = brick(size[0], size[1], rng.pick([C.red, C.yellow, C.blue, C.green, C.white, C.orange, C.lime]));
        const r = Math.sqrt(rng()) * radius;
        const a = rng() * Math.PI * 2;
        const y = Math.max(0, (1 - r / radius) * radius * 0.45 - 1);
        b.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        b.rotation.set(y > 0.5 ? (rng() - 0.5) * 0.9 : 0, rng() * Math.PI, y > 0.5 ? (rng() - 0.5) * 0.9 : 0);
        g.add(b);
    }
    return g;
}

/** A small built brick house (stack of bricks with a roof). */
export function brickHouse(rng) {
    const g = new THREE.Group();
    const wall = rng.pick([C.red, C.yellow, C.white, C.blue]);
    const p = 1.6;
    for (let row = 0; row < 4; row++) {
        const y = row * p * 1.2;
        const off = row % 2 ? p : 0;
        g.add(at(roundBox(p * 8, p * 1.2, p * 2, 0.1, wall, 1), off * 0.5, y + p * 0.6, -p * 3));
        g.add(at(roundBox(p * 8, p * 1.2, p * 2, 0.1, wall, 1), -off * 0.5, y + p * 0.6, p * 3));
        g.add(at(roundBox(p * 2, p * 1.2, p * 4, 0.1, wall, 1), -p * 3.5, y + p * 0.6, 0));
        g.add(at(roundBox(p * 2, p * 1.2, p * 4, 0.1, row === 1 || row === 2 ? C.sky : wall, 1), p * 3.5, y + p * 0.6, 0));
    }
    const roofColor = rng.pick([C.red, C.green, C.blue]);
    for (const s of [-1, 1]) {
        const roof = roundBox(p * 9.5, 0.6, p * 5, 0.2, roofColor, 1);
        roof.position.set(0, p * 4.8 + p * 1.6, s * p * 2);
        roof.rotation.x = s * 0.62;
        g.add(roof);
    }
    return g;
}

/** A wax crayon lying on the floor (length ~18). */
export function crayon(color, length = 18, r = 1.1) {
    const g = new THREE.Group();
    const body = cyl(r, r, length, color, 10);
    g.add(body);
    for (const y of [-length * 0.3, length * 0.32]) g.add(at(cyl(r * 1.06, r * 1.06, 0.8, C.ink, 10), 0, y, 0));
    g.add(at(cyl(r * 1.04, r * 1.04, length * 0.5, C.paper, 10), 0, 0, 0));
    g.add(at(cone(r, r * 2.6, color, 10), 0, length / 2 + r * 1.3, 0));
    rot(g, 0, 0, Math.PI / 2);
    g.position.y = r;
    return group(g);
}

/** A tipped-over crayon box with crayons spilling out. */
export function crayonBox(rng) {
    const g = new THREE.Group();
    const bx = box(22, 5, 14, C.yellow);
    bx.position.set(0, 2.5, 0);
    g.add(bx);
    g.add(at(box(22.2, 1.4, 14.2, C.green), 0, 3.6, 0));
    g.add(at(box(0.5, 4.6, 13.4, C.dark), 11, 2.5, 0));
    for (let k = 0; k < 7; k++) {
        const c = crayon(TOY_COLORS[k % TOY_COLORS.length]);
        c.position.set(14 + rng.range(0, 14), 0, rng.range(-10, 10));
        c.rotation.y = rng.range(-0.8, 0.8);
        g.add(c);
    }
    return g;
}

/** A beach-ball style toy ball (coloured wedges). */
export function ball(r = 12, colors = [C.red, C.yellow, C.blue, C.white, C.green, C.orange]) {
    const g = new THREE.Group();
    const n = colors.length;
    for (let k = 0; k < n; k++) {
        const geo = new THREE.SphereGeometry(r, 4, 14, (k / n) * Math.PI * 2, (Math.PI * 2) / n);
        const m = new THREE.Mesh(geo, toon(colors[k], { steps: 4 }));
        m.castShadow = m.receiveShadow = true;
        g.add(m);
    }
    g.add(at(cyl(r * 0.2, r * 0.2, 0.4, C.white, 12), 0, r, 0));
    g.position.y = r;
    g.rotation.z = 0.5;
    return group(g);
}

/** The stacking-rings toy: a base, a pole and rings getting smaller. */
export function stackingRings() {
    const g = new THREE.Group();
    g.add(at(cyl(9, 10, 3, C.wood, 16), 0, 1.5, 0));
    g.add(at(cyl(1.4, 1.6, 24, C.woodLight, 10), 0, 14, 0));
    const colors = [C.red, C.orange, C.yellow, C.green, C.blue, C.purple];
    let y = 4.5;
    colors.forEach((c, k) => {
        const tube = 2.6 - k * 0.2;
        const ring = torus(8 - k * 1.05, tube, c, 8, 18);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y + tube - 0.6;
        y += tube * 2 - 0.4;
        g.add(ring);
    });
    g.add(at(sphere(3.4, C.red, 12, 10), 0, y + 3, 0));
    return g;
}

/** A spinning top (animated by the caller: rotate about y). */
export function spinningTop() {
    const body = lathe([[0.01, 0], [2.5, 2.5], [8, 6.5], [9, 8], [8.5, 9.6], [3, 11], [1.4, 11.5], [1.4, 16], [0.01, 16.4]], C.red, 16);
    const g = new THREE.Group();
    g.add(body);
    const band = cyl(9.1, 9.1, 1.6, C.yellow, 16);
    band.position.y = 8;
    g.add(band);
    const top = cyl(1.5, 1.5, 0.6, C.blue, 10);
    top.position.y = 16.2;
    g.add(top);
    return g;
}

/** A toy drum with two sticks. */
export function drum() {
    const g = new THREE.Group();
    g.add(at(cyl(10, 10, 11, C.red, 16), 0, 5.5, 0));
    g.add(at(cyl(10.6, 10.6, 1.4, C.yellow, 16), 0, 0.7, 0));
    g.add(at(cyl(10.6, 10.6, 1.4, C.yellow, 16), 0, 10.4, 0));
    g.add(at(cyl(9.8, 9.8, 0.3, C.paper, 16), 0, 11.2, 0));
    for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const zig = cyl(0.3, 0.3, 11, C.white, 4);
        zig.position.set(Math.cos(a) * 10.2, 5.5, Math.sin(a) * 10.2);
        zig.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        g.add(zig);
    }
    for (const s of [-1, 1]) {
        const stick = group(at(cyl(0.45, 0.45, 13, C.woodLight, 6), 0, 0, 0), at(sphere(1, C.red, 8, 6), 0, 6.5, 0));
        stick.rotation.set(Math.PI / 2, 0, 0.4 * s);
        stick.position.set(14 + s * 3, 1, 3);
        g.add(stick);
    }
    return g;
}

/** A chunky toy robot (~22 tall). */
export function robot(color = C.sky) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
        g.add(at(roundBox(3.4, 7, 4, 0.6, C.grey, 1), s * 2.6, 3.5, 0));
        g.add(at(roundBox(4.2, 1.6, 5.4, 0.5, C.dark, 1), s * 2.6, 0.8, 0.5));
    }
    g.add(at(roundBox(10, 9, 6.5, 1, color, 2), 0, 11.5, 0));
    g.add(at(box(5, 4, 0.6, C.dark), 0, 12, 3.3));
    g.add(at(sphere(0.8, flat('#ff5040'), 8, 6), -1.2, 12.5, 3.7));
    g.add(at(sphere(0.8, flat('#7dff7a'), 8, 6), 1.2, 12.5, 3.7));
    for (const s of [-1, 1]) {
        const arm = group(at(cyl(1.2, 1.2, 7, C.grey, 8), 0, -3, 0), at(torus(1.6, 0.7, C.dark, 6, 10, Math.PI * 1.4), 0, -7.4, 0));
        arm.position.set(s * 6.4, 15, 0);
        arm.rotation.set(-0.4, 0, s * 0.25);
        g.add(arm);
    }
    g.add(at(cyl(1.4, 1.6, 1.5, C.grey, 10), 0, 16.6, 0));
    g.add(at(roundBox(8, 6, 6, 1, C.white, 2), 0, 20.2, 0));
    g.add(at(box(6.4, 2.2, 0.5, C.navy), 0, 20.6, 3));
    g.add(at(sphere(0.75, flat('#fff36b'), 8, 6), -1.6, 20.6, 3.3));
    g.add(at(sphere(0.75, flat('#fff36b'), 8, 6), 1.6, 20.6, 3.3));
    g.add(at(cyl(0.3, 0.3, 3, C.dark, 6), 0, 24.6, 0));
    g.add(at(sphere(1.1, C.red, 8, 6), 0, 26.4, 0));
    return g;
}

/** A chunky toy dinosaur (long neck, spikes). */
export function dino(color = C.lime) {
    const g = new THREE.Group();
    g.add(at(scl(sphere(9, color, 14, 10), 1.45, 0.9, 1), 0, 12, 0));
    for (const [x, z] of [[-7, -5], [-7, 5], [7, -5], [7, 5]]) g.add(at(cyl(2.6, 3, 9, color, 10), x, 4.5, z));
    const neck = cyl(2.6, 3.8, 18, color, 10);
    neck.position.set(13, 20, 0);
    neck.rotation.z = -0.75;
    g.add(neck);
    const head = scl(sphere(4.5, color, 12, 10), 1.35, 1, 1);
    head.position.set(19.5, 27.5, 0);
    g.add(head);
    g.add(at(sphere(1.1, C.white, 8, 6), 21, 29, 3.4));
    g.add(at(sphere(0.6, C.black, 8, 6), 21.4, 29.1, 4.3));
    g.add(at(sphere(1.1, C.white, 8, 6), 21, 29, -3.4));
    g.add(at(sphere(0.6, C.black, 8, 6), 21.4, 29.1, -4.3));
    const tail = cone(4.5, 20, color, 10);
    tail.position.set(-18, 9, 0);
    tail.rotation.z = Math.PI / 2 + 0.35;
    g.add(tail);
    for (let k = 0; k < 6; k++) {
        const spike = cone(2, 4.2, C.orange, 6);
        const x = -12 + k * 4.6;
        spike.position.set(x, 19.4 - Math.abs(x) * 0.12, 0);
        spike.rotation.z = -x * 0.02;
        g.add(spike);
    }
    return g;
}

/** A paper aeroplane. */
export function paperPlane() {
    const g = new THREE.Group();
    const paper = toon(C.paper, { side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
        const wing = shape([[0, 0], [16, 0], [0, 6.5 * s]], paper, 0);
        wing.rotation.x = -Math.PI / 2 + s * 0.25;
        wing.position.set(-8, 2.4, 0);
        g.add(wing);
    }
    const keel = shape([[0, 0], [16, 0], [0, 2.4]], paper, 0);
    keel.position.set(-8, 0, 0);
    g.add(keel);
    return g;
}

/** A sock (lost in the room). */
export function sock(color = C.red) {
    const g = new THREE.Group();
    const leg = roundBox(5, 2, 16, 1, color, 2);
    leg.position.set(0, 1, 0);
    g.add(leg);
    const foot = roundBox(5, 2, 9, 1, color, 2);
    foot.position.set(3.2, 1, 9);
    foot.rotation.y = -0.9;
    g.add(foot);
    g.add(at(roundBox(5.2, 2.1, 3, 1, C.white, 1), 0, 1.02, -7));
    g.add(at(roundBox(5.2, 2.1, 2.4, 1, C.white, 1), 5.6, 1.02, 11.4, -0.9));
    return g;
}

// ------------------------------------------------------------------ the teddy bear

/** A sitting teddy bear, about 46 tall. */
export function teddy(fur = C.fur, light = C.furLight, bow = C.red) {
    const g = new THREE.Group();
    g.add(at(scl(sphere(12, fur, 16, 12), 1, 1.12, 0.92), 0, 13, 0));
    g.add(at(scl(sphere(7.5, light, 14, 10), 1, 1.15, 0.6), 0, 12, 5.6));
    g.add(at(sphere(9.5, fur, 16, 12), 0, 32, 0.5));
    for (const s of [-1, 1]) {
        g.add(at(sphere(3.6, fur, 12, 8), s * 7, 39.5, -0.5));
        g.add(at(scl(sphere(2.2, light, 10, 8), 1, 1, 0.5), s * 7, 39.5, 1.6));
        g.add(at(sphere(1.25, C.black, 8, 6), s * 3.3, 34, 8.4));
        g.add(at(sphere(0.4, C.white, 6, 4), s * 3.3 + 0.4, 34.5, 9.5));
        // arms
        const arm = scl(sphere(4, fur, 12, 8), 1, 2.1, 1);
        arm.position.set(s * 11.5, 15, 3);
        arm.rotation.set(0.7, 0, s * 0.5);
        g.add(arm);
        // legs + foot pads
        const leg = scl(sphere(5.2, fur, 12, 8), 1, 1, 1.9);
        leg.position.set(s * 6.5, 4.6, 8.5);
        g.add(leg);
        const pad = cyl(3.6, 3.6, 0.8, light, 12);
        pad.rotation.x = Math.PI / 2;
        pad.position.set(s * 6.5, 4.8, 18.2);
        g.add(pad);
    }
    g.add(at(scl(sphere(4.2, light, 12, 8), 1.15, 0.85, 1), 0, 30, 7.4));
    g.add(at(scl(sphere(1.4, C.black, 8, 6), 1.3, 0.9, 1), 0, 31.6, 11.4));
    // bow tie
    for (const s of [-1, 1]) {
        const c = cone(2.4, 4.6, bow, 8);
        c.rotation.z = s * Math.PI / 2;
        c.position.set(-s * 2.3, 23.6, 7.2);
        g.add(c);
    }
    g.add(at(sphere(1.4, bow, 8, 6), 0, 23.6, 7.8));
    return g;
}

// ------------------------------------------------------------------ books

/** A book lying flat: length (x) L, cover width (z) D, thickness t; the spine along the -z edge, pages showing on the other three sides. */
export function lyingBook(L, D, t, color, pages = C.cream) {
    const g = new THREE.Group();
    const c = Math.min(0.45, t * 0.18);
    g.add(at(box(L, c, D, color), 0, c / 2, 0));
    g.add(at(box(L, c, D, color), 0, t - c / 2, 0));
    g.add(at(box(L, t, c * 2.2, color), 0, t / 2, -D / 2 + c * 1.1));
    g.add(at(box(L - c * 2.4, t - c * 2, D - c * 3, pages), 0, t / 2, c * 0.9));
    return g;
}

/** A book standing upright on a shelf: height H, cover width (depth on the shelf) D, thickness t along +x from 0; the spine faces +z. */
export function standingBook(H, D, t, color, band = null) {
    const g = lyingBook(H, D, t, color);
    g.rotation.set(0, Math.PI, Math.PI / 2);
    g.position.set(0, H / 2, 0);
    const holder = new THREE.Group();
    holder.add(g);
    if (band) holder.add(at(box(t * 0.9, H * 0.07, 0.3, band), t / 2, H * 0.8, D / 2 + 0.1));
    return holder;
}

/** An open book lying on the floor like a tent / ramp. */
export function openBook(L = 26, D = 20, color = C.blue) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
        const half = new THREE.Group();
        half.add(at(box(L / 2, 0.5, D, color), s * L / 4, 0.25, 0));
        half.add(at(box(L / 2 - 0.6, 1.4, D - 1, C.paper), s * L / 4, 1.1, 0));
        half.rotation.z = -s * 0.18;
        g.add(half);
    }
    g.position.y = 0.2;
    return group(g);
}

// ------------------------------------------------------------------ the train (animated: built and merged into one mesh per material)

function wheelSet(g, length, color = C.black) {
    for (const x of [-length * 0.3, length * 0.3]) {
        for (const s of [-1, 1]) {
            const w = cyl(2.1, 2.1, 1, color, 12);
            w.rotation.x = Math.PI / 2;
            w.position.set(s * 3.6, 2.1, x);
            g.add(w);
            const hub = cyl(0.9, 0.9, 1.2, C.yellow, 8);
            hub.rotation.x = Math.PI / 2;
            hub.position.set(s * 3.75, 2.1, x);
            g.add(hub);
        }
    }
}

/** The locomotive of the wooden train (faces +z). */
export function locomotive() {
    const g = new THREE.Group();
    g.add(at(roundBox(7, 2, 17, 0.4, C.dark, 1), 0, 3.2, 0));
    wheelSet(g, 17);
    const boiler = cyl(3.2, 3.2, 9.5, C.blue, 14);
    boiler.rotation.x = Math.PI / 2;
    boiler.position.set(0, 7.4, 3.2);
    g.add(boiler);
    g.add(at(cyl(3.3, 3.3, 0.8, C.yellow, 14), 0, 7.4, 6.3).rotateX(Math.PI / 2));
    g.add(at(cyl(1.2, 1.6, 5, C.red, 10), 0, 12, 5.6));
    g.add(at(cyl(2, 2, 1, C.dark, 10), 0, 14.8, 5.6));
    g.add(at(roundBox(7.4, 8.5, 6.5, 0.6, C.red, 1), 0, 8.4, -4.6));
    g.add(at(roundBox(8.6, 1.2, 8, 0.4, C.yellow, 1), 0, 13.2, -4.6));
    for (const s of [-1, 1]) g.add(at(box(0.3, 3, 3.2, C.sky), s * 3.75, 9.6, -4.4));
    g.add(at(sphere(1.4, C.yellow, 10, 8), 0, 6.8, 8.6));
    return g;
}

/** A wagon of the wooden train with a load (logs, blocks or a passenger). */
export function wagon(kind = 'blocks', color = C.green) {
    const g = new THREE.Group();
    g.add(at(roundBox(7, 2, 14, 0.4, C.dark, 1), 0, 3.2, 0));
    wheelSet(g, 14);
    g.add(at(roundBox(7.4, 3.6, 13, 0.4, color, 1), 0, 5.8, 0));
    if (kind === 'logs') {
        for (let k = 0; k < 3; k++) {
            const log = cyl(1.4, 1.4, 12.5, C.woodDark, 8);
            log.rotation.x = Math.PI / 2;
            log.position.set((k - 1) * 2.5, 9, 0);
            g.add(log);
        }
        g.add(at(cyl(1.4, 1.4, 12.5, C.wood, 8), 0, 11.2, 0).rotateX(Math.PI / 2));
    } else {
        g.add(at(roundBox(4.2, 4.2, 4.2, 0.4, C.yellow, 1), -1, 9.6, -3.5, 0.3));
        g.add(at(roundBox(4.2, 4.2, 4.2, 0.4, C.red, 1), 1, 9.6, 3, -0.2));
        g.add(at(cyl(2, 2, 4.4, C.blue, 10), 0, 9.8, 0));
    }
    return g;
}

/** Merges a model into one mesh per material and marks it animated. */
export function animated(model) {
    const merged = mergeByMaterial(group(model));
    merged.userData.keep = true;
    return merged;
}

/** The wooden train track as an oval ring (rx × rz) with two grooves. */
export function trainTrack(rx, rz, width = 8) {
    const g = new THREE.Group();
    const ring = (ox, oz, ix, iz, n = 64) => {
        const s = new THREE.Shape();
        s.absellipse(0, 0, ox, oz, 0, Math.PI * 2, false, 0);
        const hole = new THREE.Path();
        hole.absellipse(0, 0, ix, iz, 0, Math.PI * 2, true, 0);
        s.holes.push(hole);
        return { s, n };
    };
    const base = ring(rx + width / 2, rz + width / 2, rx - width / 2, rz - width / 2);
    const geo = new THREE.ExtrudeGeometry(base.s, { depth: 1.4, bevelEnabled: false, curveSegments: 72 });
    const track = new THREE.Mesh(geo, toon(C.woodLight));
    track.rotation.x = -Math.PI / 2;
    track.castShadow = track.receiveShadow = true;
    g.add(track);
    for (const off of [-1.9, 1.9]) {
        const groove = ring(rx + off + 0.5, rz + off + 0.5, rx + off - 0.5, rz + off - 0.5);
        const gg = new THREE.ShapeGeometry(groove.s, 72);
        const m = new THREE.Mesh(gg, toon(C.woodDark));
        m.rotation.x = -Math.PI / 2;
        m.position.y = 1.42;
        m.receiveShadow = true;
        g.add(m);
    }
    return g;
}

// ------------------------------------------------------------------ lamps

/** The rocket lamp (~95 tall): white body, red fins and nose, glowing portholes. Returns { group, lightY }. */
export function rocketLamp() {
    const g = new THREE.Group();
    const body = lathe([[0.01, 14], [9, 14], [12.5, 24], [14, 40], [13.5, 56], [11, 70], [6.5, 82], [0.01, 88]], C.white, 18);
    g.add(body);
    g.add(at(cone(6.6, 12, C.red, 16), 0, 87, 0));
    g.add(at(sphere(1.6, C.yellow, 8, 6), 0, 93.5, 0));
    g.add(at(cyl(14.4, 14.4, 3, C.red, 18), 0, 46, 0));
    for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const fin = shape([[0, 0], [11, -6], [11, 4], [0, 22]], C.red, 2.4);
        const holder = new THREE.Group();
        fin.position.set(11, 8, -1.2);
        holder.add(fin);
        holder.rotation.y = a;
        g.add(holder);
    }
    // portholes: glowing, framed
    for (const [y, a] of [[56, 0.2], [36, 0.2], [56, 2.3], [36, 2.3], [56, 4.4], [36, 4.4]]) {
        const ring = torus(4.4, 1, C.blue, 8, 16);
        const r = 13.3 + (y > 50 ? -0.3 : 0.7);
        ring.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
        ring.rotation.y = a;
        g.add(ring);
        const glass = cyl(4.2, 4.2, 1, flat('#ffe88a'), 14);
        glass.rotation.set(Math.PI / 2, 0, 0);
        const gh = new THREE.Group();
        gh.add(glass);
        gh.position.set(Math.sin(a) * (r - 0.2), y, Math.cos(a) * (r - 0.2));
        gh.rotation.y = a;
        g.add(gh);
    }
    // the exhaust (a glowing flame cone) and the stand
    g.add(at(cyl(6, 9, 6, C.dark, 14), 0, 11, 0));
    const flame = cone(7, 12, flat('#ffb43a'), 12);
    flame.rotation.x = Math.PI;
    flame.position.y = 6;
    g.add(flame);
    g.add(at(cyl(16, 18, 2.4, C.navy, 18), 0, 1.2, 0));
    // a cable
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1, -17), new THREE.Vector3(4, 0.6, -30), new THREE.Vector3(-6, 0.6, -46), new THREE.Vector3(2, 0.6, -64)]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.7, 6, false), toon(C.dark));
    g.add(cable);
    return { group: g, lightY: 46 };
}

/** The desk lamp (sits on a desk top at y = 0): base, two arms, a cone head pointing down-forward. Returns { group, light: [x,y,z] }. */
export function deskLamp(color = C.red) {
    const g = new THREE.Group();
    g.add(at(cyl(8, 9, 2.2, color, 16), 0, 1.1, 0));
    const a1 = cyl(1, 1, 30, '#c9d1d9', 8);
    a1.position.set(0, 15, -4);
    a1.rotation.x = -0.28;
    g.add(a1);
    g.add(at(sphere(2, color, 10, 8), 0, 29.5, -8.2));
    const a2 = cyl(1, 1, 26, '#c9d1d9', 8);
    a2.position.set(0, 33, 3.5);
    a2.rotation.x = Math.PI / 2 - 0.3;
    g.add(a2);
    const head = new THREE.Group();
    const shade = lathe([[2.5, 0], [4.5, -2], [9, -9], [10, -11]], toon(color, { side: THREE.DoubleSide }), 16);
    head.add(shade);
    head.add(at(sphere(3.6, flat('#fff6c8'), 12, 8), 0, -8.5, 0));
    head.position.set(0, 37, 16);
    head.rotation.x = 0.5;
    g.add(head);
    return { group: g, light: [0, 22, 22] };
}

// ------------------------------------------------------------------ furniture

/** The bed (long axis along x, 200 × 88, mattress top at ~44): head at -x. */
export function bed(rng) {
    const g = new THREE.Group();
    const L = 200;
    const D = 88;
    for (const [x, z] of [[-L / 2 + 4, -D / 2 + 4], [-L / 2 + 4, D / 2 - 4], [L / 2 - 4, -D / 2 + 4], [L / 2 - 4, D / 2 - 4]]) g.add(at(roundBox(8, 22, 8, 1.2, C.wood, 1), x, 11, z));
    g.add(at(roundBox(L, 8, D, 1.5, C.wood, 1), 0, 22, 0));
    g.add(at(roundBox(L - 4, 14, D - 4, 4, C.white, 2), 0, 32, 0));
    // the duvet (blue with yellow stripes) hanging over the side
    g.add(at(roundBox(L * 0.66, 5, D + 6, 2.4, C.blue, 2), L * 0.15, 40.5, 0));
    g.add(at(roundBox(L * 0.66 + 0.4, 5.2, 4, 1.5, C.yellow, 1), L * 0.15, 40.5, 0));
    g.add(at(roundBox(L * 0.66 + 0.4, 5.2, 4, 1.5, C.yellow, 1), L * 0.15, 40.5, -22));
    g.add(at(roundBox(L * 0.66 + 0.4, 5.2, 4, 1.5, C.yellow, 1), L * 0.15, 40.5, 22));
    for (const s of [-1, 1]) {
        g.add(at(roundBox(L * 0.66, 18, 3, 1.4, C.blue, 2), L * 0.15, 31, s * (D / 2 + 1.5)));
    }
    g.add(at(roundBox(L * 0.66 + 0.4, 3, D + 6.4, 1.4, C.yellow, 1), L * 0.15 - L * 0.33 + 1.5, 40.5, 0));
    // pillow
    g.add(at(roundBox(36, 9, 62, 4, C.white, 2), -L / 2 + 26, 42, 0, 0.06));
    g.add(at(roundBox(32, 9.4, 4, 2, C.sky, 1), -L / 2 + 26, 42, 22, 0.06));
    // head- and footboard with round cut-out looks (rings)
    g.add(at(roundBox(6, 80, D + 4, 2, C.wood, 1), -L / 2 - 1, 40, 0));
    g.add(at(roundBox(7, 4, D + 8, 1.5, C.woodDark, 1), -L / 2 - 1, 81, 0));
    for (const z of [-24, 0, 24]) {
        const r = torus(7, 1.4, C.yellow, 8, 18);
        r.rotation.y = Math.PI / 2;
        r.position.set(-L / 2 + 2.2, 60, z);
        g.add(r);
    }
    g.add(at(roundBox(6, 52, D + 4, 2, C.wood, 1), L / 2 + 1, 26, 0));
    g.add(at(roundBox(7, 4, D + 8, 1.5, C.woodDark, 1), L / 2 + 1, 53, 0));
    // a small teddy and a book on the bed
    const small = teddy(C.pink, C.white, C.blue);
    small.scale.setScalar(0.42);
    small.position.set(-L / 2 + 44, 44, -14);
    small.rotation.y = Math.PI / 2 + 0.3;
    g.add(small);
    const b = openBook(22, 16, C.red);
    b.position.set(40, 43.5, -10);
    b.rotation.y = 0.4;
    g.add(b);
    void rng;
    return g;
}

/** The toy chest: painted box, lid propped open, toys peeking out. Front faces +z. */
export function toyChest(rng) {
    const g = new THREE.Group();
    const W = 70;
    const H = 40;
    const D = 42;
    g.add(at(roundBox(W, H, D, 2, C.teal, 1), 0, H / 2 + 2, 0));
    g.add(at(roundBox(W + 2, 5, D + 2, 1.5, C.yellow, 1), 0, 4, 0));
    g.add(at(roundBox(W + 1, 4, D + 1, 1.5, C.yellow, 1), 0, H - 2, 0));
    // painted stars on the front: chunky 5-point shapes
    const star = [];
    for (let k = 0; k < 10; k++) {
        const r = k % 2 ? 3 : 7;
        const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
        star.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    for (const [x, c] of [[-20, C.yellow], [0, C.red], [20, C.white]]) {
        const s = shape(star, c, 0.6);
        s.position.set(x, H / 2 + 2, D / 2 - 0.1);
        g.add(s);
    }
    // the lid: hinged at the back, opened
    const lid = new THREE.Group();
    lid.add(at(roundBox(W + 2, 4, D + 2, 1.5, C.teal, 1), 0, 2, D / 2 + 1));
    lid.add(at(roundBox(W + 3, 4.4, 4, 1.2, C.yellow, 1), 0, 2, D + 1));
    lid.position.set(0, H + 2, -D / 2 - 1);
    lid.rotation.x = -1.95;
    g.add(lid);
    // toys peeking out
    g.add(at(sphere(11, C.red, 14, 10), -18, H, -4));
    g.add(at(letterBlock(10, rng.int(0, 15)), 8, H - 1, 6, 0.5));
    const arm = cyl(1.4, 1.4, 22, C.woodLight, 8);
    arm.position.set(24, H + 4, 0);
    arm.rotation.z = -0.6;
    g.add(arm);
    g.add(at(sphere(3, C.yellow, 10, 8), 30.5, H + 13, 0));
    const t = teddy(C.furLight, C.white, C.green);
    t.scale.setScalar(0.5);
    t.position.set(-2, H - 8, -8);
    t.rotation.x = -0.2;
    g.add(t);
    return g;
}

/** A bookcase against a wall (front faces +z): W wide, 4 shelves, books and toys. */
export function bookcase(rng, W = 150) {
    const g = new THREE.Group();
    const H = 210;
    const D = 32;
    const shelves = [4, 56, 108, 160];
    g.add(at(box(4, H, D, C.white), -W / 2, H / 2, 0));
    g.add(at(box(4, H, D, C.white), W / 2, H / 2, 0));
    g.add(at(box(W + 4, 4, D + 1, C.white), 0, H, 0));
    g.add(at(box(W, H, 1.5, C.sky), 0, H / 2, -D / 2 + 0.75));
    for (const y of shelves) g.add(at(box(W, 3, D, C.white), 0, y, 0));
    g.add(at(box(W + 4, 4, 2, C.yellow), 0, 2, D / 2));
    const bookColors = [C.red, C.blue, C.green, C.yellow, C.orange, C.purple, C.teal, C.navy, C.pink];
    shelves.forEach((y, row) => {
        let x = -W / 2 + 3;
        const end = W / 2 - 3;
        while (x < end - 4) {
            const r = rng();
            if (r < 0.12 && row > 0) {
                // a toy on this shelf
                const toy = rng() < 0.5 ? at(sphere(8, rng.pick(bookColors), 12, 10), x + 9, y + 9.5, 2) : at(letterBlock(12, rng.int(0, 15)), x + 8, y + 7.5, 2, 0.4);
                g.add(toy);
                x += 18;
                continue;
            }
            const n = rng.int(3, 8);
            for (let k = 0; k < n && x < end - 4; k++) {
                const t = rng.range(3, 6);
                const h = rng.range(26, 44);
                const book = standingBook(h, rng.range(18, 25), t, rng.pick(bookColors), rng() < 0.4 ? C.white : null);
                book.position.set(x, y + 1.5, 2);
                g.add(book);
                x += t + 0.3;
            }
            if (rng() < 0.4 && x < end - 30) {
                // a leaning book
                const book = standingBook(36, 22, 5, rng.pick(bookColors));
                book.position.set(x + 1, y + 1.5, 2);
                book.rotation.z = -0.42;
                g.add(book);
                x += 20;
            }
            x += rng.range(2, 10);
        }
    });
    return g;
}

/** A desk (front faces +z, top at 72) with a drawer unit. Returns { group, top }. */
export function desk(W = 140, D = 60) {
    const g = new THREE.Group();
    const H = 72;
    g.add(at(roundBox(W, 4, D, 1, C.woodLight, 1), 0, H - 2, 0));
    for (const [x, z] of [[-W / 2 + 4, -D / 2 + 4], [-W / 2 + 4, D / 2 - 4]]) g.add(at(box(5, H - 4, 5, C.white), x, (H - 4) / 2, z));
    g.add(at(box(38, H - 4, D - 4, C.white), W / 2 - 21, (H - 4) / 2, 0));
    for (const [y, c] of [[52, C.red], [32, C.yellow], [12, C.blue]]) {
        g.add(at(roundBox(34, 17, 2, 1, c, 1), W / 2 - 21, y, D / 2 - 1));
        g.add(at(cyl(1.4, 1.4, 2.6, C.white, 8).rotateX(Math.PI / 2), W / 2 - 21, y + 3, D / 2 + 0.8));
    }
    return { group: g, top: H };
}

/** A waste-paper basket with crumpled paper balls. */
export function basket() {
    const g = new THREE.Group();
    g.add(lathe([[0.01, 0], [11, 0], [14, 28], [13, 28], [10, 1.5], [0.01, 1.5]], toon(C.green, { side: THREE.DoubleSide }), 16));
    g.add(at(sphere(4.4, C.paper, 8, 6), -2, 25, 2));
    g.add(at(sphere(4, C.paper, 8, 6), 4, 24, -3));
    g.add(at(sphere(4, C.paper, 8, 6), 22, 4, 6));
    g.add(at(sphere(3.6, C.paper, 8, 6), 18, 3.6, -10));
    return g;
}

/** A globe on a stand (on the desk). */
export function globe() {
    const g = new THREE.Group();
    g.add(at(cyl(5, 6, 1.5, C.woodDark, 12), 0, 0.75, 0));
    g.add(at(cyl(0.8, 0.8, 6, C.woodDark, 6), 0, 4, 0));
    g.add(at(sphere(9, C.sky, 16, 12), 0, 15, 0));
    g.add(at(scl(sphere(5, C.green, 10, 8), 1, 1.2, 0.6), 3, 17, 5.5));
    g.add(at(scl(sphere(4, C.green, 10, 8), 1.2, 0.8, 0.6), -5, 12, 5.2));
    const ring = torus(10.2, 0.6, C.yellow, 6, 24, Math.PI);
    ring.position.y = 15;
    ring.rotation.set(0, Math.PI / 2, 0.4);
    g.add(ring);
    return g;
}

/** A pencil cup with pencils. */
export function pencilCup() {
    const g = new THREE.Group();
    g.add(at(cyl(4, 3.6, 10, C.orange, 12), 0, 5, 0));
    const colors = [C.red, C.blue, C.green, C.yellow];
    colors.forEach((c, k) => {
        const p = group(at(cyl(0.6, 0.6, 16, c, 6), 0, 0, 0), at(cone(0.6, 1.6, C.woodLight, 6), 0, 8.8, 0));
        p.position.set(Math.cos(k * 1.6) * 1.8, 11, Math.sin(k * 1.6) * 1.8);
        p.rotation.set(Math.sin(k * 2.1) * 0.2, 0, Math.cos(k * 2.1) * 0.2);
        g.add(p);
    });
    return g;
}

export { PALETTE };
