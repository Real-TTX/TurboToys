// TurboToys · cars/parts.js – the modelling helpers of the RC cars (cars/models.js):
//   G.*            : raw geometries (box, round box, cylinder, lathe, side-profile extrusion, tube between two points …)
//   Parts          : collects geometries per material and merges them into one mesh per material (few draw calls per car)
//   wheelParts     : a chunky toy wheel (tyre with tread blocks, coloured rim with spokes, chrome hub), rolling axis = x
//   decalAtlas     : one canvas per car: paint + decals (stripes, flames, stars, checker, bolt) + race number, mapped onto the shells
//   gun, antenna, glass streaks, drive units (battery / nitro engine / blower + pipes)
// Units: 1 = 10 cm. The car faces +z, its left side is +x.

import * as THREE from 'three';
import { toon, flat, roundBoxGeometry, canvasTexture, mergeGeometries } from '../render/toon.js';

export const INK = '#14100c';
export const WHITE = '#f7f3ea';
const PI = Math.PI;

// ------------------------------------------------------------------ transforms

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Moves/turns/scales a geometry in place: { x, y, z, rx, ry, rz, s | sx, sy, sz, order }. */
export function place(g, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sx = s, sy = s, sz = s, order = 'XYZ' } = {}) {
    _e.set(rx, ry, rz, order);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    return g.applyMatrix4(_m);
}

// ------------------------------------------------------------------ profiles

/** A closed outline from [x, y, cornerRadius?] points: corners with a radius are rounded (quadratic fillet with `seg` steps). */
export function outline(points, seg = 3) {
    const out = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const [x, y, r = 0] = points[i];
        if (!r || seg < 1) {
            out.push(new THREE.Vector2(x, y));
            continue;
        }
        const [ax, ay] = points[(i + n - 1) % n];
        const [bx, by] = points[(i + 1) % n];
        const la = Math.hypot(ax - x, ay - y);
        const lb = Math.hypot(bx - x, by - y);
        const rr = Math.min(r, la * 0.45, lb * 0.45);
        const p0x = x + (ax - x) / la * rr, p0y = y + (ay - y) / la * rr;
        const p2x = x + (bx - x) / lb * rr, p2y = y + (by - y) / lb * rr;
        for (let s = 0; s <= seg; s++) {
            const t = s / seg, u = 1 - t;
            out.push(new THREE.Vector2(u * u * p0x + 2 * u * t * x + t * t * p2x, u * u * p0y + 2 * u * t * y + t * t * p2y));
        }
    }
    return out;
}

/** The points of a wheel arch (front → rear, z decreasing) cut into a side profile whose lower edge is at ySill. */
export function arch(zc, yc, ra, ySill, seg = 8) {
    const t0 = Math.asin(Math.max(-1, Math.min(1, (ySill - yc) / ra)));
    const points = [];
    for (let i = 0; i <= seg; i++) {
        const t = t0 + (PI - 2 * t0) * i / seg;
        points.push([zc + ra * Math.cos(t), yc + ra * Math.sin(t)]);
    }
    return points;
}

/** Smooth normals across edges flatter than `angle` degrees, hard edges (ink lines) above – for non-indexed geometry. */
export function creaseNormals(g, angle = 40) {
    if (g.index) g = g.toNonIndexed();
    const pos = g.attributes.position.array;
    const count = pos.length / 3;
    const tris = count / 3;
    const fn = new Float32Array(tris * 3);
    const fu = new Float32Array(tris * 3);
    for (let t = 0; t < tris; t++) {
        const a = t * 9;
        const ux = pos[a + 3] - pos[a], uy = pos[a + 4] - pos[a + 1], uz = pos[a + 5] - pos[a + 2];
        const vx = pos[a + 6] - pos[a], vy = pos[a + 7] - pos[a + 1], vz = pos[a + 8] - pos[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz);
        fn[t * 3] = nx; fn[t * 3 + 1] = ny; fn[t * 3 + 2] = nz;
        if (l > 1e-12) { fu[t * 3] = nx / l; fu[t * 3 + 1] = ny / l; fu[t * 3 + 2] = nz / l; }
    }
    const map = new Map();
    for (let i = 0; i < count; i++) {
        const key = `${Math.round(pos[i * 3] * 1000)}|${Math.round(pos[i * 3 + 1] * 1000)}|${Math.round(pos[i * 3 + 2] * 1000)}`;
        let list = map.get(key);
        if (!list) map.set(key, list = []);
        list.push(i);
    }
    const cos = Math.cos(angle * PI / 180);
    const normals = new Float32Array(count * 3);
    for (const list of map.values()) {
        for (const i of list) {
            const t = (i / 3) | 0;
            let sx = 0, sy = 0, sz = 0;
            for (const j of list) {
                const u = (j / 3) | 0;
                if (fu[t * 3] * fu[u * 3] + fu[t * 3 + 1] * fu[u * 3 + 1] + fu[t * 3 + 2] * fu[u * 3 + 2] >= cos) {
                    sx += fn[u * 3]; sy += fn[u * 3 + 1]; sz += fn[u * 3 + 2];
                }
            }
            let l = Math.hypot(sx, sy, sz);
            if (l < 1e-12) { sx = fu[t * 3]; sy = fu[t * 3 + 1]; sz = fu[t * 3 + 2]; l = Math.hypot(sx, sy, sz) || 1; if (l === 1 && !sx && !sy && !sz) sy = 1; }
            normals[i * 3] = sx / l; normals[i * 3 + 1] = sy / l; normals[i * 3 + 2] = sz / l;
        }
    }
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    return g;
}

// ------------------------------------------------------------------ geometries

const UP = new THREE.Vector3(0, 1, 0);

export const G = {
    box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
    rbox: (w, h, d, r, s = 1) => (s > 0 ? roundBoxGeometry(w, h, d, r, s) : new THREE.BoxGeometry(w, h, d)),
    cyl: (rt, rb, h, seg = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
    sphere: (r, ws = 14, hs = 10) => new THREE.SphereGeometry(r, ws, hs),
    torus: (r, tube, rs = 6, ts = 20) => new THREE.TorusGeometry(r, tube, rs, ts),
    lathe: (profile, seg = 16) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg),
    /** A flat shape in the xy plane (z = 0), facing +z. */
    flatShape: points => new THREE.ShapeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)))),

    /**
     * A side profile ([z, y, cornerRadius?] points) extruded across the car (x), centred on x = 0, with rounded (bevelled) long edges.
     * taper(z, y) → x scale lets noses and tails narrow in the top view.
     */
    extrude(points, width, { bevel = 0.07, segs = 2, fillet = 3, crease = 40, taper = null } = {}) {
        const shape = new THREE.Shape(outline(points, fillet));
        bevel = segs > 0 ? Math.min(bevel, width * 0.3) : 0;
        const depth = Math.max(0.004, width - 2 * bevel);
        const g = new THREE.ExtrudeGeometry(shape, {
            depth, steps: 1, curveSegments: 1,
            bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: Math.max(1, segs),
        });
        g.translate(0, 0, -depth / 2);
        g.rotateY(-PI / 2); // shape x → car z, extrusion → car x
        if (taper) {
            const p = g.attributes.position;
            for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * taper(p.getZ(i), p.getY(i)));
        }
        g.deleteAttribute('normal');
        return creaseNormals(g, crease);
    },

    /** A round bar from a to b (arrays or vectors). */
    tube(a, b, r, seg = 8) {
        const A = Array.isArray(a) ? new THREE.Vector3(...a) : a;
        const B = Array.isArray(b) ? new THREE.Vector3(...b) : b;
        const dir = B.clone().sub(A);
        const g = new THREE.CylinderGeometry(r, r, dir.length(), seg, 1, true);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
        g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
        return g;
    },

    /** A band of arch (fender flare) around a wheel: profile ring between ra and ra + thick above ySill, extruded `width` wide. */
    flare(zc, yc, ra, thick, ySill, width, seg = 8) {
        const outer = arch(zc, yc, ra + thick, ySill, seg);
        const inner = arch(zc, yc, ra, ySill, seg).reverse();
        return G.extrude([...outer, ...inner], width, { bevel: Math.min(0.05, width * 0.3), segs: 1, fillet: 0, crease: 50 });
    },
};

/** Collects geometries per material; meshes() merges every bucket into one mesh. */
export class Parts {
    constructor() {
        this.buckets = new Map();
    }

    /** Adds a geometry (it is consumed: converted, moved, merged) with an optional placement. */
    add(geometry, material, at = null) {
        let g = geometry;
        if (g.index) {
            g = geometry.toNonIndexed();
            geometry.dispose();
        }
        if (at) place(g, at);
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        let list = this.buckets.get(material);
        if (!list) this.buckets.set(material, list = []);
        list.push(g);
        return g;
    }

    get empty() {
        return this.buckets.size === 0;
    }

    meshes({ cast = true } = {}) {
        const out = [];
        for (const [material, list] of this.buckets) {
            const geometry = list.length === 1 ? list[0] : mergeGeometries(list);
            if (list.length > 1) list.forEach(g => g.dispose());
            geometry.clearGroups();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = cast;
            mesh.receiveShadow = true;
            out.push(mesh);
        }
        this.buckets.clear();
        return out;
    }

    into(parent, options) {
        for (const m of this.meshes(options)) parent.add(m);
        return parent;
    }
}

// ------------------------------------------------------------------ wheels

/**
 * The parts of one wheel (outer face +x, rolling axis x, centre at the origin).
 * spec: { r, w, tread: 'road'|'rally'|'offroad'|'knobby'|'slick', rim: 'spoke'|'dish'|'star', spokes, rimRatio }
 */
export function wheelParts(spec, M, detail = 1) {
    const { r, w, tread = 'road', rim = 'spoke', spokes = 5 } = spec;
    const P = new Parts();
    const h = w / 2;
    const ri = r * (spec.rimRatio ?? 0.6);
    const knob = { knobby: 0.11, offroad: 0.085, rally: 0.06, road: 0.045, slick: 0 }[tread] * r;
    const rt = r - knob;
    const low = detail < 0.75;
    const radial = low ? 12 : Math.round(24 * detail);
    // the carcass: rounded shoulders, the sidewall bulges a little
    const profile = low
        ? [[ri, -h * 0.9], [rt * 0.9, -h], [rt, -h * 0.8], [rt, h * 0.8], [rt * 0.9, h], [ri, h * 0.9]]
        : [[ri, -h * 0.9], [rt * 0.84, -h], [rt * 0.96, -h * 0.94], [rt, -h * 0.74], [rt, h * 0.74], [rt * 0.96, h * 0.94], [rt * 0.84, h], [ri, h * 0.9]];
    if (tread === 'slick') profile.splice(4, 0, [rt, -h * 0.16], [rt * 1.04, -h * 0.1], [rt * 1.04, h * 0.1], [rt, h * 0.16]); // a ridge in the middle
    P.add(G.lathe(profile, radial), M.tyre, { rz: -PI / 2 });
    // tread blocks (in rows, staggered)
    if (knob > 0) {
        const rows = low ? [[0, tread === 'road' ? 0.82 : 0.7, 0]] : {
            knobby: [[-0.25, 0.4, 0], [0.25, 0.4, 0.5]],
            offroad: [[-0.17, 0.6, 0], [0.17, 0.6, 0.5]],
            rally: [[-0.23, 0.38, 0], [0.23, 0.38, 0.5]],
            road: [[0, 0.82, 0]],
        }[tread];
        const n = Math.round({ knobby: 12, offroad: 12, rally: 14, road: 16 }[tread] * (low ? 0.55 : detail < 1 ? 0.75 : 1));
        const arc = 2 * PI * rt / n;
        const len = arc * (tread === 'road' ? 0.6 : tread === 'offroad' ? 0.46 : 0.52);
        for (const [off, width, phase] of rows) {
            for (let i = 0; i < n; i++) {
                const a = (i + phase) / n * 2 * PI;
                const R = rt + knob / 2 - 0.01;
                P.add(G.box(w * width, knob + 0.02, len), M.tyre, { x: off * w, y: Math.cos(a) * R, z: Math.sin(a) * R, rx: a });
            }
        }
    }
    if (spec.stripe) P.add(G.torus((ri + rt) * 0.52, 0.025, 4, radial), toon(spec.stripe), { x: h * 0.97, ry: PI / 2 });
    // the rim: dark dish inside, coloured lip and spokes, chrome hub
    const face = h * 0.78;
    P.add(G.cyl(ri * 0.98, ri * 0.98, w * 0.8, radial), M.tyre, { rz: PI / 2 });
    P.add(G.torus(ri * 0.9, ri * 0.11, low ? 3 : detail < 1 ? 4 : 6, radial), M.rim, { x: face, ry: PI / 2 });
    if (rim === 'dish') {
        P.add(G.cyl(ri * 0.86, ri * 0.86, 0.06, radial), M.rim, { x: face - 0.02, rz: PI / 2 });
        for (let i = 0; i < (low ? 0 : spokes); i++) {
            const a = i / spokes * 2 * PI;
            P.add(G.cyl(ri * 0.17, ri * 0.17, 0.05, low ? 6 : 10), M.tyre, { x: face + 0.005, y: Math.cos(a) * ri * 0.56, z: Math.sin(a) * ri * 0.56, rz: PI / 2 });
        }
    } else {
        const thin = rim === 'star' ? 0.16 : 0.28;
        for (let i = 0; i < spokes; i++) {
            const a = i / spokes * 2 * PI;
            P.add(G.box(0.08, ri * 0.86, ri * thin), M.rim, { x: face, y: Math.cos(a) * ri * 0.45, z: Math.sin(a) * ri * 0.45, rx: a });
        }
    }
    P.add(G.cyl(ri * 0.3, ri * 0.36, 0.12, low ? 8 : 12), M.hub, { x: face, rz: PI / 2 });
    P.add(G.cyl(ri * 0.13, ri * 0.13, 0.06, 6), M.hub, { x: Math.min(face + 0.07, h - 0.01), rz: PI / 2 });
    return P;
}

// ------------------------------------------------------------------ glass highlight

/** Two slanted white streaks on a window: c = centre, u/v = half extents in the window plane, n = outward normal. */
export function streakGeometry(c, u, v, n) {
    const bands = [[-0.32, 0.34], [0.24, 0.12]];
    const pos = [];
    const pt = (s, t) => c.clone().addScaledVector(u, s).addScaledVector(v, t).addScaledVector(n, 0.014);
    for (const [s0, wd] of bands) {
        const a = pt(s0 + 0.38, -0.82), b = pt(s0 + 0.38 + wd, -0.82), d = pt(s0 - 0.38 + wd, 0.82), e = pt(s0 - 0.38, 0.82);
        const quad = [a, b, d, a, d, e];
        const normal = b.clone().sub(a).cross(d.clone().sub(a));
        if (normal.dot(n) < 0) quad.reverse();
        for (const p of quad) pos.push(p.x, p.y, p.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const normals = [];
    for (let i = 0; i < pos.length / 3; i++) normals.push(n.x, n.y, n.z);
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return g;
}

// ------------------------------------------------------------------ gun & antenna

/** A small toy machine gun (three barrels, ammo drum), base at the origin, firing along +z. userData.muzzle = local muzzle point. */
export function buildGun(M, detail = 1) {
    const P = new Parts();
    const seg = detail < 1 ? 8 : 12;
    P.add(G.cyl(0.17, 0.22, 0.14, seg), M.dark, { y: 0.07 });
    P.add(G.rbox(0.36, 0.28, 0.6, 0.07, detail < 0.75 ? 0 : 1), M.gunBody, { y: 0.32, z: 0.02 });
    P.add(G.cyl(0.15, 0.15, 0.16, seg), M.yellow, { x: 0.24, y: 0.32, z: -0.04, rz: PI / 2 });
    for (let i = 0; i < 3; i++) {
        const a = i / 3 * 2 * PI;
        P.add(G.cyl(0.045, 0.045, 0.62, 6), M.chrome, { x: Math.cos(a) * 0.07, y: 0.34 + Math.sin(a) * 0.07, z: 0.58, rx: PI / 2 });
    }
    P.add(G.cyl(0.13, 0.13, 0.08, seg), M.dark, { y: 0.34, z: 0.45, rx: PI / 2 });
    P.add(G.cyl(0.13, 0.13, 0.08, seg), M.dark, { y: 0.34, z: 0.84, rx: PI / 2 });
    P.add(G.box(0.06, 0.12, 0.14), M.dark, { y: 0.5, z: 0.18 });
    const gun = P.into(new THREE.Group());
    gun.name = 'gun';
    gun.userData.keep = true;
    gun.userData.muzzle = new THREE.Vector3(0, 0.34, 0.9);
    return gun;
}

/** The RC antenna: a thin black whip leaning back a little, with a coloured ball tip. Pivot at the base (the game wobbles rotation.x/z). */
export function buildAntenna(M, height, tipColor) {
    const P = new Parts();
    P.add(G.cyl(0.026, 0.036, height, 6, true), M.ink, { y: height / 2 });
    P.add(G.sphere(0.1, 10, 8), toon(tipColor), { y: height + 0.05 });
    const lean = P.into(new THREE.Group(), { cast: false });
    lean.rotation.x = -0.12;
    const antenna = new THREE.Group();
    antenna.name = 'antenna';
    antenna.add(lean);
    antenna.userData.keep = true;
    antenna.userData.tip = new THREE.Vector3(0, height + 0.05, 0);
    return antenna;
}

// ------------------------------------------------------------------ drive units

/** A lightning bolt outline (flat, in xy, about 1 unit tall, centred). */
export const BOLT = [[-0.05, 0.5], [0.3, 0.5], [0.08, 0.1], [0.28, 0.1], [-0.2, -0.5], [-0.04, -0.06], [-0.24, -0.06]];

/**
 * Adds the drive unit to the parts: electric (battery pack with a glowing strip, bolt sticker, no exhaust), gas (nitro engine with finned head,
 * fuel tank, chrome pipes) or turbo (chrome blower with a glowing intake scoop, twin big pipes). Returns the exhaust points.
 * a: { bay: { y, z, pitch, tank? }, deck: { y, z, pitch, w, len }, pipes: { y, z, xs, xs2, up? }, fuel: { x, y, z } }
 */
export function addDrive(drive, P, T, M, a, detail = 1) {
    const seg = detail < 0.75 ? 8 : detail < 1 ? 12 : 16;
    const rs = detail < 0.75 ? 0 : 1;
    const onto = (anchor, lx, ly, lz, extra = {}) => {
        const pitch = anchor.pitch ?? 0;
        const y = ly * Math.cos(pitch) - lz * Math.sin(pitch);
        const z = ly * Math.sin(pitch) + lz * Math.cos(pitch);
        return { x: (anchor.x ?? 0) + lx, y: anchor.y + y, z: anchor.z + z, rx: pitch + (extra.rx ?? 0), ry: extra.ry ?? 0, rz: extra.rz ?? 0, order: 'XYZ' };
    };
    const exhausts = [];
    if (drive === 'electric') {
        const d = a.deck;
        const w = Math.min(0.96, d.w ?? 0.96), len = d.len ?? 0.64, h = 0.27;
        P.add(G.rbox(w, h, len, 0.07, rs), M.battery, onto(d, 0, h / 2 - 0.02, 0));
        for (const s of [1, -1]) P.add(G.rbox(0.13, h + 0.05, len + 0.05, 0.04, rs), M.batteryCap, onto(d, s * (w / 2 - 0.05), h / 2 - 0.02, 0));
        T.add(G.box(w - 0.3, 0.05, 0.12), M.turbo, onto(d, 0, h - 0.0, len * 0.22));
        T.add(G.box(w - 0.3, 0.05, 0.12), M.turbo, onto(d, 0, h - 0.0, -len * 0.3));
        const bolt = G.flatShape(BOLT.map(([x, y]) => [x * 0.42, y * 0.42]));
        P.add(bolt, M.sticker, onto(d, 0, h - 0.01, -len * 0.04, { rx: -PI / 2 }));
        P.add(G.cyl(0.05, 0.05, 0.08, 8), M.red, onto(d, w * 0.28, h + 0.02, -len * 0.38));
        P.add(G.cyl(0.05, 0.05, 0.08, 8), M.ink, onto(d, -w * 0.28, h + 0.02, -len * 0.38));
        return exhausts;
    }
    const b = a.bay;
    const pipes = a.pipes;
    if (drive === 'gas') {
        P.add(G.rbox(0.5, 0.3, 0.52, 0.07, rs), M.metal, onto(b, 0, 0.08, 0));
        const fins = [];
        for (let i = 0, n = detail < 0.75 ? 2 : 5; i <= n; i++) fins.push([0.14, i * 0.07], [0.25, i * 0.07 + 0.012], [0.25, i * 0.07 + 0.035], [0.14, i * 0.07 + 0.047]);
        fins.push([0.12, 0.4], [0.0, 0.41]);
        fins.unshift([0.0, 0.0]);
        P.add(G.lathe(fins, seg), M.chrome, onto(b, 0, 0.2, 0));
        P.add(G.cyl(0.05, 0.06, 0.1, 8), M.red, onto(b, 0, 0.66, 0));
        P.add(G.cyl(0.14, 0.14, 0.2, seg), M.red, onto(b, 0.36, 0.22, 0.04, { rz: PI / 2 }));
        P.add(G.cyl(0.15, 0.15, 0.04, seg), M.chrome, onto(b, 0.47, 0.22, 0.04, { rz: PI / 2 }));
        const [tx, tz] = b.tank ?? [-0.44, -0.04];
        P.add(G.rbox(0.2, 0.42, 0.42, 0.05, rs), M.fuel, onto(b, tx, 0.21, tz));
        P.add(G.box(0.22, 0.03, 0.3), M.dark, onto(b, tx, 0.22, tz, { rx: 0.9 }));
        P.add(G.box(0.22, 0.03, 0.3), M.dark, onto(b, tx, 0.22, tz, { rx: -0.9 }));
        P.add(G.cyl(0.06, 0.06, 0.1, 10), M.chrome, onto(b, tx, 0.44, tz + 0.12));
        P.add(G.box(0.05, 0.06, 0.2), M.dark, onto(b, tx, 0.45, tz - 0.08));
        if (a.fuel) P.add(G.cyl(0.11, 0.11, 0.05, 12), M.chrome, { x: a.fuel.x, y: a.fuel.y, z: a.fuel.z, rz: PI / 2 });
        for (const x of pipes.xs) {
            const tip = new THREE.Vector3(x, pipes.y, pipes.z);
            P.add(G.cyl(0.075, 0.075, 0.55, seg - 2), M.chrome, { x, y: pipes.y, z: pipes.z + 0.27, rx: PI / 2 });
            P.add(G.cyl(0.095, 0.08, 0.1, seg - 2), M.chrome, { x, y: pipes.y, z: pipes.z + 0.04, rx: PI / 2 });
            T.add(G.cyl(0.06, 0.06, 0.02, 10), M.turbo, { x, y: pipes.y, z: pipes.z - 0.012, rx: PI / 2 });
            exhausts.push(tip.add(new THREE.Vector3(0, 0, -0.05)));
        }
        return exhausts;
    }
    // turbo: a blower through the hood, an intake scoop with a glowing mouth, twin big pipes with glowing rings
    P.add(G.rbox(0.66, 0.2, 0.62, 0.05, rs), M.dark, onto(b, 0, 0.04, 0));
    P.add(G.rbox(0.58, 0.36, 0.6, 0.1, rs * 2), M.chrome, onto(b, 0, 0.3, 0));
    for (const s of [-1, 0, 1]) P.add(G.box(0.6, 0.035, 0.05), M.dark, onto(b, 0, 0.3, s * 0.17));
    P.add(G.cyl(0.15, 0.15, 0.08, seg), M.dark, onto(b, 0.12, 0.26, 0.33, { rx: PI / 2 }));
    P.add(G.rbox(0.54, 0.3, 0.5, 0.09, rs * 2), M.scoop, onto(b, 0, 0.6, -0.04));
    P.add(G.box(0.42, 0.2, 0.06), M.ink, onto(b, 0, 0.6, 0.2));
    T.add(G.box(0.36, 0.15, 0.04), M.turbo, onto(b, 0, 0.6, 0.23));
    P.add(G.box(0.04, 0.2, 0.05), M.dark, onto(b, 0, 0.6, 0.24));
    for (const x of pipes.xs2) {
        P.add(G.cyl(0.1, 0.1, 0.55, 12), M.chrome, { x, y: pipes.y, z: pipes.z + 0.27, rx: PI / 2 });
        P.add(G.cyl(0.15, 0.1, 0.16, 12), M.chrome, { x, y: pipes.y, z: pipes.z + 0.07, rx: -PI / 2 });
        T.add(G.cyl(0.11, 0.11, 0.02, 12), M.turbo, { x, y: pipes.y, z: pipes.z - 0.012, rx: PI / 2 });
        exhausts.push(new THREE.Vector3(x, pipes.y, pipes.z - 0.06));
    }
    return exhausts;
}

// ------------------------------------------------------------------ decals

function star(ctx, cx, cy, R, r = R * 0.45, turn = 0) {
    ctx.moveTo(cx + Math.sin(turn) * R, cy + Math.cos(turn) * R);
    for (let i = 1; i < 10; i++) {
        const a = turn + i * PI / 5;
        const rr = i % 2 ? r : R;
        ctx.lineTo(cx + Math.sin(a) * rr, cy + Math.cos(a) * rr);
    }
    ctx.closePath();
}

/** A flame: tongues licking backwards. pt(along, across) maps to drawing units: along 0 = start (front), 1 = longest tip. */
function flame(ctx, pt, n, lengths) {
    const P = (a, c) => pt(a, c);
    ctx.moveTo(...P(0, 1));
    let prevA = 0, prevC = 1;
    for (let i = 0; i < n; i++) {
        const c0 = 1 - 2 * i / n, c1 = 1 - 2 * (i + 1) / n;
        const len = lengths[i % lengths.length];
        const tipC = (c0 + c1) / 2 + 0.28 / n * 2;
        ctx.quadraticCurveTo(...P(prevA + (len - prevA) * 0.55, prevC + 0.05), ...P(len, tipC + 0.18 / n));
        const valleyA = i < n - 1 ? len * 0.3 : 0;
        ctx.quadraticCurveTo(...P(len * 0.62, c1 + 0.02), ...P(valleyA, c1));
        prevA = valleyA;
        prevC = c1;
    }
    ctx.closePath();
}

/**
 * The paint canvas of a car: paint everywhere, decals on the sides (left/right region) and on top, the race number in a white roundel.
 * Faces of the shells are mapped by their normal: ±x → side regions (projected on z/y), up → top region (z/x), the rest → plain paint.
 * opts: { size, paint, accent, pop, decal, number, drive, box: {zmin,zmax,ymin,ymax,w}, panel: {z0,z1,y0,y1}, door: {z,y,r}, topNumber: {z,r}|null }
 */
export function decalAtlas(opts) {
    const S = opts.size;
    const pad = 10;
    const { box } = opts;
    const L = box.zmax - box.zmin, H = box.ymax - box.ymin, W = box.w;
    const ppu = Math.min((S - 2 * pad) / L, (S - 6 * pad) / (2 * H + W));
    const regions = {
        left: { ox: pad, oy: pad },
        right: { ox: pad, oy: 2 * pad + H * ppu },
        top: { ox: pad, oy: 3 * pad + 2 * H * ppu },
    };
    // (drawing units) → canvas pixels, per region
    const mat = {
        left: [-ppu, 0, 0, -ppu, regions.left.ox + box.zmax * ppu, regions.left.oy + box.ymax * ppu],
        right: [ppu, 0, 0, -ppu, regions.right.ox - box.zmin * ppu, regions.right.oy + box.ymax * ppu],
        top: [-ppu, 0, 0, ppu, regions.top.ox + box.zmax * ppu, regions.top.oy + W / 2 * ppu],
    };
    const rect = {
        left: [regions.left.ox, regions.left.oy, L * ppu, H * ppu],
        right: [regions.right.ox, regions.right.oy, L * ppu, H * ppu],
        top: [regions.top.ox, regions.top.oy, L * ppu, W * ppu],
    };
    const lw = 0.032;
    const ink = INK;
    const panel = opts.panel;
    const door = opts.door;
    const kind = opts.decal;

    const texture = canvasTexture(S, S, ctx => {
        ctx.fillStyle = opts.paint;
        ctx.fillRect(0, 0, S, S);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (const side of ['left', 'right']) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(...rect[side]);
            ctx.clip();
            ctx.setTransform(...mat[side]);
            ctx.lineWidth = lw;
            ctx.strokeStyle = ink;
            sideArt(ctx);
            ctx.restore();
            if (opts.number !== null) {
                const [a, , , d, e, f] = mat[side];
                roundel(ctx, a * door.z + e, d * door.y + f, door.r * ppu, 0);
            }
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(...rect.top);
        ctx.clip();
        ctx.setTransform(...mat.top);
        ctx.lineWidth = lw;
        ctx.strokeStyle = ink;
        topArt(ctx);
        ctx.restore();
        if (opts.number !== null && opts.topNumber) {
            const [a, , , d, e, f] = mat.top;
            // hood numbers read from the front (menus), roof numbers from behind (the chase camera)
            roundel(ctx, a * opts.topNumber.z + e, f, opts.topNumber.r * ppu, opts.topNumber.z > 0 ? PI / 2 : -PI / 2);
        }
    });
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;

    function roundel(ctx, px, py, R, turn) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, px, py);
        ctx.rotate(turn);
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, 2 * PI);
        ctx.fillStyle = WHITE;
        ctx.fill();
        ctx.lineWidth = Math.max(3, R * 0.14);
        ctx.strokeStyle = ink;
        ctx.stroke();
        const text = String(opts.number);
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.round(R * (text.length > 1 ? 1.25 : 1.45))}px Bangers, Impact, sans-serif`;
        ctx.fillText(text, 0, R * 0.08);
        ctx.restore();
    }

    function fillStroke(ctx, fill) {
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.stroke();
    }

    // (z, y) drawing units
    function sideArt(ctx) {
        const ph = panel.y1 - panel.y0;
        if (kind === 'stripes') {
            const y = panel.y0 + ph * 0.62;
            ctx.beginPath();
            ctx.rect(box.zmin - 1, y, L + 2, Math.max(0.12, ph * 0.2));
            fillStroke(ctx, opts.accent);
            ctx.beginPath();
            ctx.rect(box.zmin - 1, y - 0.12, L + 2, 0.06);
            fillStroke(ctx, opts.accent);
        } else if (kind === 'flames') {
            const z0 = box.zmax - 0.04, len = Math.max(1.2, z0 - panel.z0 - (panel.z1 - panel.z0) * 0.15);
            const yc = panel.y0 + ph * 0.48, hh = ph * 0.42;
            const pt = (a, c) => [z0 - a * len, yc + c * hh];
            const grad = ctx.createLinearGradient(z0, 0, z0 - len, 0);
            grad.addColorStop(0, '#ffe24a');
            grad.addColorStop(0.45, '#f7931e');
            grad.addColorStop(1, '#e2392f');
            ctx.beginPath();
            flame(ctx, pt, 4, [0.78, 1, 0.66, 0.84]);
            fillStroke(ctx, grad);
            ctx.beginPath();
            flame(ctx, (a, c) => [z0 - a * len * 0.62, yc + c * hh * 0.55 - hh * 0.05], 3, [0.7, 1, 0.75]);
            ctx.fillStyle = '#fff1a6';
            ctx.fill();
        } else if (kind === 'stars') {
            const spots = [[0.12, 0.7, 1], [0.3, 0.3, 0.6], [0.55, 0.78, 0.75], [0.78, 0.38, 1.1], [0.96, 0.72, 0.6], [0.7, 0.92, 0.45], [0.4, 0.06, 0.5]];
            const R = Math.min(0.26, ph * 0.3);
            for (const [u, v, s] of spots) {
                const z = panel.z1 - u * (panel.z1 - panel.z0) + (panel.z1 - panel.z0) * 0.05;
                const y = panel.y0 + v * ph;
                if (Math.hypot(z - door.z, y - door.y) < door.r + R * s) continue;
                ctx.beginPath();
                star(ctx, z, y, R * s, R * s * 0.45, u * 2);
                fillStroke(ctx, opts.pop);
            }
        } else if (kind === 'checker') {
            const s = Math.min(0.15, ph * 0.2);
            const y = panel.y0 + ph * 0.08;
            for (let row = 0; row < 2; row++) {
                for (let i = 0, z = box.zmin; z < box.zmax; i++, z += s) {
                    ctx.fillStyle = (i + row) % 2 ? ink : WHITE;
                    ctx.fillRect(z, y + row * s, s, s);
                }
            }
            ctx.beginPath();
            ctx.rect(box.zmin - 1, y, L + 2, 2 * s);
            ctx.stroke();
        } else if (kind === 'bolt') {
            // the bolt lies along the car: wide end at the front, the tip at the rear
            const across = ph * 1.05;
            const z0 = Math.min(box.zmax - 0.12, panel.z1 + 0.3), len = Math.min(across * 2.5, z0 - (panel.z0 - 0.2));
            const yc = panel.y0 + ph * 0.5;
            ctx.beginPath();
            BOLT.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](z0 - (0.5 - y) * len, yc + (x - 0.03) / 0.54 * across));
            ctx.closePath();
            fillStroke(ctx, opts.pop);
        }
        if (opts.drive === 'electric' && kind !== 'bolt') {
            // a small bolt sticker on the rear quarter
            const z = panel.z0 - 0.05, y = panel.y0 + ph * 0.55, s = Math.min(0.42, ph * 0.6);
            ctx.beginPath();
            BOLT.forEach(([x, yy], i) => ctx[i ? 'lineTo' : 'moveTo'](z + x * s, y + yy * s));
            ctx.closePath();
            fillStroke(ctx, '#3fd8ff');
        }
    }

    // (z, x) drawing units
    function topArt(ctx) {
        const half = W / 2;
        if (kind === 'stripes') {
            for (const s of [1, -1]) {
                ctx.beginPath();
                ctx.rect(box.zmin - 1, s > 0 ? half * 0.1 : -half * 0.1 - half * 0.32, L + 2, half * 0.32);
                fillStroke(ctx, opts.accent);
            }
        } else if (kind === 'flames' && opts.topFlames) {
            const z0 = opts.topFlames.z1, len = opts.topFlames.len;
            const grad = ctx.createLinearGradient(z0, 0, z0 - len, 0);
            grad.addColorStop(0, '#ffe24a');
            grad.addColorStop(0.45, '#f7931e');
            grad.addColorStop(1, '#e2392f');
            ctx.beginPath();
            flame(ctx, (a, c) => [z0 - a * len, c * half * 0.8], 5, [0.7, 0.95, 1, 0.8, 0.62]);
            fillStroke(ctx, grad);
        } else if (kind === 'checker') {
            const s = Math.min(0.15, half * 0.2);
            for (let col = -2; col < 2; col++) {
                for (let i = 0, z = box.zmin; z < box.zmax; i++, z += s) {
                    ctx.fillStyle = (i + col) % 2 ? ink : WHITE;
                    ctx.fillRect(z, col * s, s, s);
                }
            }
            ctx.beginPath();
            ctx.rect(box.zmin - 1, -2 * s, L + 2, 4 * s);
            ctx.stroke();
        } else if (kind === 'bolt' && opts.topFlames) {
            const z0 = opts.topFlames.z1 - 0.05, len = opts.topFlames.len, across = Math.min(half * 1.4, len / 1.7);
            ctx.beginPath();
            BOLT.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](z0 - (0.5 - y) * len, (x - 0.03) / 0.54 * across));
            ctx.closePath();
            fillStroke(ctx, opts.pop);
        } else if (kind === 'stars' && opts.topFlames) {
            const z = opts.topFlames.z1 - opts.topFlames.len * 0.45;
            ctx.beginPath();
            star(ctx, z, 0, Math.min(0.42, half * 0.6), Math.min(0.42, half * 0.6) * 0.45, PI / 2);
            fillStroke(ctx, opts.pop);
        }
    }

    const uvOf = (region, x, y, z) => {
        const [a, b, c, d, e, f] = mat[region];
        const X = region === 'top' ? z : z;
        const Y = region === 'top' ? x : y;
        const px = a * X + c * Y + e;
        const py = b * X + d * Y + f;
        return [px / S, 1 - py / S];
    };
    const plain = [1 - 4 / S, 4 / S];

    /** Writes the uv attribute of a shell geometry (non-indexed). */
    function map(g) {
        const p = g.attributes.position.array;
        const uv = new Float32Array(p.length / 3 * 2);
        for (let t = 0; t < p.length / 9; t++) {
            const i = t * 9;
            const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
            const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const l = Math.hypot(nx, ny, nz) || 1;
            nx /= l; ny /= l; nz /= l;
            const region = nx > 0.8 ? 'left' : nx < -0.8 ? 'right' : ny > 0.45 ? 'top' : null;
            for (let k = 0; k < 3; k++) {
                const j = t * 3 + k;
                const [u, v] = region ? uvOf(region, p[j * 3], p[j * 3 + 1], p[j * 3 + 2]) : plain;
                uv[j * 2] = u;
                uv[j * 2 + 1] = v;
            }
        }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        return g;
    }

    return { texture, map };
}
