// TurboToys · render/toon.js – the comic materials and the small modelling kit every model and every world uses.
//   toon(color)      : cel-shaded material (three flat light steps); the black ink lines come from the post-process (postfx.js), not from the meshes
//   flat(color)      : unlit, for glowing things (lamps, LEDs, screens) – still outlined
//   fx(color)        : unlit, transparent, on LAYER_FX: smoke, sparks, decals – never outlined
//   box/cyl/sphere…  : meshes in one call, already shadow-ready
//   mergeByMaterial  : a static group → one mesh per material (thousands of props, few draw calls)
// Units: 1 = 10 cm. A car is about 4.2 long, 2.2 wide, 1.4 high. The ground is y = 0 unless the track says otherwise.

import * as THREE from 'three';

/** Objects on this layer are drawn in colour only (no ink lines): particles, decals, the sky dome, glass. */
export const LAYER_FX = 1;

const gradients = new Map();

/** The light steps of the cel shading: 3 bands (dark, mid, lit); 'soft' adds a fourth for big round shapes. */
function gradient(steps = 3) {
    if (gradients.has(steps)) return gradients.get(steps);
    const values = steps === 4 ? [70, 140, 200, 255] : steps === 2 ? [110, 255] : [90, 175, 255];
    const data = new Uint8Array(values.length * 4);
    values.forEach((v, i) => data.set([v, v, v, 255], i * 4));
    const texture = new THREE.DataTexture(data, values.length, 1, THREE.RGBAFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    gradients.set(steps, texture);
    return texture;
}

const materialCache = new Map();

/**
 * A cel-shaded material. Cached by its options, so share freely (never change a returned material: clone it first).
 * @param {number|string} color
 * @param {{ steps?: 2|3|4, emissive?: number|string, emissiveIntensity?: number, side?: number, transparent?: boolean, opacity?: number, map?: THREE.Texture, vertexColors?: boolean, unique?: boolean }} [options]
 */
export function toon(color, options = {}) {
    const key = options.unique || options.map ? null : `t|${color}|${JSON.stringify(options)}`;
    if (key && materialCache.has(key)) return materialCache.get(key);
    const material = new THREE.MeshToonMaterial({
        color: new THREE.Color(color),
        gradientMap: gradient(options.steps ?? 3),
        emissive: new THREE.Color(options.emissive ?? 0x000000),
        emissiveIntensity: options.emissiveIntensity ?? 1,
        side: options.side ?? THREE.FrontSide,
        transparent: options.transparent ?? false,
        opacity: options.opacity ?? 1,
        map: options.map ?? null,
        vertexColors: options.vertexColors ?? false,
    });
    if (key) materialCache.set(key, material);
    return material;
}

/** Unlit colour (lamps, screens, LEDs, the sky): outlined like everything else. */
export function flat(color, options = {}) {
    const key = options.unique || options.map ? null : `f|${color}|${JSON.stringify(options)}`;
    if (key && materialCache.has(key)) return materialCache.get(key);
    const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        side: options.side ?? THREE.FrontSide,
        transparent: options.transparent ?? false,
        opacity: options.opacity ?? 1,
        map: options.map ?? null,
        vertexColors: options.vertexColors ?? false,
        fog: options.fog ?? true,
    });
    if (key) materialCache.set(key, material);
    return material;
}

/** Unlit and transparent, for effects: put the mesh on LAYER_FX with {@link fxLayer} so it is not outlined. */
export function fx(color, options = {}) {
    return new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: options.opacity ?? 1,
        depthWrite: options.depthWrite ?? false,
        side: options.side ?? THREE.DoubleSide,
        blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        map: options.map ?? null,
        fog: options.fog ?? true,
    });
}

/** Moves an object (and its children) to the effect layer: drawn, but without ink lines. */
export function fxLayer(object) {
    object.traverse(o => o.layers.set(LAYER_FX));
    return object;
}

// ------------------------------------------------------------------ shapes

function finish(mesh, { cast = true, receive = true } = {}) {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    return mesh;
}

function material(m) {
    return m instanceof THREE.Material ? m : toon(m);
}

/** A box: width (x), height (y), depth (z); the material or a colour. Origin in its centre. */
export function box(w, h, d, m, shadow) {
    return finish(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(m)), shadow);
}

/** A box with rounded edges (toys, furniture): radius r, segments s. */
export function roundBox(w, h, d, r, m, s = 2, shadow) {
    return finish(new THREE.Mesh(roundBoxGeometry(w, h, d, r, s), material(m)), shadow);
}

/** A cylinder along y: top radius, bottom radius, height, segments. */
export function cyl(rt, rb, h, m, seg = 16, shadow) {
    return finish(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material(m)), shadow);
}

export function sphere(r, m, wSeg = 16, hSeg = 12, shadow) {
    return finish(new THREE.Mesh(new THREE.SphereGeometry(r, wSeg, hSeg), material(m)), shadow);
}

export function cone(r, h, m, seg = 16, shadow) {
    return finish(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material(m)), shadow);
}

export function torus(r, tube, m, rSeg = 10, tSeg = 24, arc = Math.PI * 2, shadow) {
    return finish(new THREE.Mesh(new THREE.TorusGeometry(r, tube, rSeg, tSeg, arc), material(m)), shadow);
}

/** A flat shape (lying on the ground when rotated -90° about x): an outline of [x, y] points. */
export function shape(points, m, depth = 0, shadow) {
    const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = depth > 0 ? new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }) : new THREE.ShapeGeometry(s);
    return finish(new THREE.Mesh(geometry, material(m)), shadow);
}

/** A lathe (bottles, cups, pots): profile [[radius, y], …] turned about y. */
export function lathe(profile, m, seg = 20, shadow) {
    const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    return finish(new THREE.Mesh(geometry, material(m)), shadow);
}

/** Places an object: at(mesh, x, y, z, rotY = 0) → the mesh. */
export function at(object, x, y, z, rotY = 0) {
    object.position.set(x, y, z);
    if (rotY) object.rotation.y = rotY;
    return object;
}

/** A group of children. */
export function group(...children) {
    const g = new THREE.Group();
    for (const c of children) if (c) g.add(c);
    return g;
}

/** Rounded box geometry (no addon needed): a box whose vertices are pushed onto rounded corners. */
export function roundBoxGeometry(w, h, d, r, s = 2) {
    r = Math.min(r, w / 2, h / 2, d / 2);
    const geometry = new THREE.BoxGeometry(w, h, d, s * 2 + 1, s * 2 + 1, s * 2 + 1);
    const p = geometry.attributes.position;
    const v = new THREE.Vector3();
    const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
    for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const c = new THREE.Vector3(
            Math.sign(v.x) * Math.min(Math.abs(v.x), inner.x),
            Math.sign(v.y) * Math.min(Math.abs(v.y), inner.y),
            Math.sign(v.z) * Math.min(Math.abs(v.z), inner.z));
        const n = v.clone().sub(c);
        if (n.lengthSq() > 1e-9) v.copy(c).add(n.normalize().multiplyScalar(r));
        p.setXYZ(i, v.x, v.y, v.z);
    }
    geometry.computeVertexNormals();
    return geometry;
}

// ------------------------------------------------------------------ canvas textures (labels, posters, patterns)

/**
 * A texture drawn on a canvas: draw(ctx, w, h). For posters, book covers, labels, carpets.
 * @returns {THREE.CanvasTexture}
 */
export function canvasTexture(w, h, draw, { repeat = null, nearest = false } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    draw(ctx, w, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    if (repeat) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeat[0], repeat[1]);
    }
    if (nearest) texture.magFilter = THREE.NearestFilter;
    return texture;
}

// ------------------------------------------------------------------ merging static scenery

/**
 * Merges the meshes of a static group into one mesh per material (world props: one draw call per colour). Keeps castShadow/receiveShadow
 * of the majority. Objects with userData.keep = true (animated: fans, flags, water) stay as they are. Returns a new group.
 */
export function mergeByMaterial(root) {
    root.updateMatrixWorld(true);
    const buckets = new Map();
    const kept = [];
    const keptSet = new Set();
    root.traverse(o => {
        if (!keptSet.has(o) && (o.userData?.keep || o.isInstancedMesh || o.isPoints || o.isSprite || o.isLight)) {
            kept.push(o);
            o.traverse(c => keptSet.add(c));
        }
    });
    root.traverse(o => {
        if (!o.isMesh || keptSet.has(o) || o.isInstancedMesh || o.isSkinnedMesh) return;
        const key = o.material.uuid + '|' + o.layers.mask;
        if (!buckets.has(key)) buckets.set(key, { material: o.material, layers: o.layers.mask, items: [], shadowCast: 0 });
        const bucket = buckets.get(key);
        bucket.items.push(o);
        if (o.castShadow) bucket.shadowCast++;
    });
    const out = new THREE.Group();
    out.name = root.name;
    for (const bucket of buckets.values()) {
        const geometries = bucket.items.map(mesh => {
            let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
            g.applyMatrix4(mesh.matrixWorld);
            for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
            return g;
        });
        const merged = mergeGeometries(geometries);
        geometries.forEach(g => g.dispose());
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, bucket.material);
        mesh.castShadow = bucket.shadowCast > bucket.items.length / 2;
        mesh.receiveShadow = true;
        mesh.layers.mask = bucket.layers;
        out.add(mesh);
    }
    for (const o of kept) {
        o.parent?.updateMatrixWorld(true);
        const clone = o; // keep the original (its animation references it)
        const world = new THREE.Matrix4().copy(o.matrixWorld);
        clone.removeFromParent();
        world.decompose(clone.position, clone.quaternion, clone.scale);
        out.add(clone);
    }
    return out;
}

/** Merges non-indexed geometries with the same attributes (position, normal, uv/color when all have them). */
export function mergeGeometries(geometries) {
    if (!geometries.length) return null;
    const names = ['position', 'normal', 'uv', 'color'].filter(n => geometries.every(g => g.attributes[n]));
    if (!names.includes('position')) return null;
    let count = 0;
    for (const g of geometries) count += g.attributes.position.count;
    const merged = new THREE.BufferGeometry();
    for (const name of names) {
        const size = geometries[0].attributes[name].itemSize;
        const array = new Float32Array(count * size);
        let offset = 0;
        for (const g of geometries) {
            const a = g.attributes[name];
            if (a.itemSize !== size) return null;
            array.set(a.array.length === a.count * size ? a.array : Float32Array.from({ length: a.count * size }, (_, i) => a.array[i]), offset);
            offset += a.count * size;
        }
        merged.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    merged.computeBoundingSphere();
    return merged;
}

// ------------------------------------------------------------------ randomness that is the same on every machine (scenery must match for all players)

/** A seeded random generator (mulberry32): rng() → [0,1), rng.range(a,b), rng.int(a,b), rng.pick(list), rng.sign(). */
export function seeded(seed) {
    let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
    const rng = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.range = (min, max) => min + rng() * (max - min);
    rng.int = (min, max) => Math.floor(rng.range(min, max + 1));
    rng.pick = list => list[Math.floor(rng() * list.length)];
    rng.sign = () => (rng() < 0.5 ? -1 : 1);
    return rng;
}

export function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** The comic palette: saturated, warm, a little dirty (XIII). */
export const PALETTE = {
    ink: 0x14100c,
    paper: 0xf4ead2,
    red: 0xe2392f,
    orange: 0xf28c28,
    yellow: 0xf6c638,
    lime: 0x9bd23c,
    green: 0x3f9b4b,
    teal: 0x2aa198,
    sky: 0x5cb7e6,
    blue: 0x2f6fd0,
    navy: 0x1d3263,
    purple: 0x7a4bc4,
    pink: 0xe86aa6,
    brown: 0x8a5a32,
    wood: 0xc68a4e,
    sand: 0xe6c88f,
    grey: 0x8a8f96,
    dark: 0x34373d,
    white: 0xf7f3ea,
    chrome: 0xc9d1d9,
};
