// TurboToys · themes/garden-props.js – the plants, garden things and party props of the back garden (garden.js places them).
// Factories return groups standing on y = 0; instanced helpers build the many small plants (grass tufts, tulips, daisies).

import * as THREE from 'three';
import { toon, flat, fx, fxLayer, box, roundBox, cyl, sphere, cone, torus, shape, lathe, at, group, canvasTexture, mergeByMaterial, mergeGeometries } from '../render/toon.js';

export const G = {
    grass: '#6cbf3f',
    grassDark: '#4e9a32',
    grassLight: '#8fd457',
    leaf: '#3f9b4b',
    leafDark: '#2d7a3a',
    hedge: '#3a8a3e',
    soil: '#7a4f2e',
    soilDark: '#5e3a20',
    wood: '#b87a45',
    woodLight: '#d9a066',
    woodDark: '#7a4a26',
    fence: '#f4ead2',
    stone: '#a9a49a',
    stoneLight: '#c9c3b6',
    stoneDark: '#7f7a72',
    water: '#4fb6e0',
    waterDeep: '#2f8fc4',
    red: '#e2392f',
    orange: '#f28c28',
    yellow: '#f6c638',
    pink: '#e86aa6',
    purple: '#7a4bc4',
    blue: '#2f6fd0',
    sky: '#5cb7e6',
    white: '#f7f3ea',
    cream: '#fbf1d8',
    skin: '#f2c19a',
    dark: '#34373d',
    black: '#1c1a1a',
    brown: '#8a5a32',
    teal: '#2aa198',
    lime: '#9bd23c',
};

const scl = (o, x, y = x, z = x) => {
    o.scale.set(x, y, z);
    return o;
};

// ------------------------------------------------------------------ instancing

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();
const c = new THREE.Color();

/** An InstancedMesh of items [{ x, y, z, rx, ry, rz, s, sy, color }] (animated-safe: userData.keep, so the static merge leaves it alone). */
export function instanced(geometry, material, items, { cast = false } = {}) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
    mesh.count = items.length;
    items.forEach((it, k) => {
        e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
        q.setFromEuler(e);
        p.set(it.x, it.y ?? 0, it.z);
        const sc = it.s ?? 1;
        s.set(it.sx ?? sc, it.sy ?? sc, it.sz ?? sc);
        m4.compose(p, q, s);
        mesh.setMatrixAt(k, m4);
        if (it.color !== undefined) mesh.setColorAt(k, c.set(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.userData.keep = true;
    return mesh;
}

/** Merges geometries placed by matrices into one (non-indexed) geometry. */
function combine(parts) {
    const list = parts.map(([geometry, matrix]) => {
        const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
        if (g.attributes.uv) g.deleteAttribute('uv');
        g.applyMatrix4(matrix);
        return g;
    });
    return mergeGeometries(list);
}

const mat = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/** A grass tuft: five blades leaning outwards (about 4 tall at scale 1). */
export function tuftGeometry() {
    const blade = new THREE.ConeGeometry(0.5, 4, 3, 1, true);
    const parts = [];
    for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        const lean = 0.35 + (k % 2) * 0.15;
        parts.push([blade, mat(Math.cos(a) * 0.5, 1.8 - (k % 2) * 0.4, Math.sin(a) * 0.5, Math.sin(a) * lean, 0, -Math.cos(a) * lean, 1, 1 - (k % 2) * 0.25, 1)]);
    }
    parts.push([blade, mat(0, 2.2, 0, 0, 0, 0, 1, 1.15, 1)]);
    const g = combine(parts);
    g.computeVertexNormals();
    return g;
}

/** A tulip head (cup with three pointed petals), origin at its base. */
export function tulipHeadGeometry() {
    const g = new THREE.LatheGeometry([[0.01, 0], [1.5, 0.4], [2.1, 1.6], [2.2, 3], [1.5, 4.2]].map(([x, y]) => new THREE.Vector2(x, y)), 8);
    const parts = [[g, mat(0, 0, 0)]];
    for (let k = 0; k < 3; k++) {
        const petal = new THREE.ConeGeometry(1, 2.2, 4);
        const a = (k / 3) * Math.PI * 2;
        parts.push([petal, mat(Math.cos(a) * 1.3, 4.6, Math.sin(a) * 1.3, Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25)]);
    }
    const out = combine(parts);
    out.computeVertexNormals();
    return out;
}

/** A tulip stem with one leaf, origin at the ground, height ~12. */
export function stemGeometry(height = 12) {
    const stem = new THREE.CylinderGeometry(0.35, 0.45, height, 4, 1, true);
    const leaf = new THREE.SphereGeometry(1, 5, 3);
    const out = combine([
        [stem, mat(0, height / 2, 0)],
        [leaf, mat(0.9, 3.5, 0, 0, 0, -0.45, 0.8, 4.2, 0.3)],
        [leaf, mat(-0.8, 2.5, 0.2, 0, 0.6, 0.5, 0.7, 3.2, 0.3)],
    ]);
    out.computeVertexNormals();
    return out;
}

/** A daisy blossom: a thick white disc with scalloped petals (reads from the side too); the yellow centre and the stem are separate parts. */
export function daisyGeometry() {
    const star = new THREE.Shape();
    for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const r = k % 2 ? 1.5 : 2.6;
        if (k === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ExtrudeGeometry(star, { depth: 0.5, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.deleteAttribute('uv');
    return g;
}

// ------------------------------------------------------------------ plants

/** A sunflower, height h (head facing +z, tilted a little down). */
export function sunflower(h = 40, rng) {
    const g = new THREE.Group();
    g.add(at(cyl(0.8, 1.1, h, G.leaf, 6), 0, h / 2, 0));
    for (const [y, side] of [[h * 0.35, 1], [h * 0.55, -1], [h * 0.75, 1]]) {
        const leaf = scl(sphere(1, G.leafDark, 8, 5), 4.2, 0.5, 2.4);
        leaf.position.set(side * 4, y, 0);
        leaf.rotation.z = side * 0.4;
        g.add(leaf);
    }
    const head = new THREE.Group();
    const petals = 14;
    for (let k = 0; k < petals; k++) {
        const a = (k / petals) * Math.PI * 2;
        const petal = cone(1.5, 5, G.yellow, 4);
        petal.position.set(Math.cos(a) * 7.4, Math.sin(a) * 7.4, 0);
        petal.rotation.z = a - Math.PI / 2;
        head.add(petal);
    }
    head.add(at(cyl(6, 6, 1.4, G.orange, 14), 0, 0, 0).rotateX(Math.PI / 2));
    head.add(at(cyl(5, 5.4, 2.4, G.brown, 14), 0, 0, 0.6).rotateX(Math.PI / 2));
    head.position.set(0, h + 2, 1.5);
    head.rotation.x = -0.25 + (rng() - 0.5) * 0.2;
    g.add(head);
    return g;
}

/** A round bush (three spheres), optionally with flowers. */
export function bush(r = 10, color = G.leaf, flowers = null) {
    const g = new THREE.Group();
    g.add(at(sphere(r, color, 12, 9), 0, r * 0.75, 0));
    g.add(at(sphere(r * 0.75, color, 12, 9), r * 0.8, r * 0.55, r * 0.2));
    g.add(at(sphere(r * 0.7, color, 12, 9), -r * 0.7, r * 0.5, -r * 0.3));
    if (flowers) {
        for (let k = 0; k < 7; k++) {
            const a = k * 2.4;
            const y = r * (0.7 + (k % 3) * 0.25);
            g.add(at(sphere(r * 0.13, flowers, 8, 6), Math.cos(a) * r * 0.85, y, Math.sin(a) * r * 0.85));
        }
    }
    return g;
}

/** A big cartoon tree (trunk + clustered canopy). */
export function tree(h = 140, canopy = 55, color = G.leaf) {
    const g = new THREE.Group();
    g.add(at(cyl(canopy * 0.16, canopy * 0.24, h, G.woodDark, 10), 0, h / 2, 0));
    g.add(at(cyl(canopy * 0.3, canopy * 0.35, 6, G.woodDark, 10), 0, 3, 0));
    const blobs = [[0, 0, 0, 1], [0.6, -0.2, 0.2, 0.7], [-0.55, -0.15, -0.25, 0.72], [0.1, 0.45, -0.1, 0.7], [-0.2, -0.25, 0.6, 0.62], [0.25, -0.1, -0.6, 0.6]];
    for (const [x, y, z, r] of blobs) g.add(at(sphere(canopy * r, color, 14, 10), x * canopy, h + y * canopy, z * canopy));
    return g;
}

/** A clump of reeds with bulrush heads. */
export function reeds(rng) {
    const g = new THREE.Group();
    for (let k = 0; k < 7; k++) {
        const h = rng.range(14, 24);
        const x = rng.range(-3, 3);
        const z = rng.range(-3, 3);
        const lean = (rng() - 0.5) * 0.3;
        const stalk = cyl(0.3, 0.45, h, G.leafDark, 4);
        stalk.position.set(x, h / 2, z);
        stalk.rotation.z = lean;
        g.add(stalk);
        if (k % 2 === 0) {
            const head = cyl(0.9, 0.9, 4, G.brown, 6);
            head.position.set(x - Math.sin(lean) * h * 0.85, h * 0.85, z);
            head.rotation.z = lean;
            g.add(head);
        }
    }
    return g;
}

/** A toadstool (red cap with white spots). */
export function toadstool(r = 6) {
    const g = new THREE.Group();
    g.add(at(cyl(r * 0.35, r * 0.45, r * 1.2, G.cream, 10), 0, r * 0.6, 0));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(G.red));
    cap.castShadow = cap.receiveShadow = true;
    cap.position.y = r * 1.1;
    cap.scale.y = 0.75;
    g.add(cap);
    g.add(at(cyl(r * 0.98, r * 0.98, 0.3, G.cream, 14), 0, r * 1.12, 0));
    for (const [a, h] of [[0.3, 0.55], [2.1, 0.5], [4.0, 0.6], [5.2, 0.3], [1.2, 0.2]]) {
        const spot = scl(sphere(r * 0.18, G.white, 8, 6), 1, 0.5, 1);
        const phi = Math.acos(h);
        spot.position.set(Math.cos(a) * Math.sin(phi) * r, r * 1.1 + Math.cos(phi) * r * 0.75, Math.sin(a) * Math.sin(phi) * r);
        g.add(spot);
    }
    g.add(at(scl(sphere(r * 0.2, G.white, 8, 6), 1, 0.5, 1), 0, r * 1.86, 0));
    return g;
}

/** A pumpkin (ribbed: several squashed spheres). */
export function pumpkin(r = 10) {
    const g = new THREE.Group();
    for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.add(at(scl(sphere(r * 0.62, G.orange, 10, 8), 0.75, 0.95, 1), Math.cos(a) * r * 0.35, r * 0.62, Math.sin(a) * r * 0.35, -a));
    }
    g.add(at(cyl(r * 0.1, r * 0.14, r * 0.45, G.leafDark, 6), 0, r * 1.3, 0));
    const leaf = scl(sphere(r * 0.4, G.leaf, 8, 5), 1, 0.2, 0.7);
    leaf.position.set(r * 0.4, r * 1.2, 0);
    g.add(leaf);
    return g;
}

/** A cabbage (layered leaves). */
export function cabbage(r = 7) {
    const g = new THREE.Group();
    g.add(at(sphere(r * 0.7, G.lime, 12, 9), 0, r * 0.7, 0));
    for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const leaf = scl(sphere(r * 0.6, G.leaf, 10, 6), 1, 0.35, 0.8);
        leaf.position.set(Math.cos(a) * r * 0.55, r * 0.35, Math.sin(a) * r * 0.55);
        leaf.rotation.set(0, -a, 0.6);
        g.add(leaf);
    }
    return g;
}

// ------------------------------------------------------------------ garden things

/** The garden gnome (original): purple pointed hat, green coat, white beard, sitting on a toadstool with a fishing rod. ~38 tall. */
export function gnome() {
    const g = new THREE.Group();
    const stool = toadstool(7);
    g.add(stool);
    const body = new THREE.Group();
    body.position.y = 12;
    // legs and boots
    for (const sx of [-1, 1]) {
        const leg = cyl(1.8, 2, 7, G.blue, 8);
        leg.position.set(sx * 2.6, 0.5, 3.6);
        leg.rotation.x = Math.PI / 2 - 0.3;
        body.add(leg);
        body.add(at(scl(sphere(2.4, G.black, 10, 8), 1, 0.8, 1.5), sx * 2.8, -2.5, 8));
    }
    body.add(lathe([[0.01, 0], [6, 0], [6.6, 4], [5.6, 10], [3.5, 13], [0.01, 13.5]], G.leaf, 14));
    body.add(at(cyl(6.4, 6.4, 1.6, G.brown, 14), 0, 3.6, 0));
    body.add(at(box(2.4, 2.2, 0.8, G.yellow), 0, 3.6, 6.3));
    // head, beard, nose, eyes
    body.add(at(sphere(4.6, G.skin, 14, 10), 0, 16, 0.5));
    const beard = cone(5.2, 10, G.white, 12);
    beard.rotation.x = Math.PI;
    beard.position.set(0, 10.5, 3.2);
    body.add(beard);
    body.add(at(sphere(3.6, G.white, 12, 8), 0, 14, 3.4));
    body.add(at(sphere(1.7, '#e88a7a', 10, 8), 0, 16.2, 5.2));
    for (const sx of [-1, 1]) {
        body.add(at(sphere(0.6, G.black, 6, 5), sx * 1.8, 17.6, 4.3));
        body.add(at(scl(sphere(1.2, G.white, 8, 6), 1.4, 0.5, 0.8), sx * 1.9, 18.8, 4));
    }
    // the hat: two cones, the tip bent
    body.add(at(cyl(5.2, 5.4, 1.4, G.yellow, 14), 0, 19.2, 0.4));
    body.add(at(cone(5, 10, G.purple, 14), 0, 24.6, 0.4));
    const tip = cone(2.3, 6, G.purple, 10);
    tip.position.set(0, 30.6, -1.2);
    tip.rotation.x = -0.6;
    body.add(tip);
    body.add(at(sphere(1.1, G.yellow, 8, 6), 0, 33, -3));
    // arms holding the rod
    for (const sx of [-1, 1]) {
        const arm = cyl(1.4, 1.6, 7, G.leaf, 8);
        arm.position.set(sx * 4.6, 9, 3.2);
        arm.rotation.set(1.1, 0, -sx * 0.4);
        body.add(arm);
        body.add(at(sphere(1.5, G.skin, 8, 6), sx * 2.6, 7.2, 6.4));
    }
    const rod = cyl(0.35, 0.5, 40, G.woodDark, 6);
    rod.position.set(0, 14, 20);
    rod.rotation.x = 1.0;
    body.add(rod);
    g.add(body);
    return { group: g, rodTip: new THREE.Vector3(0, 12 + 14 + Math.cos(1.0) * 20, 20 + Math.sin(1.0) * 20) };
}

/** A watering can (green, long spout). */
export function wateringCan(color = G.teal) {
    const g = new THREE.Group();
    g.add(at(cyl(7, 7.5, 13, color, 14), 0, 6.5, 0));
    g.add(at(cyl(7.1, 7.1, 1, G.yellow, 14), 0, 12.4, 0));
    const spout = cyl(0.9, 1.6, 18, color, 8);
    spout.position.set(10, 9, 0);
    spout.rotation.z = -1.0;
    g.add(spout);
    const rose = cyl(2.4, 1.2, 2.4, color, 10);
    rose.position.set(17.5, 14, 0);
    rose.rotation.z = -1.0;
    g.add(rose);
    const handle = torus(6, 1, color, 6, 14, Math.PI);
    handle.position.set(-1, 13, 0);
    g.add(handle);
    return g;
}

/** A hose reel cart. */
export function hoseReel() {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
        const w = cyl(9, 9, 1.6, G.dark, 14);
        w.rotation.x = Math.PI / 2;
        w.position.set(0, 9, s * 8);
        g.add(w);
        g.add(at(box(2, 26, 1.4, G.yellow), -4, 13, s * 7.6).rotateZ(-0.2));
    }
    const drum = cyl(7, 7, 13, '#3f9b4b', 14);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(0, 9, 0);
    g.add(drum);
    for (let k = 0; k < 4; k++) {
        const loop = torus(7.2, 0.9, G.lime, 6, 16);
        loop.position.set(0, 9, -5 + k * 3.3);
        g.add(loop);
    }
    g.add(at(cyl(1, 1, 18, G.yellow, 6), -7, 25.5, 0).rotateX(Math.PI / 2));
    return g;
}

/** The garden hose along a path (points [[x, z], …] at the ground). */
export function hose(points, color = G.lime) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 1.1, z)), false, 'centripetal');
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, points.length * 14), 1.1, 7, false), toon(color));
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
}

/** A stepping stone (flat, roundish). */
export function steppingStone(r = 6, color = G.stoneLight) {
    const m = cyl(r, r * 1.05, 1.2, color, 9);
    m.position.y = 0.6;
    return group(m);
}

/** A picket fence segment of length L (along x), height h. */
export function fenceSegment(L, h = 70, color = G.fence) {
    const g = new THREE.Group();
    const n = Math.max(2, Math.round(L / 7));
    for (let k = 0; k < n; k++) {
        const x = -L / 2 + (k + 0.5) * (L / n);
        g.add(at(box(5, h - 4, 1.6, color), x, (h - 4) / 2, 0));
        const tip = cone(3.55, 4, color, 4);
        tip.rotation.y = Math.PI / 4;
        tip.scale.z = 0.32;
        tip.position.set(x, h, 0);
        g.add(tip);
    }
    g.add(at(box(L, 4, 1.4, color), 0, h * 0.25, -1.4));
    g.add(at(box(L, 4, 1.4, color), 0, h * 0.72, -1.4));
    return g;
}

/** A birdbath (stone bowl on a column). */
export function birdbath() {
    const g = new THREE.Group();
    g.add(at(cyl(7, 9, 3, G.stone, 12), 0, 1.5, 0));
    g.add(lathe([[3, 3], [2.2, 10], [2.6, 20], [3.5, 24]], G.stone, 12));
    g.add(lathe([[3, 24], [12, 26], [14, 29], [13, 29.5], [11, 27.5], [0.01, 27.5]], G.stoneLight, 16));
    g.add(at(cyl(11, 11, 0.4, G.water, 16), 0, 28, 0));
    // a little bird
    const bird = new THREE.Group();
    bird.add(at(scl(sphere(2.2, G.blue, 10, 8), 1.3, 1, 1), 0, 0, 0));
    bird.add(at(sphere(1.6, G.blue, 10, 8), 2.2, 1.6, 0));
    const beak = cone(0.5, 1.6, G.orange, 6);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(4.1, 1.5, 0);
    bird.add(beak);
    bird.add(at(scl(sphere(1.4, G.white, 8, 6), 1.2, 0.8, 0.8), 0.4, -0.6, 0));
    bird.position.set(12, 31.5, 0);
    g.add(bird);
    return g;
}

/** A garden shed (simple and chunky). */
export function shed() {
    const g = new THREE.Group();
    g.add(at(box(90, 90, 70, G.woodLight), 0, 45, 0));
    for (let k = 0; k < 9; k++) g.add(at(box(0.8, 90, 70.4, G.wood), -40 + k * 10, 45, 0));
    for (const s of [-1, 1]) {
        const roof = box(100, 3, 46, G.red);
        roof.position.set(0, 102, s * 19);
        roof.rotation.x = s * 0.55;
        g.add(roof);
    }
    g.add(at(box(70, 26, 1, G.woodLight).rotateX(0), 0, 103, 0));
    g.add(at(box(30, 64, 2, G.teal), -15, 32, 35.5));
    g.add(at(sphere(1.6, G.yellow, 8, 6), -4, 32, 37));
    g.add(at(box(24, 20, 1.5, G.sky), 22, 55, 35.5));
    g.add(at(box(26, 2, 2.5, G.white), 22, 55, 36));
    g.add(at(box(2, 22, 2.5, G.white), 22, 55, 36));
    return g;
}

/** A wheelbarrow. */
export function wheelbarrow() {
    const g = new THREE.Group();
    const tub = lathe([[0.01, 0], [9, 0], [13, 10], [12, 10], [8.6, 1], [0.01, 1]], toon(G.red, { side: THREE.DoubleSide }), 14);
    tub.scale.set(1.3, 1, 0.9);
    tub.position.set(0, 9, 0);
    g.add(tub);
    const wheel = cyl(5, 5, 2.4, G.dark, 12);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(17, 5, 0);
    g.add(wheel);
    for (const s of [-1, 1]) {
        const arm = cyl(0.8, 0.8, 40, G.woodDark, 6);
        arm.rotation.z = Math.PI / 2 - 0.15;
        arm.position.set(-2, 10, s * 7);
        g.add(arm);
        g.add(at(cyl(0.8, 0.8, 9, G.dark, 6), -6, 4.5, s * 7));
    }
    g.add(at(scl(sphere(7, G.soil, 10, 6), 1.5, 0.45, 1), 0, 16.5, 0));
    return g;
}

/** A garden bench. */
export function bench() {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) g.add(at(box(80, 2, 5, G.wood), 0, 26, -7 + k * 5));
    for (let k = 0; k < 3; k++) g.add(at(box(80, 5, 2, G.wood), 0, 36 + k * 7, -11).rotateX(-0.1));
    for (const s of [-1, 1]) {
        g.add(at(box(4, 26, 4, G.dark), s * 35, 13, 6));
        g.add(at(box(4, 52, 4, G.dark), s * 35, 26, -11));
        g.add(at(box(4, 3, 22, G.dark), s * 35, 34, -2));
    }
    return g;
}

// ------------------------------------------------------------------ the party

/** A picnic blanket texture (red/white gingham). */
export function blanketMaterial() {
    return toon(0xffffff, {
        map: canvasTexture(256, 256, (ctx, w, h) => {
            ctx.fillStyle = '#fbf1d8';
            ctx.fillRect(0, 0, w, h);
            const n = 8;
            const cell = w / n;
            ctx.fillStyle = 'rgba(226,57,47,0.55)';
            for (let k = 0; k < n; k += 2) {
                ctx.fillRect(k * cell, 0, cell, h);
                ctx.fillRect(0, k * cell, w, cell);
            }
            ctx.fillStyle = 'rgba(190,30,25,0.6)';
            for (let i = 0; i < n; i += 2) for (let j = 0; j < n; j += 2) ctx.fillRect(i * cell, j * cell, cell, cell);
        }, { repeat: [3, 3] }),
    });
}

/** A layered birthday cake on a stand with candles (flames glow). */
export function cake() {
    const g = new THREE.Group();
    g.add(lathe([[0.01, 0], [5, 0], [2, 1], [1.6, 7], [14, 8], [14, 9], [0.01, 9]], G.white, 16));
    g.add(at(cyl(11, 11, 8, G.pink, 18), 0, 13, 0));
    g.add(at(cyl(11.4, 11.4, 1.6, G.white, 18), 0, 17, 0));
    g.add(at(cyl(7.5, 7.5, 7, G.cream, 18), 0, 21.5, 0));
    g.add(at(cyl(7.9, 7.9, 1.4, G.pink, 18), 0, 25, 0));
    for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.add(at(sphere(1.5, G.red, 8, 6), Math.cos(a) * 9.6, 18.4, Math.sin(a) * 9.6));
    }
    for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const x = Math.cos(a) * 4.5;
        const z = Math.sin(a) * 4.5;
        g.add(at(cyl(0.5, 0.5, 5, [G.blue, G.yellow, G.red, G.teal, G.purple][k], 6), x, 27.5, z));
        g.add(at(scl(sphere(0.8, flat('#ffcc40'), 8, 6), 1, 1.7, 1), x, 31, z));
    }
    return g;
}

/** A paper cup with a straw. */
export function cup(color = G.red) {
    const g = new THREE.Group();
    g.add(lathe([[0.01, 0], [2.8, 0], [3.8, 9], [3.6, 9], [0.01, 8]], color, 12));
    g.add(at(cyl(3.6, 3.6, 0.4, G.orange, 12), 0, 7.6, 0));
    const straw = cyl(0.35, 0.35, 12, G.white, 6);
    straw.position.set(1, 11, 0);
    straw.rotation.z = -0.25;
    g.add(straw);
    return g;
}

/** A plate with a slice of cake or sandwiches. */
export function plate(kind = 'cake') {
    const g = new THREE.Group();
    g.add(at(cyl(7, 5.5, 1, G.white, 16), 0, 0.5, 0));
    if (kind === 'cake') {
        const slice = shape([[0, 0], [7, -2.5], [7, 2.5]], G.pink, 4);
        slice.rotation.x = -Math.PI / 2;
        slice.position.set(-3, 1, 0);
        g.add(slice);
        g.add(at(sphere(1, G.red, 8, 6), 2.6, 5.4, 0));
    } else {
        for (let k = 0; k < 2; k++) {
            const sw = new THREE.Group();
            sw.add(at(box(6, 1, 6, G.cream), 0, 0.5, 0));
            sw.add(at(box(6.2, 0.6, 6.2, G.lime), 0, 1.3, 0));
            sw.add(at(box(6, 1, 6, G.cream), 0, 2.1, 0));
            sw.position.set(k * 2 - 1, 1 + k * 2.6, 0);
            sw.rotation.y = k * 0.8;
            g.add(sw);
        }
    }
    return g;
}

/** A party hat (striped cone with a pompom). */
export function partyHat(color = G.blue) {
    const g = new THREE.Group();
    g.add(at(cone(4, 11, color, 12), 0, 5.5, 0));
    g.add(at(cyl(3, 3.2, 1.6, G.yellow, 12), 0, 3.2, 0));
    g.add(at(sphere(1.5, G.yellow, 8, 6), 0, 11.4, 0));
    return g;
}

/** A gift box with a ribbon. */
export function gift(size = 9, color = G.purple, ribbon = G.yellow) {
    const g = new THREE.Group();
    g.add(at(box(size, size * 0.8, size, color), 0, size * 0.4, 0));
    g.add(at(box(size * 1.02, size * 0.82, 1.4, ribbon), 0, size * 0.4, 0));
    g.add(at(box(1.4, size * 0.82, size * 1.02, ribbon), 0, size * 0.4, 0));
    for (const s of [-1, 1]) {
        const bow = torus(1.6, 0.6, ribbon, 6, 10);
        bow.position.set(s * 1.5, size * 0.8 + 1.2, 0);
        bow.rotation.set(0, Math.PI / 2, s * 0.6);
        g.add(bow);
    }
    return g;
}

/** A bunch of balloons on strings (animated as a whole: sway about its base). Built merged; returns the kept group. */
export function balloons(colors = [G.red, G.yellow, G.blue, G.pink, G.teal, G.orange]) {
    const g = new THREE.Group();
    colors.forEach((col, k) => {
        const a = (k / colors.length) * Math.PI * 2;
        const top = new THREE.Vector3(Math.cos(a) * 8, 56 + (k % 3) * 7, Math.sin(a) * 8);
        const b = scl(sphere(6, toon(col, { steps: 4 }), 14, 10), 1, 1.18, 1);
        b.position.copy(top);
        g.add(b);
        g.add(at(cone(1.2, 1.8, col, 8), top.x, top.y - 7.6, top.z));
        const len = top.length();
        const string = cyl(0.15, 0.15, len, G.dark, 3);
        string.position.copy(top).multiplyScalar(0.5);
        string.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().normalize());
        g.add(string);
    });
    const merged = mergeByMaterial(group(g));
    merged.userData.keep = true;
    return merged;
}

/** A drifting cloud billboard texture (puffy, with a soft blue shade underneath). */
export function cloudMaterial() {
    const tex = canvasTexture(512, 256, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const puffs = [[120, 160, 70], [210, 120, 90], [310, 135, 80], [390, 165, 60], [260, 175, 70], [170, 180, 55]];
        ctx.fillStyle = '#c9e2f2';
        for (const [x, y, r] of puffs) {
            ctx.beginPath();
            ctx.arc(x, y + 12, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#ffffff';
        for (const [x, y, r] of puffs) {
            ctx.beginPath();
            ctx.arc(x, y, r * 0.93, 0, Math.PI * 2);
            ctx.fill();
        }
        // cut a flat bottom
        ctx.clearRect(0, 205, w, h);
    });
    return fx(0xffffff, { map: tex, opacity: 0.95, fog: false });
}

export { fxLayer, flat, fx, box, roundBox, cyl, sphere, cone, torus, shape, lathe, at, group, toon };
