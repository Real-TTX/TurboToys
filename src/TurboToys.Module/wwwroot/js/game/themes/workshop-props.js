// TurboToys · themes/workshop-props.js – the props of the workshop world (workshop.js): tyres, barrels, oil cans, the red tool chest, hand tools,
// the vintage car's nose, fluorescent lamps … Every factory returns a group standing on y = 0 (origin at its foot), front facing +z.
// Units: 1 = 10 cm of the toy car's world (a car tyre is 65 across). Chunky shapes on purpose: the ink pass outlines everything.

import * as THREE from 'three';
import { toon, flat, box, roundBox, cyl, sphere, cone, torus, lathe, at, group, canvasTexture } from '../render/toon.js';

export const C = {
    concrete: '#aaa59b',
    wood: '#c68a4e',
    woodLight: '#ddb17a',
    woodDark: '#7a4d2a',
    steel: '#9aa3ad',
    steelDark: '#4e555e',
    chrome: '#d4dde6',
    rubber: '#2e2d33',
    red: '#d8382c',
    redDark: '#9e2219',
    yellow: '#f6c638',
    orange: '#f28c28',
    blue: '#2f6fd0',
    navy: '#25406e',
    green: '#3f9b4b',
    teal: '#3aa39a',
    mint: '#8fd1bd',
    cream: '#f1e4c3',
    ink: '#1d1a17',
    white: '#f7f3ea',
    cardboard: '#c9a06a',
};

// ------------------------------------------------------------------ textures (made once per build)

/** A comic label: coloured band with a bold word (font Bangers). */
export function labelTexture(text, { bg = '#e2392f', fg = '#fff', stripe = '#14100c', w = 512, h = 128, size = 84, sub = null, once = false } = {}) {
    return canvasTexture(w, h, (ctx, W, H) => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = stripe;
        ctx.fillRect(0, 0, W, H * 0.1);
        ctx.fillRect(0, H * 0.9, W, H * 0.1);
        ctx.font = `${size}px Bangers, Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = size * 0.12;
        ctx.strokeStyle = '#14100c';
        ctx.fillStyle = fg;
        const y = sub ? H * 0.42 : H * 0.53;
        for (let k = 0; k < (once ? 1 : 2); k++) {
            const x = once ? W / 2 : W * (k === 0 ? 0.25 : 0.75);
            ctx.strokeText(text, x, y);
            ctx.fillText(text, x, y);
            if (sub) {
                ctx.font = `${size * 0.42}px Bangers, Impact, sans-serif`;
                ctx.lineWidth = size * 0.06;
                ctx.strokeText(sub, x, H * 0.76);
                ctx.fillText(sub, x, H * 0.76);
                ctx.font = `${size}px Bangers, Impact, sans-serif`;
                ctx.lineWidth = size * 0.12;
            }
        }
    });
}

export function pegboardTexture() {
    return canvasTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#b4875a';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#4a3220';
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
            ctx.beginPath();
            ctx.arc(16 + x * 32, 16 + y * 32, 4.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }, { repeat: [1, 1] });
}

// ------------------------------------------------------------------ the floor (sinks under the road where the spline dips below y = 0)

/**
 * The floor as a big plane at y = base with rectangular holes where the road dips below 0 (the layout spline undershoots before a ramp);
 * the holes are filled with small grids that follow the road down. uv = world position / tile (one seamless texture).
 */
export function sunkenFloor(track, { size = 1100, tile = 90, material, base = -0.06 }) {
    const n = track.count;
    const rects = [];
    let run = null;
    for (let k = 0; k <= n; k++) {
        const i = k % n;
        const dip = k < n && track.heightAt(i) < base + 0.05;
        if (dip) {
            const r = track.w[i] / 2 + 10;
            if (!run) run = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
            run.minX = Math.min(run.minX, track.x[i] - r);
            run.maxX = Math.max(run.maxX, track.x[i] + r);
            run.minZ = Math.min(run.minZ, track.z[i] - r);
            run.maxZ = Math.max(run.maxZ, track.z[i] + r);
        } else if (run) {
            rects.push(run);
            run = null;
        }
    }
    // merge overlapping rectangles
    for (let changed = true; changed;) {
        changed = false;
        outer: for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
            const A = rects[a];
            const B = rects[b];
            if (A.minX <= B.maxX && B.minX <= A.maxX && A.minZ <= B.maxZ && B.minZ <= A.maxZ) {
                A.minX = Math.min(A.minX, B.minX);
                A.maxX = Math.max(A.maxX, B.maxX);
                A.minZ = Math.min(A.minZ, B.minZ);
                A.maxZ = Math.max(A.maxZ, B.maxZ);
                rects.splice(b, 1);
                changed = true;
                break outer;
            }
        }
    }
    const cx = track.bounds.cx;
    const cz = track.bounds.cz;
    const h = size / 2;
    const outline = new THREE.Shape([[cx - h, -(cz - h)], [cx + h, -(cz - h)], [cx + h, -(cz + h)], [cx - h, -(cz + h)]].map(([x, y]) => new THREE.Vector2(x, y)).reverse());
    for (const r of rects) {
        outline.holes.push(new THREE.Path([[r.minX, -r.minZ], [r.maxX, -r.minZ], [r.maxX, -r.maxZ], [r.minX, -r.maxZ]].map(([x, y]) => new THREE.Vector2(x, y))));
    }
    const plane = new THREE.ShapeGeometry(outline);
    plane.rotateX(-Math.PI / 2);
    plane.translate(0, base, 0);
    const parts = [plane];
    // the grids inside the holes
    const located = {};
    for (const r of rects) {
        const cell = 2.5;
        const nx = Math.ceil((r.maxX - r.minX) / cell);
        const nz = Math.ceil((r.maxZ - r.minZ) / cell);
        const positions = [];
        const index = [];
        for (let iz = 0; iz <= nz; iz++) {
            for (let ix = 0; ix <= nx; ix++) {
                const x = r.minX + ((r.maxX - r.minX) * ix) / nx;
                const z = r.minZ + ((r.maxZ - r.minZ) * iz) / nz;
                let y = base;
                const edge = ix === 0 || iz === 0 || ix === nx || iz === nz;
                if (!edge) {
                    const p = track.locate(x, z, -1, located);
                    const e = Math.abs(p.lateral) - p.half;
                    const low = Math.min(base, p.height - 0.14);
                    y = e < 2.8 ? low : e < 7 ? low + (base - low) * ((e - 2.8) / 4.2) : base;
                }
                positions.push(x, y, z);
            }
        }
        for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
            const a = iz * (nx + 1) + ix;
            index.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        g.setIndex(index);
        g.computeVertexNormals();
        parts.push(g);
    }
    const meshes = parts.map(g => {
        const p = g.attributes.position;
        const uv = new Float32Array(p.count * 2);
        for (let k = 0; k < p.count; k++) {
            uv[k * 2] = p.getX(k) / tile;
            uv[k * 2 + 1] = -p.getZ(k) / tile;
        }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        if (!g.attributes.normal) g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, material);
        mesh.receiveShadow = true;
        mesh.name = 'floor';
        return mesh;
    });
    return group(...meshes);
}

// ------------------------------------------------------------------ tyres, barrels, cans

/** A car tyre lying flat (65 across, 18 high); rim = true adds a steel wheel. */
export function tyre({ rim = false } = {}) {
    const g = group(at(rotX(torus(23.5, 9.5, C.rubber, 8, 22)), 0, 9.5, 0));
    // tread blocks on the rim of the tyre (chunky, few)
    g.add(at(rotX(cyl(14.5, 14.5, 1, C.ink, 20)), 0, 9.5, 0));
    if (rim) {
        g.add(at(cyl(16, 16, 12, C.steel, 16), 0, 9.5, 0));
        g.add(at(cyl(6, 6, 12.6, C.steelDark, 10), 0, 9.5, 0));
    }
    return g;
}

/** A stack of n tyres, slightly offset (a real pile, not a column). */
export function tyreStack(n, rng) {
    const g = group();
    for (let k = 0; k < n; k++) {
        const t = tyre({ rim: k === n - 1 && rng() < 0.5 });
        t.position.set((rng() - 0.5) * 4, k * 18.6, (rng() - 0.5) * 4);
        t.rotation.y = rng() * Math.PI;
        g.add(t);
    }
    return g;
}

/** A tyre standing upright (leaning a little). */
export function tyreUpright(rng, lean = 0.12) {
    const t = tyre({ rim: rng() < 0.6 });
    t.rotation.x = Math.PI / 2 - lean;
    t.position.set(0, 33 - 9.5, 0);
    const g = group(t);
    return g;
}

function rotX(mesh) {
    mesh.rotation.x = Math.PI / 2;
    return mesh;
}

/** A 200-litre oil drum (88 high) with ribs and a label band. */
export function barrel(color, labelMaterial, { lying = false } = {}) {
    const g = group(
        at(cyl(29, 29, 86, color, 16), 0, 44, 0),
        at(torus(29.4, 1.6, color, 6, 16), 0, 29, 0),
        at(torus(29.4, 1.6, color, 6, 16), 0, 58, 0),
        at(torus(28.2, 1.8, C.steelDark, 6, 16), 0, 87, 0),
        at(cyl(3.6, 3.6, 2.4, C.steelDark, 8), 12, 88, 6),
    );
    g.children.slice(1, 4).forEach(t => (t.rotation.x = Math.PI / 2));
    if (labelMaterial) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(29.25, 29.25, 22, 16, 1, true), labelMaterial);
        band.position.y = 44;
        band.castShadow = true;
        g.add(band);
    }
    if (lying) {
        const outer = group(g);
        g.rotation.z = Math.PI / 2;
        g.position.set(44, 29, 0);
        return outer;
    }
    return g;
}

/** A square motor-oil can (25 high) with a screw cap and a label. */
export function oilCan(color, labelMaterial) {
    const g = group(
        at(roundBox(17, 22, 9, 1.8, color), 0, 11, 0),
        at(cyl(2.4, 2.4, 3.2, C.ink, 10), 4.5, 23.4, 0),
        at(roundBox(4, 2.4, 6, 1, color), -4, 23, 0),
    );
    if (labelMaterial) {
        const label = new THREE.Mesh(new THREE.PlaneGeometry(13, 10), labelMaterial);
        label.position.set(0, 11, 4.55);
        g.add(label);
    }
    return g;
}

/** An old-fashioned pump oiler: round body and a long thin spout. */
export function oiler(color = C.red) {
    const body = lathe([[0, 0], [9, 0], [10, 2], [10, 6], [7, 11], [3.4, 13], [2.2, 14.5], [0, 14.5]], color, 14);
    const spout = cyl(0.7, 1.6, 24, C.chrome, 8);
    spout.position.set(0, 25, 4.5);
    spout.rotation.x = 0.36;
    const thumb = at(cyl(2.2, 2.2, 1, C.chrome, 10), -6, 9, 0);
    thumb.rotation.z = Math.PI / 2;
    return group(body, spout, thumb);
}

/** A paint tin (lid, colour drip). */
export function paintCan(color, r = 8, h = 11) {
    const g = group(
        at(cyl(r, r, h, C.steel, 14), 0, h / 2, 0),
        at(cyl(r + 0.2, r + 0.2, h * 0.55, color, 14), 0, h * 0.45, 0),
        at(cyl(r * 0.92, r * 0.92, 0.6, color, 14), 0, h + 0.3, 0),
    );
    const drip = at(roundBox(2, h * 0.5, 1, 0.8, color), r * 0.7, h * 0.85, r * 0.62);
    drip.rotation.y = -0.85;
    g.add(drip);
    return g;
}

// ------------------------------------------------------------------ the red tool chest

export function toolChest() {
    const red = C.red;
    const g = group();
    // the roll cabinet: 72 wide, 62 high, 46 deep, on castors
    g.add(at(roundBox(72, 58, 46, 1.6, red), 0, 9 + 29, 0));
    for (const [x, z] of [[-31, -18], [31, -18], [-31, 18], [31, 18]]) {
        g.add(at(cyl(2, 2, 5, C.steelDark, 8), x, 6, z));
        const wheel = at(cyl(3.6, 3.6, 3, C.rubber, 12), x, 3.6, z);
        wheel.rotation.z = Math.PI / 2;
        g.add(wheel);
    }
    const drawers = [[12, 14], [27, 11], [39, 9], [49, 9], [59, 7]];
    for (const [y, h] of drawers) {
        g.add(at(box(66, h - 1.6, 1.4, C.redDark), 0, 9 + y - h / 2 + 3, 23.2));
        g.add(at(box(66, h - 2.6, 1.6, red), 0, 9 + y - h / 2 + 3.3, 23.6));
        g.add(at(roundBox(46, 1.8, 2.2, 0.6, C.chrome), 0, 9 + y + 0.2, 24.6));
    }
    // the top chest with a lid
    g.add(at(roundBox(68, 30, 40, 1.4, red), 0, 67 + 15, -2));
    g.add(at(roundBox(70, 6, 42, 2, C.redDark), 0, 67 + 33, -2));
    for (const [y, h] of [[8, 10], [17, 8], [25, 7]]) {
        g.add(at(box(62, h - 1.8, 1.6, red), 0, 67 + y - h / 2 + 3, 18.4));
        g.add(at(roundBox(40, 1.5, 2, 0.5, C.chrome), 0, 67 + y + 0.4, 19.4));
    }
    // side handle
    const handle = at(torus(10, 1.2, C.chrome, 6, 14, Math.PI), 37, 52, 0);
    handle.rotation.y = Math.PI / 2;
    g.add(handle);
    // a badge (an invented brand plate)
    g.add(at(box(22, 5, 0.6, C.chrome), 0, 67 + 27.8, 18.6));
    return g;
}

// ------------------------------------------------------------------ hand tools (hanging on a board: in the x/y plane, facing +z)

export function wrench(len, color = C.chrome) {
    const g = group();
    g.add(at(roundBox(len * 0.7, len * 0.12, len * 0.05, len * 0.02, color), 0, 0, 0));
    const ring = at(torus(len * 0.085, len * 0.04, color, 6, 12), len * 0.4, 0, 0);
    g.add(ring);
    const jaw = at(torus(len * 0.1, len * 0.045, color, 6, 10, Math.PI * 1.35), -len * 0.42, 0, 0);
    jaw.rotation.z = Math.PI * 0.82;
    g.add(jaw);
    return g;
}

export function hammer(len, grip = C.red) {
    const g = group(
        at(cyl(len * 0.04, len * 0.045, len * 0.85, C.woodLight, 8), 0, 0, 0),
        at(cyl(len * 0.055, len * 0.055, len * 0.32, grip, 8), 0, -len * 0.27, 0),
        at(roundBox(len * 0.44, len * 0.14, len * 0.13, len * 0.03, C.steelDark), len * 0.04, len * 0.44, 0),
    );
    const claw = at(cone(len * 0.07, len * 0.18, C.steelDark, 6), -len * 0.25, len * 0.47, 0);
    claw.rotation.z = Math.PI / 2 + 0.3;
    g.add(claw);
    return g;
}

export function saw(len) {
    const g = group();
    const teeth = 14;
    const pts = [[0, len * 0.28]];
    for (let k = 0; k <= teeth; k++) {
        const x = (k / teeth) * len;
        pts.push([x, 0], [x + len / teeth / 2, -len * 0.025]);
    }
    pts.pop();
    pts.push([len, len * 0.13]);
    const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x - len, y)));
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: len * 0.012, bevelEnabled: false }), toon(C.chrome));
    blade.castShadow = true;
    g.add(blade);
    // the handle with a hole
    const h = len * 0.32;
    const outline = new THREE.Shape([[0, 0], [h, 0], [h, h], [h * 0.15, h * 0.95], [0, h * 0.4]].map(([x, y]) => new THREE.Vector2(x, y)));
    const hole = new THREE.Path([[h * 0.3, h * 0.25], [h * 0.75, h * 0.25], [h * 0.75, h * 0.72], [h * 0.35, h * 0.7]].map(([x, y]) => new THREE.Vector2(x, y)));
    outline.holes.push(hole);
    const handle = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: len * 0.06, bevelEnabled: false }), toon(C.red));
    handle.position.set(-len * 0.05, -len * 0.04, -len * 0.024);
    handle.castShadow = true;
    g.add(handle);
    g.position.x = len / 2;
    return group(g);
}

export function screwdriver(len, color) {
    return group(
        at(roundBox(len * 0.16, len * 0.42, len * 0.16, len * 0.05, color), 0, len * 0.3, 0),
        at(cyl(len * 0.03, len * 0.03, len * 0.55, C.chrome, 6), 0, -len * 0.18, 0),
        at(cone(len * 0.04, len * 0.08, C.chrome, 6), 0, -len * 0.48, 0),
    ).rotateX(0);
}

/** The bench vice (cast iron blue), ~30 long. */
export function vice() {
    const blue = C.navy;
    const g = group(
        at(roundBox(22, 3, 18, 1, C.steelDark), 0, 1.5, 0),
        at(roundBox(14, 9, 14, 1.4, blue), 0, 7.5, 0),
        at(roundBox(22, 9, 6, 1.2, blue), 0, 12, -4),
        at(roundBox(22, 9, 6, 1.2, blue), 0, 12, 9),
        at(box(20, 6, 0.8, C.steel), 0, 13, -0.6),
        at(box(20, 6, 0.8, C.steel), 0, 13, 5.6),
    );
    const screw = at(cyl(1.3, 1.3, 16, C.chrome, 8), 0, 9, 16);
    screw.rotation.x = Math.PI / 2;
    g.add(screw);
    const bar = at(cyl(0.9, 0.9, 22, C.chrome, 8), 0, 9, 24);
    bar.rotation.z = Math.PI / 2;
    g.add(bar, at(sphere(1.8, C.chrome, 8, 6), 11, 9, 24), at(sphere(1.8, C.chrome, 8, 6), -11, 9, 24));
    return g;
}

/** A cordless drill lying on its side (~26 long). */
export function drill() {
    const g = group(
        at(roundBox(22, 9, 8, 2.6, C.yellow), 0, 4, 0),
        at(roundBox(7, 14, 7, 2, C.ink), 4, 4, -9),
        at(roundBox(11, 6, 10, 1.6, C.steelDark), 5, 3.5, -18),
    );
    g.children[1].rotation.x = Math.PI / 2;
    g.children[1].position.set(4, 3.6, -9);
    const chuck = at(cyl(2.6, 3.2, 6, C.ink, 10), -13, 4, 0);
    chuck.rotation.z = Math.PI / 2;
    const bit = at(cyl(0.7, 0.7, 12, C.chrome, 6), -21, 4, 0);
    bit.rotation.z = Math.PI / 2;
    g.add(chuck, bit);
    return g;
}

/** Hex nut, bolt, washer: the little scrap on the floor. */
export function nut(r = 3.2) {
    const n = at(cyl(r, r, r * 0.8, C.steel, 6), 0, r * 0.4, 0);
    return group(n, at(cyl(r * 0.45, r * 0.45, r * 0.84, C.steelDark, 8), 0, r * 0.4, 0));
}

export function bolt(len = 14) {
    const shaft = at(cyl(1.3, 1.3, len, C.steel, 8), 0, 1.6, len / 2);
    shaft.rotation.x = Math.PI / 2;
    const head = at(cyl(2.8, 2.8, 2.2, C.steelDark, 6), 0, 2.8, 0);
    head.rotation.x = Math.PI / 2;
    return group(shaft, head);
}

export function washer(r = 3) {
    const t = at(torus(r, r * 0.32, C.chrome, 5, 12), 0, r * 0.32, 0);
    t.rotation.x = Math.PI / 2;
    return group(t);
}

// ------------------------------------------------------------------ bigger workshop furniture

/** A sawhorse (trestle): beam length L, height H. */
export function sawhorse(L = 60, H = 36, color = C.wood) {
    const g = group(at(box(L, 4, 6, color), 0, H - 2, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = at(box(3.4, H, 3.4, color), sx * (L / 2 - 6), H / 2 - 1, sz * 5);
        leg.rotation.x = -sz * 0.22;
        g.add(leg);
    }
    for (const sx of [-1, 1]) g.add(at(box(2, 3, 16, color), sx * (L / 2 - 6), H * 0.3, 0));
    return g;
}

/** A cable reel (orange drum with wound black cable). */
export function cableReel() {
    const g = group();
    const d1 = at(cyl(22, 22, 3, C.orange, 18), 0, 22, -11);
    const d2 = at(cyl(22, 22, 3, C.orange, 18), 0, 22, 11);
    d1.rotation.x = d2.rotation.x = Math.PI / 2;
    const core = at(cyl(15, 15, 19, C.rubber, 16), 0, 22, 0);
    core.rotation.x = Math.PI / 2;
    const hub = at(cyl(5, 5, 26, C.ink, 10), 0, 22, 0);
    hub.rotation.x = Math.PI / 2;
    g.add(d1, d2, core, hub);
    for (const sx of [-1, 1]) g.add(at(box(3, 26, 3, C.steelDark), sx * 18, 11, 15), at(box(3, 26, 3, C.steelDark), sx * 18, 11, -15));
    // a loose cable loop on the floor
    const loop = at(torus(14, 1.4, C.rubber, 5, 18), 26, 1.4, 6);
    loop.rotation.x = Math.PI / 2;
    loop.scale.set(1, 0.7, 1);
    g.add(loop, at(roundBox(6, 3, 9, 1, C.orange), 38, 1.6, 10));
    return g;
}

export function fireExtinguisher() {
    return group(
        at(cyl(9, 9, 48, C.red, 14), 0, 24, 0),
        at(sphere(9, C.red, 14, 8), 0, 48, 0),
        at(cyl(2.6, 2.6, 6, C.ink, 8), 0, 58, 0),
        at(roundBox(12, 2, 3, 0.8, C.ink), 3, 61, 0),
        at(roundBox(4, 30, 3, 1.4, C.ink), 11, 38, 0),
        at(box(13, 12, 0.6, C.white), 0, 30, 9),
    );
}

/** The red trolley jack with its long handle. */
export function trolleyJack() {
    const g = group(
        at(roundBox(26, 10, 62, 2.4, C.red), 0, 9, 0),
        at(cyl(10, 10, 4, C.steelDark, 14), 0, 17, 22),
    );
    for (const [x, z, r] of [[-15, 26, 4.5], [15, 26, 4.5], [-15, -24, 6], [15, -24, 6]]) {
        const w = at(cyl(r, r, 4, C.rubber, 12), x, r, z);
        w.rotation.z = Math.PI / 2;
        g.add(w);
    }
    const handle = at(cyl(1.6, 1.6, 90, C.steelDark, 8), 0, 34, -64);
    handle.rotation.x = -1.0;
    g.add(handle, at(roundBox(16, 3.2, 3.2, 1.4, C.ink), 0, 58, -102));
    return g;
}

/** A wooden crate with slats. */
export function crate(w = 40, h = 30, d = 30, color = C.woodLight) {
    const g = group(at(box(w - 2, h - 2, d - 2, C.woodDark), 0, h / 2, 0));
    for (let k = 0; k < 3; k++) {
        const y = 3 + k * ((h - 6) / 2);
        g.add(at(box(w, h / 4.2, d, color), 0, y + h / 8.4, 0));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(3, h, 3, color), sx * (w / 2 - 1.2), h / 2, sz * (d / 2 - 1.2)));
    return g;
}

export function cardboardBox(w, h, d, tapeMaterial) {
    const g = group(at(box(w, h, d, C.cardboard), 0, h / 2, 0));
    g.add(at(box(w * 0.18, 0.4, d + 0.2, tapeMaterial ?? C.woodLight), 0, h + 0.1, 0));
    return g;
}

/** A broom leaning on a wall (lean in -z towards the wall). */
export function broom() {
    const stick = at(cyl(1.2, 1.2, 120, C.wood, 8), 0, 62, 0);
    const head = at(roundBox(36, 6, 7, 1.6, C.blue), 0, 4, 0);
    const bristles = at(box(34, 6, 5, C.yellow), 0, 0.5, 0);
    const g = group(group(stick, head, bristles));
    g.children[0].rotation.x = -0.2;
    g.children[0].position.z = 4;
    return g;
}

export function bucket(color = C.blue) {
    return group(
        lathe([[0, 0], [11, 0], [14, 22], [13, 22], [10.2, 1], [0, 1]], color, 14),
        at(torus(14, 0.6, C.steelDark, 4, 14, Math.PI), 0, 22, 0),
    );
}

/** A steel shelving rack (3 shelves) with things on it, w × h × d. fill(shelfGroup, y, w, d) adds the stuff. */
export function shelfRack(w, h, d, levels, fill) {
    const g = group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(3, h, 3, C.steelDark), sx * (w / 2 - 1.5), h / 2, sz * (d / 2 - 1.5)));
    for (let k = 0; k < levels; k++) {
        const y = 4 + (k * (h - 8)) / (levels - 1);
        g.add(at(box(w, 2, d, C.steel), 0, y, 0));
        g.add(at(box(w, 3, 1, C.orange), 0, y, d / 2));
        if (k < levels - 1) fill(g, y + 1, w, d, k);
    }
    return g;
}

// ------------------------------------------------------------------ the fluorescent lamp

/** The hanging fluorescent lamp: housing, two glowing tubes; returns { group, tubes }. The origin is the lamp itself (hang it at its height). */
export function fluorescentLamp(chain = 120, tubeMaterial) {
    const g = group(
        at(roundBox(76, 5, 16, 1.6, '#55635a'), 0, 0, 0),
        at(box(78, 1.2, 18, '#3b4640'), 0, 2.5, 0),
    );
    for (const sz of [-1, 1]) {
        const tube = at(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 70, 8), tubeMaterial), 0, -3.4, sz * 3.6);
        tube.rotation.z = Math.PI / 2;
        g.add(tube);
        for (const sx of [-1, 1]) g.add(at(box(3, 4, 4, '#3b4640'), sx * 35.5, -3, sz * 3.6));
    }
    for (const sx of [-1, 1]) g.add(at(box(0.9, chain, 0.9, C.steelDark), sx * 28, chain / 2 + 2.5, 0));
    return g;
}

// ------------------------------------------------------------------ the vintage car's nose (it sticks out of the wall)

/** The front of an old car facing +z: fenders, whitewall tyres, chrome grille, bumper, round lamps. body = length of the hood behind the grille. */
export function carFront({ body = 90, color = C.mint, lampMaterial }) {
    const g = group();
    const track = 74;
    for (const sx of [-1, 1]) {
        const x = sx * track;
        const tyreMesh = at(cyl(35, 35, 22, C.rubber, 22), x, 35, -30);
        tyreMesh.rotation.z = Math.PI / 2;
        const wall = at(cyl(25, 25, 22.8, C.white, 22), x, 35, -30);
        wall.rotation.z = Math.PI / 2;
        const hub = at(cyl(15, 15, 23.6, C.chrome, 16), x, 35, -30);
        hub.rotation.z = Math.PI / 2;
        const cap = at(sphere(6, C.chrome, 10, 8), x + sx * 11, 35, -30);
        g.add(tyreMesh, wall, hub, cap);
        // the teardrop fender over the wheel
        const fender = at(sphere(40, color, 18, 12), x, 52, -40);
        fender.scale.set(0.72, 0.7, 1.2);
        g.add(fender);
        // the round head lamp on a stalk, between fender and grille
        g.add(at(cyl(2.2, 2.2, 16, C.chrome, 8), sx * 44, 78, -6));
        const housing = at(cyl(12, 9, 14, C.chrome, 16), sx * 44, 92, -4);
        housing.rotation.x = Math.PI / 2;
        const lens = at(new THREE.Mesh(new THREE.CylinderGeometry(10.5, 10.5, 1, 16), lampMaterial), sx * 44, 92, 3.4);
        lens.rotation.x = Math.PI / 2;
        g.add(housing, lens);
    }
    // hood and cabin behind the grille
    g.add(at(roundBox(118, 46, body, 12, color, 2), 0, 74, -24 - body / 2));
    g.add(at(roundBox(170, 26, body - 40, 8, color, 2), 0, 52, -64 - (body - 40) / 2));
    g.add(at(box(126, 4, body - 10, C.cream), 0, 98, -30 - (body - 10) / 2));
    // the tall chrome grille with dark slats
    g.add(at(roundBox(58, 76, 12, 6, C.chrome, 2), 0, 72, -14));
    g.add(at(box(46, 62, 1, C.ink), 0, 72, -7.6));
    for (let k = -3; k <= 3; k++) g.add(at(box(2.6, 60, 2, C.chrome), k * 6, 72, -7.2));
    g.add(at(sphere(5, C.chrome, 10, 8), 0, 114, -14), at(cone(3.5, 10, C.chrome, 8), 0, 121, -14));
    // the bumper with two over-riders
    g.add(at(roundBox(206, 10, 10, 4.5, C.chrome, 2), 0, 24, 10));
    for (const sx of [-1, 1]) g.add(at(roundBox(9, 26, 9, 4, C.chrome, 2), sx * 34, 28, 13));
    g.add(at(box(40, 14, 1, C.yellow), 0, 42, -4), at(box(36, 10, 1.2, C.ink), 0, 42, -3.8));
    return g;
}
