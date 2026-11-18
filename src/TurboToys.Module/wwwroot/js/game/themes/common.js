// TurboToys · themes/common.js – what every world uses: the floor, scattering props beside the road, room walls, simple lights.
// A theme module (themes/<key>.js) exports default:
//   {
//     key, name,
//     sky:   { top: '#hex', bottom: '#hex', fog: '#hex', fogNear: number, fogFar: number },
//     light: { sun: '#hex', sunIntensity: number, sunDirection: [x, y, z], ambient: '#hex', ambientIntensity: number, hemiSky: '#hex', hemiGround: '#hex', hemiIntensity: number },
//     road:  the road style (tracks/builder.js),
//     build(ctx) → { update?(dt, time), lights?: THREE.Light[] }   ctx: { root, track, rng, quality, timeOfDay }
//   }
// Everything static is merged afterwards (world.js: mergeByMaterial); give animated objects userData.keep = true and move them in update().

import * as THREE from 'three';
import { toon, canvasTexture, seeded } from '../render/toon.js';

/**
 * The floor of a world: a big plane at y = 0 under everything (texture repeated per `tile` units).
 * @param {{ size?: number, color?: string, draw?: (ctx, w, h) => void, tile?: number, track: any }} options
 */
export function floor({ track, size = 900, color = '#888', draw = null, tile = 40, steps = 3 }) {
    const material = draw
        ? toon(0xffffff, { map: canvasTexture(512, 512, draw, { repeat: [size / tile, size / tile] }), steps })
        : toon(color, { steps });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(track.bounds.cx, 0, track.bounds.cz);
    mesh.receiveShadow = true;
    mesh.name = 'floor';
    return mesh;
}

/**
 * Scatters props beside the road: tries `count` random places within the track's bounds (+ margin), keeps those at least `clearance` away from the
 * road and from each other (`spacing`), calls make(rng, place) → Object3D and places it (y = 0, random turn unless place.yaw is used).
 * @returns {Array<{x:number,z:number}>} the places used
 */
export function scatter(root, track, { count, rng, clearance = 6, spacing = 6, margin = 60, make, inside = null, maxDistance = Infinity, minDistance = -Infinity }) {
    const used = [];
    const b = track.bounds;
    let tries = 0;
    while (used.length < count && tries < count * 25) {
        tries++;
        const x = rng.range(b.minX - margin, b.maxX + margin);
        const z = rng.range(b.minZ - margin, b.maxZ + margin);
        if (inside && !inside(x, z)) continue;
        if (track.isNearRoad(x, z, clearance)) continue;
        const d = track.distanceToRoad(x, z);
        if (d > maxDistance || d < minDistance) continue;
        if (used.some(p => Math.hypot(p.x - x, p.z - z) < spacing)) continue;
        const place = { x, z, yaw: rng() * Math.PI * 2, distance: d };
        const object = make(rng, place);
        if (!object) continue;
        object.position.x = x;
        object.position.z = z;
        if (place.y !== undefined) object.position.y = place.y;
        object.rotation.y = place.yaw;
        root.add(object);
        used.push({ x, z });
    }
    return used;
}

/**
 * Places objects along the road at both sides (rows of spectators, lamps, pylons …): every `every` units at `offset` beyond the barrier.
 * make(rng, { x, z, yaw, side, index }) → Object3D (yaw faces the road).
 */
export function alongRoad(root, track, { every = 30, offset = 6, rng, make, sides = [1, -1], from = 0, to = 1 }) {
    const n = track.count;
    for (const side of sides) {
        for (let s = from * track.length; s < to * track.length; s += every) {
            const i = Math.min(n - 1, Math.round((s / track.length) * n));
            const { nx, nz } = track.normalAt(i);
            const l = side * (track.w[i] / 2 + 2 + offset);
            const x = track.x[i] + nx * l;
            const z = track.z[i] + nz * l;
            // not onto another part of the road
            if (track.isNearRoad(x, z, 3)) continue;
            const yaw = Math.atan2(-nx * side, -nz * side);
            const object = make(rng, { x, z, yaw, side, index: i });
            if (!object) continue;
            object.position.set(x, object.position.y || 0, z);
            object.rotation.y = yaw;
            root.add(object);
        }
    }
}

/** Four walls of a room around the track (indoor worlds), with skirting boards. Returns the group. */
export function roomWalls({ track, margin = 120, height = 160, color = '#e9dcc3', skirting = '#f7f3ea', draw = null }) {
    const b = track.bounds;
    const minX = b.minX - margin;
    const maxX = b.maxX + margin;
    const minZ = b.minZ - margin;
    const maxZ = b.maxZ + margin;
    const group = new THREE.Group();
    const material = draw ? toon(0xffffff, { map: canvasTexture(512, 512, draw, { repeat: [4, 1] }), side: THREE.DoubleSide }) : toon(color, { side: THREE.DoubleSide });
    const skirt = toon(skirting);
    const walls = [
        [minX, (minZ + maxZ) / 2, maxZ - minZ, Math.PI / 2],
        [maxX, (minZ + maxZ) / 2, maxZ - minZ, -Math.PI / 2],
        [(minX + maxX) / 2, minZ, maxX - minX, 0],
        [(minX + maxX) / 2, maxZ, maxX - minX, Math.PI],
    ];
    for (const [x, z, length, yaw] of walls) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, height), material);
        wall.position.set(x, height / 2, z);
        wall.rotation.y = yaw;
        wall.receiveShadow = true;
        group.add(wall);
        const board = new THREE.Mesh(new THREE.BoxGeometry(length, 4, 1.2), skirt);
        board.position.set(x, 2, z);
        board.rotation.y = yaw;
        group.add(board);
    }
    group.userData.box = { minX, maxX, minZ, maxZ, height };
    return group;
}

/** A point light that matters (lamps, the attic's torches); intensity in three's physical units for this scale. */
export function lamp(color, intensity = 400, distance = 120) {
    const light = new THREE.PointLight(color, intensity, distance, 1.6);
    light.castShadow = false;
    return light;
}

export { seeded };
