// TurboToys · themes/supermarket-props.js – the kit of the supermarket world (supermarket.js): an atlas of invented products (cereal boxes,
// cans, detergents, chips …), instanced product batches, shelf gondolas, freezer chests and freezer walls, checkouts, shopping carts, pallets,
// the fruit & veg stand and comic sale signs. Every factory returns a group standing on y = 0, front facing +z.
// Scale: shelves ~100 tall, a cart ~70 tall, a cereal box 16 tall (the toy car is 4.2 long).

import * as THREE from 'three';
import { toon, flat, box, roundBox, cyl, sphere, cone, torus, lathe, at, group, canvasTexture } from '../render/toon.js';

export const S = {
    red: '#d8382c',
    redDark: '#a3241b',
    blue: '#2f6fd0',
    navy: '#22386b',
    yellow: '#f6c638',
    orange: '#f28c28',
    green: '#3f9b4b',
    lime: '#9bd23c',
    teal: '#2aa198',
    pink: '#e86aa6',
    purple: '#7a4bc4',
    brown: '#8a5a32',
    wood: '#c68a4e',
    woodLight: '#ddb17a',
    cardboard: '#c9a06a',
    shelf: '#d5dae0',
    shelfDark: '#5d6570',
    chrome: '#d4dde6',
    steel: '#9aa3ad',
    rubber: '#2e2d33',
    ink: '#1d1a17',
    white: '#f7f3ea',
    cream: '#f1e4c3',
};

const FONT = 'Bangers, Impact, sans-serif';

function fitText(ctx, text, maxWidth, size) {
    ctx.font = `${size}px ${FONT}`;
    const w = ctx.measureText(text).width;
    if (w > maxWidth) ctx.font = `${Math.floor((size * maxWidth) / w)}px ${FONT}`;
}

function inkText(ctx, text, x, y, maxWidth, size, fill, stroke = '#14100c', line = 0.14) {
    fitText(ctx, text, maxWidth, size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * line;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
}

// ------------------------------------------------------------------ the product atlas (4 × 4 cells of 256 px; the left 24 px of a cell: plain side colour)

export const CELLS = [
    { bg: '#f6c638', side: '#e2392f', title: 'KNUSPER', sub: 'FLOCKEN', fg: '#e2392f', deco: 'bowl' },
    { bg: '#6b3b22', side: '#3f2112', title: 'SCHOKO', sub: 'POPS', fg: '#f6c638', deco: 'balls' },
    { bg: '#3f9b4b', side: '#24602c', title: 'HAFER', sub: 'HELD', fg: '#f7f3ea', deco: 'sun' },
    { bg: '#f28c28', side: '#a8521a', title: 'ZIMT', sub: 'RINGE', fg: '#fff3c0', deco: 'rings' },
    { bg: '#e2392f', side: '#f7f3ea', title: 'TOMATEN', sub: 'EXTRA ROT', fg: '#ffffff', deco: 'tomato' },
    { bg: '#3f9b4b', side: '#f7f3ea', title: 'ERBSEN', sub: 'FEIN', fg: '#f6c638', deco: 'peas' },
    { bg: '#8a5a32', side: '#f6c638', title: 'BOHNEN', sub: 'IN SOSSE', fg: '#f6c638', deco: 'balls' },
    { bg: '#2f6fd0', side: '#f6c638', title: 'MAIS', sub: 'SÜSS', fg: '#f6c638', deco: 'sun' },
    { bg: '#2f6fd0', side: '#f7f3ea', title: 'BLITZ', sub: 'WEISS', fg: '#ffffff', deco: 'star' },
    { bg: '#e86aa6', side: '#7a4bc4', title: 'FLAUSCH', sub: 'WEICH', fg: '#ffffff', deco: 'clouds' },
    { bg: '#e2392f', side: '#f6c638', title: 'CHIPS', sub: 'KNUSPER', fg: '#f6c638', deco: 'wave' },
    { bg: '#f28c28', side: '#e2392f', title: 'PAPRIKA', sub: 'WUMMS!', fg: '#ffffff', deco: 'star' },
    { bg: '#f7f3ea', side: '#5cb7e6', title: 'WOLKE 8', sub: 'SUPERSOFT', fg: '#2f6fd0', deco: 'clouds' },
    { bg: '#f7f3ea', side: '#2f6fd0', title: 'MILCH', sub: 'FRISCH', fg: '#2f6fd0', deco: 'spots' },
    { bg: '#f6c638', side: '#f28c28', title: 'SAFT', sub: 'ORANGE', fg: '#e2392f', deco: 'orange' },
    { bg: '#c9a06a', side: '#c9a06a', title: 'BANANEN', sub: 'KISTE 12', fg: '#2f6fd0', deco: 'cardboard' },
];

export function productAtlas() {
    return canvasTexture(1024, 1024, (ctx) => {
        CELLS.forEach((c, k) => {
            const x0 = (k % 4) * 256;
            const y0 = Math.floor(k / 4) * 256;
            ctx.save();
            ctx.translate(x0, y0);
            ctx.beginPath();
            ctx.rect(0, 0, 256, 256);
            ctx.clip();
            ctx.fillStyle = c.bg;
            ctx.fillRect(0, 0, 256, 256);
            decorate(ctx, c);
            inkText(ctx, c.title, 140, 70, 200, 64, c.fg);
            inkText(ctx, c.sub, 140, 128, 190, 40, '#ffffff');
            ctx.fillStyle = c.side;
            ctx.fillRect(0, 0, 24, 256);
            ctx.restore();
        });
    });
}

function decorate(ctx, c) {
    const ink = '#14100c';
    ctx.lineWidth = 6;
    ctx.strokeStyle = ink;
    const disc = (x, y, r, fill) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
    };
    switch (c.deco) {
        case 'bowl':
            disc(140, 210, 46, '#f7f3ea');
            ctx.fillStyle = '#f28c28';
            for (let k = 0; k < 7; k++) disc(105 + k * 12, 180 + (k % 2) * 6, 9, '#f28c28');
            ctx.fillStyle = c.bg;
            ctx.fillRect(60, 150, 170, 30);
            break;
        case 'balls':
            for (let k = 0; k < 6; k++) disc(70 + k * 30, 200 + (k % 2) * 18, 14, '#4a2414');
            break;
        case 'sun':
            ctx.fillStyle = '#f6c638';
            for (let k = 0; k < 12; k++) {
                const a = (k / 12) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(140, 205);
                ctx.lineTo(140 + Math.cos(a) * 60, 205 + Math.sin(a) * 60);
                ctx.lineTo(140 + Math.cos(a + 0.2) * 60, 205 + Math.sin(a + 0.2) * 60);
                ctx.fill();
            }
            disc(140, 205, 30, '#ffdf5a');
            break;
        case 'rings':
            for (let k = 0; k < 4; k++) {
                ctx.beginPath();
                ctx.arc(80 + k * 40, 205, 16, 0, Math.PI * 2);
                ctx.lineWidth = 12;
                ctx.strokeStyle = '#8a4a1c';
                ctx.stroke();
            }
            break;
        case 'tomato':
            disc(140, 205, 36, '#ff5a3c');
            ctx.fillStyle = '#3f9b4b';
            ctx.fillRect(128, 166, 24, 10);
            break;
        case 'peas':
            for (let k = 0; k < 7; k++) disc(64 + k * 26, 205, 11, '#9bd23c');
            break;
        case 'star':
            ctx.fillStyle = '#f6c638';
            ctx.beginPath();
            for (let k = 0; k < 10; k++) {
                const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
                const r = k % 2 ? 22 : 50;
                ctx.lineTo(140 + Math.cos(a) * r, 205 + Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case 'clouds':
            for (const [x, y, r] of [[90, 210, 26], [130, 196, 34], [175, 212, 26]]) disc(x, y, r, '#ffffff');
            break;
        case 'wave':
            ctx.fillStyle = '#f6c638';
            ctx.beginPath();
            ctx.moveTo(24, 256);
            for (let x = 24; x <= 256; x += 8) ctx.lineTo(x, 190 + Math.sin(x / 18) * 14);
            ctx.lineTo(256, 256);
            ctx.fill();
            break;
        case 'spots':
            ctx.fillStyle = '#14100c';
            for (const [x, y, r] of [[70, 200, 20], [150, 225, 26], [210, 180, 16], [110, 170, 10]]) {
                ctx.beginPath();
                ctx.ellipse(x, y, r * 1.3, r, 0.4, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
        case 'orange':
            disc(140, 205, 38, '#f28c28');
            ctx.fillStyle = '#3f9b4b';
            ctx.beginPath();
            ctx.ellipse(160, 165, 18, 8, -0.5, 0, Math.PI * 2);
            ctx.fill();
            break;
        case 'cardboard':
            ctx.strokeStyle = 'rgba(20,16,12,0.5)';
            ctx.lineWidth = 4;
            ctx.strokeRect(40, 20, 200, 216);
            ctx.fillStyle = '#f6c638';
            ctx.beginPath();
            ctx.ellipse(140, 200, 60, 18, 0.2, 0, Math.PI);
            ctx.fill();
            ctx.stroke();
            break;
        default:
    }
}

/** The uv rectangle of a cell: front = the printed part, side = the plain strip. */
function cellRect(k) {
    const u0 = (k % 4) / 4;
    const v1 = 1 - Math.floor(k / 4) / 4;
    const v0 = v1 - 0.25;
    return {
        front: [u0 + 26 / 1024, v0 + 2 / 1024, u0 + 254 / 1024, v1 - 2 / 1024],
        side: [u0 + 6 / 1024, v0 + 40 / 1024, u0 + 18 / 1024, v1 - 40 / 1024],
    };
}

function remap(uv, index, [a, b, c, d]) {
    uv.setXY(index, a + (c - a) * uv.getX(index), b + (d - b) * uv.getY(index));
}

/** A box product (origin at its bottom centre) printed with atlas cell k on the front (+z) and the back. */
export function atlasBox(w, h, d, k, { roundness = 0 } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    const uv = g.attributes.uv;
    const r = cellRect(k);
    for (let face = 0; face < 6; face++) {
        const rect = face === 4 || face === 5 ? r.front : r.side;
        for (let v = 0; v < 4; v++) remap(uv, face * 4 + v, rect);
    }
    if (roundness) puff(g, w, h, d, roundness);
    return g;
}

/** Pushes the middle of the big faces out a little (chips bags, toilet paper packs). */
function puff(g, w, h, d, amount) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) / (w / 2);
        const y = (p.getY(i) - h / 2) / (h / 2);
        p.setZ(i, p.getZ(i) * (1 + amount * (1 - Math.abs(x)) * (1 - Math.abs(y))));
    }
}

/** A can (origin at the bottom) with atlas cell k around it (the print centred at the front). */
export function atlasCan(r, h, k, seg = 12) {
    const g = new THREE.CylinderGeometry(r, r, h, seg, 1, false, Math.PI);
    g.translate(0, h / 2, 0);
    const uv = g.attributes.uv;
    const rc = cellRect(k);
    const torsoVerts = (seg + 1) * 2;
    for (let i = 0; i < uv.count; i++) remap(uv, i, i < torsoVerts ? rc.front : rc.side);
    return g;
}

/** A bottle (origin at the bottom), plain – coloured per instance. */
export function bottleGeometry(r, h, seg = 8) {
    const profile = [[0, 0], [r, 0], [r, h * 0.58], [r * 0.45, h * 0.78], [r * 0.38, h * 0.95], [r * 0.4, h], [0, h]];
    return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

/** A detergent jug with a handle hole (origin at the bottom) printed with cell k. */
export function jugGeometry(w, h, d, k) {
    return atlasBox(w, h, d, k);
}

// ------------------------------------------------------------------ instanced product batches

export class Batch {
    constructor() {
        this.types = new Map();
        this.m = new THREE.Matrix4();
        this.q = new THREE.Quaternion();
        this.e = new THREE.Euler();
        this.p = new THREE.Vector3();
        this.s = new THREE.Vector3(1, 1, 1);
        this.c = new THREE.Color();
    }

    type(key, geometry, material, { shadow = false } = {}) {
        if (!this.types.has(key)) this.types.set(key, { geometry, material, matrices: [], colors: [], shadow });
        return key;
    }

    /** Adds an instance: parent matrix (or null), local position, yaw, colour, scale. */
    add(key, parent, x, y, z, yaw = 0, color = 0xffffff, sx = 1, sy = 1, sz = 1, tilt = 0) {
        const t = this.types.get(key);
        this.e.set(tilt, yaw, 0);
        this.q.setFromEuler(this.e);
        this.p.set(x, y, z);
        this.s.set(sx, sy, sz);
        const m = new THREE.Matrix4().compose(this.p, this.q, this.s);
        if (parent) m.premultiply(parent);
        t.matrices.push(m);
        t.colors.push(new THREE.Color(color));
    }

    build(root) {
        let instances = 0;
        for (const [key, t] of this.types) {
            if (!t.matrices.length) continue;
            const mesh = new THREE.InstancedMesh(t.geometry, t.material, t.matrices.length);
            t.matrices.forEach((m, k) => {
                mesh.setMatrixAt(k, m);
                mesh.setColorAt(k, t.colors[k]);
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.computeBoundingSphere();
            mesh.castShadow = t.shadow;
            mesh.receiveShadow = true;
            mesh.userData.keep = true;
            mesh.name = 'products:' + key;
            root.add(mesh);
            instances += t.matrices.length;
        }
        return instances;
    }
}

/**
 * The product kinds and their sizes. Each: { key, w, h, d, cells?: [k…], colors?: [...] }. Registered on a batch with makeProducts(batch).
 */
export function makeProducts(batch, atlasMaterial, plainMaterial) {
    const kinds = {};
    const reg = (name, w, h, d, geometry, material, colors) => {
        batch.type(name, geometry, material);
        kinds[name] = { key: name, w, h, d, colors };
    };
    for (const k of [0, 1, 2, 3]) reg('cereal' + k, 11, 16, 4.5, atlasBox(11, 16, 4.5, k), atlasMaterial);
    for (const k of [4, 5, 6, 7]) reg('can' + k, 4.6, 6, 4.6, atlasCan(2.3, 6, k), atlasMaterial);
    for (const k of [8, 9]) reg('jug' + k, 9, 15, 5.5, atlasBox(9, 15, 5.5, k, { roundness: 0.18 }), atlasMaterial);
    for (const k of [10, 11]) reg('chips' + k, 10, 14, 4, atlasBox(10, 14, 4, k, { roundness: 0.55 }), atlasMaterial);
    reg('paper', 22, 16, 20, atlasBox(22, 16, 20, 12, { roundness: 0.12 }), atlasMaterial);
    reg('milk', 5, 11, 5, atlasBox(5, 11, 5, 13), atlasMaterial);
    reg('juice', 5.5, 12, 5.5, atlasBox(5.5, 12, 5.5, 14), atlasMaterial);
    reg('crate', 30, 18, 22, atlasBox(30, 18, 22, 15), atlasMaterial);
    reg('bottle', 5, 15, 5, bottleGeometry(2.5, 15), plainMaterial, ['#5cb7e6', '#e2392f', '#3f9b4b', '#f28c28', '#f6c638', '#7a4bc4']);
    reg('bigbottle', 6, 17, 6, bottleGeometry(3, 17), plainMaterial, ['#8fd3ff', '#9bd23c', '#e86aa6']);
    const capGeometry = new THREE.CylinderGeometry(1.15, 1.15, 1.6, 8);
    capGeometry.translate(0, 0.8, 0);
    batch.type('cap', capGeometry, plainMaterial);
    const jar = new THREE.CylinderGeometry(3, 3, 7, 10);
    jar.translate(0, 3.5, 0);
    reg('jar', 6.2, 7, 6.2, jar, plainMaterial, ['#c0392b', '#7a2a5a', '#f28c28', '#e8b030']);
    return kinds;
}

/** Fills a shelf board (local x from x0 to x1 at height y, the front edge at zFront, facing +z (dir 1) or −z (dir −1)) with blocks of products. */
export function fillShelf(batch, kinds, parent, { x0, x1, y, zFront, dir = 1, category, rng, maxH = 18, deep = false }) {
    let x = x0 + 0.6;
    const yaw = dir > 0 ? 0 : Math.PI;
    let guard = 0;
    while (x < x1 - 3 && guard++ < 400) {
        const kind = kinds[rng.pick(category)];
        if (kind.h > maxH) continue;
        const facings = 2 + Math.floor(rng() * 4);
        const color = kind.colors ? rng.pick(kind.colors) : null;
        for (let f = 0; f < facings && x + kind.w < x1; f++) {
            const cx = x + kind.w / 2;
            const shade = 0.9 + rng() * 0.1;
            const c = color ? new THREE.Color(color).multiplyScalar(shade) : new THREE.Color(shade, shade, shade);
            const rows = deep ? 2 : 1;
            for (let r = 0; r < rows; r++) {
                const z = zFront - dir * (kind.d / 2 + 0.6 + r * (kind.d + 0.4));
                batch.add(kind.key, parent, cx, y, z, yaw + (rng() - 0.5) * 0.08, c);
                if (kind.key.includes('bottle')) batch.add('cap', parent, cx, y + kind.h - 0.2, z, 0, rng.pick(['#f7f3ea', '#e2392f', '#2f6fd0']), kind.key === 'bigbottle' ? 1.2 : 1, 1, kind.key === 'bigbottle' ? 1.2 : 1);
            }
            x += kind.w + 0.5;
        }
        x += 1.2;
    }
}

// ------------------------------------------------------------------ shelf gondolas

/**
 * A double-sided shelf gondola along local x: length L, height H, depth D, `levels` boards per side. Returns { group, boards } where boards are
 * the shelf slots in local coordinates ({ x0, x1, y, zFront, dir }) to be filled after the gondola is placed.
 */
export function gondola({ L = 100, H = 104, D = 32, levels = 5, color = S.blue, priceMaterial, sides = [1, -1] }) {
    const g = group();
    const boards = [];
    g.add(at(box(L, 7, D, color), 0, 3.5, 0));
    g.add(at(box(L, H - 7, 2, S.shelf), 0, 7 + (H - 7) / 2, 0));
    for (const sx of [-1, 1]) g.add(at(box(2.4, H + 2, D + 1, S.shelfDark), sx * (L / 2 + 1.2), (H + 2) / 2, 0));
    const step = (H - 26) / (levels - 1);
    for (let k = 0; k < levels; k++) {
        const y = 7 + k * step;
        const room = (k < levels - 1 ? step : H - y) - 2.2;
        for (const dir of sides) {
            const depth = D / 2 - 1.2 + (k === 0 ? 2 : 0);
            const zc = dir * (1 + depth / 2);
            g.add(at(box(L, 1.4, depth, S.shelf), 0, y + 0.7, zc));
            const strip = new THREE.Mesh(priceStripGeometry(L), priceMaterial);
            strip.position.set(0, y + 0.2, dir * (1 + depth + 0.25));
            if (dir < 0) strip.rotation.y = Math.PI;
            g.add(strip);
            boards.push({ x0: -L / 2, x1: L / 2, y: y + 1.4, zFront: dir * (1 + depth), dir, level: k, maxH: room });
        }
    }
    g.add(at(box(L + 4, 2.4, D + 2, S.shelfDark), 0, H + 1.2, 0));
    return { group: g, boards };
}

function priceStripGeometry(L) {
    const g = new THREE.PlaneGeometry(L, 3.2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * (L / 24));
    return g;
}

export function priceStripTexture() {
    return canvasTexture(256, 32, (ctx, w, h) => {
        ctx.fillStyle = '#e2392f';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#f6c638';
        ctx.fillRect(18, 3, 74, 26);
        ctx.fillRect(150, 3, 74, 26);
        ctx.fillStyle = '#14100c';
        ctx.font = `22px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('1,99', 55, 17);
        ctx.fillText('0,79', 187, 17);
    }, { repeat: [1, 1] });
}

/** A hanging/standing sign board with text on both sides (canvas texture). */
export function boardTexture(text, { bg = '#2f6fd0', fg = '#ffffff', w = 512, h = 128, size = 86, border = '#f6c638' } = {}) {
    return canvasTexture(w, h, (ctx, W, H) => {
        ctx.fillStyle = border;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = bg;
        ctx.fillRect(10, 10, W - 20, H - 20);
        inkText(ctx, text, W / 2, H / 2 + 4, W - 50, size, fg);
    });
}

// ------------------------------------------------------------------ comic sale signs (star bursts, real geometry so the ink follows the spikes)

export function burstSign(text, { radius = 14, fill = '#f6c638', fg = '#e2392f', spikes = 14, depth = 0.6, size = 120 } = {}) {
    const texture = canvasTexture(256, 256, (ctx, w, h) => {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#14100c';
        ctx.lineWidth = 10;
        ctx.beginPath();
        for (let k = 0; k < spikes * 2; k++) {
            const a = (k / (spikes * 2)) * Math.PI * 2;
            const r = (k % 2 ? 0.78 : 1) * 122;
            ctx.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.stroke();
        inkText(ctx, text, 128, 136, 180, size, fg, '#14100c', 0.12);
    });
    const pts = [];
    for (let k = 0; k < spikes * 2; k++) {
        const a = (k / (spikes * 2)) * Math.PI * 2;
        const r = (k % 2 ? 0.78 : 1) * radius;
        pts.push(new THREE.Vector2(Math.cos(a) * r, -Math.sin(a) * r));
    }
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth / 2);
    const p = geometry.attributes.position;
    const n = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) {
        let u = (p.getX(i) / radius + 1) / 2;
        const v = (p.getY(i) / radius + 1) / 2;
        if (n.getZ(i) < -0.5) u = 1 - u;
        uv.setXY(i, u, v);
    }
    const mesh = new THREE.Mesh(geometry, toon(0xffffff, { map: texture }));
    mesh.castShadow = true;
    return mesh;
}

// ------------------------------------------------------------------ freezers

/** A chest freezer (L × 24 × 34) with a glowing glass lid. */
export function freezerChest(L, lidMaterial, bodyColor = S.white) {
    const g = group(
        at(roundBox(L, 22, 34, 2, bodyColor), 0, 11, 0),
        at(box(L + 0.4, 4, 34.4, S.blue), 0, 8, 0),
        at(box(L - 4, 0.6, 28, S.ink), 0, 22.1, 0),
        at(box(L + 1, 2, 2, S.chrome), 0, 23, 17),
        at(box(L + 1, 2, 2, S.chrome), 0, 23, -17),
        at(box(2, 2, 34, S.chrome), 0, 23, 0),
    );
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(L - 5, 29), lidMaterial);
    lid.rotation.x = -Math.PI / 2;
    lid.position.set(0, 22.6, 0);
    g.add(lid);
    for (const sx of [-1, 1]) g.add(at(box(3, 3, 30, S.rubber), sx * (L / 2 - 4), 1.5, 0));
    return g;
}

export function freezerLidTexture() {
    return canvasTexture(512, 256, (ctx, w, h) => {
        ctx.fillStyle = '#bfefff';
        ctx.fillRect(0, 0, w, h);
        const colors = ['#e2392f', '#2f6fd0', '#f6c638', '#3f9b4b', '#f28c28', '#e86aa6'];
        let s = 3;
        const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
        for (let k = 0; k < 26; k++) {
            ctx.fillStyle = colors[k % colors.length];
            ctx.save();
            ctx.translate(r() * w, r() * h);
            ctx.rotate((r() - 0.5) * 0.8);
            ctx.fillRect(-40, -26, 80, 52);
            ctx.strokeStyle = '#14100c';
            ctx.lineWidth = 4;
            ctx.strokeRect(-40, -26, 80, 52);
            ctx.restore();
        }
        // frost
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, 'rgba(235,252,255,0.75)');
        g.addColorStop(0.5, 'rgba(235,252,255,0.25)');
        g.addColorStop(1, 'rgba(235,252,255,0.7)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 6;
        for (let x = -h; x < w; x += 90) {
            ctx.beginPath();
            ctx.moveTo(x, h);
            ctx.lineTo(x + 60, 0);
            ctx.stroke();
        }
    });
}

/** A wall of upright freezers (doors glowing), length L (several doors), height 110. */
export function freezerWall(L, doorMaterial, color = S.white) {
    const g = group(at(box(L, 120, 30, color), 0, 60, 0), at(box(L, 12, 31, S.blue), 0, 128, 0), at(box(L, 6, 31, S.shelfDark), 0, 3, 0));
    const doors = Math.max(1, Math.round(L / 30));
    const dw = L / doors;
    for (let k = 0; k < doors; k++) {
        const x = -L / 2 + dw * (k + 0.5);
        const door = new THREE.Mesh(new THREE.PlaneGeometry(dw - 4, 96), doorMaterial);
        door.position.set(x, 60, 15.2);
        g.add(door);
        g.add(at(box(dw - 2, 2, 1.6, S.chrome), x, 109, 15.4), at(box(dw - 2, 2, 1.6, S.chrome), x, 11, 15.4));
        g.add(at(box(2, 98, 1.6, S.chrome), x - dw / 2 + 1, 60, 15.4));
        g.add(at(roundBox(1.8, 26, 2.6, 0.8, S.chrome), x + dw / 2 - 5, 62, 16.6));
    }
    return g;
}

export function freezerDoorTexture() {
    return canvasTexture(128, 256, (ctx, w, h) => {
        ctx.fillStyle = '#9fe3ff';
        ctx.fillRect(0, 0, w, h);
        const colors = ['#e2392f', '#2f6fd0', '#f6c638', '#3f9b4b', '#f28c28', '#e86aa6', '#f7f3ea'];
        for (let row = 0; row < 5; row++) {
            const y = 20 + row * 48;
            ctx.fillStyle = '#d8f6ff';
            ctx.fillRect(0, y + 34, w, 6);
            for (let k = 0; k < 4; k++) {
                ctx.fillStyle = colors[(row * 3 + k) % colors.length];
                ctx.fillRect(8 + k * 30, y, 24, 34);
            }
        }
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(0, h * 0.7);
        ctx.lineTo(w, h * 0.35);
        ctx.lineTo(w, h * 0.5);
        ctx.lineTo(0, h * 0.85);
        ctx.fill();
    });
}

// ------------------------------------------------------------------ checkout

/** A checkout counter along local z (length 80): the belt, the register with a glowing display, a candy rack, the lane lamp with its number. */
export function checkout(number, { beltMaterial, displayMaterial, numberMaterial }) {
    const g = group(
        at(roundBox(26, 24, 84, 2, S.red), 0, 12, 0),
        at(box(26.4, 3, 84.4, S.redDark), 0, 3, 0),
        at(box(20, 0.6, 58, S.ink), 0, 24.3, 10),
    );
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(19, 56), beltMaterial);
    belt.rotation.x = -Math.PI / 2;
    belt.position.set(0, 24.7, 10);
    g.add(belt);
    // the register: a desk with the till and the display
    g.add(at(roundBox(30, 30, 24, 2, S.shelf), -24, 15, -26));
    g.add(at(roundBox(14, 8, 12, 1.5, S.shelfDark), -24, 34, -28));
    g.add(at(cyl(1, 1, 10, S.shelfDark, 8), -16, 36, -20));
    g.add(at(roundBox(12, 8, 1.6, 0.6, S.ink), -16, 44, -20));
    const display = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), displayMaterial);
    display.position.set(-16, 44, -19.1);
    g.add(display);
    // the bagging shelf, the divider bar on the belt
    g.add(at(box(24, 2, 26, S.steel), 0, 20, -34));
    const divider = at(box(3, 3, 18, S.blue), 4, 26.2, 24);
    divider.rotation.z = Math.PI / 4;
    g.add(divider);
    // candy rack at the start of the lane
    g.add(at(box(22, 40, 8, S.shelfDark), 18, 20, 38));
    for (let k = 0; k < 3; k++) g.add(at(box(20, 1, 8, S.shelf), 18, 10 + k * 12, 41));
    // the stool
    g.add(at(cyl(6, 6, 2.5, S.ink, 12), -26, 26, -6), at(cyl(1.2, 1.2, 24, S.steel, 8), -26, 12, -6), at(cyl(7, 7, 1.2, S.steel, 12), -26, 0.6, -6));
    // lane lamp with the number
    g.add(at(cyl(1.2, 1.2, 70, S.steel, 8), 12, 35, -40));
    g.add(at(roundBox(14, 14, 6, 2, S.ink), 12, 74, -40));
    const num = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 6.4), numberMaterial(number));
    num.position.set(12, 74, -40);
    g.add(num);
    return g;
}

export function beltTexture() {
    return canvasTexture(64, 256, (ctx, w, h) => {
        ctx.fillStyle = '#2b2b30';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#3c3c44';
        for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 6);
    });
}

// ------------------------------------------------------------------ shopping cart (chunky bars, no transparency: the ink pass needs real geometry)

export function shoppingCart(handle = S.red) {
    const g = group();
    const bar = S.chrome;
    const L = 56;
    const W = 34;
    const y0 = 34;
    const Hb = 30;
    // basket: bottom frame, corner posts, rails, a few vertical bars
    const rail = (x, y, z, len, axis) => {
        const b = axis === 'x' ? box(len, 1.3, 1.3, bar) : axis === 'z' ? box(1.3, 1.3, len, bar) : box(1.3, len, 1.3, bar);
        return at(b, x, y, z);
    };
    for (const y of [y0, y0 + Hb * 0.5, y0 + Hb]) {
        g.add(rail(0, y, -W / 2, L, 'x'), rail(0, y, W / 2, L, 'x'));
        g.add(rail(-L / 2, y, 0, W, 'z'), rail(L / 2, y, 0, W - (y > y0 ? 0 : 0), 'z'));
    }
    for (let k = 0; k <= 6; k++) {
        const x = -L / 2 + (k * L) / 6;
        g.add(rail(x, y0 + Hb / 2, -W / 2, Hb, 'y'), rail(x, y0 + Hb / 2, W / 2, Hb, 'y'));
    }
    for (let k = 1; k < 4; k++) {
        const z = -W / 2 + (k * W) / 4;
        g.add(rail(-L / 2, y0 + Hb / 2, z, Hb, 'y'), rail(L / 2, y0 + Hb / 2, z, Hb, 'y'));
        g.add(rail(0, y0, z, L, 'x'));
    }
    // chassis: two side tubes down to the castors, the bottom tray
    for (const sz of [-1, 1]) {
        const tube = at(box(L + 4, 2, 2, bar), 2, 8, sz * (W / 2 - 3));
        g.add(tube);
        for (const sx of [-1, 1]) {
            const leg = at(box(2, y0 - 8, 2, bar), sx * (L / 2 - 4), 8 + (y0 - 8) / 2, sz * (W / 2 - 3));
            g.add(leg);
            g.add(at(cyl(1.4, 1.4, 4, S.steelDark, 8), sx * (L / 2 - 1), 6, sz * (W / 2 - 3)));
            const wheel = at(cyl(3.6, 3.6, 2.4, S.rubber, 12), sx * (L / 2 - 1), 3.6, sz * (W / 2 - 3));
            wheel.rotation.x = Math.PI / 2;
            g.add(wheel);
        }
    }
    g.add(at(box(L - 6, 1, W - 6, S.steel), 2, 10, 0));
    // the handle (plastic grip) at the back (+x end)
    for (const sz of [-1, 1]) g.add(at(box(10, 1.6, 1.6, bar), L / 2 + 5, y0 + Hb + 4, sz * (W / 2 - 1)));
    const grip = at(cyl(1.8, 1.8, W + 2, handle, 10), L / 2 + 10, y0 + Hb + 4, 0);
    grip.rotation.x = Math.PI / 2;
    g.add(grip);
    // the child seat flap and a coin lock
    g.add(at(box(2, 12, W - 8, handle), L / 2 - 2, y0 + Hb - 6, 0));
    g.add(at(box(4, 5, 3, S.yellow), L / 2 + 8, y0 + Hb + 6.5, W / 2 - 4));
    return g;
}

// ------------------------------------------------------------------ pallets, crates, the fruit stand

export function pallet() {
    const g = group();
    for (let k = 0; k < 5; k++) g.add(at(box(48, 1.4, 8, S.woodLight), 0, 5.3, -18 + k * 9));
    for (const z of [-17, 0, 17]) g.add(at(box(48, 4, 6, S.wood), 0, 2.3, z));
    for (const x of [-21, 0, 21]) g.add(at(box(6, 1.2, 40, S.woodLight), x, 0.6, 0));
    return g;
}

/** A wooden fruit crate tilted towards the front, filled from the batch with fruit spheres. */
export function fruitCrate(L, D, tilt, color = S.wood) {
    const g = group();
    const inner = group(
        at(box(L, 1.2, D, color), 0, 0.6, 0),
        at(box(L, 7, 1.4, color), 0, 3.5, D / 2),
        at(box(L, 7, 1.4, color), 0, 3.5, -D / 2),
        at(box(1.4, 7, D, color), L / 2, 3.5, 0),
        at(box(1.4, 7, D, color), -L / 2, 3.5, 0),
    );
    inner.rotation.x = tilt;
    g.add(inner);
    return { group: g, inner };
}

export function awningTexture() {
    return canvasTexture(256, 64, (ctx, w, h) => {
        for (let k = 0; k < 8; k++) {
            ctx.fillStyle = k % 2 ? '#f7f3ea' : '#e2392f';
            ctx.fillRect((k * w) / 8, 0, w / 8, h);
        }
    }, { repeat: [1, 1] });
}

/** A chalkboard sign on an easel. */
export function chalkboard(text, sub, material) {
    void text;
    void sub;
    const g = group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(26, 34, 1.4), material);
    board.position.set(0, 26, 0);
    board.rotation.x = -0.18;
    g.add(board);
    g.add(at(box(28, 36, 1, S.wood), 0, 26, -0.9).rotateX(-0.18));
    for (const sx of [-1, 1]) {
        const leg = at(box(2, 46, 2, S.wood), sx * 12, 22, -2);
        leg.rotation.x = -0.18;
        g.add(leg);
    }
    const back = at(box(2, 46, 2, S.wood), 0, 22, -10);
    back.rotation.x = 0.35;
    g.add(back);
    return g;
}

export function chalkTexture(lines) {
    return canvasTexture(256, 336, (ctx, w, h) => {
        ctx.fillStyle = '#c68a4e';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#25332c';
        ctx.fillRect(14, 14, w - 28, h - 28);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        lines.forEach(([text, size, color], k) => {
            ctx.font = `${size}px ${FONT}`;
            ctx.fillStyle = color;
            ctx.fillText(text, w / 2, 60 + k * 72);
        });
    });
}

export { sphere, cone, torus, lathe, cyl, flat };
