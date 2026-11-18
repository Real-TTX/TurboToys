// TurboToys · tracks/builder.js – the meshes of a track (every path: the main road and its branches): the road ribbon (with the kicker ramps), the curbs, the barriers (open where roads meet), the skirts under raised
// parts, the boost arrows, the start/finish gantry with the checkered line. The world around it (floor, furniture, toys) is the theme's (themes/*.js).
// Contract of a theme's road style (theme.road):
//   { surface: '#hex', surfaceDark: '#hex', line: '#hex'|null, edge: '#hex'|null, curb: ['#hex', '#hex'], barrier: 'blocks'|'books'|'stones'|'wall'|'cans'|'none',
//     barrierColors: ['#hex', …], skirt: '#hex', kicker: ['#hex', '#hex'], gantry: '#hex', pattern?: (ctx, w, h) => void }

import * as THREE from 'three';
import { toon, flat, canvasTexture, mergeByMaterial, roundBoxGeometry, seeded, PALETTE } from '../render/toon.js';

/** How far the barrier stands from the road's centre beyond the half width; physics keeps cars inside (see race/physics.js). */
export const BARRIER_OFFSET = 1.9;

function roadTexture(style) {
    return canvasTexture(256, 512, (ctx, w, h) => {
        ctx.fillStyle = style.surface;
        ctx.fillRect(0, 0, w, h);
        if (style.pattern) {
            style.pattern(ctx, w, h);
        } else {
            // grain of the toy road mat
            const rng = seeded('road' + style.surface);
            for (let k = 0; k < 2600; k++) {
                ctx.fillStyle = rng() < 0.5 ? style.surfaceDark : 'rgba(255,255,255,0.06)';
                ctx.globalAlpha = 0.25 + rng() * 0.35;
                ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
            }
            ctx.globalAlpha = 1;
        }
        if (style.edge) {
            ctx.fillStyle = style.edge;
            ctx.fillRect(w * 0.035, 0, w * 0.025, h);
            ctx.fillRect(w * 0.94, 0, w * 0.025, h);
        }
        if (style.line) {
            ctx.fillStyle = style.line;
            ctx.fillRect(w * 0.49, 0, w * 0.02, h * 0.55);
        }
    }, { repeat: [1, 1] });
}

function checkerTexture() {
    return canvasTexture(256, 64, (ctx, w, h) => {
        const s = 16;
        for (let x = 0; x < w / s; x++) for (let y = 0; y < h / s; y++) {
            ctx.fillStyle = (x + y) % 2 ? '#16120e' : '#f7f3ea';
            ctx.fillRect(x * s, y * s, s, s);
        }
    });
}

function arrowTexture() {
    return canvasTexture(128, 256, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        for (let k = 0; k < 3; k++) {
            const y = 40 + k * 70;
            ctx.beginPath();
            ctx.moveTo(w * 0.1, y + 50);
            ctx.lineTo(w * 0.5, y);
            ctx.lineTo(w * 0.9, y + 50);
            ctx.lineTo(w * 0.9, y + 78);
            ctx.lineTo(w * 0.5, y + 28);
            ctx.lineTo(w * 0.1, y + 78);
            ctx.closePath();
            ctx.fillStyle = '#ffd23a';
            ctx.fill();
            ctx.lineWidth = 7;
            ctx.strokeStyle = '#14100c';
            ctx.stroke();
        }
    });
}

function bannerTexture(text) {
    return canvasTexture(1024, 160, (ctx, w, h) => {
        ctx.fillStyle = '#e2392f';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#f6c638';
        for (let x = -40; x < w; x += 80) {
            ctx.beginPath();
            ctx.moveTo(x, h);
            ctx.lineTo(x + 40, h);
            ctx.lineTo(x + 80, 0);
            ctx.lineTo(x + 40, 0);
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(20,16,12,0.85)';
        ctx.fillRect(w * 0.18, 18, w * 0.64, h - 36);
        ctx.font = '96px Bangers, Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#14100c';
        ctx.fillStyle = '#ffffff';
        ctx.strokeText(text, w / 2, h / 2 + 6);
        ctx.fillText(text, w / 2, h / 2 + 6);
    });
}

/**
 * A point of the road: sample i of a path, lateral offset l, height h (absolute; in a looping h - y is the offset along the road's up direction).
 */
function vertex(path, i, l, h, out) {
    const nx = -path.tz[i];
    const nz = path.tx[i];
    if (path.rail[i]) {
        const o = h - path.y[i];
        out.push(path.x[i] + nx * l + path.ux[i] * o, path.y[i] + path.uy[i] * o, path.z[i] + nz * l + path.uz[i] * o);
    } else {
        out.push(path.x[i] + nx * l, h, path.z[i] + nz * l);
    }
}

/** The samples of a path from `from` to `to` (inclusive; a whole closed path ends on its first sample again) with their v distance. */
function span(path, from = 0, to = null) {
    const n = path.count;
    const list = [];
    if (to === null) {
        for (let i = 0; i < n; i++) list.push([i, path.s[i]]);
        if (path.closed) list.push([0, path.length]);
        return list;
    }
    const last = path.closed ? ((to - from) % n + n) % n : Math.min(n - 1, to) - from;
    for (let k = 0; k <= last; k++) {
        const i = path.wrap(from + k);
        list.push([i, path.s[path.wrap(from)] + k]);
    }
    return list;
}

/**
 * A ribbon along a path between two lateral offsets (left > right) at height(i) (default: the road height) + lift.
 * skip(i) leaves out the segments touching sample i; flip turns it upside down (seen from below).
 */
function ribbon(path, left, right, lift, { from = 0, to = null, uvScale = 1 / 24, heights = null, skip = null, flip = false } = {}) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const list = span(path, from, to);
    list.forEach(([i, s], k) => {
        const y = (heights ? heights(i) : path.heightAt(i)) + (typeof lift === 'function' ? lift(i) : lift);
        const l = typeof left === 'function' ? left(i) : left;
        const r = typeof right === 'function' ? right(i) : right;
        vertex(path, i, l, y, positions);
        vertex(path, i, r, y, positions);
        const v = s * uvScale;
        uvs.push(0, v, 1, v);
        if (k > 0 && !(skip && (skip(i) || skip(list[k - 1][0])))) {
            const a = (k - 1) * 2;
            if (flip) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
            else indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
}

/** A wall along a path at a lateral offset from y0(i) to y1(i) (in a looping: along the road's up direction). */
function wall(path, lateral, y0, y1, { uvScale = 1 / 12, from = 0, to = null, skip = null } = {}) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const list = span(path, from, to);
    list.forEach(([i, s], k) => {
        const l = typeof lateral === 'function' ? lateral(i) : lateral;
        vertex(path, i, l, y0(i), positions);
        vertex(path, i, l, y1(i), positions);
        const v = s * uvScale;
        uvs.push(v, 0, v, 1);
        if (k > 0 && !(skip && (skip(i) || skip(list[k - 1][0])))) {
            const a = (k - 1) * 2;
            indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
}

/** Grows the marked samples by `by` on both sides (clean gaps). */
function dilate(mask, by, closed) {
    const n = mask.length;
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        if (!mask[i]) continue;
        for (let k = -by; k <= by; k++) {
            const j = closed ? (i + k + n) % n : i + k;
            if (j >= 0 && j < n) out[j] = 1;
        }
    }
    return out;
}

/**
 * Where another road takes the place of this path's edge (forks, joins, crossings at the same height): there is no barrier, no curb, no skirt.
 * @returns {Uint8Array} per sample: 1 = open
 */
function openings(track, path, sign, offset) {
    const n = path.count;
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        if (path.rail[i]) continue;
        const l = sign * (path.w[i] / 2 + offset);
        const x = path.x[i] - path.tz[i] * l;
        const z = path.z[i] + path.tx[i] * l;
        const h = path.heightAt(i);
        const hit = track.roadsNear(x, z, 0.4, (height, other, j) => {
            if (Math.abs(height - h) > 3) return false;
            if (other !== path) return true;
            const d = Math.abs(i - j);
            return Math.min(d, path.closed ? n - d : d) > 40;
        });
        if (hit) mask[i] = 1;
    }
    return dilate(mask, 2, path.closed);
}

/** The samples of a path that cross an earlier stretch of the same path at the same height (1 = lies on top). */
function crossings(track, path) {
    const n = path.count;
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        if (path.rail[i]) continue;
        const h = path.heightAt(i);
        const hit = track.roadsNear(path.x[i], path.z[i], 0, (height, other, j) => other === path && j < i - 40 && !(path.closed && j < 40 && i > n - 40) && Math.abs(height - h) < 1.5);
        if (hit) mask[i] = 1;
    }
    return dilate(mask, 12, path.closed);
}

/** Where a road runs below this path's skirt (bridges): the skirt opens. */
function underpasses(track, path, sign, offset) {
    const n = path.count;
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        if (path.rail[i] || path.y[i] < 3) continue;
        for (const l of [sign * (path.w[i] / 2 + offset), sign * path.w[i] * 0.25]) {
            const x = path.x[i] - path.tz[i] * l;
            const z = path.z[i] + path.tx[i] * l;
            if (track.roadsNear(x, z, 4, height => height < path.y[i] - 3)) mask[i] = 1;
        }
    }
    return dilate(mask, 3, path.closed);
}

/**
 * Builds the roads of a track (the main path and its branches) in the style of its theme.
 * @param {import('./track.js').Track} track
 * @param {object} style theme.road
 * @param {{ quality?: string }} options
 * @returns {{ group: THREE.Group, boostMeshes: THREE.Mesh[], update: (dt:number, time:number)=>void }}
 */
export function buildRoad(track, style, { quality = 'high' } = {}) {
    const root = new THREE.Group();
    root.name = 'road';

    const surfaceTexture = roadTexture(style);
    const surfaceMaterial = toon(0xffffff, { map: surfaceTexture, steps: 3 });
    const waterMaterial = toon(0xffffff, { map: waterTexture(), steps: 3, transparent: true, opacity: 0.82 });
    const curbTexture = canvasTexture(64, 64, (ctx, w, h) => {
        ctx.fillStyle = style.curb?.[0] ?? '#e2392f';
        ctx.fillRect(0, 0, w, h / 2);
        ctx.fillStyle = style.curb?.[1] ?? '#f7f3ea';
        ctx.fillRect(0, h / 2, w, h / 2);
    }, { repeat: [1, 1] });
    const curbMaterial = toon(0xffffff, { map: curbTexture });
    const skirtMaterial = toon(style.skirt ?? PALETTE.wood, { side: THREE.DoubleSide });

    for (const path of track.paths) {
        const half = i => path.w[i] / 2;
        const water = path.surface === 'water';
        // a branch lies a hair above the main road where they overlap (the fork); at a flat crossing the later stretch lies on top
        const lift = path === track ? 0.02 : 0.045;
        const over = crossings(track, path);

        // ---- the road surface
        const road = new THREE.Mesh(ribbon(path, i => half(i), i => -half(i), i => lift + over[i] * 0.04, { uvScale: 1 / 26 }), water ? waterMaterial : surfaceMaterial);
        road.receiveShadow = true;
        road.name = water ? 'water' : 'surface';
        root.add(road);

        const open = { 1: openings(track, path, 1, BARRIER_OFFSET), [-1]: openings(track, path, -1, BARRIER_OFFSET) };

        // ---- curbs: striped bands at both edges (not where another road joins)
        if (!water) {
            for (const sign of [1, -1]) {
                const inner = i => sign * (half(i) - 0.2);
                const outer = i => sign * (half(i) + 1.0);
                const skip = i => open[sign][i] === 1;
                const g = sign > 0 ? ribbon(path, outer, inner, lift + 0.1, { uvScale: 1 / 5, skip }) : ribbon(path, inner, outer, lift + 0.1, { uvScale: 1 / 5, skip });
                const curb = new THREE.Mesh(g, curbMaterial);
                curb.receiveShadow = true;
                root.add(curb);
            }
        }

        // ---- skirts under raised road (planks, book spines …): from the floor to the road edge; open where another road joins or passes below
        let raised = false;
        for (let i = 0; i < path.count; i++) if (!path.rail[i] && path.y[i] > 0.25) raised = true;
        if (raised) {
            const edge = i => half(i) + BARRIER_OFFSET + 1.9;
            const raisedTop = i => (path.y[i] > 0.25 ? path.y[i] + 0.05 : -0.05);
            for (const sign of [1, -1]) {
                const below = underpasses(track, path, sign, BARRIER_OFFSET + 1.9);
                const skipSkirt = i => path.rail[i] === 1 || open[sign][i] === 1 || below[i] === 1 || path.y[i] <= 0.25;
                const skirt = new THREE.Mesh(wall(path, i => sign * edge(i), () => -0.05, raisedTop, { skip: skipSkirt }), skirtMaterial);
                skirt.castShadow = true;
                skirt.receiveShadow = true;
                root.add(skirt);
                // the shoulder between the curb and the skirt carries the barrier on raised parts
                const skipShoulder = i => path.rail[i] === 1 || open[sign][i] === 1 || path.y[i] <= 0.25;
                const a = i => sign * edge(i);
                const b = i => sign * (half(i) + 0.9);
                const shoulder = new THREE.Mesh(ribbon(path, sign > 0 ? a : b, sign > 0 ? b : a, 0, { heights: raisedTop, uvScale: 1 / 12, skip: skipShoulder }), skirtMaterial);
                shoulder.receiveShadow = true;
                root.add(shoulder);
            }
            // the underside of high parts (bridges are seen from below)
            const low = i => path.rail[i] === 1 || path.y[i] < 2.5;
            const deck = new THREE.Mesh(ribbon(path, i => edge(i), i => -edge(i), -0.6, { heights: i => path.y[i], skip: low, flip: true, uvScale: 1 / 12 }), skirtMaterial);
            root.add(deck);
        }

        // ---- barriers
        const barrier = buildBarriers(track, path, water ? { ...style, barrier: path.data?.barrier ?? 'none' } : { ...style, barrier: path.data?.barrier ?? style.barrier }, quality, open);
        if (barrier) root.add(barrier);
    }

    // ---- kicker ramps: a striped top and wedge sides
    const kickerTexture = canvasTexture(64, 64, (ctx, w, h) => {
        for (let k = -2; k < 6; k++) {
            ctx.fillStyle = k % 2 ? (style.kicker?.[0] ?? '#f6c638') : (style.kicker?.[1] ?? '#14100c');
            ctx.beginPath();
            ctx.moveTo(k * 16, 0);
            ctx.lineTo(k * 16 + 16, 0);
            ctx.lineTo(k * 16 + 48, h);
            ctx.lineTo(k * 16 + 32, h);
            ctx.fill();
        }
    }, { repeat: [3, 1] });
    for (const jump of track.jumps) {
        const path = jump.path ?? track;
        const half = i => path.w[i] / 2;
        const from = jump.start;
        const top = new THREE.Mesh(
            ribbon(path, i => half(i) * 0.86, i => -half(i) * 0.86, 0.06, { from, to: from + jump.length, uvScale: 1 / 6 }),
            toon(0xffffff, { map: kickerTexture }));
        top.receiveShadow = true;
        top.castShadow = true;
        root.add(top);
        // the sides and the back face (the drop)
        const sides = [];
        for (let k = 0; k < jump.length; k++) {
            const i = path.wrap(from + k);
            const j = path.wrap(from + k + 1);
            for (const sign of [1, -1]) {
                const a = path.normalAt(i);
                const b = path.normalAt(j);
                const la = sign * half(i) * 0.86;
                const lb = sign * half(j) * 0.86;
                const p0 = [path.x[i] + a.nx * la, path.y[i], path.z[i] + a.nz * la];
                const p1 = [path.x[i] + a.nx * la, path.heightAt(i) + 0.06, path.z[i] + a.nz * la];
                const p2 = [path.x[j] + b.nx * lb, path.y[j], path.z[j] + b.nz * lb];
                const p3 = [path.x[j] + b.nx * lb, path.heightAt(j) + 0.06, path.z[j] + b.nz * lb];
                if (sign > 0) sides.push(...p0, ...p2, ...p1, ...p1, ...p2, ...p3);
                else sides.push(...p0, ...p1, ...p2, ...p1, ...p3, ...p2);
            }
        }
        const endI = path.wrap(from + jump.length - 1);
        const e = path.normalAt(endI);
        const hw = half(endI) * 0.86;
        const yTop = path.heightAt(endI) + 0.06;
        const yBase = path.y[endI];
        const L = [path.x[endI] + e.nx * hw, path.z[endI] + e.nz * hw];
        const R = [path.x[endI] - e.nx * hw, path.z[endI] - e.nz * hw];
        sides.push(L[0], yBase, L[1], R[0], yBase, R[1], L[0], yTop, L[1], L[0], yTop, L[1], R[0], yBase, R[1], R[0], yTop, R[1]);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3));
        g.computeVertexNormals();
        const wedge = new THREE.Mesh(g, toon(style.kicker?.[2] ?? style.skirt ?? PALETTE.wood, { side: THREE.DoubleSide }));
        wedge.castShadow = true;
        root.add(wedge);
    }

    // ---- loopings: the outside of the band and a frame that holds it
    for (const loop of track.loops) root.add(buildLoopFrame(track, loop, style));

    // ---- tunnels: boxes, pipes, crates over the road
    for (const tunnel of track.tunnels) root.add(buildTunnel(tunnel, style));

    // ---- start / finish: checkered line and the gantry
    const start = track.pointAt(0);
    const checker = new THREE.Mesh(new THREE.PlaneGeometry(track.w[0] + 1, 3), flat(0xffffff, { map: checkerTexture() }));
    checker.rotation.x = -Math.PI / 2;
    checker.rotation.z = start.yaw;
    checker.position.set(start.x, start.y + 0.07, start.z);
    checker.receiveShadow = true;
    const holder = new THREE.Group();
    holder.add(checker);
    root.add(holder);
    root.add(buildGantry(track, style));

    // ---- boost arrows (they pulse)
    const arrowMaterial = flat(0xffffff, { map: arrowTexture(), transparent: true });
    const boostMeshes = [];
    for (const b of track.boosts) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 9), arrowMaterial);
        mesh.rotation.order = 'YXZ';
        mesh.rotation.y = b.yaw + Math.PI;
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(b.x, b.y + 0.11, b.z);
        root.add(mesh);
        boostMeshes.push(mesh);
    }

    // ---- static merge (one draw call per material)
    const merged = mergeByMaterial(root);
    const group = new THREE.Group();
    group.name = 'track';
    group.add(merged);
    let pulse = 0;
    return {
        group,
        boostMeshes,
        update(dt) {
            pulse += dt;
            arrowMaterial.color.setHSL(0.13, 1, 0.55 + Math.sin(pulse * 8) * 0.18);
            if (surfaceTexture) waterOffset(waterMaterial, dt);
        },
    };
}

function waterTexture() {
    return canvasTexture(128, 256, (ctx, w, h) => {
        ctx.fillStyle = '#5cb7e6';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 3;
        for (let k = 0; k < 9; k++) {
            const y = (k + 0.5) * (h / 9);
            ctx.beginPath();
            for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y + Math.sin((x / w) * Math.PI * 4 + k) * 5);
            ctx.stroke();
        }
    }, { repeat: [1, 1] });
}

function waterOffset(material, dt) {
    if (material.map) material.map.offset.y -= dt * 0.15;
}

/** The outside of a looping (the band seen from outside), its side rails and a frame of two posts. */
function buildLoopFrame(track, loop, style) {
    const g = new THREE.Group();
    const half = i => track.w[i] / 2;
    const from = loop.entry;
    const to = loop.exit;
    const skirtMaterial = toon(style.skirt ?? PALETTE.wood, { side: THREE.DoubleSide });
    const outside = new THREE.Mesh(ribbon(track, i => half(i) + 0.9, i => -half(i) - 0.9, -0.5, { from, to, flip: true, uvScale: 1 / 12 }), skirtMaterial);
    g.add(outside);
    // the frame: an A of two posts beside the circle and a cross beam on top
    const postMaterial = toon(style.gantry ?? PALETTE.dark);
    const R = loop.radius;
    const [tx, tz] = loop.T;
    const [nx, nz] = loop.N;
    const top = loop.P[1] + R * 2 + 1.2;
    for (const sign of [1, -1]) {
        const lateral = sign * (loop.D / 2 + track.w[loop.entry] / 2 + 3.5);
        for (const fwd of [-R * 0.7, R * 0.7]) {
            const x = loop.P[0] + nx * lateral + tx * fwd;
            const z = loop.P[2] + nz * lateral + tz * fwd;
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1, 10), postMaterial);
            const base = new THREE.Vector3(x, loop.P[1], z);
            const head = new THREE.Vector3(loop.P[0] + nx * lateral, top, loop.P[2] + nz * lateral);
            const mid = base.clone().add(head).multiplyScalar(0.5);
            leg.position.copy(mid);
            leg.scale.y = base.distanceTo(head);
            leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), head.clone().sub(base).normalize());
            leg.castShadow = true;
            g.add(leg);
        }
    }
    const beamLength = loop.D + track.w[loop.entry] + 7;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, beamLength, 10), postMaterial);
    beam.position.set(loop.P[0], top, loop.P[2]);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, 0, nz));
    beam.castShadow = true;
    g.add(beam);
    return g;
}

const TUNNEL_STYLES = {
    box: { color: '#c8955a', dark: '#a8763f', print: '#e2392f', text: 'TURBO TOYS', shape: 'box' },
    crate: { color: '#d2a062', dark: '#8a5a32', print: null, text: null, shape: 'box', planks: true },
    cereal: { color: '#f6c638', dark: '#e2392f', print: '#2f6fd0', text: 'KNUSPER-FLOCKEN', shape: 'box' },
    pipe: { color: '#9aa3ab', dark: '#6c757d', print: '#f28c28', text: null, shape: 'arch' },
    tube: { color: '#e86aa6', dark: '#b8467e', print: '#f7f3ea', text: null, shape: 'arch' },
};

function tunnelTexture(s) {
    return canvasTexture(256, 128, (ctx, w, h) => {
        ctx.fillStyle = s.color;
        ctx.fillRect(0, 0, w, h);
        if (s.planks) {
            ctx.fillStyle = s.dark;
            for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 3);
            for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 3, h);
        } else {
            // corrugation or rings and a printed band
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            for (let x = 0; x < w; x += 10) ctx.fillRect(x, 0, 4, h);
            if (s.print) {
                ctx.fillStyle = s.print;
                ctx.fillRect(0, h * 0.62, w, h * 0.16);
            }
            if (s.text) {
                ctx.font = '40px Bangers, Impact, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.lineWidth = 6;
                ctx.strokeStyle = '#14100c';
                ctx.fillStyle = '#f7f3ea';
                ctx.strokeText(s.text, w / 2, h * 0.32);
                ctx.fillText(s.text, w / 2, h * 0.32);
            }
        }
    }, { repeat: [1, 1] });
}

/** A tunnel over a stretch of road: a cardboard box (with flaps), a crate, a cereal box, a pipe or a tube. */
function buildTunnel(tunnel, style) {
    const s = TUNNEL_STYLES[tunnel.style] ?? TUNNEL_STYLES.box;
    const path = tunnel.path;
    const g = new THREE.Group();
    const material = toon(0xffffff, { map: tunnelTexture(s), side: THREE.DoubleSide });
    const dark = toon(s.dark, { side: THREE.DoubleSide });
    const from = tunnel.start;
    const to = Math.min(path.closed ? tunnel.end : path.count - 1, tunnel.end);
    const width = i => path.w[i] / 2 + BARRIER_OFFSET + 1.6;
    const H = 10.5;
    if (s.shape === 'arch') {
        // a half pipe of segments over the road
        const parts = 12;
        for (let k = 0; k < parts; k++) {
            const a0 = (k / parts) * Math.PI;
            const a1 = ((k + 1) / parts) * Math.PI;
            const l0 = i => Math.cos(a0) * width(i);
            const l1 = i => Math.cos(a1) * width(i);
            const h0 = i => path.heightAt(i) + Math.sin(a0) * H;
            const h1 = i => path.heightAt(i) + Math.sin(a1) * H;
            const positions = [];
            const uvs = [];
            const indices = [];
            span(path, from, to).forEach(([i, sv], j) => {
                vertex(path, i, l0(i), h0(i), positions);
                vertex(path, i, l1(i), h1(i), positions);
                uvs.push(sv / 10, k / parts, sv / 10, (k + 1) / parts);
                if (j > 0) {
                    const a = (j - 1) * 2;
                    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
                }
            });
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
            geometry.setIndex(indices);
            geometry.computeVertexNormals();
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            g.add(mesh);
        }
        // rings at both ends
        for (const end of [from, to]) {
            const p = path.pointAt(end);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(width(end), 0.8, 8, 24, Math.PI), dark);
            ring.position.set(p.x, p.y, p.z);
            ring.rotation.y = p.yaw;
            ring.castShadow = true;
            g.add(ring);
        }
        return g;
    }
    // a box: two side walls, the roof, the flaps at both ends
    for (const sign of [1, -1]) {
        const side = new THREE.Mesh(wall(path, i => sign * width(i), i => path.y[i] - 0.05, i => path.heightAt(i) + H, { from, to, uvScale: 1 / 26 }), material);
        side.castShadow = true;
        side.receiveShadow = true;
        g.add(side);
    }
    const roof = new THREE.Mesh(ribbon(path, i => width(i), i => -width(i), H, { from, to, uvScale: 1 / 26 }), material);
    roof.castShadow = true;
    g.add(roof);
    if (tunnel.style === 'crate') return g;
    for (const [end, dir] of [[from, -1], [to, 1]]) {
        // the box's flap, folded open outwards
        const p = path.pointAt(end);
        const flapH = H * 0.5;
        const flap = new THREE.Mesh(new THREE.PlaneGeometry(width(end) * 2, flapH), dark);
        flap.position.set(0, flapH / 2, 0);
        const pivot = new THREE.Group();
        pivot.rotation.order = 'YXZ';
        pivot.rotation.set(0.9, p.yaw + (dir < 0 ? Math.PI : 0), 0);
        pivot.position.set(p.x, p.y + H, p.z);
        pivot.add(flap);
        g.add(pivot);
    }
    return g;
}

function buildGantry(track, style) {
    const p = track.pointAt(0);
    const i = 0;
    const span = track.w[i] / 2 + 3.2;
    const { nx, nz } = track.normalAt(i);
    const g = new THREE.Group();
    const postMaterial = toon(style.gantry ?? PALETTE.dark);
    const height = 13;
    for (const sign of [1, -1]) {
        const post = new THREE.Mesh(roundBoxGeometry(1.4, height, 1.4, 0.3), postMaterial);
        post.position.set(p.x + nx * span * sign, p.y + height / 2, p.z + nz * span * sign);
        post.castShadow = true;
        g.add(post);
        const foot = new THREE.Mesh(roundBoxGeometry(2.6, 0.8, 2.6, 0.3), postMaterial);
        foot.position.set(p.x + nx * span * sign, p.y + 0.4, p.z + nz * span * sign);
        g.add(foot);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 1.4, 3.2, 0.5), [
        toon(PALETTE.red), toon(PALETTE.red), toon(PALETTE.red), toon(PALETTE.red),
        toon(0xffffff, { map: bannerTexture('START · ZIEL') }), toon(0xffffff, { map: bannerTexture('TURBO TOYS') }),
    ]);
    banner.position.set(p.x, p.y + height - 1.2, p.z);
    banner.rotation.y = p.yaw + Math.PI;
    banner.castShadow = true;
    g.add(banner);
    // the start lights (red bulbs: race.js lights them through userData)
    const lights = [];
    for (let k = 0; k < 3; k++) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), flat(0x3a0a08, { unique: true }));
        const off = (k - 1) * 1.6;
        bulb.position.set(p.x + nx * off, p.y + height - 3.4, p.z + nz * off);
        g.add(bulb);
        lights.push(bulb);
    }
    g.userData.keep = true;
    g.userData.startLights = lights;
    g.name = 'gantry';
    return g;
}

function buildBarriers(track, path, style, quality, open) {
    const kind = style.barrier ?? 'wall';
    const n = path.count;
    const colors = (style.barrierColors ?? ['#e2392f', '#f7f3ea']).map(c => new THREE.Color(c));
    const group = new THREE.Group();
    const wallTexture = () => canvasTexture(64, 32, (ctx, w, h) => {
        ctx.fillStyle = '#' + colors[0].getHexString();
        ctx.fillRect(0, 0, w / 2, h);
        ctx.fillStyle = '#' + (colors[1] ?? colors[0]).getHexString();
        ctx.fillRect(w / 2, 0, w / 2, h);
    }, { repeat: [1, 1] });

    // continuous walls: everywhere for kind 'wall', and always on the rails of a looping
    const walls = (skip, material) => {
        for (const sign of [1, -1]) {
            const lateral = i => sign * (path.w[i] / 2 + BARRIER_OFFSET);
            const y0 = i => (path.rail[i] ? path.y[i] : path.y[i] - 0.05);
            const y1 = i => path.heightAt(i) + 2.0;
            const s = i => skip(i, sign);
            const m = new THREE.Mesh(wall(path, lateral, y0, y1, { uvScale: 1 / 6, skip: s }), material);
            m.castShadow = true;
            m.receiveShadow = true;
            group.add(m);
            const outer = i => sign * (path.w[i] / 2 + BARRIER_OFFSET + 0.8);
            const inner = i => sign * (path.w[i] / 2 + BARRIER_OFFSET);
            const cap = new THREE.Mesh(ribbon(path, sign > 0 ? outer : inner, sign > 0 ? inner : outer, 2.0, { uvScale: 1 / 6, skip: s }), material);
            group.add(cap);
        }
    };
    const wallMaterial = toon(0xffffff, { map: wallTexture(), side: THREE.DoubleSide });
    if (path.hasRail) walls((i, sign) => !path.rail[i] && !path.rail[path.wrap(i + 1)] && !path.rail[path.wrap(i - 1)], wallMaterial);
    if (kind === 'none') return group;
    if (kind === 'wall') {
        walls((i, sign) => path.rail[i] === 1 || open[sign][i] === 1, wallMaterial);
        return group;
    }

    // discrete pieces along both edges: instanced
    const spacing = { blocks: 2.7, books: 1.5, stones: 2.4, cans: 2.3 }[kind] ?? 2.5;
    const pieces = [];
    for (const sign of [1, -1]) {
        let carry = 0;
        for (let i = 0; i < n; i++) {
            const next = path.wrap(i + 1);
            if (next === i) break;
            carry += Math.hypot(path.x[next] - path.x[i], path.z[next] - path.z[i]);
            if (carry < spacing) continue;
            carry -= spacing;
            if (path.rail[i] || open[sign][i]) continue;
            const { nx, nz } = path.normalAt(i);
            const l = sign * (path.w[i] / 2 + BARRIER_OFFSET + 0.6);
            pieces.push({ x: path.x[i] + nx * l, y: path.y[i], z: path.z[i] + nz * l, yaw: Math.atan2(path.tx[i], path.tz[i]), k: pieces.length });
        }
    }
    if (!pieces.length) return group;
    const rng = seeded('barrier' + track.key + path.id);
    let geometry;
    const material = toon(0xffffff);
    if (kind === 'blocks') geometry = roundBoxGeometry(2.4, 2.4, 2.4, 0.25, 1);
    else if (kind === 'books') geometry = new THREE.BoxGeometry(0.9, 3.0, 2.6);
    else if (kind === 'stones') geometry = roundBoxGeometry(2.2, 1.6, 1.6, 0.55, 1);
    else geometry = new THREE.CylinderGeometry(0.95, 0.95, 2.6, 14);
    const mesh = new THREE.InstancedMesh(geometry, material, pieces.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const e = new THREE.Euler();
    pieces.forEach((p, k) => {
        let h = 1.2;
        let sc = 1;
        let tilt = 0;
        if (kind === 'books') {
            sc = 0.85 + rng() * 0.35;
            h = 1.5 * sc;
            tilt = (rng() - 0.5) * 0.12;
        } else if (kind === 'stones') {
            sc = 0.8 + rng() * 0.4;
            h = 0.6 * sc;
        } else if (kind === 'cans') {
            h = 1.3;
        }
        e.set(tilt, p.yaw + (kind === 'stones' ? rng() * 0.5 : 0), 0);
        q.setFromEuler(e);
        s.set(kind === 'books' ? 1 : sc, sc, sc);
        pos.set(p.x, p.y + h, p.z);
        m.compose(pos, q, s);
        mesh.setMatrixAt(k, m);
        const c = kind === 'stones' ? colors[0].clone().offsetHSL(0, 0, (rng() - 0.5) * 0.12) : colors[(k + Math.floor(rng() * (kind === 'books' ? colors.length : 1))) % colors.length];
        mesh.setColorAt(k, c);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.keep = true;
    group.add(mesh);
    return group;
}
