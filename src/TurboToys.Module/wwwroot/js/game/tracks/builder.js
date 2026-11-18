// TurboToys · tracks/builder.js – the meshes of a track: the road ribbon (with the kicker ramps), the curbs, the barriers, the skirts under raised
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

/** A ribbon along the track between two lateral offsets (left > right), at the road height + lift. uvScale: v per unit. */
function ribbon(track, left, right, lift, { from = 0, to = track.count, uvScale = 1 / 24, heights = null, closed = true } = {}) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const n = track.count;
    const last = closed && from === 0 && to === n ? n : to - from;
    for (let k = 0; k <= last; k++) {
        const i = (from + k) % n;
        const { nx, nz } = track.normalAt(i);
        const y = (heights ? heights(i) : track.heightAt(i)) + lift;
        const l = typeof left === 'function' ? left(i) : left;
        const r = typeof right === 'function' ? right(i) : right;
        positions.push(track.x[i] + nx * l, y, track.z[i] + nz * l, track.x[i] + nx * r, y, track.z[i] + nz * r);
        const v = (k === last && closed && to === n ? track.length : track.s[i] - track.s[from]) * uvScale;
        uvs.push(0, v, 1, v);
        if (k > 0) {
            const a = (k - 1) * 2;
            indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
}

/** A vertical wall along the track at a lateral offset from y0(i) to y1(i). */
function wall(track, lateral, y0, y1, { uvScale = 1 / 12 } = {}) {
    const positions = [];
    const uvs = [];
    const indices = [];
    const n = track.count;
    for (let k = 0; k <= n; k++) {
        const i = k % n;
        const { nx, nz } = track.normalAt(i);
        const l = typeof lateral === 'function' ? lateral(i) : lateral;
        const x = track.x[i] + nx * l;
        const z = track.z[i] + nz * l;
        positions.push(x, y0(i), z, x, y1(i), z);
        const v = (k === n ? track.length : track.s[i]) * uvScale;
        uvs.push(v, 0, v, 1);
        if (k > 0) {
            const a = (k - 1) * 2;
            indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
}

/**
 * Builds the road of a track in the style of its theme.
 * @param {import('./track.js').Track} track
 * @param {object} style theme.road
 * @param {{ quality?: string }} options
 * @returns {{ group: THREE.Group, boostMeshes: THREE.Mesh[], update: (dt:number, time:number)=>void }}
 */
export function buildRoad(track, style, { quality = 'high' } = {}) {
    const root = new THREE.Group();
    root.name = 'road';
    const n = track.count;
    const half = i => track.w[i] / 2;

    // ---- the road surface
    const surfaceTexture = roadTexture(style);
    const road = new THREE.Mesh(ribbon(track, i => half(i), i => -half(i), 0.02, { uvScale: 1 / 26 }), toon(0xffffff, { map: surfaceTexture, steps: 3 }));
    road.receiveShadow = true;
    road.name = 'surface';
    root.add(road);

    // ---- curbs: striped bands at both edges
    const curbTexture = canvasTexture(64, 64, (ctx, w, h) => {
        ctx.fillStyle = style.curb?.[0] ?? '#e2392f';
        ctx.fillRect(0, 0, w, h / 2);
        ctx.fillStyle = style.curb?.[1] ?? '#f7f3ea';
        ctx.fillRect(0, h / 2, w, h / 2);
    }, { repeat: [1, 1] });
    const curbMaterial = toon(0xffffff, { map: curbTexture });
    for (const sign of [1, -1]) {
        const inner = i => sign * (half(i) - 0.2);
        const outer = i => sign * (half(i) + 1.0);
        const g = sign > 0 ? ribbon(track, outer, inner, 0.12, { uvScale: 1 / 5 }) : ribbon(track, inner, outer, 0.12, { uvScale: 1 / 5 });
        const curb = new THREE.Mesh(g, curbMaterial);
        curb.receiveShadow = true;
        root.add(curb);
    }

    // ---- skirts under raised road (planks, book spines …): from the floor to the road edge
    const raised = [];
    for (let i = 0; i < n; i++) if (track.heightAt(i) > 0.25) raised.push(i);
    if (raised.length) {
        const skirtMaterial = toon(style.skirt ?? PALETTE.wood, { side: THREE.DoubleSide });
        for (const sign of [1, -1]) {
            const outer = i => sign * (half(i) + BARRIER_OFFSET + 1.9);
            const raisedTop = i => (track.y[i] > 0.25 ? track.y[i] + 0.05 : -0.05);
            const g = wall(track, outer, () => -0.05, raisedTop);
            const skirt = new THREE.Mesh(g, skirtMaterial);
            skirt.castShadow = true;
            skirt.receiveShadow = true;
            root.add(skirt);
            // the shoulder between the curb and the skirt carries the barrier on raised parts
            const left = sign > 0 ? outer : i => sign * (half(i) + 0.9);
            const right = sign > 0 ? i => sign * (half(i) + 0.9) : outer;
            const shoulder = new THREE.Mesh(ribbon(track, left, right, 0, { heights: raisedTop, uvScale: 1 / 12 }), skirtMaterial);
            shoulder.receiveShadow = true;
            root.add(shoulder);
        }
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
        const from = jump.start;
        const top = new THREE.Mesh(
            ribbon(track, i => half(i) * 0.86, i => -half(i) * 0.86, 0.06, { from, to: from + jump.length, closed: false, uvScale: 1 / 6 }),
            toon(0xffffff, { map: kickerTexture }));
        top.receiveShadow = true;
        top.castShadow = true;
        root.add(top);
        // the sides and the back face (the drop)
        const sides = [];
        for (let k = 0; k < jump.length; k++) {
            const i = (from + k) % n;
            const j = (from + k + 1) % n;
            for (const sign of [1, -1]) {
                const a = track.normalAt(i);
                const b = track.normalAt(j);
                const la = sign * half(i) * 0.86;
                const lb = sign * half(j) * 0.86;
                const p0 = [track.x[i] + a.nx * la, track.y[i], track.z[i] + a.nz * la];
                const p1 = [track.x[i] + a.nx * la, track.heightAt(i) + 0.06, track.z[i] + a.nz * la];
                const p2 = [track.x[j] + b.nx * lb, track.y[j], track.z[j] + b.nz * lb];
                const p3 = [track.x[j] + b.nx * lb, track.heightAt(j) + 0.06, track.z[j] + b.nz * lb];
                if (sign > 0) sides.push(...p0, ...p2, ...p1, ...p1, ...p2, ...p3);
                else sides.push(...p0, ...p1, ...p2, ...p1, ...p3, ...p2);
            }
        }
        const endI = (from + jump.length - 1) % n;
        const e = track.normalAt(endI);
        const hw = half(endI) * 0.86;
        const yTop = track.heightAt(endI) + 0.06;
        const yBase = track.y[endI];
        const L = [track.x[endI] + e.nx * hw, track.z[endI] + e.nz * hw];
        const R = [track.x[endI] - e.nx * hw, track.z[endI] - e.nz * hw];
        sides.push(L[0], yBase, L[1], R[0], yBase, R[1], L[0], yTop, L[1], L[0], yTop, L[1], R[0], yBase, R[1], R[0], yTop, R[1]);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(sides, 3));
        g.computeVertexNormals();
        const wedge = new THREE.Mesh(g, toon(style.kicker?.[2] ?? style.skirt ?? PALETTE.wood, { side: THREE.DoubleSide }));
        wedge.castShadow = true;
        root.add(wedge);
    }

    // ---- barriers
    const barrier = buildBarriers(track, style, quality);
    if (barrier) root.add(barrier);

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
        mesh.position.set(b.x, b.y + 0.09, b.z);
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
        },
    };
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

function buildBarriers(track, style, quality) {
    const kind = style.barrier ?? 'wall';
    if (kind === 'none') return null;
    const n = track.count;
    const colors = (style.barrierColors ?? ['#e2392f', '#f7f3ea']).map(c => new THREE.Color(c));
    const group = new THREE.Group();

    if (kind === 'wall') {
        const tex = canvasTexture(64, 32, (ctx, w, h) => {
            ctx.fillStyle = '#' + colors[0].getHexString();
            ctx.fillRect(0, 0, w / 2, h);
            ctx.fillStyle = '#' + (colors[1] ?? colors[0]).getHexString();
            ctx.fillRect(w / 2, 0, w / 2, h);
        }, { repeat: [1, 1] });
        const material = toon(0xffffff, { map: tex, side: THREE.DoubleSide });
        for (const sign of [1, -1]) {
            const lateral = i => sign * (track.w[i] / 2 + BARRIER_OFFSET);
            const y0 = i => track.y[i] - 0.05;
            const y1 = i => track.heightAt(i) + 2.0;
            const inner = wall(track, lateral, y0, y1, { uvScale: 1 / 6 });
            const m = new THREE.Mesh(inner, material);
            m.castShadow = true;
            m.receiveShadow = true;
            group.add(m);
            // the top cap
            const cap = new THREE.Mesh(ribbon(track, i => (sign > 0 ? track.w[i] / 2 + BARRIER_OFFSET + 0.8 : -(track.w[i] / 2 + BARRIER_OFFSET)), i => (sign > 0 ? track.w[i] / 2 + BARRIER_OFFSET : -(track.w[i] / 2 + BARRIER_OFFSET + 0.8)), 2.0, { uvScale: 1 / 6 }), material);
            group.add(cap);
        }
        return group;
    }

    // discrete pieces along both edges: instanced
    const spacing = { blocks: 2.7, books: 1.5, stones: 2.4, cans: 2.3 }[kind] ?? 2.5;
    const pieces = [];
    for (const sign of [1, -1]) {
        let carry = 0;
        for (let i = 0; i < n; i++) {
            const next = (i + 1) % n;
            const segment = Math.hypot(track.x[next] - track.x[i], track.z[next] - track.z[i]) * (1 + sign * 0); // ~1
            carry += segment;
            if (carry < spacing) continue;
            carry -= spacing;
            const { nx, nz } = track.normalAt(i);
            const l = sign * (track.w[i] / 2 + BARRIER_OFFSET + 0.6);
            pieces.push({ x: track.x[i] + nx * l, y: track.y[i], z: track.z[i] + nz * l, yaw: Math.atan2(track.tx[i], track.tz[i]), k: pieces.length });
        }
    }
    const rng = seeded('barrier' + track.key);
    let geometry;
    let material = toon(0xffffff);
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
