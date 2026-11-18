// TurboToys · themes/workshop.js – "Werkstatt-Wahnsinn": a giant garage workshop. Concrete floor with oil stains; the official lap is a figure
// eight: a looping of bent steel rail on the start straight, up onto the workbench (a vice and tools on it, a pegboard behind it), down a plank
// bridge on wooden braces over the lap, through a crate and, as a shortcut, under a steel shelf. Tool walls, a tyre stack, oil drums and cans,
// the red tool chest, the nose of a vintage car poking out of the wall, hanging fluorescent lamps and the open workshop door with daylight.
// Custom tracks (editor layouts) get the same world without the workbench: braces under raised roads, rails on loopings, dressed crates.

import * as THREE from 'three';
import { toon, flat, fx, fxLayer, box, roundBox, cyl, sphere, cone, torus, at, group, canvasTexture, LAYER_FX } from '../render/toon.js';
import { scatter, lamp } from './common.js';
import { loopPoint } from '../tracks/track.js';
import { BARRIER_OFFSET } from '../tracks/builder.js';
import {
    C, labelTexture, pegboardTexture, tyre, tyreStack, tyreUpright, barrel, oilCan, oiler, paintCan, toolChest, wrench, hammer, saw, screwdriver,
    vice, drill, nut, bolt, washer, sawhorse, cableReel, fireExtinguisher, trolleyJack, crate, cardboardBox, broom, bucket, shelfRack,
    fluorescentLamp, carFront, sunkenFloor,
} from './workshop-props.js';

const WALL_HEIGHT = 300;

function roadPattern(ctx, w, h) {
    // painted planks along the road: four boards with seams, butt joints, nail heads; hazard stripes at both edges
    const boards = 4;
    const tones = ['#4f5866', '#55606f', '#4a5260', '#525c6a'];
    for (let b = 0; b < boards; b++) {
        ctx.fillStyle = tones[b];
        ctx.fillRect((b * w) / boards, 0, w / boards, h);
    }
    ctx.fillStyle = '#2c313a';
    for (let b = 1; b < boards; b++) ctx.fillRect((b * w) / boards - 2, 0, 4, h);
    const joints = [90, 300, 200, 420];
    for (let b = 0; b < boards; b++) {
        ctx.fillRect((b * w) / boards, joints[b], w / boards, 4);
        ctx.fillStyle = '#9aa3ad';
        for (const dy of [-10, 12]) for (const dx of [0.3, 0.7]) {
            ctx.beginPath();
            ctx.arc(((b + dx) * w) / boards, joints[b] + dy, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#2c313a';
    }
    // scuffs of tyre rubber
    ctx.fillStyle = 'rgba(20,20,24,0.25)';
    ctx.fillRect(w * 0.3, 40, 10, 160);
    ctx.fillRect(w * 0.64, 260, 9, 200);
    // hazard edges
    for (const x0 of [0, w * 0.93]) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, 0, w * 0.07, h);
        ctx.clip();
        ctx.fillStyle = '#f6c638';
        ctx.fillRect(x0, 0, w * 0.07, h);
        ctx.fillStyle = '#1d1a17';
        for (let y = -40; y < h + 40; y += 40) {
            ctx.beginPath();
            ctx.moveTo(x0, y);
            ctx.lineTo(x0 + w * 0.07, y - 18);
            ctx.lineTo(x0 + w * 0.07, y + 2);
            ctx.lineTo(x0, y + 20);
            ctx.fill();
        }
        ctx.restore();
    }
}

function concrete(ctx, w, h) {
    ctx.fillStyle = '#aca69b';
    ctx.fillRect(0, 0, w, h);
    // big soft patches
    const blobs = [[120, 140, 90, 'rgba(120,112,100,0.18)'], [380, 330, 120, 'rgba(190,184,172,0.25)'], [300, 90, 60, 'rgba(110,100,90,0.15)'], [90, 420, 70, 'rgba(190,184,172,0.2)']];
    for (const [x, y, r, c] of blobs) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    // speckles
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 900; k++) {
        ctx.fillStyle = r() < 0.5 ? 'rgba(80,74,66,0.35)' : 'rgba(230,226,216,0.35)';
        ctx.fillRect(r() * w, r() * h, 2 + r() * 2, 2 + r() * 2);
    }
    // a crack
    ctx.strokeStyle = 'rgba(60,54,48,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 260);
    ctx.lineTo(110, 245);
    ctx.lineTo(150, 290);
    ctx.lineTo(230, 280);
    ctx.stroke();
    // the expansion joints (tile edges)
    ctx.fillStyle = '#6e685f';
    ctx.fillRect(0, 0, w, 5);
    ctx.fillRect(0, 0, 5, h);
}

function blockWall(ctx, w, h) {
    // 512 px = 128 units wide, 512 px = WALL_HEIGHT tall: painted block wall, green below, cream above
    const unit = h / WALL_HEIGHT;
    const split = h - 95 * unit;
    ctx.fillStyle = '#e4dccb';
    ctx.fillRect(0, 0, w, split);
    ctx.fillStyle = '#6f907c';
    ctx.fillRect(0, split, w, h - split);
    ctx.fillStyle = '#c8402f';
    ctx.fillRect(0, split - 6 * unit, w, 6 * unit);
    ctx.strokeStyle = 'rgba(70,60,50,0.22)';
    ctx.lineWidth = 2;
    const bh = 20 * unit;
    for (let row = 0; row * bh < h; row++) {
        const y = h - row * bh;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        const off = row % 2 ? 0 : 80;
        for (let x = off; x < w; x += 160) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y - bh);
            ctx.stroke();
        }
    }
}

function daylightTexture(time) {
    const palette = {
        day: ['#8fd0ff', '#e7f6ff', '#7cc35a', '#4f9a45', '#fff7d6'],
        dusk: ['#5a4fa0', '#ffb36b', '#6c7a3a', '#3e5030', '#ffd29a'],
        night: ['#0d1630', '#2c3f78', '#1f3326', '#14221a', '#c8d8ff'],
    }[time] ?? null;
    const [top, bottom, hill, hedge, sun] = palette;
    return canvasTexture(256, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.7);
        g.addColorStop(0, top);
        g.addColorStop(1, bottom);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = sun;
        ctx.beginPath();
        ctx.arc(w * 0.72, h * 0.3, time === 'night' ? 14 : 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hill;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.72);
        ctx.quadraticCurveTo(w * 0.3, h * 0.55, w * 0.6, h * 0.68);
        ctx.quadraticCurveTo(w * 0.85, h * 0.6, w, h * 0.66);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.fill();
        ctx.fillStyle = hedge;
        for (let x = -10; x < w; x += 34) {
            ctx.beginPath();
            ctx.arc(x, h * 0.78, 22, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillRect(0, h * 0.78, w, h);
        ctx.fillStyle = time === 'night' ? '#2a2c38' : '#9c9a92';
        ctx.fillRect(0, h * 0.86, w, h);
    });
}

/** The pegboard text plate and posters on the walls. */
function signTexture(text, sub, bg, fg) {
    return canvasTexture(512, 256, (ctx, w, h) => {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#14100c';
        ctx.lineWidth = 14;
        ctx.strokeRect(10, 10, w - 20, h - 20);
        ctx.font = '120px Bangers, Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 12;
        ctx.strokeText(text, w / 2, h * 0.42);
        ctx.fillStyle = fg;
        ctx.fillText(text, w / 2, h * 0.42);
        ctx.font = '48px Bangers, Impact, sans-serif';
        ctx.fillStyle = '#14100c';
        ctx.fillText(sub, w / 2, h * 0.78);
    });
}

export default {
    key: 'workshop',
    name: 'Werkstatt-Wahnsinn',
    sky: { top: '#3e3a35', bottom: '#8f897e', fog: '#9d968a', fogNear: 380, fogFar: 1100 },
    light: {
        sun: '#fff1d6', sunIntensity: 2.3, sunDirection: [-0.62, 1, 0.18],
        ambient: '#fff8ea', ambientIntensity: 0.55, hemiSky: '#fbf1dc', hemiGround: '#6f675b', hemiIntensity: 0.95,
    },
    road: {
        surface: '#4f5866', surfaceDark: '#2c313a', line: '#f6c638', edge: null, pattern: roadPattern,
        curb: ['#e2392f', '#f7f3ea'], barrier: 'wall', barrierColors: ['#f6c638', '#1d1a17'], skirt: '#8a5a32',
        kicker: ['#f6c638', '#1d1a17', '#7a4d2a'], gantry: '#2d3038',
    },

    build({ root, track, rng, quality, timeOfDay, night }) {
        const q = quality === 'low' ? 0.45 : quality === 'medium' ? 0.75 : 1;
        const time = timeOfDay ?? 'day';
        const b = track.bounds;
        const room = { minX: b.minX - 110, maxX: b.maxX + 170, minZ: b.minZ - 110, maxZ: b.maxZ + 110 };

        /** Is a circle (x, z, r) free of the road (barriers included)? */
        const free = (x, z, r) => !track.isNearRoad(x, z, r + 5);
        /** The nearest free place to (x, z) for a footprint radius r (spiral search), or null. */
        const spot = (x, z, r) => {
            if (free(x, z, r)) return { x, z };
            for (let ring = 1; ring < 25; ring++) {
                for (let k = 0; k < 16; k++) {
                    const a = (k / 16) * Math.PI * 2;
                    const px = x + Math.cos(a) * ring * 5;
                    const pz = z + Math.sin(a) * ring * 5;
                    if (free(px, pz, r)) return { x: px, z: pz };
                }
            }
            return null;
        };
        const put = (object, x, z, r, yaw = 0, y = 0) => {
            const p = spot(x, z, r + 8);
            if (!p) return null;
            object.position.set(p.x, y, p.z);
            object.rotation.y = yaw;
            root.add(object);
            return object;
        };

        // ---- shared materials / textures
        const barrelLabel = toon(0xffffff, { map: labelTexture('TURBO-ÖL', { bg: '#f6c638', fg: '#e2392f', sub: 'SUPER 2000' }) });
        const canLabels = [
            toon(0xffffff, { map: labelTexture('BLITZ', { bg: '#2f6fd0', fg: '#f6c638', w: 256, h: 192, size: 86, sub: '10W-40', once: true }) }),
            toon(0xffffff, { map: labelTexture('GLEITFIX', { bg: '#f7f3ea', fg: '#3f9b4b', w: 256, h: 192, size: 66, sub: 'MOTORÖL', once: true }) }),
        ];
        const tubeMaterial = flat('#f4fbff');
        const lampLens = flat(night ? '#fff2b0' : '#f4e7b8');
        const decal = fx('#3b3128', { opacity: 0.5 });

        // ---- the floor and the room
        // the floor sits a little under y = 0 (no z-fighting with the road from far away) and sinks where the road dips below 0
        const floorMaterial = toon(0xffffff, { map: canvasTexture(512, 512, concrete, { repeat: [1, 1] }) });
        root.add(sunkenFloor(track, { size: 1300, tile: 90, material: floorMaterial }));
        buildWalls(root, room);

        // ---- the set pieces of the track: the workbench under the raised road (only the official layout: its bench stretch is known),
        // braces under every raised road, the steel shelf over a 'shelf' shortcut, the bent rails of the loopings, the crate tunnels' dressing
        const official = track.key === 'workshop';
        const onBench = (path, i) => official && path === track && track.y[i] > 14.3 && track.z[i] < -118;
        if (official) buildBench(root, track, rng, q, { free, onBench: i => onBench(track, i) });
        buildBraces(root, track, onBench);
        for (const branch of track.branches) if (branch.style === 'shelf') buildShelfTunnel(root, track, branch, rng, { canLabels });
        for (const loop of track.loops) buildLoopRails(root, track, loop);
        for (const tunnel of track.tunnels) if (tunnel.style === 'crate') dressCrate(root, track, tunnel);

        // ---- the vintage car's nose sticking out of the east wall
        const car = carFront({ body: 100, color: C.mint, lampMaterial: lampLens });
        car.position.set(b.maxX + 92, 0, -70);
        car.rotation.y = -Math.PI / 2;
        root.add(car);
        put(trolleyJack(), room.maxX - 120, 70, 40, -2.3);
        put(tyreUpright(rng, 0.25), room.maxX - 60, 70, 34, 0.6);

        // ---- the infield: tyre stack, drums, sawhorses with a plank, cable reel, crates
        put(tyreStack(4, rng), 98, -64, 36, 0.3);
        const lone = tyreUpright(rng, 0.3);
        put(lone, 150, -64, 34, 1.3);
        put(tyre({ rim: true }), 40, -78, 34, 0);
        const drums = [[195, -62, C.red, false], [182, -30, C.blue, false], [-215, 95, C.red, true]];
        for (const [x, z, color, lying] of drums) put(barrel(color, barrelLabel, { lying }), x, z, 34, rng() * 6);
        const horses = group(at(sawhorse(70, 34), 0, 0, -36), at(sawhorse(70, 34), 0, 0, 36), at(box(36, 3, 120, C.woodLight), 0, 35.5, 0));
        const plankSaw = saw(46);
        plankSaw.rotation.x = -Math.PI / 2;
        plankSaw.position.set(-6, 37.6, -10);
        horses.add(plankSaw, at(nut(3), 8, 37, 30), at(nut(2.5), 10, 37, 24));
        put(horses, -20, -62, 62, 1.45);
        put(cableReel(), -110, -40, 38, 0.7);
        const planks = group();
        for (let k = 0; k < 4; k++) planks.add(at(box(84 - k * 6, 3, 15, k % 2 ? C.woodLight : C.wood), (rng() - 0.5) * 6, 1.5 + k * 3, (k % 2) * 4 - 6, (rng() - 0.5) * 0.15));
        planks.add(at(box(70, 3, 15, C.woodLight), 4, 1.5, 14, 0.06));
        put(planks, -50, -82, 40, 0.15);
        put(crate(44, 30, 32), -120, 0, 30, 0.2);
        put(cardboardBox(36, 26, 30, C.woodLight), -84, -6, 22, -0.3);
        put(group(at(oilCan(C.blue, canLabels[0]), 0, 0, 0), at(oilCan(C.red, canLabels[1]), 20, 0, 4), at(oiler(), 10, 0, -16)), 20, -30, 24, 0.4);

        // ---- south: the red tool chest, shelving, drill
        put(group(toolChest(), at(wrench(28), -10, 103, 0).rotateX(-Math.PI / 2), at(oiler(C.yellow), 22, 103, 2)), 70, 62, 46, Math.PI + 0.15);
        put(drill(), 150, 36, 18, 0.8);
        put(bucket(C.blue), -30, 58, 16, 0);
        put(group(paintCan(C.red), at(paintCan(C.blue), 18, 0, 4), at(paintCan(C.yellow, 7, 9), 8, 11, 2)), 0, 50, 22, 0.5);

        // ---- north (behind the bench): drums and boxes
        put(group(barrel(C.green, barrelLabel), at(barrel(C.red, barrelLabel), 62, 0, 8), at(barrel(C.blue, barrelLabel), 30, 0, -50)), 230, -200, 70, 0.2);
        put(group(cardboardBox(50, 40, 44), at(cardboardBox(40, 30, 36), 6, 40, 2), at(cardboardBox(44, 34, 40), 56, 0, -4)), -200, -180, 50, 0.4);

        // ---- along the walls: shelving racks and a tool board, the door with daylight
        wallDecor(root, room, rng, { canLabels, barrelLabel, free });
        const door = buildDoor(root, room, time, night);

        // ---- small scrap beside the road
        // low scrap close to the barriers (the chase cam looks over it) …
        const scrap = [
            () => nut(2.6 + rng() * 1.5), () => nut(3.4), () => bolt(10 + rng() * 8), () => washer(2.4 + rng()),
            () => { const w = wrench(18 + rng() * 14); w.rotation.x = -Math.PI / 2; w.position.y = 0.9; return group(w); },
            () => { const s = screwdriver(16, rng.pick([C.red, C.yellow, C.blue])); s.rotation.z = Math.PI / 2; s.position.y = 1.4; return group(s); },
            () => at(box(14 + rng() * 10, 3, 6, C.woodLight), 0, 1.5, 0),
            () => at(cone(7, 2.4, '#e6c88f', 10), 0, 1.2, 0),
        ];
        scatter(root, track, {
            count: Math.round(90 * q), rng, clearance: 4, spacing: 7, margin: 40, minDistance: 2.5, maxDistance: 32,
            make: r => r.pick(scrap)(),
        });
        // … taller cans a little further out (readable as shapes, not as a wall right at the barrier)
        const cans = [
            () => oilCan(rng.pick([C.blue, C.red, C.green]), rng.pick(canLabels)), () => oiler(rng.pick([C.red, C.yellow, C.green])),
            () => paintCan(rng.pick([C.red, C.blue, C.yellow, C.green, C.orange])),
            () => group(paintCan(rng.pick([C.red, C.blue])), at(paintCan(rng.pick([C.yellow, C.green]), 7, 9), 15, 0, 5), at(nut(3), -12, 0, 6)),
        ];
        scatter(root, track, {
            count: Math.round(34 * q), rng, clearance: 16, spacing: 16, margin: 60, minDistance: 16, maxDistance: 60,
            make: r => r.pick(cans)(),
        });
        // bigger things further out: tyres, buckets, crates, oil drums
        scatter(root, track, {
            count: Math.round(18 * q), rng, clearance: 36, spacing: 44, margin: 90, minDistance: 36,
            inside: (x, z) => x > room.minX + 40 && x < room.maxX - 40 && z > room.minZ + 40 && z < room.maxZ - 40,
            make: r => {
                const k = r.int(0, 5);
                if (k === 0) return tyreStack(r.int(2, 3), r);
                if (k === 1) return barrel(r.pick([C.red, C.blue, C.green]), barrelLabel);
                if (k === 2) return crate(30 + r() * 20, 24 + r() * 10, 28);
                if (k === 3) return cardboardBox(30 + r() * 16, 22 + r() * 16, 30);
                if (k === 4) return group(bucket(r.pick([C.blue, C.orange])), at(paintCan(C.red), 22, 0, 6));
                return tyreUpright(r, 0.3);
            },
        });

        // ---- oil stains on the concrete
        for (let k = 0; k < 46; k++) {
            const x = rng.range(b.minX - 60, b.maxX + 60);
            const z = rng.range(b.minZ - 60, b.maxZ + 60);
            if (track.isNearRoad(x, z, 3)) continue;
            const s = new THREE.Mesh(new THREE.CircleGeometry(4 + rng() * 9, 12), decal);
            s.rotation.x = -Math.PI / 2;
            s.position.set(x, 0.04, z);
            s.scale.set(1, 0.5 + rng() * 0.6, 1);
            s.rotation.z = rng() * 3;
            fxLayer(s);
            root.add(s);
        }
        const under = new THREE.Mesh(new THREE.CircleGeometry(40, 16), decal);
        under.rotation.x = -Math.PI / 2;
        under.position.set(room.maxX - 70, 0.05, -70);
        under.scale.set(1, 0.6, 1);
        root.add(fxLayer(under));

        // ---- hanging fluorescent lamps over the track (one swings), light cones, point lights
        const lights = [];
        const swinging = [];
        const coneMaterial = fx('#fff6d2', { opacity: night ? 0.11 : 0.05, additive: true });
        const lampAt = [0.07, 0.31, 0.55, 0.8];
        lampAt.forEach((f, k) => {
            const i = Math.floor(f * track.count);
            const p = track.pointAt(i);
            const hang = group();
            hang.position.set(p.x, WALL_HEIGHT, p.z);
            hang.rotation.y = p.yaw + Math.PI / 2;
            const lampGroup = fluorescentLamp(WALL_HEIGHT - 150 - p.y, tubeMaterial);
            lampGroup.position.y = -(WALL_HEIGHT - 150 - p.y);
            hang.add(lampGroup);
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(30, 70, 138 + p.y, 4, 1, true), coneMaterial);
            beam.scale.set(1, 1, 0.4);
            beam.rotation.y = Math.PI / 4;
            beam.position.y = -(WALL_HEIGHT - 150 - p.y) - 70 - p.y / 2;
            fxLayer(beam);
            hang.add(beam);
            if (k === 1) {
                hang.userData.keep = true;
                swinging.push(hang);
            }
            root.add(hang);
            const light = lamp('#eef6ff', night ? 9000 : 3500, 320);
            light.position.set(p.x, p.y + 140, p.z);
            lights.push(light);
        });

        return {
            lights,
            update(dt, t) {
                for (const h of swinging) {
                    h.rotation.x = Math.sin(t * 0.9) * 0.025;
                    h.rotation.z = Math.sin(t * 0.63) * 0.018;
                }
                door.update(dt, t);
            },
        };
    },
};

// ------------------------------------------------------------------ the room

function buildWalls(root, room) {
    const texture = canvasTexture(512, 512, blockWall, { repeat: [1, 1] });
    const material = toon(0xffffff, { map: texture });
    const { minX, maxX, minZ, maxZ } = room;
    const walls = [
        // [centre x, centre z, length, yaw facing into the room]
        [(minX + maxX) / 2, minZ, maxX - minX, 0],
        [(minX + maxX) / 2, maxZ, maxX - minX, Math.PI],
        [minX, (minZ + maxZ) / 2, maxZ - minZ, Math.PI / 2],
        [maxX, (minZ + maxZ) / 2, maxZ - minZ, -Math.PI / 2],
    ];
    for (const [x, z, length, yaw] of walls) {
        const geometry = new THREE.PlaneGeometry(length, WALL_HEIGHT);
        const uv = geometry.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * (length / 128));
        const wall = new THREE.Mesh(geometry, material); // front side only: from outside (orbit view) the near wall vanishes
        wall.position.set(x, WALL_HEIGHT / 2, z);
        wall.rotation.y = yaw;
        wall.receiveShadow = true;
        root.add(wall);
        const skirting = at(box(length, 6, 2, '#3d4a42'), x, 3, z);
        skirting.rotation.y = yaw;
        skirting.translateZ(1);
        root.add(skirting);
    }
    // a dark ceiling with steel girders (seen from the low chase cam only at the far end)
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), toon('#4a4540'));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((minX + maxX) / 2, WALL_HEIGHT, (minZ + maxZ) / 2);
    root.add(ceiling);
    for (let x = minX + 90; x < maxX; x += 140) root.add(at(box(8, 14, maxZ - minZ, '#5d6670'), x, WALL_HEIGHT - 7, (minZ + maxZ) / 2));
}

// ------------------------------------------------------------------ the bench (under the raised flat part) and the ramps

/** The workbench of the official layout: a cabinet with a wooden top under the bench stretch of the road (onBench(i)), the pegboard behind it, tools on top. */
function buildBench(root, track, rng, q, { free, onBench }) {
    const n = track.count;
    const flatTop = [];
    for (let i = 0; i < n; i++) if (onBench(i)) flatTop.push(i);
    if (!flatTop.length) return;
    const first = flatTop[0];
    const last = flatTop[flatTop.length - 1];
    const front = i => -(track.w[i] / 2 + 8); // lateral of the bench's front edge (inside of the loop)
    const backL = i => track.w[i] / 2 + 46; // the back edge (where the pegboard stands)
    const frame = (i, j) => {
        const dx = track.x[j] - track.x[i];
        const dz = track.z[j] - track.z[i];
        const len = Math.hypot(dx, dz) || 1;
        return { cx: (track.x[i] + track.x[j]) / 2, cz: (track.z[i] + track.z[j]) / 2, yaw: Math.atan2(dx, dz), len, nx: -dz / len, nz: dx / len };
    };
    const woodTop = '#d29a5c';
    const body = '#8a5a32';
    const drawerColor = '#b9783f';
    const step = 8;
    for (let i = first; i < last; i += step) {
        const j = Math.min(i + step, last);
        const f = frame(i, j);
        let top = Infinity;
        for (let k = i; k <= j; k++) top = Math.min(top, track.heightAt(k));
        top -= 0.06;
        const half = track.w[i] / 2;
        const lo = front(i);
        const hi = backL(i);
        const g = group();
        g.position.set(f.cx, 0, f.cz);
        g.rotation.y = f.yaw;
        const width = hi - lo;
        const mid = -(lo + hi) / 2; // local x = −lateral
        g.add(at(box(width, 1.8, f.len + 0.05, woodTop), mid, top - 0.9, 0));
        // the cabinet body and a plinth
        g.add(at(box(width - 3, top - 2.4, f.len + 0.05, body), mid, (top - 1.8) / 2 + 0.3, 0));
        g.add(at(box(1.2, 0.8, f.len + 0.05, '#4a2f1b'), -lo - 1, 0.4, 0));
        // drawers on the front face (inside of the loop)
        g.add(at(box(0.6, top - 3.6, f.len - 1.2, drawerColor), -lo - 1.25, (top - 1.8) / 2 + 0.5, 0));
        g.add(at(roundBox(0.9, 0.7, 2.6, 0.3, '#d4dde6'), -lo - 0.7, top - 3.2, 0));
        root.add(g);
        void half;
    }
    // end legs
    for (const i of [first, last]) {
        const f = frame(Math.max(0, i - 1), Math.min(n - 1, i + 1));
        const g = group();
        g.position.set(f.cx, 0, f.cz);
        g.rotation.y = f.yaw;
        const lo = front(i);
        const hi = backL(i);
        g.add(at(box(hi - lo + 1, track.heightAt(i) - 0.2, 2.2, '#5e3b20'), -(lo + hi) / 2, (track.heightAt(i) - 0.2) / 2, 0));
        root.add(g);
    }

    // the pegboard along the back of the bench with hanging tools
    const peg = pegboardTexture();
    const pegMaterial = toon(0xffffff, { map: peg });
    const panels = 3;
    const span = last - first;
    for (let p = 0; p < panels; p++) {
        const i = first + Math.round((p * span) / panels);
        const j = first + Math.round(((p + 1) * span) / panels);
        const f = frame(i, j);
        const top = track.heightAt(i);
        const L = backL(i) - 1;
        const height = 64;
        const g = group();
        g.position.set(f.cx + f.nx * L, top, f.cz + f.nz * L);
        g.rotation.y = f.yaw + Math.PI / 2; // face the road (towards −lateral)
        const geometry = new THREE.PlaneGeometry(f.len, height);
        const uv = geometry.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (f.len / 12), uv.getY(k) * (height / 12));
        const board = new THREE.Mesh(geometry, pegMaterial);
        board.position.set(0, height / 2 + 4, 0.7);
        board.receiveShadow = true;
        g.add(board);
        g.add(at(box(f.len, height, 1.2, '#7a5634'), 0, height / 2 + 4, -0.1));
        g.add(at(box(f.len + 2, 3, 3, C.woodDark), 0, height + 5.5, 0.5));
        for (const sx of [-1, 1]) g.add(at(box(3, height + 4, 3, C.woodDark), sx * (f.len / 2), height / 2 + 2, 0.5));
        // tools: a row of wrenches, hammers, a saw, screwdrivers
        const tools = group();
        const x0 = -f.len / 2 + 10;
        for (let k = 0; k < 5; k++) {
            const w = wrench(14 + k * 3.5);
            w.rotation.z = Math.PI / 2;
            tools.add(at(w, x0 + k * 6, 46, 2.4));
        }
        tools.add(at(hammer(26, C.red), x0 + 38, 40, 3), at(hammer(20, C.blue), x0 + 47, 40, 3));
        const s = saw(40);
        tools.add(at(s, x0 + 54, 20, 2));
        const colors = [C.red, C.yellow, C.blue, C.green, C.orange];
        for (let k = 0; k < 5; k++) tools.add(at(screwdriver(14 + k, colors[k]), x0 + 4 + k * 5, 22, 3));
        tools.add(at(new THREE.Mesh(new THREE.TorusGeometry(7, 1.6, 6, 16), toon(C.orange)), x0 + 40, 18, 2.6));
        g.add(tools);
        root.add(g);
    }

    // things on the bench top behind the barrier: the vice, the drill, nuts, an oiler, a mug, offcuts
    const place = (object, t, lateral, yaw = 0) => {
        const i = first + Math.round(t * span);
        const p = track.pointAt(i, lateral);
        if (!free(p.x, p.z, -1)) return;
        object.position.set(p.x, p.y - 0.06, p.z);
        object.rotation.y = p.yaw + yaw;
        root.add(object);
    };
    const backStart = i => track.w[i] / 2 + 6;
    const hs = backStart(first);
    place(vice(), 0.5, hs + 16, Math.PI / 2);
    place(drill(), 0.22, hs + 22, 0.6);
    place(oiler(C.red), 0.78, hs + 26);
    place(group(at(cyl(5, 4.4, 11, C.white, 14), 0, 5.5, 0), at(new THREE.Mesh(new THREE.TorusGeometry(3.2, 1, 6, 12), toon(C.white)), 5.8, 6, 0), at(cyl(4.6, 4.6, 0.4, '#5a3a22', 12), 0, 10.6, 0)), 0.88, hs + 26);
    place(paintCan(C.blue), 0.1, hs + 24);
    place(at(box(48, 0.8, 6, C.yellow), 0, 0.4, 0), 0.35, hs + 4, Math.PI / 2);
    for (let k = 0; k < Math.round(14 * q); k++) {
        const t = rng();
        const o = rng() < 0.5 ? nut(1.8 + rng()) : rng() < 0.5 ? washer(1.8) : bolt(8);
        place(o, t, hs + rng() * 30, rng() * 6);
    }
    place(at(box(22, 4, 9, C.woodLight), 0, 2, 0), 0.65, hs + 22, 0.4);
    place(at(box(14, 3, 7, C.woodLight), 0, 1.5, 0), 0.68, hs + 18, 1.2);
    // a C-clamp hanging on the front edge
    for (const t of [0.3, 0.72]) {
        const i = first + Math.round(t * span);
        const p = track.pointAt(i, front(i) + 0.8);
        const clamp = group(
            at(roundBox(2, 9, 2, 0.6, C.red), 0, -3.2, -1.4),
            at(roundBox(2, 2, 5, 0.6, C.red), 0, 1.2, 0.6),
            at(roundBox(2, 2, 5, 0.6, C.red), 0, -7.2, 0.6),
            at(cyl(0.5, 0.5, 8, C.chrome, 6), 0, -9, 2.2),
        );
        clamp.position.set(p.x, p.y, p.z);
        clamp.rotation.y = p.yaw + Math.PI / 2;
        root.add(clamp);
    }
}

// ------------------------------------------------------------------ braces, the shelf tunnel, the loop rails, the crate tunnels

/** The middle, heading and length of a path between samples i and j (for pieces that follow the road). */
function segment(path, i, j) {
    const dx = path.x[j] - path.x[i];
    const dz = path.z[j] - path.z[i];
    const len = Math.hypot(dx, dz) || 1;
    return { cx: (path.x[i] + path.x[j]) / 2, cz: (path.z[i] + path.z[j]) / 2, yaw: Math.atan2(dx, dz), len };
}

const UP = new THREE.Vector3(0, 1, 0);
/** A square beam from a to b (Vector3s). */
function beam(a, b, size, color) {
    const mesh = box(size, a.distanceTo(b), size, color);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    return mesh;
}

/**
 * Wooden braces under every raised road (any layout): a post just outside the skirt from the floor to the shoulder and a diagonal strut,
 * every 15 units on both sides; never on another road (bridges, crossings) and not where skip(path, i) (the workbench stands there).
 */
function buildBraces(root, track, skip) {
    for (const path of track.paths) {
        let next = -Infinity;
        for (let i = 0; i < path.count; i++) {
            if (path.rail[i] || path.s[i] < next) continue;
            const y = path.y[i];
            if (y < 3 || skip(path, i)) continue;
            next = path.s[i] + 15;
            const { nx, nz } = path.normalAt(i);
            const edge = path.w[i] / 2 + BARRIER_OFFSET + 1.9 + 1.1;
            const spread = Math.min(7, 1.5 + y * 0.3);
            for (const side of [1, -1]) {
                const top = new THREE.Vector3(path.x[i] + nx * side * edge, y + 0.1, path.z[i] + nz * side * edge);
                const foot = new THREE.Vector3(path.x[i] + nx * side * (edge + spread), 0, path.z[i] + nz * side * (edge + spread));
                if (track.isNearRoad(top.x, top.z, 1.2) || track.isNearRoad(foot.x, foot.z, 1.2)) continue;
                root.add(beam(new THREE.Vector3(top.x, 0, top.z), top, 1.5, C.woodLight));
                root.add(beam(foot, new THREE.Vector3(top.x, y * 0.62, top.z), 1.1, C.wood));
                root.add(at(box(2.6, 1, 2.6, C.woodDark), top.x, y - 0.4, top.z));
            }
        }
    }
}

/**
 * A long steel shelf over a shortcut (branch style 'shelf'): two boards across the road (the lower one is the roof of the narrow passage),
 * posts beside the barriers, tins and boxes on the boards, a sign at the way in. Posts that would stand on another road are left out.
 */
function buildShelfTunnel(root, track, branch, rng, { canLabels }) {
    const n = branch.count;
    const i0 = Math.round((n - 1) * 0.38);
    const i1 = Math.round((n - 1) * 0.8);
    if (i1 - i0 < 12) return;
    const H1 = 13;
    const H2 = 27;
    const reach = i => branch.w[i] / 2 + BARRIER_OFFSET + 2.2;
    const otherRoad = (x, z) => track.roadsNear(x, z, 1.2, (h, other) => other !== branch) !== null;
    for (let i = i0; i < i1; i += 6) {
        const j = Math.min(i + 6, i1);
        const f = segment(branch, i, j);
        const W = 2 * reach(i) + 3;
        const g = group();
        g.position.set(f.cx, branch.y[i], f.cz);
        g.rotation.y = f.yaw;
        for (const H of [H1, H2]) {
            g.add(at(box(W, 1.6, f.len + 0.05, C.steel), 0, H, 0));
            for (const sx of [-1, 1]) g.add(at(box(1, 3, f.len + 0.05, C.orange), sx * (W / 2), H, 0));
        }
        root.add(g);
    }
    for (let i = i0; i <= i1; i += 16) {
        const k = Math.min(i, i1);
        for (const side of [1, -1]) {
            const p = branch.pointAt(k, side * (reach(k) + 1));
            if (otherRoad(p.x, p.z)) continue;
            root.add(at(box(2.6, H2 + 1.5, 2.6, C.steelDark), p.x, branch.y[k] + (H2 + 1.5) / 2, p.z));
        }
    }
    // tins and boxes on the boards
    const items = [
        () => oilCan(rng.pick([C.blue, C.red, C.green]), rng.pick(canLabels)),
        () => paintCan(rng.pick([C.red, C.blue, C.yellow, C.green, C.orange]), 8, 11),
        () => cardboardBox(18, 10 + rng() * 6, 14),
        () => group(at(cyl(4, 4, 12, rng.pick([C.yellow, C.white, C.red]), 10), 0, 6, 0), at(cyl(1.6, 1.6, 3, C.ink, 8), 0, 13.5, 0)),
    ];
    for (let i = i0 + 4; i < i1 - 3; i += 8 + Math.floor(rng() * 6)) {
        for (const [H, low] of [[H2, false], [H1, true]]) {
            if (low && rng() < 0.45) continue;
            const make = low ? rng.pick([items[1], items[2], items[3]]) : rng.pick(items);
            const o = make();
            const p = branch.pointAt(i, (rng() * 2 - 1) * (reach(i) - 5));
            o.position.set(p.x, branch.y[i] + H + 0.8, p.z);
            o.rotation.y = rng() * Math.PI * 2;
            root.add(o);
        }
    }
    // the sign over the way in
    const p = branch.pointAt(i0);
    const W = 2 * reach(i0) + 3;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(W - 2, 11), toon(0xffffff, { map: signTexture('ABKÜRZUNG', 'KOPF EINZIEHEN!', '#f6c638', '#e2392f') }));
    plate.position.set(0, 0, -0.9);
    plate.rotation.y = Math.PI;
    const sign = group(plate, at(box(W - 1, 12, 1.2, C.ink), 0, 0, 0));
    sign.position.set(p.x - branch.tx[i0] * 2.5, branch.y[i0] + H1 + 7, p.z - branch.tz[i0] * 2.5);
    sign.rotation.y = p.yaw;
    root.add(sign);
}

/** A looping as a bent steel rail: round rails on its walls, sleepers across the outside of the band, a warning sign before it. */
function buildLoopRails(root, track, loop) {
    const half = track.w[loop.entry] / 2 + BARRIER_OFFSET + 0.4;
    const steel = toon(C.chrome);
    const steps = 72;
    for (const side of [1, -1]) {
        const pts = [];
        for (let k = 0; k <= steps; k++) {
            const q = loopPoint(loop, (k / steps) * Math.PI * 2, side * half);
            pts.push(new THREE.Vector3(q.x + q.ux * 2.5, q.y + q.uy * 2.5, q.z + q.uz * 2.5));
        }
        const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.75, 8), steel);
        rail.castShadow = true;
        root.add(rail);
    }
    // sleepers across the outside of the band (not on the bottom: there it lies on the floor)
    const m = new THREE.Matrix4();
    const N = new THREE.Vector3(loop.N[0], 0, loop.N[1]);
    for (let k = 3; k < 22; k++) {
        const q = loopPoint(loop, (k / 24) * Math.PI * 2, 0);
        const U = new THREE.Vector3(q.ux, q.uy, q.uz);
        const F = new THREE.Vector3(q.fx, q.fy, q.fz);
        const sleeper = box(half * 2 + 1.5, 1.1, 1.8, C.steelDark);
        m.makeBasis(N, U, F);
        sleeper.quaternion.setFromRotationMatrix(m);
        sleeper.position.set(q.x - q.ux * 1.1, q.y - q.uy * 1.1, q.z - q.uz * 1.1);
        root.add(sleeper);
    }
    // the warning sign on the outside before the looping
    const R = loop.radius;
    const lateral = -(loop.D / 2 + track.w[loop.entry] / 2 + 9);
    const x = loop.P[0] - loop.T[0] * R * 2.2 + loop.N[0] * lateral;
    const z = loop.P[2] - loop.T[1] * R * 2.2 + loop.N[1] * lateral;
    if (!track.isNearRoad(x, z, 4)) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), toon(0xffffff, { map: signTexture('LOOPING!', 'VOLLGAS ODER NIX', '#e2392f', '#f6c638') }));
        plate.position.set(0, 20, 0.8);
        const sign = group(plate, at(box(23, 12, 1.2, C.ink), 0, 20, 0), at(box(1.6, 26, 1.6, C.steelDark), 0, 13, -0.8), at(box(6, 1, 6, C.steelDark), 0, 0.5, -0.8));
        sign.position.set(x, loop.P[1], z);
        sign.rotation.y = Math.atan2(loop.T[0], loop.T[1]) + Math.PI;
        root.add(sign);
    }
}

let stencilTexture = null;
/** A crate tunnel: stencilled words on both sides, a crowbar and straw at the way in. */
function dressCrate(root, track, tunnel) {
    const path = tunnel.path;
    const last = Math.min(path.closed ? tunnel.end : path.count - 1, tunnel.end);
    const mid = path.wrap(Math.round((tunnel.start + last) / 2));
    stencilTexture ??= canvasTexture(256, 96, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.font = '58px Bangers, Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(30,24,20,0.85)';
        ctx.fillText('ZERBRECHLICH!', w / 2, h / 2 + 3);
    });
    const stencil = toon(0xffffff, { map: stencilTexture, transparent: true });
    const width = path.w[mid] / 2 + BARRIER_OFFSET + 1.6;
    for (const side of [1, -1]) {
        const p = path.pointAt(mid, side * (width + 0.15));
        const { nx, nz } = path.normalAt(mid);
        const label = new THREE.Mesh(new THREE.PlaneGeometry(22, 8), stencil);
        label.position.set(p.x, path.y[mid] + 5.5, p.z);
        label.rotation.y = Math.atan2(nx * side, nz * side);
        root.add(label);
    }
    // a crowbar leaning on the crate and some straw at the way in
    const start = path.wrap(tunnel.start);
    const p = path.pointAt(start, -(width + 1.5));
    if (!track.isNearRoad(p.x, p.z, 0.8)) {
        const bar = cyl(0.55, 0.55, 14, C.red, 6);
        bar.position.set(p.x, path.y[start] + 6.2, p.z);
        bar.rotation.set(0.25, path.pointAt(start).yaw, 0.2);
        root.add(bar);
    }
    for (let k = 0; k < 7; k++) {
        const side = k % 2 ? 1 : -1;
        const q = path.pointAt(path.wrap(start - 2 + k), side * (width + 1.5 + (k % 3)));
        if (track.isNearRoad(q.x, q.z, 0.8)) continue;
        const straw = cone(1.6, 2.4 + (k % 3), C.yellow, 5);
        straw.position.set(q.x, path.y[start] + 1.2, q.z);
        straw.rotation.z = (k - 3) * 0.12;
        root.add(straw);
    }
}

// ------------------------------------------------------------------ wall furniture

function wallDecor(root, room, rng, { canLabels, barrelLabel, free }) {
    const { minX, maxX, minZ, maxZ } = room;
    const onWall = (object, side, u, out = 0, y = 0) => {
        if (side === 'N') object.position.set(u, y, minZ + out), (object.rotation.y = 0);
        if (side === 'S') object.position.set(u, y, maxZ - out), (object.rotation.y = Math.PI);
        if (side === 'W') object.position.set(minX + out, y, u), (object.rotation.y = Math.PI / 2);
        if (side === 'E') object.position.set(maxX - out, y, u), (object.rotation.y = -Math.PI / 2);
        if (!free(object.position.x, object.position.z, 10)) return null;
        root.add(object);
        return object;
    };
    const stuff = (g, y, w, d, level) => {
        let x = -w / 2 + 6;
        while (x < w / 2 - 12) {
            const k = (rng() * 5) | 0;
            let o;
            let width;
            if (k === 0) (o = oilCan(rng.pick([C.blue, C.red, C.green]), rng.pick(canLabels))), (width = 20);
            else if (k === 1) (o = paintCan(rng.pick([C.red, C.blue, C.yellow, C.green]), 9, 12)), (width = 20);
            else if (k === 2) (o = cardboardBox(26, 18 + rng() * 6, d - 8)), (width = 29);
            else if (k === 3) (o = crate(26, 16, d - 10)), (width = 29);
            else (o = group(at(cyl(5, 5, 18, rng.pick([C.yellow, C.white, C.red]), 10), 0, 9, 0), at(cyl(2, 2, 4, C.ink, 8), 0, 20, 0))), (width = 13);
            if (x + width > w / 2 - 4) break;
            o.position.set(x + width / 2, y, 0);
            g.add(o);
            x += width + 2;
        }
        void level;
    };
    // shelving racks along the north and south walls
    for (const u of [-215, 110]) onWall(shelfRack(130, 150, 44, 4, stuff), 'N', u, 24);
    for (const u of [-40, 150]) onWall(shelfRack(120, 120, 40, 3, stuff), 'S', u, 22);
    // a big tool wall on the south wall (pegboard with giant tools)
    const pegMat = toon(0xffffff, { map: pegboardTexture() });
    const toolWall = (u, side) => {
        const g = group();
        const W = 150;
        const H = 90;
        const geometry = new THREE.PlaneGeometry(W, H);
        const uv = geometry.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (W / 12), uv.getY(k) * (H / 12));
        g.add(at(new THREE.Mesh(geometry, pegMat), 0, 140, 1.5));
        g.add(at(box(W + 6, H + 6, 1.5, C.woodDark), 0, 140, 0.4));
        for (let k = 0; k < 4; k++) {
            const w = wrench(28 + k * 8);
            w.rotation.z = Math.PI / 2;
            g.add(at(w, -60 + k * 12, 140, 4));
        }
        g.add(at(hammer(40, C.red), -6, 145, 5), at(hammer(34, C.yellow), 8, 145, 5));
        g.add(at(saw(70), 22, 108, 3));
        g.add(at(saw(54), 22, 150, 3));
        const colors = [C.red, C.yellow, C.blue, C.green];
        for (let k = 0; k < 4; k++) g.add(at(screwdriver(24 + k * 2, colors[k]), 25 + k * 8, 170, 5));
        g.add(at(new THREE.Mesh(new THREE.TorusGeometry(12, 2.6, 6, 16), toon(C.orange)), -50, 108, 4));
        g.add(at(new THREE.Mesh(new THREE.TorusGeometry(9, 2.2, 6, 16), toon(C.ink)), -20, 108, 4));
        onWall(g, side, u, 0);
    };
    toolWall(-200, 'S');
    toolWall(260, 'N');
    toolWall(-60, 'N');
    // wall signs
    const signs = [
        ['WERKSTATT', 'SCHRAUBEN · ÖLEN · RASEN', '#f6c638', '#e2392f', 'N', 120, 210],
        ['VOLLGAS!', 'NUR FÜR PROFIS', '#e2392f', '#f6c638', 'S', 30, 190],
        ['TURBO-ÖL', 'DAS FLÜSSIGE GOLD', '#2f6fd0', '#f6c638', 'E', 80, 190],
    ];
    for (const [text, sub, bg, fg, side, u, y] of signs) {
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(110, 55), toon(0xffffff, { map: signTexture(text, sub, bg, fg) }));
        plate.position.set(0, y, 1.6);
        const g = group(plate, at(box(116, 61, 2, C.ink), 0, y, 0.2));
        onWall(g, side, u, 0);
    }
    // a wall clock
    const clock = group(
        at(cyl(20, 20, 4, C.white, 20), 0, 230, 2).rotateX(Math.PI / 2),
        at(torus(20, 2.6, C.red, 6, 20), 0, 230, 3.6),
        at(box(2, 14, 1, C.ink), 0, 236, 4.4),
        at(box(10, 2, 1, C.ink), 4, 230, 4.6),
    );
    onWall(clock, 'S', -150, 0);
    // drums and an extinguisher by the walls
    onWall(fireExtinguisher(), 'W', -185, 14);
    onWall(group(barrel(C.red, barrelLabel), at(barrel(C.blue, barrelLabel), 62, 0, 0)), 'S', maxX - 90, 34);
    onWall(broom(), 'S', 62, 6);
    onWall(group(bucket(C.orange), at(paintCan(C.green), 24, 0, 4)), 'S', 90, 16);
    onWall(group(tyreStack(3, rng), at(tyreStack(2, rng), 70, 0, 0)), 'W', maxZ - 50, 40);
}

// ------------------------------------------------------------------ the open workshop door with daylight (and drifting dust)

function buildDoor(root, room, time, night) {
    const z0 = -40;
    const W = 230;
    const H = 230;
    const open = 170; // the roller shutter is up to here
    const x = room.minX;
    const g = group();
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(W, open), flat(0xffffff, { map: daylightTexture(time), fog: false }));
    outside.position.set(x + 0.6, open / 2, z0);
    outside.rotation.y = Math.PI / 2;
    g.add(outside);
    // the shutter (rolled down a little) and its drum, the steel frame
    const shutter = canvasTexture(64, 64, (ctx, w, h) => {
        ctx.fillStyle = '#9aa3ad';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#5c646d';
        for (let y = 0; y < h; y += 16) ctx.fillRect(0, y, w, 4);
    }, { repeat: [1, 4] });
    const shutterMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H - open), toon(0xffffff, { map: shutter }));
    shutterMesh.position.set(x + 0.7, open + (H - open) / 2, z0);
    shutterMesh.rotation.y = Math.PI / 2;
    g.add(shutterMesh);
    g.add(at(cyl(16, 16, W + 10, '#6b737c', 14), x + 18, H + 14, z0).rotateX(Math.PI / 2));
    g.add(at(box(8, H + 30, 12, '#3d4148'), x + 4, (H + 30) / 2, z0 - W / 2 - 6));
    g.add(at(box(8, H + 30, 12, '#3d4148'), x + 4, (H + 30) / 2, z0 + W / 2 + 6));
    g.add(at(box(6, 6, W, '#c8402f'), x + 3, open, z0));
    root.add(g);

    // the patch of daylight on the floor and the beam (additive, no ink)
    const strength = night ? 0.1 : time === 'dusk' ? 0.22 : 0.24;
    const color = night ? '#7f9cff' : time === 'dusk' ? '#ffb26b' : '#fff3c8';
    const depth = 125;
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(depth, W), fx(color, { opacity: strength, additive: true }));
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(x + depth / 2 + 4, 0.06, z0 + 18);
    root.add(fxLayer(patch));
    const beamGeometry = new THREE.BufferGeometry();
    const xa = x + 1;
    const xb = x + depth + 4;
    const v = [
        // top plane: from the top of the opening to the far edge of the patch
        [xa, open, z0 - W / 2], [xb, 0, z0 - W / 2 + 36], [xa, open, z0 + W / 2], [xa, open, z0 + W / 2], [xb, 0, z0 - W / 2 + 36], [xb, 0, z0 + W / 2 + 36],
        // the two sides
        [xa, open, z0 - W / 2], [xa, 0, z0 - W / 2], [xb, 0, z0 - W / 2 + 36],
        [xa, open, z0 + W / 2], [xb, 0, z0 + W / 2 + 36], [xa, 0, z0 + W / 2],
    ].flat();
    beamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const beam = new THREE.Mesh(beamGeometry, fx(color, { opacity: strength * 0.35, additive: true }));
    root.add(fxLayer(beam));

    // dust in the beam
    const count = 140;
    const dust = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.7, 0), fx('#fff8e0', { opacity: night ? 0.35 : 0.7, additive: true }), count);
    dust.userData.keep = true;
    dust.layers.set(LAYER_FX);
    dust.frustumCulled = false;
    const seeds = Array.from({ length: count }, (_, k) => [(k * 0.6180339) % 1, (k * 0.7548776) % 1, (k * 0.5698403) % 1]);
    const m = new THREE.Matrix4();
    root.add(dust);
    return {
        update(dt, t) {
            for (let k = 0; k < count; k++) {
                const [a, bb, c] = seeds[k];
                const u = (a + t * 0.006 * (0.5 + c)) % 1;
                const height = (bb * open + Math.sin(t * 0.3 + k) * 6 + open) % open;
                const px = xa + u * depth * (1 - height / open) + 4;
                const pz = z0 - W / 2 + c * W + Math.sin(t * 0.2 + k * 1.7) * 5 + u * 30;
                m.makeTranslation(px, height + 2, pz);
                dust.setMatrixAt(k, m);
            }
            dust.instanceMatrix.needsUpdate = true;
        },
    };
}
