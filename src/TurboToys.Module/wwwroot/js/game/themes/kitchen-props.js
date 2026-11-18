// TurboToys · themes/kitchen-props.js – furniture, food and clutter of the giant kitchen (kitchen.js places them).
// Factories return groups standing on y = 0 (front facing +z unless noted).

import * as THREE from 'three';
import { toon, flat, box, roundBox, cyl, sphere, cone, torus, shape, lathe, at, group, canvasTexture, mergeByMaterial } from '../render/toon.js';

export const K = {
    cabinet: '#f4ead2',
    cabinetDark: '#d9cba8',
    counter: '#5a6b7a',
    wood: '#c68a4e',
    woodDark: '#8a5a32',
    woodLight: '#e0b27a',
    steel: '#c9d1d9',
    steelDark: '#8a949e',
    black: '#1f1d1c',
    dark: '#34373d',
    white: '#f7f3ea',
    red: '#e2392f',
    orange: '#f28c28',
    yellow: '#f6c638',
    green: '#3f9b4b',
    lime: '#9bd23c',
    teal: '#2aa198',
    blue: '#2f6fd0',
    sky: '#5cb7e6',
    pink: '#e86aa6',
    purple: '#7a4bc4',
    cream: '#fbf1d8',
    cereal: '#e8b04a',
    glass: '#bfe3ee',
    brown: '#7a4a26',
    fur: '#f0a050',
    furLight: '#fbe3c0',
};

const scl = (o, x, y = x, z = x) => {
    o.scale.set(x, y, z);
    return o;
};

// ------------------------------------------------------------------ furniture

/** A run of lower kitchen cabinets with a counter top: length L along x, depth 60, counter at 92. Front faces +z. Doors alternate. */
export function counterRun(L, { skip = [] } = {}) {
    const g = new THREE.Group();
    const D = 60;
    const H = 88;
    g.add(at(box(L, 8, D - 6, K.dark), 0, 4, -3));
    const doors = Math.max(1, Math.round(L / 50));
    const dw = L / doors;
    for (let k = 0; k < doors; k++) {
        const x = -L / 2 + (k + 0.5) * dw;
        if (skip.some(([a, b]) => x > a && x < b)) continue;
        g.add(at(box(dw, H - 8, D - 2, K.cabinet), x, 8 + (H - 8) / 2, -1));
        g.add(at(roundBox(dw - 3, H - 14, 2, 0.8, k % 2 ? K.cabinet : K.cabinetDark, 1), x, 8 + (H - 8) / 2, D / 2 - 1));
        g.add(at(roundBox(12, 2, 2.6, 0.8, K.steel, 1), x + (k % 2 ? -dw / 2 + 12 : dw / 2 - 12), H - 14, D / 2 + 1));
    }
    g.add(at(box(L + 2, 4, D + 3, K.counter), 0, H + 2, 0.5));
    return g;
}

/** A run of wall cabinets (hanging, bottom at y0): length L, depth 36. */
export function wallCabinets(L, y0 = 150, H = 70) {
    const g = new THREE.Group();
    const D = 36;
    const doors = Math.max(1, Math.round(L / 50));
    const dw = L / doors;
    g.add(at(box(L, H, D - 2, K.cabinet), 0, y0 + H / 2, -1));
    for (let k = 0; k < doors; k++) {
        const x = -L / 2 + (k + 0.5) * dw;
        g.add(at(roundBox(dw - 3, H - 6, 2, 0.8, k % 2 ? K.cabinet : K.cabinetDark, 1), x, y0 + H / 2, D / 2 - 1));
        g.add(at(roundBox(2, 12, 2.6, 0.8, K.steel, 1), x + (k % 2 ? -dw / 2 + 6 : dw / 2 - 6), y0 + 10, D / 2 + 1));
    }
    return g;
}

/** The oven (front faces +z): 60 wide, glass door with a glowing inside, knobs, the hob on top with a pot. */
export function oven() {
    const g = new THREE.Group();
    g.add(at(box(60, 84, 58, K.steel), 0, 46, -1));
    g.add(at(box(52, 46, 1.5, K.black), 0, 38, 28.6));
    g.add(at(box(40, 28, 1, flat('#ff9a3c')), 0, 40, 29.2));
    for (const y of [36, 44]) g.add(at(box(36, 0.8, 1, K.dark), 0, y, 29.8));
    g.add(at(cyl(1.4, 1.4, 44, K.steel, 8), 0, 66, 31).rotateZ(Math.PI / 2));
    g.add(at(box(60, 14, 2, K.dark), 0, 80, 28.5));
    for (let k = 0; k < 4; k++) g.add(at(cyl(2.4, 2.4, 2.4, K.white, 10), -20 + k * 13.3, 80, 30.5).rotateX(Math.PI / 2));
    g.add(at(box(60, 3, 60, K.black), 0, 89.5, 0));
    for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) g.add(at(torus(8, 0.8, K.dark, 6, 18), x, 91.2, z).rotateX(Math.PI / 2));
    return g;
}

/** A cooking pot with a lid and handles (height ~22). */
export function pot(color = K.red, r = 13, lidOff = false) {
    const g = new THREE.Group();
    g.add(lathe([[0.01, 0], [r, 0], [r, r * 1.2], [r - 0.8, r * 1.2], [r - 0.8, 1], [0.01, 1]], toon(color, { side: THREE.DoubleSide }), 18));
    g.add(at(cyl(r + 0.4, r + 0.4, 1.4, K.white, 18), 0, r * 1.2 - 0.6, 0));
    for (const s of [-1, 1]) g.add(at(roundBox(5, 2, 4, 0.8, K.black, 1), s * (r + 2), r * 0.95, 0));
    const lid = group(lathe([[0.01, 2.6], [r * 0.6, 2.2], [r + 0.8, 0], [r + 0.8, -0.4], [0.01, 1.8]], K.steel, 18), at(sphere(1.8, K.black, 10, 8), 0, 3.6, 0));
    if (lidOff) {
        lid.position.set(r * 2.2, r * 0.9, 4);
        lid.rotation.set(0, 0, 1.45);
    } else lid.position.y = r * 1.2;
    g.add(lid);
    return g;
}

/** A frying pan with a long handle. */
export function pan(r = 14) {
    const g = new THREE.Group();
    g.add(lathe([[0.01, 0], [r - 2, 0], [r, 4], [r - 0.8, 4], [r - 2.6, 1], [0.01, 1]], toon(K.dark, { side: THREE.DoubleSide }), 20));
    g.add(at(roundBox(26, 2, 3.4, 1, K.black, 1), r + 12, 3.2, 0).rotateZ(0.08));
    // a fried egg in it
    g.add(at(scl(sphere(6, K.white, 12, 6), 1.1, 0.12, 0.9), -1, 1.4, 0));
    g.add(at(scl(sphere(2.4, K.yellow, 10, 8), 1, 0.6, 1), 0, 1.8, 0));
    return g;
}

/** The fridge (front faces +z): 74 × 200, two doors, magnets and a drawing. */
export function fridge(drawing) {
    const g = new THREE.Group();
    g.add(at(roundBox(74, 200, 66, 4, K.white, 2), 0, 100, 0));
    g.add(at(box(70, 1.2, 1, K.steelDark), 0, 128, 33.2));
    g.add(at(roundBox(3, 40, 4, 1.2, K.steel, 1), -30, 150, 34.5));
    g.add(at(roundBox(3, 60, 4, 1.2, K.steel, 1), -30, 90, 34.5));
    if (drawing) {
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(26, 32), drawing);
        paper.position.set(8, 160, 33.4);
        paper.rotation.z = 0.06;
        g.add(paper);
    }
    const magnets = [[8, 177, K.red], [-12, 104, K.yellow], [16, 94, K.blue], [2, 70, K.green], [20, 140, K.pink]];
    for (const [x, y, c] of magnets) g.add(at(cyl(2.6, 2.6, 1.6, c, 10).rotateX(Math.PI / 2), x, y, 33.8));
    return g;
}

/** A kitchen chair (seat at 45, legs 3.5 thick, front faces +z). */
export function chair(color = K.wood) {
    const g = new THREE.Group();
    const s = 42;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(at(box(3.6, 45, 3.6, color), x * (s / 2 - 2.5), 22.5, z * (s / 2 - 2.5)));
    g.add(at(roundBox(s, 4, s, 1.2, color, 1), 0, 46, 0));
    g.add(at(roundBox(s - 6, 2, s - 6, 1, K.red, 1), 0, 48.8, 1));
    for (const x of [-1, 1]) g.add(at(box(3.6, 48, 3.6, color), x * (s / 2 - 2.5), 72, -s / 2 + 2.5));
    for (const y of [78, 92]) g.add(at(box(s - 4, 6, 2.4, color), 0, y, -s / 2 + 2.5));
    for (const y of [12]) {
        g.add(at(box(s - 6, 2, 2, color), 0, y, -s / 2 + 2.5));
        g.add(at(box(s - 6, 2, 2, color), 0, y, s / 2 - 2.5));
    }
    return g;
}

/** The kitchen table: top W × D at 76 (legs as pillars), a runner, plates, a vase with flowers and a jug. */
export function table(W = 150, D = 96) {
    const g = new THREE.Group();
    const H = 76;
    g.add(at(roundBox(W, 4.5, D, 1.5, K.woodLight, 1), 0, H - 2.25, 0));
    g.add(at(box(W - 16, 8, D - 16, K.wood), 0, H - 8, 0));
    const legs = [];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const lx = x * (W / 2 - 6);
        const lz = z * (D / 2 - 6);
        g.add(at(box(6.5, H - 4, 6.5, K.wood), lx, (H - 4) / 2, lz));
        g.add(at(box(7.5, 3, 7.5, K.woodDark), lx, 1.5, lz));
        legs.push([lx, lz]);
    }
    g.add(at(box(W * 0.6, 0.4, D * 0.35, K.sky), 0, H + 0.2, 0));
    for (const [x, z] of [[-W * 0.32, -D * 0.22], [W * 0.32, D * 0.22], [-W * 0.3, D * 0.25]]) {
        g.add(at(cyl(10, 7, 1.4, K.white, 16), x, H + 0.7, z));
        g.add(at(cyl(5, 5, 0.4, K.yellow, 12), x, H + 1.6, z));
    }
    g.add(lathe([[0.01, 0], [5, 0], [7, 8], [4, 18], [4.6, 22], [0.01, 22]], K.blue, 14).translateX(10).translateY(H).translateZ(-6));
    for (let k = 0; k < 5; k++) {
        const a = k * 1.25;
        g.add(at(cyl(0.4, 0.4, 14, K.green, 4), 10 + Math.cos(a) * 1.5, H + 26, -6 + Math.sin(a) * 1.5).rotateZ(Math.cos(a) * 0.3));
        g.add(at(sphere(2.6, [K.red, K.yellow, K.pink, K.orange, K.white][k], 8, 6), 10 + Math.cos(a) * 5, H + 33, -6 + Math.sin(a) * 5));
    }
    g.add(at(group(lathe([[0.01, 0], [6, 0], [6.5, 14], [5, 18], [5.6, 20]], toon(K.white, { side: THREE.DoubleSide }), 14), at(torus(4, 0.9, K.white, 6, 12, Math.PI), 7, 10, 0).rotateZ(-Math.PI / 2)), -30, H, 10));
    return { group: g, legs, height: H };
}

/** A tall pantry cupboard (front +z). */
export function pantry(W = 80, H = 210) {
    const g = new THREE.Group();
    g.add(at(box(W, H, 58, K.cabinet), 0, H / 2, 0));
    for (const s of [-1, 1]) {
        g.add(at(roundBox(W / 2 - 3, H - 10, 2, 1, K.cabinetDark, 1), s * W / 4, H / 2, 29.4));
        g.add(at(roundBox(2.4, 16, 2.8, 1, K.steel, 1), s * 4, H / 2, 31));
    }
    return g;
}

// ------------------------------------------------------------------ food and clutter

/** The cereal box (tipped over or standing) with its printed front (one material for all boxes). */
let cerealMaterial = null;
function cerealFront() {
    if (cerealMaterial) return cerealMaterial;
    const tex = canvasTexture(256, 384, (ctx, w, h) => {
        ctx.fillStyle = '#f6c638';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#e2392f';
        ctx.fillRect(0, 0, w, 110);
        ctx.font = '62px Bangers, Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#14100c';
        ctx.strokeText('KNUSPER', w / 2, 62);
        ctx.fillText('KNUSPER', w / 2, 62);
        ctx.font = '40px Bangers, Impact, sans-serif';
        ctx.strokeText('RINGE', w / 2, 102);
        ctx.fillText('RINGE', w / 2, 102);
        // a bowl of rings
        ctx.fillStyle = '#2f6fd0';
        ctx.beginPath();
        ctx.ellipse(w / 2, 280, 100, 60, 0, 0, Math.PI);
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.stroke();
        for (let k = 0; k < 9; k++) {
            ctx.beginPath();
            ctx.arc(w / 2 - 70 + (k % 5) * 35, 270 - Math.floor(k / 5) * 26, 14, 0, Math.PI * 2);
            ctx.strokeStyle = '#e8862a';
            ctx.lineWidth = 9;
            ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(210, 160, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e2392f';
        ctx.font = '28px Bangers, Impact, sans-serif';
        ctx.fillText('NEU!', 210, 170);
    });
    cerealMaterial = toon(0xffffff, { map: tex });
    return cerealMaterial;
}

/** A cereal box 26 × 38 × 9 (front +z), its origin at the bottom centre. */
export function cerealBox() {
    const side = toon(K.yellow);
    const top = toon(K.red);
    const front = cerealFront();
    const m = new THREE.Mesh(new THREE.BoxGeometry(26, 38, 9), [side, side, top, top, front, front]);
    m.castShadow = m.receiveShadow = true;
    m.position.y = 19;
    return group(m);
}

/** A glass jar with a coloured content and a lid (height h). */
export function jar(content = K.orange, lid = K.red, h = 18, r = 7) {
    const g = new THREE.Group();
    g.add(at(cyl(r, r, h * 0.7, content, 14), 0, h * 0.35, 0));
    g.add(at(cyl(r * 1.02, r * 1.02, h * 0.3, K.glass, 14), 0, h * 0.85, 0));
    g.add(at(cyl(r * 1.08, r * 1.08, 3, lid, 14), 0, h + 1.5, 0));
    g.add(at(cyl(r * 1.03, r * 1.03, h * 0.28, K.white, 14), 0, h * 0.45, 0));
    return g;
}

/** A food can (lying or standing). */
export function can(color = K.red, r = 5, h = 11) {
    const g = new THREE.Group();
    g.add(at(cyl(r, r, h, K.steel, 14), 0, h / 2, 0));
    g.add(at(cyl(r * 1.01, r * 1.01, h * 0.64, color, 14), 0, h / 2, 0));
    return g;
}

/** An apple (red or green) with a stalk and a leaf. */
export function apple(r = 6, color = K.red) {
    const g = new THREE.Group();
    g.add(at(scl(sphere(r, toon(color, { steps: 4 }), 12, 10), 1.05, 0.95, 1.05), 0, r * 0.95, 0));
    g.add(at(cyl(0.35, 0.35, r * 0.5, K.brown, 5), 0, r * 1.95, 0));
    g.add(at(scl(sphere(r * 0.25, K.green, 6, 4), 1, 0.3, 0.55), r * 0.25, r * 1.95, 0));
    return g;
}

/** An orange (with a little navel and a leaf). */
export function orange(r = 6.5) {
    const g = new THREE.Group();
    g.add(at(sphere(r, toon(K.orange, { steps: 4 }), 12, 10), 0, r, 0));
    g.add(at(scl(sphere(r * 0.28, K.green, 6, 4), 1, 0.3, 0.6), r * 0.2, r * 2 - 0.2, 0));
    return g;
}

/** A banana (curved: a bent tube). */
export function banana() {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-9, 2.5, 0), new THREE.Vector3(0, 0.5, 6), new THREE.Vector3(9, 2.5, 0));
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 2.2, 7, false), toon(K.yellow));
    m.castShadow = m.receiveShadow = true;
    return group(m, at(sphere(1.2, K.brown, 6, 4), -9, 2.5, 0), at(sphere(1.2, K.brown, 6, 4), 9, 2.5, 0));
}

/** The fruit bowl lying on its side (fallen). */
export function fallenBowl() {
    const g = new THREE.Group();
    const bowl = lathe([[0.01, 0], [7, 0], [16, 8], [18, 14], [17, 14], [15, 9], [6.5, 1.2], [0.01, 1.2]], toon(K.teal, { side: THREE.DoubleSide }), 20);
    bowl.rotation.z = 1.3;
    bowl.position.set(-6, 16, 0);
    g.add(bowl);
    return g;
}

/** A cat bowl on a little mat, with food (or water) and a fish painted as a raised shape. */
export function catBowl(water = false, color = K.pink) {
    const g = new THREE.Group();
    g.add(lathe([[0.01, 0], [11, 0], [12.5, 6], [11.5, 6], [9, 1.2], [0.01, 1.2]], toon(color, { side: THREE.DoubleSide }), 18));
    if (water) g.add(at(cyl(10.6, 10.6, 0.3, flat('#a8dcf0'), 16), 0, 4.6, 0));
    else for (let k = 0; k < 9; k++) g.add(at(sphere(1.6, K.woodDark, 6, 4), Math.cos(k * 2.1) * (k % 3) * 2.6, 4.6, Math.sin(k * 2.1) * (k % 3) * 2.6));
    const fish = shape([[0, 0], [3, 1.6], [5.4, 0], [3, -1.6], [0, 0], [-1.6, 1.4], [-1.6, -1.4]], K.white, 0.4);
    fish.position.set(-2, 3.4, 11.6);
    fish.rotation.x = -0.35;
    g.add(fish);
    return g;
}

/** A sleeping cat curled up on a cushion (~ 26 high, 60 long). Returns { group, tail } (animate the tail). */
export function sleepingCat() {
    const g = new THREE.Group();
    g.add(at(roundBox(70, 7, 56, 3.5, K.purple, 2), 0, 3.5, 0));
    g.add(at(scl(sphere(16, K.fur, 16, 12), 1.5, 0.85, 1.1), 0, 19, 0));
    for (let k = 0; k < 3; k++) g.add(at(scl(sphere(4, K.orange, 8, 6), 2.6, 0.5, 0.3), -6 + k * 9, 31, 4).rotateY(0.2));
    const head = new THREE.Group();
    head.add(sphere(10, K.fur, 14, 10));
    head.add(at(scl(sphere(5, K.furLight, 10, 8), 1.2, 0.7, 0.6), 0, -3, 7.5));
    for (const s of [-1, 1]) {
        const ear = cone(4, 7, K.fur, 4);
        ear.position.set(s * 5.5, 8.5, 0);
        ear.rotation.z = -s * 0.35;
        head.add(ear);
        head.add(at(box(3.6, 0.6, 0.6, K.black), s * 4, 1.2, 9.4).rotateZ(s * 0.12));
        for (const dy of [-0.8, 0.8]) head.add(at(box(7, 0.25, 0.25, K.black), s * 9, -2.4 + dy, 6.5).rotateZ(s * dy * 0.25));
    }
    head.add(at(scl(sphere(1.2, K.pink, 8, 6), 1.3, 0.8, 1), 0, -1.5, 10.6));
    head.position.set(22, 18, 10);
    head.rotation.set(0.15, 0.7, 0.3);
    g.add(head);
    for (const s of [-1, 1]) g.add(at(scl(sphere(4.5, K.furLight, 10, 8), 1.4, 0.8, 1), 16 + s * 6, 8, 18));
    const tail = new THREE.Group();
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-10, 0, 14), new THREE.Vector3(2, 0, 26));
    const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 3, 8, false), toon(K.fur));
    t.castShadow = true;
    tail.add(t);
    tail.add(at(sphere(3, K.furLight, 8, 6), 2, 0, 26));
    tail.position.set(-22, 9, 6);
    return { group: g, tail };
}

/** A bucket (with water) and a mop leaning in it. */
export function mopBucket() {
    const g = new THREE.Group();
    g.add(lathe([[0.01, 0], [14, 0], [17, 30], [16, 30], [13, 1.4], [0.01, 1.4]], toon(K.blue, { side: THREE.DoubleSide }), 18));
    g.add(at(cyl(15.6, 15.6, 0.3, flat('#9fd6ec'), 18), 0, 24, 0));
    const handle = torus(16.5, 0.6, K.steel, 5, 18, Math.PI);
    handle.position.y = 30;
    handle.rotation.y = 0.3;
    handle.rotation.x = -0.4;
    g.add(handle);
    const mop = new THREE.Group();
    mop.add(at(cyl(1.4, 1.4, 120, K.yellow, 8), 0, 64, 0));
    mop.add(at(cyl(4, 4, 4, K.red, 10), 0, 4, 0));
    for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const strand = cyl(1.4, 1, 14, K.white, 5);
        strand.position.set(Math.cos(a) * 3, -2, Math.sin(a) * 3);
        strand.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
        mop.add(strand);
    }
    mop.position.set(2, 14, 0);
    mop.rotation.z = -0.32;
    g.add(mop);
    return g;
}

/** A roll of paper towels, partly unrolled across the floor (length of the strip: strip). */
export function paperRoll(strip = 70) {
    const g = new THREE.Group();
    const roll = group(cyl(7, 7, 26, K.white, 16), cyl(2.6, 2.6, 26.2, K.cabinetDark, 10));
    roll.rotation.x = Math.PI / 2;
    roll.position.set(0, 7, 0);
    g.add(roll);
    const sheet = box(strip, 0.3, 25, K.white);
    sheet.position.set(-strip / 2 - 3, 0.15, 0);
    g.add(sheet);
    for (let k = 1; k < strip / 14; k++) g.add(at(box(0.5, 0.35, 25.2, '#e2ddd0'), -3 - k * 14, 0.2, 0));
    return g;
}

/** A wooden spoon. */
export function spoon() {
    const g = new THREE.Group();
    g.add(at(roundBox(30, 1.6, 2.4, 0.7, K.woodLight, 1), 0, 0.8, 0));
    g.add(at(scl(sphere(4, K.woodLight, 10, 6), 1.4, 0.3, 1), 18, 1, 0));
    return g;
}

/** A milk carton (gable top). */
export function milk() {
    const g = new THREE.Group();
    g.add(at(box(10, 22, 10, K.white), 0, 11, 0));
    g.add(at(box(10.2, 8, 10.2, K.sky), 0, 8, 0));
    const roof = cyl(7.1, 7.1, 10, K.white, 4);
    roof.rotation.set(Math.PI / 2, 0, Math.PI / 4);
    roof.scale.set(1, 1, 0.5);
    roof.position.set(0, 24, 0);
    g.add(roof);
    return g;
}

/** An egg (and a broken one with its yolk, when broken). */
export function egg(broken = false) {
    if (!broken) return group(at(scl(sphere(3, K.cream, 10, 8), 1, 1.3, 1), 0, 3.9, 0));
    const g = new THREE.Group();
    g.add(at(scl(sphere(7, K.white, 12, 6), 1.2, 0.08, 1), 0, 0.3, 0));
    g.add(at(scl(sphere(2.6, K.yellow, 10, 8), 1, 0.55, 1), 0.6, 1, 0.4));
    const shell = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(K.cream, { side: THREE.DoubleSide }));
    shell.position.set(9, 2, 3);
    shell.rotation.x = 2.2;
    g.add(shell);
    return g;
}

/** A colander turned upside down (a dome with holes and two handles). */
export function colander(r = 14, color = K.lime) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(color, { side: THREE.DoubleSide }));
    dome.castShadow = dome.receiveShadow = true;
    dome.scale.y = 0.75;
    g.add(dome);
    g.add(at(cyl(r * 1.08, r * 1.08, 1.2, color, 16), 0, 0.6, 0));
    for (let ring = 0; ring < 2; ring++) {
        const n = ring ? 6 : 10;
        const phi = ring ? 0.55 : 1.0;
        for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2 + ring * 0.3;
            const hole = cyl(1.1, 1.1, 0.4, K.dark, 6);
            hole.position.set(Math.cos(a) * Math.sin(phi) * r, Math.cos(phi) * r * 0.75 + 0.1, Math.sin(a) * Math.sin(phi) * r);
            hole.lookAt(hole.position.x * 2, hole.position.y * 2 + 2, hole.position.z * 2);
            hole.rotateX(Math.PI / 2);
            g.add(hole);
        }
    }
    for (const s of [-1, 1]) g.add(at(roundBox(6, 1.2, 4, 0.5, color, 1), s * (r + 3), 1, 0));
    return g;
}

/** A kitchen sponge (yellow with a green scrub side). */
export function sponge() {
    return group(at(roundBox(14, 4, 9, 1.4, K.yellow, 1), 0, 2, 0), at(roundBox(14, 1.6, 9, 0.6, K.green, 1), 0, 4.6, 0));
}

/** A rolling pin. */
export function rollingPin() {
    const g = new THREE.Group();
    const body = cyl(3.6, 3.6, 30, K.woodLight, 12);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    for (const s of [-1, 1]) {
        const h = cyl(1.4, 1.6, 9, K.wood, 8);
        h.rotation.z = Math.PI / 2;
        h.position.x = s * 19.5;
        g.add(h);
    }
    g.position.y = 3.6;
    return group(g);
}

/** A measuring jug (with a handle and lines). */
export function measuringJug() {
    const g = new THREE.Group();
    g.add(lathe([[0.01, 0], [8, 0], [9, 20], [8.4, 20], [7.4, 1.2], [0.01, 1.2]], toon(K.glass, { side: THREE.DoubleSide }), 16));
    for (let k = 1; k < 4; k++) g.add(at(box(4, 0.5, 0.5, K.red), 0, k * 5, 8.4));
    const handle = torus(5, 1.2, K.glass, 6, 12, Math.PI);
    handle.rotation.z = -Math.PI / 2;
    handle.position.set(-9, 11, 0);
    g.add(handle);
    return g;
}

/** An oven mitt lying flat. */
export function ovenMitt(color = K.red) {
    const g = new THREE.Group();
    g.add(at(roundBox(14, 3, 22, 3, color, 2), 0, 1.5, 0));
    g.add(at(roundBox(6, 3, 10, 2.6, color, 2), 8, 1.5, 4).rotateY(-0.5));
    g.add(at(roundBox(15, 3.2, 4, 1.2, K.white, 1), 0, 1.6, -10));
    return g;
}

// ------------------------------------------------------------------ the sink (the water shortcut)

/**
 * A swan-neck mixer tap: the column stands at the origin, the neck arcs over +x and the spout ends `reach` away, `height` above the base.
 * Returns { group, spout: [x, y] } (the spout's mouth in the group's frame).
 */
export function tap(reach = 11, height = 22) {
    const g = new THREE.Group();
    const R = reach / 2;
    g.add(at(cyl(3.2, 3.6, 2, K.steelDark, 16), 0, 1, 0));
    g.add(at(cyl(1.7, 1.9, height, K.steel, 12), 0, height / 2 + 1, 0));
    const neck = torus(R, 1.6, K.steel, 8, 18, Math.PI);
    neck.position.set(R, height + 1, 0);
    g.add(neck);
    g.add(at(cyl(1.9, 1.5, 3, K.steel, 12), reach, height - 0.5, 0));
    // the lever and the hot / cold dots
    g.add(at(roundBox(1.6, 1.6, 9, 0.6, K.steel, 1), -1, height * 0.62, 0).rotateX(0.5));
    g.add(at(sphere(0.9, K.red, 8, 6), 0, height * 0.45, 1.9));
    g.add(at(sphere(0.9, K.blue, 8, 6), 0, height * 0.45, -1.9));
    return { group: g, spout: [reach, height - 2] };
}

/** A plate (r, white with a coloured rim), lying flat with its origin at the bottom. */
export function plate(r = 6, rim = K.blue) {
    return group(at(cyl(r, r * 0.72, r * 0.16, K.white, 18), 0, r * 0.08, 0), at(torus(r * 0.86, r * 0.07, rim, 4, 22), 0, r * 0.17, 0).rotateX(Math.PI / 2));
}

/** A wire dish rack with plates standing in it (length L along x). */
export function dishRack(L = 16, rng = Math.random) {
    const g = new THREE.Group();
    const wire = K.steelDark;
    for (const s of [-1, 1]) {
        g.add(at(box(L, 0.5, 0.5, wire), 0, 0.3, s * 4));
        g.add(at(box(L, 0.5, 0.5, wire), 0, 4.5, s * 4));
        for (let x = -L / 2; x <= L / 2 + 0.01; x += L / 4) g.add(at(box(0.4, 4.4, 0.4, wire), x, 2.4, s * 4));
    }
    for (let x = -L / 2; x <= L / 2 + 0.01; x += L / 4) g.add(at(box(0.4, 0.4, 8, wire), x, 0.3, 0));
    const rims = [K.blue, K.red, K.yellow, K.green, K.blue];
    for (let k = 0; k < 4; k++) {
        const p = plate(5, rims[k]);
        p.rotation.x = Math.PI / 2 + (rng() - 0.5) * 0.15;
        p.position.set(-L / 2 + 2.5 + k * (L - 5) / 3, 5.4, 0.4);
        g.add(p);
    }
    return g;
}

/** A bottle of washing-up liquid (green, with a red cap). */
export function soapBottle(color = K.lime) {
    const g = new THREE.Group();
    g.add(at(roundBox(6, 14, 3.6, 1.6, color, 2), 0, 7, 0));
    g.add(at(cyl(1, 1.4, 2.6, K.red, 8), 0, 15.2, 0));
    g.add(at(box(4, 5, 0.3, K.white), 0, 7, 1.85));
    return g;
}

/** A pendant lamp hanging from the ceiling (at y = top) over a point; returns { group, lightY }. */
export function pendantLamp(top = 260, low = 150) {
    const g = new THREE.Group();
    g.add(at(cyl(0.5, 0.5, top - low, K.black, 4), 0, (top + low) / 2, 0));
    g.add(lathe([[1.5, 0], [4, -2], [18, -16], [19, -17]], toon(K.red, { side: THREE.DoubleSide }), 20).translateY(low));
    g.add(at(sphere(4.2, flat('#fff3c0'), 10, 8), 0, low - 13, 0));
    return { group: g, lightY: low - 18 };
}

export { mergeByMaterial, flat, toon, box, roundBox, cyl, sphere, cone, torus, shape, lathe, at, group, canvasTexture };
