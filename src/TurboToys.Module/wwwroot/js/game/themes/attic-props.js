// TurboToys · themes/attic-props.js – the props of the attic world (attic.js): trunks and suitcases, old books, ghostly sheets over furniture,
// the rocking horse, the dress form, the lantern, a gramophone, a bird cage, cobwebs, labelled boxes … and the floor that sinks under the road.
// Every factory returns a group standing on y = 0 (origin at its foot), front facing +z. Units: 1 = 10 cm of the toy car's world.

import * as THREE from 'three';
import { toon, box, roundBox, cyl, sphere, cone, torus, lathe, at, group, canvasTexture } from '../render/toon.js';

export const A = {
    floor: '#5a3d28',
    wood: '#8a5a36',
    woodDark: '#4a3020',
    woodLight: '#b98a5a',
    beam: '#5e3f28',
    brass: '#d1a64a',
    iron: '#3a3640',
    leather: '#5a2f1c',
    sheet: '#b3b9d6',
    cream: '#efe2c0',
    red: '#b8322a',
    green: '#3f6a3a',
    navy: '#2f4166',
    plum: '#5a3a6a',
    mustard: '#c99a2e',
    brick: '#9a4a36',
    ink: '#1d1a17',
    cardboard: '#b8905a',
    paper: '#efe6cc',
    white: '#efe6d6',
};

/** Old-book cover colours (barrier, plateau, stacks). */
export const BOOK_COLORS = ['#7a2a2a', '#2f4a6a', '#3e5a32', '#8a6a2a', '#5a3a6a', '#a0522d', '#2a5a5a', '#6a2a40'];

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

// ------------------------------------------------------------------ textures

/** Dark floor boards along x (512 px = one tile). */
export function floorBoards(ctx, w, h) {
    const boards = 6;
    const tones = ['#5a3d28', '#523724', '#61432c', '#4d3422', '#583b26', '#5e402a'];
    const bh = h / boards;
    for (let k = 0; k < boards; k++) {
        ctx.fillStyle = tones[k];
        ctx.fillRect(0, k * bh, w, bh);
        ctx.strokeStyle = 'rgba(30,18,10,0.25)';
        ctx.lineWidth = 2;
        for (let g = 0; g < 3; g++) {
            const y = k * bh + 14 + g * 22;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(w * 0.3, y - 6, w * 0.6, y + 8, w, y);
            ctx.stroke();
        }
        // butt joint + nails
        const x = ((k * 197) % w) + 30;
        ctx.fillStyle = '#2a1a10';
        ctx.fillRect(x, k * bh, 4, bh);
        ctx.fillStyle = '#8a7a6a';
        for (const dy of [0.3, 0.7]) {
            for (const dx of [-9, 13]) {
                ctx.beginPath();
                ctx.arc(x + dx, k * bh + bh * dy, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    ctx.fillStyle = '#24160d';
    for (let k = 0; k < boards; k++) ctx.fillRect(0, k * bh, w, 4);
    ctx.fillStyle = 'rgba(200,190,170,0.08)';
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.6, 90, 0, Math.PI * 2);
    ctx.fill();
}

/** Roof sheathing boards (dark, running along the ridge). */
export function roofBoards(ctx, w, h) {
    const n = 8;
    for (let k = 0; k < n; k++) {
        ctx.fillStyle = k % 2 ? '#3e2a1c' : '#46301f';
        ctx.fillRect(0, (k * h) / n, w, h / n);
        ctx.fillStyle = '#1e130b';
        ctx.fillRect(0, (k * h) / n, w, 5);
    }
}

export function brickTexture(ctx, w, h) {
    ctx.fillStyle = '#4a2a20';
    ctx.fillRect(0, 0, w, h);
    const bw = w / 4;
    const bh = h / 8;
    for (let r = 0; r < 8; r++) {
        for (let c = -1; c < 5; c++) {
            const x = c * bw + (r % 2 ? bw / 2 : 0);
            ctx.fillStyle = ['#9a4a36', '#8a4030', '#a8573f', '#91452f'][(r * 3 + c + 8) % 4];
            ctx.fillRect(x + 3, r * bh + 3, bw - 6, bh - 6);
        }
    }
}

/** The round window: night sky, stars, the moon (unlit, drawn bright). */
export function windowTexture(ctx, w, h) {
    const g = ctx.createRadialGradient(w * 0.62, h * 0.38, 10, w / 2, h / 2, w * 0.7);
    g.addColorStop(0, '#c9d8ff');
    g.addColorStop(0.25, '#6f86c8');
    g.addColorStop(1, '#1c2550');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 40; k++) ctx.fillRect(r() * w, r() * h * 0.8, 2, 2);
    ctx.fillStyle = '#f4f2dc';
    ctx.beginPath();
    ctx.arc(w * 0.62, h * 0.38, w * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,160,140,0.45)';
    for (const [x, y, rr] of [[0.58, 0.34, 0.035], [0.67, 0.42, 0.025], [0.6, 0.45, 0.02]]) {
        ctx.beginPath();
        ctx.arc(w * x, h * y, w * rr, 0, Math.PI * 2);
        ctx.fill();
    }
    // the roofs of the town below
    ctx.fillStyle = '#0d1230';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 32) ctx.lineTo(x, h * (0.78 + ((x * 7) % 5) * 0.03) - (x % 64 ? 18 : 0));
    ctx.lineTo(w, h);
    ctx.fill();
}

/** A cobweb drawn from the bottom-left corner (transparent background). */
export function webTexture(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(235,238,250,0.95)';
    ctx.lineWidth = 3;
    const rays = 7;
    const angles = Array.from({ length: rays }, (_, k) => (k / (rays - 1)) * (Math.PI / 2));
    for (const a of angles) {
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(Math.cos(a) * w, h - Math.sin(a) * h);
        ctx.stroke();
    }
    ctx.lineWidth = 2;
    for (let ring = 1; ring <= 6; ring++) {
        const r = (ring / 6.4) * w;
        ctx.beginPath();
        for (let k = 0; k < rays; k++) {
            const a = angles[k];
            const x = Math.cos(a) * r;
            const y = h - Math.sin(a) * r;
            if (k === 0) ctx.moveTo(x, y);
            else {
                const m = (angles[k - 1] + a) / 2;
                ctx.quadraticCurveTo(Math.cos(m) * r * 0.82, h - Math.sin(m) * r * 0.82, x, y);
            }
        }
        ctx.stroke();
    }
}

/** A box label in a hand-lettered look. */
export function boxLabel(text, color = '#2a1a10') {
    return canvasTexture(256, 128, (ctx, w, h) => {
        ctx.fillStyle = '#c69c64';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#e8d9b0';
        ctx.fillRect(10, 14, w - 20, h - 28);
        ctx.font = `${text.length > 9 ? 40 : 58}px Bangers, Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(text, w / 2, h / 2 + 3);
    });
}

/** A portrait of a stern ancestor with a moustache (for the leaning painting). */
export function portraitTexture(ctx, w, h) {
    ctx.fillStyle = '#3d5a4a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1e2a24';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.95, w * 0.42, h * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.45, w * 0.2, h * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(w * 0.3, h * 0.2, w * 0.4, h * 0.1);
    ctx.beginPath();
    ctx.moveTo(w * 0.32, h * 0.56);
    ctx.quadraticCurveTo(w * 0.5, h * 0.48, w * 0.68, h * 0.56);
    ctx.quadraticCurveTo(w * 0.5, h * 0.6, w * 0.32, h * 0.56);
    ctx.fill();
    ctx.fillRect(w * 0.4, h * 0.4, w * 0.05, h * 0.04);
    ctx.fillRect(w * 0.55, h * 0.4, w * 0.05, h * 0.04);
}

// ------------------------------------------------------------------ books

/** A book lying flat: cover (w along x, t thick, d deep) with the cream page edge showing on the +x side. */
export function book(w, t, d, color) {
    const g = group(at(box(w, t, d, color), 0, t / 2, 0));
    g.add(at(box(0.6, t * 0.74, d * 0.94, A.cream), w / 2 + 0.05, t / 2, 0));
    return g;
}

/** A stack of n books, slightly twisted; its height in userData.height. */
export function bookStack(rng, n, size = 1) {
    const g = group();
    let y = 0;
    for (let k = 0; k < n; k++) {
        const t = (1.4 + rng() * 1.6) * size;
        const b = book((10 + rng() * 6) * size, t, (7 + rng() * 4) * size, rng.pick(BOOK_COLORS));
        b.position.set((rng() - 0.5) * 1.5 * size, y, (rng() - 0.5) * 1.5 * size);
        b.rotation.y = (rng() - 0.5) * 0.7;
        g.add(b);
        y += t;
    }
    g.userData.height = y;
    return g;
}

/** An open book lying on the floor. */
export function openBook(color) {
    const g = group(at(box(22, 0.6, 15, color), 0, 0.3, 0));
    for (const s of [-1, 1]) {
        const half = at(box(10.4, 1.4, 14, A.paper), s * 5.3, 1.2, 0);
        half.rotation.z = -s * 0.08;
        g.add(half);
    }
    return g;
}

// ------------------------------------------------------------------ trunks, suitcases, boxes

/** A half cylinder along x with its round side up (radius r, length len), squashed to height h. */
function halfDrum(r, len, h, material, open = false) {
    const geometry = new THREE.CylinderGeometry(r, r, len, 14, 1, open, 0, Math.PI);
    geometry.rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.y = h / r;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

/** A dome-lidded travel trunk (w × h × d) with straps, brass corners and a lock. */
export function trunk(color, w = 60, h = 30, d = 40) {
    const body = h * 0.68;
    const g = group(at(box(w, body, d, color), 0, body / 2, 0));
    g.add(at(halfDrum(d / 2, w, h - body, toon(color)), 0, body, 0));
    g.add(at(box(w + 0.6, 1.2, d + 0.6, A.woodDark), 0, body, 0));
    for (const sx of [-0.3, 0.3]) {
        g.add(at(box(3, body + 0.4, d + 0.8, A.leather), sx * w, body / 2, 0));
        g.add(at(halfDrum(d / 2 + 0.5, 3, h - body + 0.5, toon(A.leather, { side: THREE.DoubleSide }), true), sx * w, body, 0));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(4, 4, 4, A.brass), sx * (w / 2 - 1.6), 2, sz * (d / 2 - 1.6)));
    g.add(at(box(6, 7, 1.2, A.brass), 0, body - 2, d / 2 + 0.4));
    return g;
}

/** A flat old suitcase (lying) with handle, straps and corners. */
export function suitcase(color, w = 44, h = 13, d = 30) {
    const g = group(at(roundBox(w, h, d, 2.4, color), 0, h / 2, 0));
    g.add(at(box(w + 0.4, 1, d + 0.4, A.leather), 0, h / 2, 0));
    for (const sx of [-0.28, 0.28]) g.add(at(box(2.4, h + 0.5, d + 0.5, A.leather), sx * w, h / 2, 0));
    const handle = at(torus(4, 0.9, A.leather, 6, 10, Math.PI), 0, h / 2, d / 2 + 0.5);
    handle.rotation.x = Math.PI / 2;
    g.add(handle);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(3, h * 0.5, 3, A.brass), sx * (w / 2 - 1), h / 2, sz * (d / 2 - 1)));
    return g;
}

export function cardboardBox(w, h, d, labelMaterial) {
    const g = group(at(box(w, h, d, A.cardboard), 0, h / 2, 0));
    g.add(at(box(w * 0.2, 0.4, d + 0.2, '#d8c49a'), 0, h + 0.1, 0));
    const flap = at(box(w * 0.48, 0.6, d * 0.5, '#a88050'), w * 0.2, h + 1.2, -d * 0.22);
    flap.rotation.x = -0.35;
    g.add(flap);
    if (labelMaterial) {
        const label = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w * 0.8, 34), Math.min(h * 0.5, 17)), labelMaterial);
        label.position.set(0, h * 0.55, d / 2 + 0.05);
        g.add(label);
    }
    return g;
}

/** A painted toy chest with a lid, a ball and a drum poking out. */
export function toyChest(labelMaterial) {
    const g = group(at(box(54, 28, 32, '#2f5f9a'), 0, 14, 0), at(roundBox(57, 6, 35, 2, A.red), 0, 30, 0));
    for (const sx of [-1, 1]) g.add(at(box(4, 29, 4, A.mustard), sx * 26, 14.5, 15));
    if (labelMaterial) g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(40, 14), labelMaterial), 0, 15, 16.05));
    g.add(at(sphere(6, A.red, 12, 8), 18, 36, -4), at(cyl(5, 5, 6, A.mustard, 12), -16, 34, 2));
    return g;
}

// ------------------------------------------------------------------ the ghost furniture under sheets

const SHEET_GLOW = '#121a36';

function skirt(w, d, h, flare = 1.18) {
    const g = new THREE.CylinderGeometry(1, flare, 1, 4, 1, true);
    g.rotateY(Math.PI / 4);
    const m = new THREE.Mesh(g, toon(A.sheet, { emissive: SHEET_GLOW, side: THREE.DoubleSide }));
    m.scale.set(w / Math.SQRT2, h, d / Math.SQRT2);
    m.position.y = h / 2;
    m.castShadow = true;
    return m;
}

/** Sheets over furniture: 'wardrobe' | 'chair' | 'table' | 'clock'. */
export function drape(kind) {
    const m = toon(A.sheet, { emissive: SHEET_GLOW });
    const g = group();
    if (kind === 'wardrobe') {
        g.add(at(roundBox(62, 140, 38, 7, m), 0, 82, 0), skirt(64, 40, 26));
        g.add(at(cone(6, 12, m, 6), -26, 154, 0), at(cone(6, 10, m, 6), 27, 153, 2));
        for (const x of [-18, 2, 20]) g.add(at(roundBox(4, 100, 4, 2, m), x, 60, 19));
    } else if (kind === 'chair') {
        g.add(at(roundBox(70, 34, 62, 10, m), 0, 30, 0), at(roundBox(70, 46, 20, 9, m), 0, 58, -22));
        for (const s of [-1, 1]) g.add(at(roundBox(16, 26, 62, 7, m), s * 32, 46, 0));
        g.add(skirt(74, 66, 18, 1.12));
    } else if (kind === 'table') {
        g.add(at(roundBox(86, 6, 54, 3, m), 0, 40, 0), skirt(86, 54, 40, 1.14));
        g.add(at(lathe([[0, 0], [7, 0], [9, 6], [5, 16], [7, 24], [0, 26]], m, 10), -18, 43, 4));
    } else {
        g.add(at(roundBox(36, 170, 26, 10, m), 0, 98, 0), skirt(40, 30, 26), at(sphere(14, m, 12, 8), 0, 182, 0));
        for (const x of [-11, 10]) g.add(at(roundBox(4, 120, 4, 2, m), x, 70, 13));
        g.add(at(cone(5, 10, m, 6), 14, 186, 0));
    }
    return g;
}

// ------------------------------------------------------------------ characters of the attic

/** The rocking horse (~68 tall): dapple body, red mane and saddle, curved rockers. */
export function rockingHorse() {
    const g = group();
    const R = 70;
    const arc = 0.95;
    for (const sx of [-1, 1]) {
        const rocker = new THREE.Mesh(new THREE.TorusGeometry(R, 1.8, 6, 24, arc), toon(A.red));
        rocker.rotation.set(0, Math.PI / 2, -Math.PI / 2 - arc / 2);
        rocker.position.set(sx * 9, R + 1.8, 0);
        rocker.castShadow = true;
        g.add(rocker);
    }
    for (const z of [-26, 26]) g.add(at(box(20, 2, 3, A.red), 0, 6.5, z));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = at(roundBox(4, 30, 4, 1.6, A.white), sx * 6, 18, sz * 12);
        leg.rotation.x = -sz * 0.12;
        g.add(leg);
    }
    g.add(at(roundBox(15, 15, 36, 6.5, A.white), 0, 38, 0));
    const neck = at(roundBox(9, 22, 10, 4, A.white), 0, 51, 15);
    neck.rotation.x = 0.45;
    const head = at(roundBox(9, 10, 20, 4, A.white), 0, 61, 23);
    head.rotation.x = 0.35;
    const mane = at(roundBox(3, 24, 6, 1.4, A.red), 0, 54, 10);
    mane.rotation.x = 0.45;
    const tail = at(cone(4, 22, A.red, 6), 0, 34, -22);
    tail.rotation.x = -2.4;
    g.add(neck, head, mane, tail);
    g.add(at(roundBox(16, 3, 13, 1.4, A.red), 0, 46, 0), at(box(17, 8, 2, A.mustard), 0, 41, 0));
    for (const sx of [-1, 1]) g.add(at(sphere(1.4, A.ink, 6, 4), sx * 4.6, 64, 27), at(cone(2, 5, A.white, 4), sx * 3, 68, 18));
    for (const [x, y, z] of [[7.4, 40, 6], [-7.4, 36, -8], [7.4, 34, -12]]) {
        const spot = at(sphere(2.6, '#9aa0b0', 6, 4), x, y, z);
        spot.scale.set(0.3, 1, 1);
        g.add(spot);
    }
    return g;
}

/** The dress form (~128 tall) on a tripod. */
export function mannequin(fabric = '#8a2f3a') {
    const g = group();
    for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        const leg = at(box(2.4, 2, 26, A.woodDark), Math.sin(a) * 11, 1.2, Math.cos(a) * 11);
        leg.rotation.y = a;
        g.add(leg);
    }
    g.add(at(cyl(1.6, 2, 58, A.woodDark, 8), 0, 30, 0), at(cyl(4, 4, 3, A.brass, 10), 0, 58, 0));
    const torso = lathe([[0, 0], [13, 1], [17, 8], [14, 20], [12.5, 30], [16.5, 42], [15.5, 50], [10, 56], [5, 58], [4.5, 62], [0, 63]], fabric, 18);
    torso.position.y = 60;
    torso.scale.set(1, 1, 0.78);
    g.add(torso, at(sphere(3.6, A.woodDark, 10, 8), 0, 125, 0));
    const tape = at(torus(6, 0.6, A.mustard, 4, 16), 0, 116, 0);
    tape.rotation.x = Math.PI / 2 + 0.2;
    g.add(tape, at(box(1.4, 26, 0.3, A.mustard), 4.5, 102, 6.2));
    return g;
}

/** The lantern (~24 tall): iron frame, glowing core, a handle. */
export function lantern(glowMaterial) {
    const g = group(
        at(box(11, 2, 11, A.iron), 0, 1, 0),
        at(new THREE.Mesh(new THREE.BoxGeometry(7.6, 12, 7.6), glowMaterial), 0, 8, 0),
        at(box(10, 1.4, 10, A.iron), 0, 14.6, 0),
    );
    const roof = at(cone(7.4, 6, A.iron, 4), 0, 18.2, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(1, 13, 1, A.iron), sx * 4.4, 8, sz * 4.4));
    g.add(at(torus(4, 0.7, A.iron, 4, 12, Math.PI), 0, 21.5, 0), at(cyl(1, 1, 2, A.iron, 6), 0, 21.4, 0));
    return g;
}

export function gramophone() {
    const g = group(
        at(box(26, 10, 26, A.wood), 0, 5, 0),
        at(box(27, 1.6, 27, A.brass), 0, 10, 0),
        at(cyl(11, 11, 1.2, A.ink, 18), 0, 11.4, 0),
        at(cyl(3, 3, 1.4, A.red, 10), 0, 11.8, 0),
        at(cyl(1.2, 1.2, 16, A.brass, 8), 10, 18, -10),
    );
    const crank = at(box(1, 1, 10, A.brass), 13.5, 6, 0);
    crank.rotation.z = Math.PI / 2;
    g.add(crank, at(sphere(1.6, A.woodDark, 6, 4), 18.5, 6, 0));
    const horn = lathe([[1.6, 0], [2.2, 10], [3.4, 18], [6.5, 26], [12, 32], [19, 35], [19.5, 34]], toon(A.brass, { side: THREE.DoubleSide }), 16);
    horn.position.set(10, 25, -10);
    horn.rotation.x = 0.9;
    horn.rotation.z = 0.25;
    g.add(horn);
    return g;
}

/** A bird cage on a stand (with a little yellow bird). */
export function birdcage() {
    const g = group(at(cyl(12, 14, 2.4, A.brass, 14), 0, 1.2, 0), at(cyl(1.2, 1.2, 74, A.brass, 8), 0, 38, 0));
    g.add(at(box(12, 1.4, 1.4, A.brass), -5, 74.5, 0));
    const cage = group(at(cyl(13, 13, 2, A.brass, 16), 0, 0, 0));
    const bars = 12;
    for (let k = 0; k < bars; k++) {
        const a = (k / bars) * Math.PI * 2;
        cage.add(at(cyl(0.5, 0.5, 24, A.brass, 4), Math.cos(a) * 12.4, 12, Math.sin(a) * 12.4));
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(13, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon(A.brass));
    dome.position.y = 24;
    dome.scale.y = 0.6;
    const ring = at(torus(13, 0.8, A.brass, 4, 16), 0, 12, 0);
    ring.rotation.x = Math.PI / 2;
    const perch = at(cyl(0.5, 0.5, 20, A.woodDark, 4), 0, 8, 0);
    perch.rotation.z = Math.PI / 2;
    const beak = at(cone(0.9, 2.4, A.red, 4), 5, 15, 0);
    beak.rotation.z = -Math.PI / 2;
    cage.add(dome, ring, perch, at(sphere(3, A.mustard, 8, 6), 0, 12, 0), at(sphere(2.2, A.mustard, 8, 6), 2.6, 15, 0), beak, at(cyl(0.6, 0.6, 8, A.brass, 4), 0, 30, 0));
    cage.position.set(-10, 36, 0);
    g.add(cage);
    return g;
}

/** A framed painting leaning against a wall (tilted back). */
export function painting(material, w = 54, h = 66) {
    const g = group(at(box(w + 8, h + 8, 3, A.mustard), 0, 0, 0), at(new THREE.Mesh(new THREE.PlaneGeometry(w, h), material), 0, 0, 1.6));
    g.position.y = (h + 8) / 2 - 1;
    g.rotation.x = -0.16;
    return group(g);
}

/** A rolled carpet lying on the floor. */
export function rolledCarpet(len = 90, color = '#8a2a30') {
    const roll = at(cyl(7, 7, len, color, 14), 0, 7, 0);
    roll.rotation.z = Math.PI / 2;
    const g = group(roll);
    for (const x of [-len * 0.3, len * 0.3]) {
        const band = at(cyl(7.3, 7.3, 4, A.mustard, 14), x, 7, 0);
        band.rotation.z = Math.PI / 2;
        g.add(band);
    }
    for (const s of [-1, 1]) {
        const end = at(cyl(5, 5, 0.6, '#5a1a1e', 12), s * (len / 2 + 0.2), 7, 0);
        end.rotation.z = Math.PI / 2;
        g.add(end);
    }
    return g;
}

/** A floor lamp with a fringed fabric shade. */
export function floorLamp() {
    const shade = lathe([[18, 0], [10, 20], [0, 20]], toon('#d98a8a', { side: THREE.DoubleSide }), 14);
    shade.position.y = 86;
    const fringe = new THREE.Mesh(new THREE.CylinderGeometry(18.4, 19.4, 4, 14, 1, true), toon('#8a3a4a', { side: THREE.DoubleSide }));
    fringe.position.y = 85;
    return group(at(cyl(12, 14, 3, A.woodDark, 14), 0, 1.5, 0), at(cyl(1.4, 1.4, 92, A.brass, 8), 0, 47, 0), shade, fringe);
}

/** A brick chimney stack from the floor to the roof. */
export function chimney(height, material) {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(46, height, 46), material);
    stack.position.y = height / 2;
    stack.castShadow = stack.receiveShadow = true;
    return group(stack, at(box(52, 6, 52, '#6a3a2a'), 0, 3, 0));
}

/** A candle on a brass dish; userData.flameY = the height of its flame (added by the world: instanced, flickering). */
export function candle(rng) {
    const h = 2.4 + rng() * 1.4;
    const g = group(at(cyl(1.8, 2.1, 0.6, A.brass, 10), 0, 0.3, 0), at(cyl(0.85, 0.85, h, A.cream, 8), 0, 0.6 + h / 2, 0));
    g.userData.flameY = 0.6 + h + 0.25;
    return g;
}
