// TurboToys · themes/garden.js – "Gartenparty": a sunny back garden seen by a toy car. A gravel path through the lawn, flower beds with tulips
// and sunflowers, a pond under a wooden bridge (the raised part of the track) with a fishing garden gnome, a tree with a swing, a picnic party
// with cake and balloons, a sprinkler on a snaking hose, a vegetable patch, a shed, the house terrace, a picket fence and hedge, cartoon clouds.

import * as THREE from 'three';
import { floor, scatter } from './common.js';
import {
    G, instanced, tuftGeometry, tulipHeadGeometry, stemGeometry, daisyGeometry, sunflower, bush, tree, reeds, toadstool, pumpkin, cabbage, gnome,
    wateringCan, hoseReel, hose, steppingStone, fenceSegment, birdbath, shed, wheelbarrow, bench, blanketMaterial, cake, cup, plate, partyHat, gift,
    balloons, cloudMaterial, fxLayer, flat, fx, box, roundBox, cyl, sphere, cone, torus, shape, at, group, toon,
} from './garden-props.js';
import { canvasTexture, mergeByMaterial, LAYER_FX } from '../render/toon.js';

const scaled = (m, x, y, z) => {
    m.scale.set(x, y, z);
    return m;
};

/** The ground level: a little below 0 (the path dips slightly where it starts to climb). */
const GROUND = -0.12;

const footprintBox = new THREE.Box3();
/** The horizontal reach of an object around its origin (any turn): what must stay off the road. */
function footprint(object) {
    footprintBox.setFromObject(object);
    if (footprintBox.isEmpty()) return 0;
    return Math.hypot(Math.max(-footprintBox.min.x, footprintBox.max.x), Math.max(-footprintBox.min.z, footprintBox.max.z));
}

function drawLawn(ctx, w, h) {
    // mowing stripes and blades
    ctx.fillStyle = '#6cbf3f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#62b23a';
    ctx.fillRect(0, 0, w / 2, h);
    const rnd = (() => {
        let a = 7;
        return () => ((a = (a * 16807) % 2147483647) / 2147483647);
    })();
    for (let k = 0; k < 900; k++) {
        const x = rnd() * w;
        const y = rnd() * h;
        ctx.strokeStyle = rnd() < 0.5 ? 'rgba(60,130,40,0.55)' : 'rgba(150,215,90,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 6, y - 6 - rnd() * 6);
        ctx.stroke();
    }
}

function drawGravel(ctx, w, h) {
    ctx.fillStyle = '#b8915f';
    ctx.fillRect(0, 0, w, h);
    const rnd = (() => {
        let a = 11;
        return () => ((a = (a * 16807) % 2147483647) / 2147483647);
    })();
    const tones = ['#9c7a4e', '#cfae7c', '#a88660', '#d9c09a', '#8e6d45'];
    for (let k = 0; k < 1300; k++) {
        ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
        ctx.beginPath();
        ctx.ellipse(rnd() * w, rnd() * h, 2 + rnd() * 4, 1.5 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
    }
    // tyre tracks (two darker bands)
    ctx.fillStyle = 'rgba(110,80,45,0.18)';
    ctx.fillRect(w * 0.26, 0, w * 0.1, h);
    ctx.fillRect(w * 0.64, 0, w * 0.1, h);
}

function drawSlabs(ctx, w, h) {
    ctx.fillStyle = '#8c857a';
    ctx.fillRect(0, 0, w, h);
    const tones = ['#d8cfbf', '#cfc5b3', '#e0d8c8', '#c8bfae'];
    const n = 4;
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        ctx.fillStyle = tones[(i * 3 + j * 5) % tones.length];
        ctx.fillRect(i * s + 4, j * s + 4, s - 8, s - 8);
    }
}

function drawFacade(ctx, w, h) {
    ctx.fillStyle = '#f2d6a2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(200,160,100,0.25)';
    for (let k = 0; k < 60; k++) ctx.fillRect((k * 97) % w, (k * 53) % h, 18, 4);
    ctx.fillStyle = '#d9b884';
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
}

export default {
    key: 'garden',
    name: 'Gartenparty',
    sky: { top: '#3f9fe6', bottom: '#cdeefc', fog: '#d4eefb', fogNear: 380, fogFar: 1100 },
    light: {
        sun: '#fff4d6', sunIntensity: 2.8, sunDirection: [0.5, 1, 0.35],
        ambient: '#ffffff', ambientIntensity: 0.5, hemiSky: '#bfe3ff', hemiGround: '#5f8a34', hemiIntensity: 1.0,
    },
    road: {
        surface: '#b8915f', surfaceDark: '#8e6d45', line: null, edge: null, curb: ['#f2ede0', '#a9a49a'],
        barrier: 'stones', barrierColors: ['#a9a49a'], skirt: '#9a6136', kicker: ['#f6c638', '#14100c', '#9a6136'], gantry: '#3f9b4b',
        pattern: drawGravel,
    },

    build({ root: world, track, rng, quality, timeOfDay }) {
        const q = quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1;
        const night = timeOfDay === 'night';
        const root = new THREE.Group();
        root.position.y = GROUND;
        world.add(root);
        const b = track.bounds;
        const yard = { minX: b.minX - 86, maxX: b.maxX + 88, minZ: b.minZ - 88, maxZ: b.maxZ + 110 };
        const reserved = [];
        const reserve = (x, z, r) => reserved.push({ x, z, r });
        const isFree = (x, z, r = 0) => x > yard.minX + 6 + r && x < yard.maxX - 6 - r && z > yard.minZ + 6 + r && z < yard.maxZ - 6 - r
            && !reserved.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r);
        /**
         * Places a piece beside the road: its whole footprint (or opts.reach) keeps 4.5 off the road; when the wanted spot is too close it moves
         * to the nearest free spot nearby (unless opts.exact). Returns whether it was placed.
         */
        const put = (object, x, z, r, yaw = 0, y = 0, opts = {}) => {
            const reach = opts.reach ?? Math.max(r, footprint(object));
            for (let k = 0; k < (opts.exact ? 1 : 48); k++) {
                const d = k === 0 ? 0 : 2 + k * 0.8;
                const px = x + Math.cos(k * 2.39996) * d;
                const pz = z + Math.sin(k * 2.39996) * d;
                if (track.isNearRoad(px, pz, 4.5 + reach)) continue;
                object.position.set(px, y, pz);
                object.rotation.y = yaw;
                root.add(object);
                reserve(px, pz, r);
                return true;
            }
            return false;
        };
        const animations = [];

        // ---------------------------------------------------------- lawn, terrace, the house, fence + hedge, far trees, clouds
        const lawn = floor({ track, size: 1500, draw: drawLawn, tile: 110 });
        lawn.position.y = -0.03;
        root.add(lawn);

        const terraceZ0 = yard.maxZ - 70;
        const slabs = new THREE.Mesh(new THREE.PlaneGeometry(yard.maxX - yard.minX - 60, 70), toon(0xffffff, { map: canvasTexture(256, 256, drawSlabs, { repeat: [(yard.maxX - yard.minX - 60) / 60, 70 / 60] }) }));
        slabs.rotation.x = -Math.PI / 2;
        slabs.position.set((yard.minX + yard.maxX) / 2, 0.05, terraceZ0 + 35);
        slabs.receiveShadow = true;
        root.add(slabs);
        root.add(at(box(yard.maxX - yard.minX - 60, 1.6, 3, G.stoneDark), (yard.minX + yard.maxX) / 2, 0.8, terraceZ0));
        for (let x = yard.minX + 30; x < yard.maxX - 30; x += 60) reserve(x, terraceZ0 + 35, 36);

        // the house: facade with windows and the patio door
        const houseZ = yard.maxZ + 12;
        const houseW = yard.maxX - yard.minX + 160;
        const hx = (yard.minX + yard.maxX) / 2;
        // one-sided (faces the garden): a camera behind the house looks through it
        const facade = new THREE.Mesh(new THREE.PlaneGeometry(houseW, 280), toon(0xffffff, { map: canvasTexture(512, 256, drawFacade, { repeat: [houseW / 300, 1] }) }));
        facade.rotation.y = Math.PI;
        facade.position.set(hx, 140, houseZ);
        facade.receiveShadow = true;
        root.add(facade);
        root.add(at(box(houseW + 20, 10, 40, '#b5523a'), hx, 284, houseZ + 6));
        const glassMat = flat('#9fd4f0');
        const window_ = (x, y, w, h) => {
            root.add(at(box(w + 8, h + 8, 3, G.white), x, y, houseZ - 1));
            root.add(at(box(w, h, 1, glassMat), x, y, houseZ - 2.8));
            const shine = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.18, h * 1.1), flat('#e6f6ff'));
            shine.position.set(x - w * 0.15, y, houseZ - 3.4);
            shine.rotation.z = 0.5;
            shine.scale.y = Math.min(1, w / h);
            root.add(shine);
            root.add(at(box(4, h, 2, G.white), x, y, houseZ - 3.2));
            root.add(at(box(w + 14, 4, 10, G.white), x, y - h / 2 - 5, houseZ - 4));
        };
        window_(hx - 60, 120, 90, 150);
        window_(hx + 60, 120, 90, 150);
        window_(hx - 230, 150, 70, 90);
        window_(hx + 230, 150, 70, 90);
        window_(hx - 380, 150, 70, 90);
        window_(hx + 380, 150, 70, 90);
        root.add(at(cyl(3, 3, 280, '#b5523a', 8), hx + 300, 140, houseZ - 4));
        // flower boxes under the side windows
        for (const x of [hx - 230, hx + 230]) {
            root.add(at(box(70, 12, 14, G.red), x, 98, houseZ - 9));
            for (let k = 0; k < 7; k++) root.add(at(sphere(4, [G.pink, G.yellow, G.white][k % 3], 8, 6), x - 30 + k * 10, 107, houseZ - 10));
        }
        // the parasol + table + chairs on the terrace
        {
            const t = new THREE.Group();
            t.add(at(cyl(30, 30, 3, G.white, 20), 0, 52, 0));
            t.add(at(cyl(3, 6, 50, G.white, 10), 0, 25, 0));
            t.add(at(cyl(1.4, 1.4, 120, G.dark, 8), 0, 60, 0));
            const colors = [G.red, G.white, G.red, G.white, G.red, G.white, G.red, G.white];
            for (let k = 0; k < 8; k++) {
                const geo = new THREE.ConeGeometry(75, 26, 1, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4);
                const m = new THREE.Mesh(geo, toon(colors[k], { side: THREE.DoubleSide }));
                m.position.y = 118;
                m.castShadow = m.receiveShadow = true;
                t.add(m);
            }
            t.add(at(sphere(3, G.yellow, 8, 6), 0, 132, 0));
            for (const a of [0.4, 2.4, 4.4]) {
                const chair = new THREE.Group();
                chair.add(at(box(24, 3, 24, G.white), 0, 28, 0));
                chair.add(at(box(24, 30, 3, G.white), 0, 44, -11).rotateX(-0.15));
                for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) chair.add(at(cyl(1.2, 1.2, 28, G.white, 6), x, 14, z));
                chair.position.set(Math.cos(a) * 44, 0, Math.sin(a) * 44);
                chair.rotation.y = -a - Math.PI / 2;
                t.add(chair);
            }
            t.add(at(cup(G.yellow), 8, 53.5, 4));
            t.add(at(plate('sandwich'), -10, 53.5, -6));
            t.position.set(hx - 150, 0, terraceZ0 + 36);
            root.add(t);
        }
        put(bench(), hx + 170, terraceZ0 + 50, 0, Math.PI);
        for (const x of [hx - 300, hx - 40, hx + 60, hx + 300]) {
            const pot = group(at(cyl(14, 10, 22, '#c8643a', 12), 0, 11, 0), at(cyl(14.6, 14.6, 3, '#d97a4a', 12), 0, 21, 0), at(bush(9, G.leaf, rng() < 0.5 ? G.pink : G.yellow), 0, 20, 0));
            pot.position.set(x, 0, terraceZ0 + 58);
            root.add(pot);
        }

        // the picket fence around the garden (not on the house side) and the hedge behind it
        const fence = (x0, z0, x1, z1) => {
            const L = Math.hypot(x1 - x0, z1 - z0);
            const seg = fenceSegment(L, 70);
            seg.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
            seg.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
            root.add(seg);
        };
        fence(yard.minX, yard.minZ, yard.maxX, yard.minZ);
        fence(yard.minX, yard.minZ, yard.minX, houseZ);
        fence(yard.maxX, yard.minZ, yard.maxX, houseZ);
        const hedge = (x0, z0, x1, z1) => {
            const L = Math.hypot(x1 - x0, z1 - z0);
            const n = Math.ceil(L / 50);
            for (let k = 0; k <= n; k++) {
                const t = k / n;
                const h = rng.range(95, 125);
                const blob = roundBox(58, h, 44, 18, k % 2 ? G.hedge : '#348036', 2);
                blob.position.set(x0 + (x1 - x0) * t, h / 2, z0 + (z1 - z0) * t);
                blob.rotation.y = -Math.atan2(z1 - z0, x1 - x0) + (rng() - 0.5) * 0.2;
                root.add(blob);
            }
        };
        hedge(yard.minX - 40, yard.minZ - 30, yard.maxX + 40, yard.minZ - 30);
        hedge(yard.minX - 34, yard.minZ - 30, yard.minX - 34, houseZ - 10);
        hedge(yard.maxX + 34, yard.minZ - 30, yard.maxX + 34, houseZ - 10);
        // far trees around
        const cx = (yard.minX + yard.maxX) / 2;
        const cz = (yard.minZ + yard.maxZ) / 2;
        for (let k = 0; k < 18; k++) {
            const a = (k / 18) * Math.PI * 2 + rng() * 0.2;
            const x = cx + Math.cos(a) * rng.range(560, 700);
            const z = cz + Math.sin(a) * rng.range(450, 560);
            if (z > houseZ + 20 && Math.abs(x - hx) < houseW / 2) continue;
            const t = tree(rng.range(150, 230), rng.range(65, 95), rng.pick([G.leaf, '#4aa34a', '#2f8a3f']));
            t.position.set(x, 0, z);
            root.add(t);
        }
        // clouds: flat cartoon billboards far away (no ink)
        const cloudMat = cloudMaterial();
        for (let k = 0; k < 11; k++) {
            const a = (k / 11) * Math.PI * 2 + rng() * 0.3;
            const r = rng.range(900, 1050);
            const w = rng.range(160, 280);
            const c = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), cloudMat);
            c.position.set(cx + Math.cos(a) * r, rng.range(230, 420), cz + Math.sin(a) * r);
            c.lookAt(cx, c.position.y - 60, cz);
            fxLayer(c);
            c.renderOrder = -1;
            world.add(c);
        }

        // ---------------------------------------------------------- the pond under the bridge, the bridge's planks and posts
        const pond = { x: -80, z: -160, rx: 50, rz: 32 };
        {
            const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), toon(G.water, { steps: 2 }));
            water.rotation.x = -Math.PI / 2;
            water.scale.set(pond.rx, pond.rz, 1);
            water.position.set(pond.x, 0.25, pond.z);
            water.receiveShadow = true;
            root.add(water);
            const deep = new THREE.Mesh(new THREE.CircleGeometry(1, 32), toon(G.waterDeep, { steps: 2 }));
            deep.rotation.x = -Math.PI / 2;
            deep.scale.set(pond.rx * 0.6, pond.rz * 0.55, 1);
            deep.position.set(pond.x + 4, 0.3, pond.z - 2);
            root.add(deep);
            reserve(pond.x, pond.z, Math.max(pond.rx, pond.rz) + 4);
            // a rim of round stones
            for (let k = 0; k < 44; k++) {
                const a = (k / 44) * Math.PI * 2;
                const x = pond.x + Math.cos(a) * (pond.rx + 2);
                const z = pond.z + Math.sin(a) * (pond.rz + 2);
                if (track.isNearRoad(x, z, 4.5)) continue;
                const st = roundBox(rng.range(6, 9), rng.range(2.5, 4), rng.range(5, 7), 1.6, rng.pick([G.stone, G.stoneLight, G.stoneDark]), 1);
                st.position.set(x, 1.2, z);
                st.rotation.y = -a + (rng() - 0.5) * 0.4;
                root.add(st);
            }
            // lily pads with a few flowers
            const padGeo = new THREE.CylinderGeometry(1, 1, 0.4, 14, 1, false, 0.35, Math.PI * 2 - 0.7);
            const pads = [];
            for (let k = 0; k < 14; k++) {
                const a = rng() * Math.PI * 2;
                const r = Math.sqrt(rng()) * 0.85;
                const x = pond.x + Math.cos(a) * r * pond.rx;
                const z = pond.z + Math.sin(a) * r * pond.rz;
                // nothing under the bridge: the flowers would poke through it
                if (track.isNearRoad(x, z, 4)) continue;
                const s = rng.range(3.5, 6);
                pads.push({ x, y: 0.5, z, ry: rng() * 6.3, s, sy: 1, color: rng() < 0.5 ? G.leaf : G.lime });
                if (rng() < 0.4) {
                    const flower = group(...[0, 1, 2, 3, 4, 5].map(i => {
                        const petal = cone(1.1, 3.4, i % 2 ? G.pink : G.white, 5);
                        petal.position.set(Math.cos(i) * 1.2, 1.4, Math.sin(i) * 1.2);
                        petal.rotation.set(Math.sin(i) * 0.5, 0, -Math.cos(i) * 0.5);
                        return petal;
                    }), at(sphere(0.9, G.yellow, 8, 6), 0, 1.4, 0));
                    flower.position.set(x, 0.7, z);
                    root.add(flower);
                }
            }
            root.add(instanced(padGeo, toon(0xffffff), pads.map(p => ({ ...p, sx: p.s, sz: p.s }))));
            // ripples (animated rings, no ink)
            const ripples = [];
            for (let k = 0; k < 4; k++) {
                const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), fx('#e8f8ff', { opacity: 0.6 }));
                ring.rotation.x = -Math.PI / 2;
                ring.userData.keep = true;
                ring.layers.set(LAYER_FX);
                const a = rng() * Math.PI * 2;
                ring.userData.home = [pond.x + Math.cos(a) * pond.rx * 0.5, pond.z + Math.sin(a) * pond.rz * 0.5];
                ring.position.set(ring.userData.home[0], 0.6 + GROUND, ring.userData.home[1]);
                world.add(ring);
                ripples.push(ring);
            }
            animations.push((dt, time) => {
                ripples.forEach((ring, k) => {
                    const t = (time * 0.35 + k / ripples.length) % 1;
                    ring.scale.setScalar(1 + t * 10);
                    ring.material.opacity = 0.65 * (1 - t);
                });
            });
            // reeds at the shore
            for (let k = 0; k < 7; k++) {
                const a = rng() * Math.PI * 2;
                const x = pond.x + Math.cos(a) * (pond.rx + 7);
                const z = pond.z + Math.sin(a) * (pond.rz + 7);
                if (track.isNearRoad(x, z, 7)) continue;
                const r = reeds(rng);
                r.position.set(x, 0, z);
                root.add(r);
            }
        }
        // the bridge: plank decking under the barrier stones and posts down to the ground
        {
            const n = track.count;
            for (const side of [1, -1]) {
                // rail posts with a sagging rope beyond the barrier stones (what the chase camera sees of the bridge)
                const rail = [];
                for (let i = 0; i < n; i += 14) {
                    if (track.y[i] < 1.4) continue;
                    const { nx, nz } = track.normalAt(i);
                    const l = side * (track.w[i] / 2 + 5.6);
                    const x = track.x[i] + nx * l;
                    const z = track.z[i] + nz * l;
                    if (track.isNearRoad(x, z, 4.4)) continue;
                    const top = track.y[i] - GROUND + 7;
                    root.add(at(cyl(1.2, 1.4, top, G.woodDark, 8), x, top / 2, z));
                    root.add(at(sphere(1.6, G.wood, 8, 6), x, top + 0.6, z));
                    rail.push(new THREE.Vector3(x, top - 0.6, z));
                }
                for (let k = 0; k + 1 < rail.length; k++) {
                    const a = rail[k];
                    const c = rail[k + 1];
                    if (a.distanceTo(c) > 22) continue;
                    const mid = a.clone().add(c).multiplyScalar(0.5);
                    mid.y -= 2.2;
                    const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, c), 8, 0.45, 5), toon(G.cream));
                    rope.castShadow = true;
                    root.add(rope);
                }
                for (let i = 0; i < n; i += 2) {
                    const y0 = track.y[i];
                    if (y0 < 1.0) continue;
                    const j = (i + 2) % n;
                    const lat = track.w[i] / 2 + 2.6;
                    const a = track.normalAt(i);
                    const bN = track.normalAt(j);
                    const p0 = new THREE.Vector3(track.x[i] + a.nx * side * lat, y0 - GROUND - 0.45, track.z[i] + a.nz * side * lat);
                    const p1 = new THREE.Vector3(track.x[j] + bN.nx * side * lat, track.y[j] - GROUND - 0.45, track.z[j] + bN.nz * side * lat);
                    const plank = box(3.4, 0.8, p0.distanceTo(p1) + 0.3, (i / 2) % 2 ? G.wood : G.woodLight);
                    plank.position.copy(p0).add(p1).multiplyScalar(0.5);
                    plank.lookAt(p1.x, p1.y, p1.z);
                    // lookAt in the parent's space: the plank group is root (only translated): fine
                    root.add(plank);
                    if (i % 12 === 0) {
                        // a post under the deck, down to the ground (or the pond)
                        const h = y0 - GROUND - 0.85;
                        root.add(at(cyl(1.1, 1.3, h, G.woodDark, 8), p0.x, h / 2, p0.z));
                    }
                }
            }
        }
        // the gnome fishing at the north shore
        {
            const gn = gnome();
            put(gn.group, pond.x - 6, pond.z + pond.rz + 22, 12, Math.PI + 0.15, 0, { exact: true, reach: 12 });
            const bobber = group(at(sphere(1.4, G.red, 10, 8), 0, 0, 0), at(sphere(1, G.white, 8, 6), 0, 1.1, 0));
            bobber.userData.keep = true;
            const bx = pond.x - 6 - Math.sin(0.15) * 34;
            const bz = pond.z + pond.rz + 22 - Math.cos(0.15) * 34;
            bobber.position.set(bx, 0.9 + GROUND, bz);
            world.add(bobber);
            animations.push((dt, time) => {
                bobber.position.y = 0.9 + GROUND + Math.sin(time * 2.4) * 0.3;
            });
            // the fishing line from the rod tip down to the bobber
            const tipLocal = gn.rodTip;
            const yaw = Math.PI + 0.15;
            const tip = new THREE.Vector3(tipLocal.x * Math.cos(yaw) + tipLocal.z * Math.sin(yaw), tipLocal.y, -tipLocal.x * Math.sin(yaw) + tipLocal.z * Math.cos(yaw)).add(new THREE.Vector3(pond.x - 6, 0, pond.z + pond.rz + 22));
            const end = new THREE.Vector3(bx, 1.2, bz);
            const line = cyl(0.12, 0.12, tip.distanceTo(end), G.white, 3);
            line.position.copy(tip).add(end).multiplyScalar(0.5);
            line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tip.clone().sub(end).normalize());
            root.add(line);
        }

        // ---------------------------------------------------------- the tree with the swing and the bunting
        const treeX = 150;
        const treeZ = -118;
        {
            const t = tree(150, 52, '#3f9b4b');
            if (put(t, treeX, treeZ, 14, 0, 0, { exact: true, reach: 16 })) {
                // a branch for the swing
                const branchFrom = new THREE.Vector3(treeX - 4, 112, treeZ);
                const branchTo = new THREE.Vector3(treeX - 62, 122, treeZ + 6);
                const br = cyl(3, 5, branchFrom.distanceTo(branchTo), G.woodDark, 8);
                br.position.copy(branchFrom).add(branchTo).multiplyScalar(0.5);
                br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), branchTo.clone().sub(branchFrom).normalize());
                root.add(br);
                root.add(at(sphere(22, '#4aa34a', 12, 9), branchTo.x - 6, branchTo.y + 10, branchTo.z));
                const pivot = new THREE.Vector3(treeX - 48, 118, treeZ + 5);
                const swing = new THREE.Group();
                const ropeLen = 92;
                for (const s of [-1, 1]) {
                    const rope = cyl(0.5, 0.5, ropeLen, G.cream, 5);
                    rope.position.set(0, -ropeLen / 2, s * 9);
                    swing.add(rope);
                }
                swing.add(at(roundBox(12, 2.2, 24, 0.8, G.red, 1), 0, -ropeLen, 0));
                const swingModel = mergeByMaterial(group(swing));
                swingModel.userData.keep = true;
                swingModel.position.set(pivot.x, pivot.y + GROUND, pivot.z);
                world.add(swingModel);
                animations.push((dt, time) => {
                    swingModel.rotation.z = Math.sin(time * 1.3) * 0.32;
                });
                // a little patch of worn lawn under the swing
                const worn = new THREE.Mesh(new THREE.CircleGeometry(16, 20), toon('#a98a58'));
                worn.rotation.x = -Math.PI / 2;
                worn.scale.set(1.6, 1, 1);
                worn.position.set(pivot.x, 0.03, pivot.z);
                root.add(worn);
                reserve(pivot.x, pivot.z, 22);
                // bunting from the tree to a pole beyond the path
                const pole = new THREE.Vector3(treeX + 110, 0, treeZ + 70);
                if (!track.isNearRoad(pole.x, pole.z, 6)) {
                    root.add(at(cyl(1.6, 2, 78, G.white, 8), pole.x, 39, pole.z));
                    root.add(at(sphere(2.6, G.red, 8, 6), pole.x, 79, pole.z));
                    const a = new THREE.Vector3(treeX + 8, 76, treeZ + 4);
                    const c = new THREE.Vector3(pole.x, 76, pole.z);
                    const steps = 22;
                    const pts = [];
                    for (let k = 0; k <= steps; k++) {
                        const t = k / steps;
                        pts.push(new THREE.Vector3().lerpVectors(a, c, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * 12, 0)));
                    }
                    const curve = new THREE.CatmullRomCurve3(pts);
                    root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.3, 4), toon(G.dark)));
                    const flagColors = [G.red, G.yellow, G.blue, G.lime, G.pink, G.orange];
                    for (let k = 1; k < steps; k++) {
                        const p0 = pts[k];
                        const dir = pts[k + 1].clone().sub(pts[k - 1]).normalize();
                        const flag = shape([[-2.6, 0], [2.6, 0], [0, -6]], toon(flagColors[k % flagColors.length], { side: THREE.DoubleSide }), 0);
                        flag.position.copy(p0);
                        flag.rotation.y = -Math.atan2(dir.z, dir.x);
                        root.add(flag);
                    }
                }
            }
        }

        // ---------------------------------------------------------- the picnic party
        const party = { x: -48, z: -58 };
        {
            const blanket = new THREE.Mesh(new THREE.BoxGeometry(92, 0.4, 70), blanketMaterial());
            blanket.position.set(party.x, 0.2, party.z);
            blanket.rotation.y = 0.25;
            blanket.receiveShadow = true;
            root.add(blanket);
            reserve(party.x, party.z, 50);
            const P = new THREE.Group();
            P.add(at(cake(), 0, 0.4, 0));
            const cups = [G.red, G.blue, G.yellow, G.teal, G.pink];
            cups.forEach((col, k) => P.add(at(cup(col), Math.cos(k * 1.25 + 0.3) * 24, 0.4, Math.sin(k * 1.25 + 0.3) * 18)));
            P.add(at(plate('cake'), -30, 0.4, 6));
            P.add(at(plate('cake'), 18, 0.4, -20));
            P.add(at(plate('sandwich'), 30, 0.4, 12));
            P.add(at(partyHat(G.blue), -16, 0.4, 22));
            P.add(at(partyHat(G.pink), 36, 0.4, -8));
            const fallen = partyHat(G.yellow);
            fallen.rotation.z = 1.4;
            P.add(at(fallen, -36, 3.8, -18));
            P.add(at(gift(10, G.purple, G.yellow), -24, 0.4, -24, 0.3));
            P.add(at(gift(8, G.teal, G.red), 8, 0.4, 24, -0.4));
            // a juice bottle
            P.add(at(cyl(4.2, 4.2, 16, G.orange, 12), 40, 8.4, 20));
            P.add(at(cyl(4.3, 4.3, 5, G.white, 12), 40, 9, 20));
            P.add(at(cyl(1.6, 3.6, 5, G.orange, 12), 40, 19, 20));
            P.add(at(cyl(1.8, 1.8, 2, G.red, 10), 40, 22.4, 20));
            // a big toy friend at the party: a stuffed bunny sitting at the blanket
            const bunny = new THREE.Group();
            bunny.add(at(scaled(sphere(9, G.white, 14, 10), 1, 1.15, 0.9), 0, 9, 0));
            bunny.add(at(sphere(6.5, G.white, 14, 10), 0, 22, 1));
            for (const s of [-1, 1]) {
                const ear = sphere(2.6, G.white, 10, 8);
                ear.scale.set(1, 3, 0.6);
                ear.position.set(s * 3, 31, 0);
                ear.rotation.z = -s * 0.2;
                bunny.add(ear);
                const inner = sphere(1.4, G.pink, 8, 6);
                inner.scale.set(1, 3.2, 0.5);
                inner.position.set(s * 3.1, 31, 1.3);
                inner.rotation.z = -s * 0.2;
                bunny.add(inner);
                bunny.add(at(sphere(0.8, G.black, 6, 5), s * 2.4, 23.5, 6.6));
                bunny.add(at(scaled(sphere(3.2, G.white, 10, 8), 1, 0.7, 1.6), s * 5, 2.6, 7));
            }
            bunny.add(at(sphere(1, G.pink, 8, 6), 0, 21.6, 7.4));
            bunny.add(at(scaled(sphere(4.5, G.pink, 10, 8), 1, 1.2, 0.5), 0, 9, 6.6));
            bunny.position.set(-44, 0.4, 14);
            bunny.rotation.y = 0.9;
            P.add(bunny);
            P.position.set(party.x, 0, party.z);
            P.rotation.y = 0.25;
            root.add(P);
            // the balloons tied to a peg at the blanket's corner
            const bl = balloons();
            const peg = new THREE.Vector3(party.x + 46, 0, party.z - 32);
            root.add(at(cyl(0.8, 0.5, 5, G.woodDark, 6), peg.x, 2.5, peg.z));
            bl.position.set(peg.x, 4 + GROUND, peg.z);
            world.add(bl);
            animations.push((dt, time) => {
                bl.rotation.z = Math.sin(time * 0.9) * 0.08;
                bl.rotation.x = Math.sin(time * 0.7 + 1) * 0.06;
                bl.rotation.y = Math.sin(time * 0.3) * 0.4;
            });
        }

        // ---------------------------------------------------------- the sprinkler on the hose (animated water)
        const spr = { x: 62, z: -78 };
        {
            const reel = hoseReel();
            put(reel, -150, -78, 14, 0.4, 0, { exact: true });
            const path = [[-142, -78], [-128, -96], [-100, -108], [-70, -116], [-36, -106], [-6, -96], [20, -86], [40, -92], [spr.x - 4, spr.z - 2]];
            const ok = path.every(([x, z]) => !track.isNearRoad(x, z, 4.5));
            if (ok) root.add(hose(path));
            const base = new THREE.Group();
            base.add(at(roundBox(16, 3, 10, 1.4, G.dark, 1), 0, 1.5, 0));
            base.add(at(cyl(1.4, 1.4, 12, G.yellow, 8), 0, 8, 0));
            put(base, spr.x, spr.z, 8, 0, 0, { exact: true });
            const head = new THREE.Group();
            head.add(at(cyl(2.4, 2.4, 3, G.blue, 10), 0, 0, 0));
            for (const s of [-1, 1]) {
                const arm = cyl(0.8, 0.8, 9, G.blue, 6);
                arm.rotation.z = Math.PI / 2 - s * 0.35;
                arm.position.set(s * 4.4, 1.6, 0);
                head.add(arm);
            }
            const headModel = mergeByMaterial(group(head));
            headModel.userData.keep = true;
            headModel.position.set(spr.x, 15 + GROUND, spr.z);
            world.add(headModel);
            // a dark wet patch
            const wet = new THREE.Mesh(new THREE.CircleGeometry(38, 28), toon(G.grassDark));
            wet.rotation.x = -Math.PI / 2;
            wet.position.set(spr.x, 0.02, spr.z);
            root.add(wet);
            const N = quality === 'low' ? 60 : 140;
            const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 6, 4), fx('#cfefff', { opacity: 0.85 }), N);
            drops.layers.set(LAYER_FX);
            drops.userData.keep = true;
            drops.frustumCulled = false;
            world.add(drops);
            const m = new THREE.Matrix4();
            const T = 1.5;
            const g = 46;
            const spin = 1.6;
            animations.push((dt, time) => {
                headModel.rotation.y = time * spin;
                for (let k = 0; k < N; k++) {
                    const phase = (time / T + k / N) % 1;
                    const t = phase * T;
                    const born = time - t;
                    const angle = -born * spin + (k % 2 ? Math.PI : 0) + (k % 7) * 0.02;
                    const vh = 26 + (k % 5) * 3;
                    const vy = 30;
                    const x = spr.x + Math.cos(angle) * vh * t;
                    const z = spr.z + Math.sin(angle) * vh * t;
                    const y = 17 + GROUND + vy * t - 0.5 * g * t * t;
                    const sc = y < GROUND ? 0 : 1 - phase * 0.4;
                    m.makeScale(sc, sc * 1.6, sc).setPosition(x, y, z);
                    drops.setMatrixAt(k, m);
                }
                drops.instanceMatrix.needsUpdate = true;
            });
        }

        // ---------------------------------------------------------- stepping stones from the party to the tree
        {
            const pts = [[-4, -30], [14, -28], [32, -32], [50, -38], [72, -44], [92, -52], [106, -66], [116, -82]];
            for (const [x, z] of pts) {
                const st = steppingStone(rng.range(5, 6.5), rng.pick([G.stoneLight, G.stone]));
                if (!track.isNearRoad(x, z, 10) && !reserved.some(r => Math.hypot(r.x - x, r.z - z) < r.r - 4)) {
                    st.position.set(x, 0, z);
                    st.rotation.y = rng() * 3;
                    root.add(st);
                }
            }
            for (const [x, z] of pts) reserve(x, z, 7);
        }

        // ---------------------------------------------------------- flower beds (soil + tulips) and the sunflower border
        const tulipItems = [];
        const stemItems = [];
        const tulipColors = [G.red, G.yellow, G.pink, G.purple, G.orange, G.red];
        const bed = (x, z, rx, rz, count, palette = tulipColors) => {
            if (track.isNearRoad(x, z, 4.5 + Math.max(rx, rz))) return false;
            const soil = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.06, 1, 24), toon(G.soil));
            soil.scale.set(rx, 1.2, rz);
            soil.position.set(x, 0.3, z);
            soil.receiveShadow = true;
            root.add(soil);
            // an edging of small stones
            for (let k = 0; k < 22; k++) {
                const a = (k / 22) * Math.PI * 2;
                root.add(at(roundBox(4, 1.8, 3, 0.7, G.stoneLight, 1), x + Math.cos(a) * (rx + 1), 0.9, z + Math.sin(a) * (rz + 1), -a));
            }
            const color = rng.pick(palette);
            for (let k = 0; k < count * q + 4; k++) {
                const a = rng() * Math.PI * 2;
                const r = Math.sqrt(rng()) * 0.85;
                const px = x + Math.cos(a) * r * rx;
                const pz = z + Math.sin(a) * r * rz;
                const h = rng.range(9, 14);
                stemItems.push({ x: px, y: 0.8, z: pz, ry: rng() * 6.3, s: 1, sy: h / 12, rz: (rng() - 0.5) * 0.15 });
                tulipItems.push({ x: px, y: 0.8 + h - 0.3, z: pz, ry: rng() * 6.3, s: rng.range(0.9, 1.15), color: rng() < 0.75 ? color : rng.pick(palette) });
            }
            reserve(x, z, Math.max(rx, rz) + 2);
            return true;
        };
        bed(-128, -22, 24, 16, 40);
        bed(26, -180, 22, 14, 36);
        bed(120, -40, 16, 12, 24, [G.yellow, G.orange]);
        bed(-170, 74, 34, 14, 50);
        bed(150, 78, 34, 14, 50);
        bed(-40, 88, 28, 12, 36, [G.pink, G.white, G.purple]);
        bed(60, 92, 26, 12, 34, [G.red, G.yellow]);
        bed(200, -240, 30, 14, 36);
        bed(-180, -235, 30, 13, 36);
        bed(240, 20, 16, 30, 40);
        // sunflowers along the back fence and beside the shed, some near the path
        const sunflowers = [];
        for (let x = yard.minX + 30; x < yard.maxX - 20; x += rng.range(20, 34)) sunflowers.push([x, yard.minZ + rng.range(14, 26)]);
        for (let z = yard.minZ + 40; z < yard.maxZ - 90; z += rng.range(26, 40)) sunflowers.push([yard.minX + rng.range(12, 22), z]);
        for (const [x, z] of [[24, -205], [40, -200], [10, -196], [-130, -195], [-150, -200], [-20, -50], [-110, -10]]) sunflowers.push([x, z]);
        for (const [x, z] of sunflowers) {
            if (!isFree(x, z, 3) && !(z < yard.minZ + 30 || x < yard.minX + 30)) continue;
            if (track.isNearRoad(x, z, 8)) continue;
            const f = sunflower(rng.range(32, 50), rng);
            f.position.set(x, 0, z);
            // face the garden's middle
            f.rotation.y = Math.atan2(cx - x, cz - z) + (rng() - 0.5) * 0.6;
            root.add(f);
        }

        // ---------------------------------------------------------- the vegetable patch (west), the shed (east), the birdbath, the watering can
        {
            const px = yard.minX + 48;
            const pz = -80;
            for (let r = 0; r < 4; r++) {
                const row = roundBox(18, 3, 120, 1.5, G.soil, 1);
                const x = px - 30 + r * 22;
                if (track.isNearRoad(x, pz, 15)) continue;
                row.position.set(x, 1.5, pz);
                root.add(row);
                for (let k = 0; k < 5; k++) {
                    const z = pz - 50 + k * 25;
                    const veg = r % 2 ? cabbage(rng.range(6, 8)) : r === 0 ? pumpkin(rng.range(8, 11)) : group(...[0, 1, 2].map(i => at(cone(1.2, 5, G.orange, 6).rotateX(Math.PI), i * 2 - 2, 1.5, 0)), at(cone(2, 7, G.lime, 5), 0, 6, 0));
                    veg.position.set(x + rng.range(-2, 2), 2.5, z);
                    veg.rotation.y = rng() * 6;
                    root.add(veg);
                }
                reserve(x, pz, 12);
                reserve(x, pz - 40, 12);
                reserve(x, pz + 40, 12);
            }
            put(wheelbarrow(), px + 70, pz - 76, 18, 0.8);
        }
        put(shed(), yard.maxX - 44, -70, 48, -Math.PI / 2);
        put(birdbath(), 36, -228, 14);
        put(wateringCan(), -20, 52, 12, -0.5);
        put(wateringCan(G.red), -150, -40, 12, 2.2);

        // ---------------------------------------------------------- bushes, toadstools, toys, rocks (near the path first)
        const inside = (x, z) => isFree(x, z, 4);
        /** Wraps a scatter factory: objects whose footprint would reach the road (barriers included) are skipped. */
        const fits = make => (r, place) => {
            const object = make(r, place);
            return object && !track.isNearRoad(place.x, place.z, 4.5 + footprint(object)) ? object : null;
        };
        const scatterSet = (count, opts) => scatter(root, track, { rng, inside, margin: 90, ...opts, make: fits(opts.make), count: Math.max(1, Math.round(count * q)) });
        scatterSet(18, { clearance: 12, spacing: 30, maxDistance: 60, make: r => bush(r.range(7, 12), r.pick([G.leaf, '#4aa34a', G.leafDark]), r() < 0.5 ? r.pick([G.pink, G.yellow, G.white, G.red]) : null) });
        scatterSet(16, { clearance: 7, spacing: 18, maxDistance: 30, make: r => toadstool(r.range(3.5, 7)) });
        scatterSet(14, { clearance: 6, spacing: 12, maxDistance: 26, make: r => roundBox(r.range(4, 9), r.range(2.5, 5), r.range(4, 8), 1.5, r.pick([G.stone, G.stoneLight, G.stoneDark]), 1) });
        scatterSet(4, { clearance: 8, spacing: 50, maxDistance: 50, make: r => {
            // a two-coloured play ball
            const half = c => new THREE.Mesh(new THREE.SphereGeometry(7, 14, 6, 0, Math.PI * 2, c ? 0 : Math.PI / 2, Math.PI / 2), toon(c ? r.pick([G.red, G.blue]) : G.white, { steps: 4 }));
            const ball = group(half(true), half(false));
            ball.position.y = 7;
            ball.rotation.z = r.range(-0.6, 0.6);
            ball.children.forEach(m => { m.castShadow = m.receiveShadow = true; });
            return group(ball);
        } });
        scatterSet(3, { clearance: 9, spacing: 60, maxDistance: 60, make: () => group(at(cyl(9, 7, 11, G.yellow, 14), 0, 5.5, 0), at(torus(5, 0.5, G.red, 6, 12, Math.PI), 0, 11, 0)) });
        scatterSet(3, { clearance: 8, spacing: 60, maxDistance: 70, make: r => group(at(cyl(9, 9, 1.2, r.pick([G.pink, G.blue, G.lime]), 18), 0, 0.6, 0), at(torus(8.6, 0.8, G.white, 6, 18), 0, 1.2, 0).rotateX(Math.PI / 2)) });
        // snails
        scatterSet(5, { clearance: 6, spacing: 30, maxDistance: 40, make: r => {
            const sn = new THREE.Group();
            sn.add(at(roundBox(14, 3, 4, 1.4, G.cream, 2), 0, 1.5, 0));
            sn.add(at(sphere(2.2, G.cream, 10, 8), 7, 3.6, 0));
            for (const s of [-1, 1]) {
                sn.add(at(cyl(0.3, 0.3, 4, G.cream, 4), 8, 6.5, s * 1).rotateZ(-0.3));
                sn.add(at(sphere(0.7, G.black, 6, 4), 8.6, 8.5, s * 1));
            }
            const shell = torus(3.2, 2.6, r.pick([G.orange, G.brown, G.purple]), 8, 16);
            shell.position.set(-1, 7, 0);
            sn.add(shell);
            sn.add(at(scaled(sphere(2.4, G.yellow, 8, 6), 1, 1, 1.4), -1, 7, 0));
            return sn;
        } });
        scatterSet(10, { clearance: 25, spacing: 40, make: r => bush(r.range(10, 18), r.pick([G.leaf, '#4aa34a', G.leafDark]), r() < 0.4 ? r.pick([G.pink, G.yellow, G.white]) : null) });

        // ---------------------------------------------------------- the many small plants (instanced): grass tufts, daisies, tulips
        const tufts = [];
        const daisyItems = [];
        const greens = ['#5fae36', '#72c447', '#4f9a2e', '#86d057', '#64b83c'];
        const tuftCount = Math.round(3000 * q);
        for (let k = 0, tries = 0; k < tuftCount && tries < tuftCount * 4; tries++) {
            // biased towards the path (that is where the camera looks)
            const near = rng() < 0.6;
            let x;
            let z;
            if (near) {
                const i = Math.floor(rng() * track.count);
                const { nx, nz } = track.normalAt(i);
                const l = (track.w[i] / 2 + 4.6 + rng() * 26) * (rng() < 0.5 ? 1 : -1);
                x = track.x[i] + nx * l;
                z = track.z[i] + nz * l;
            } else {
                x = rng.range(yard.minX, yard.maxX);
                z = rng.range(yard.minZ, yard.maxZ - 75);
            }
            if (track.isNearRoad(x, z, 4.6)) continue;
            if (Math.hypot((x - pond.x) / (pond.rx + 3), (z - pond.z) / (pond.rz + 3)) < 1) continue;
            if (Math.hypot(x - party.x, z - party.z) < 48) continue;
            const s = rng.range(0.8, 1.6);
            tufts.push({ x, y: 0, z, ry: rng() * 6.3, s, sy: s * rng.range(0.8, 1.3), color: rng.pick(greens) });
            if (rng() < 0.16) {
                const dx = x + rng.range(-2.5, 2.5);
                const dz = z + rng.range(-2.5, 2.5);
                if (!track.isNearRoad(dx, dz, 5.5)) daisyItems.push({ x: dx, y: 3.2, z: dz, rx: rng.range(-0.5, 0.5), rz: rng.range(-0.5, 0.5), s: rng.range(0.8, 1.2) });
            }
            k++;
        }
        root.add(instanced(tuftGeometry(), toon(0xffffff), tufts));
        root.add(instanced(daisyGeometry(), toon(G.white), daisyItems));
        root.add(instanced(new THREE.CylinderGeometry(0.9, 0.9, 0.5, 6), toon(G.yellow), daisyItems.map(d => ({ ...d, y: d.y + 0.55 * Math.cos(d.rx), x: d.x - 0.55 * Math.sin(d.rz), z: d.z + 0.55 * Math.sin(d.rx) }))));
        root.add(instanced(new THREE.CylinderGeometry(0.18, 0.22, 3.2, 3, 1, true), toon(G.leaf), daisyItems.map(d => ({ x: d.x, y: 1.6, z: d.z, s: 1 }))));
        root.add(instanced(stemGeometry(12), toon(G.leaf), stemItems));
        root.add(instanced(tulipHeadGeometry(), toon(0xffffff), tulipItems, { cast: true }));

        // ---------------------------------------------------------- butterflies (animated)
        const butterflies = [];
        const bfColors = [[G.yellow, G.orange], [G.sky, G.blue], [G.pink, G.purple], [G.white, G.yellow]];
        const nb = quality === 'low' ? 2 : 4;
        for (let k = 0; k < nb; k++) {
            const [c1, c2] = bfColors[k % bfColors.length];
            const bf = new THREE.Group();
            const wings = [];
            for (const s of [-1, 1]) {
                const w = new THREE.Group();
                const up = shape([[0, 0], [2.5 * s, 3], [5 * s, 2.5], [4.5 * s, -0.5]], toon(c1, { side: THREE.DoubleSide }), 0);
                const low = shape([[0, 0], [3.4 * s, -1.2], [2.6 * s, -3.4]], toon(c2, { side: THREE.DoubleSide }), 0);
                w.add(up, low);
                w.rotation.x = -Math.PI / 2;
                const hinge = new THREE.Group();
                hinge.add(w);
                bf.add(hinge);
                wings.push([hinge, s]);
            }
            bf.add(at(cyl(0.35, 0.35, 4, G.dark, 5), 0, 0, -0.5).rotateX(Math.PI / 2));
            bf.userData.keep = true;
            world.add(bf);
            const home = [[party.x, party.z], [treeX - 40, treeZ + 20], [-128, -22], [26, -180]][k % 4];
            butterflies.push({ bf, wings, home, r: rng.range(14, 26), speed: rng.range(0.4, 0.7) * (k % 2 ? 1 : -1), h: rng.range(14, 26), phase: rng() * 6 });
        }
        animations.push((dt, time) => {
            for (const b of butterflies) {
                const a = time * b.speed + b.phase;
                const x = b.home[0] + Math.cos(a) * b.r + Math.sin(a * 2.3) * 4;
                const z = b.home[1] + Math.sin(a) * b.r;
                b.bf.position.set(x, b.h + Math.sin(time * 3 + b.phase) * 3, z);
                b.bf.rotation.y = -a + (b.speed > 0 ? Math.PI : 0);
                const flap = Math.sin(time * 18 + b.phase) * 0.9;
                for (const [hinge, s] of b.wings) hinge.rotation.z = s * flap;
            }
        });

        // ---------------------------------------------------------- lights: none needed by day; garden lanterns at night
        const lights = [];
        if (night) {
            for (const [x, z, c] of [[party.x, party.z, '#ffd27a'], [treeX - 40, treeZ + 10, '#ffe2a0'], [hx - 150, terraceZ0 + 36, '#ffcf7a']]) {
                const l = new THREE.PointLight(c, 1400, 200, 1.6);
                l.position.set(x, 40, z);
                lights.push(l);
            }
            // lanterns as glowing balls along the bunting / terrace
            for (let k = 0; k < 8; k++) root.add(at(sphere(2.6, flat(['#ffd27a', '#ff9a5a', '#fff2a0'][k % 3]), 10, 8), hx - 280 + k * 80, 160, houseZ - 6));
        }

        return {
            lights,
            update(dt, time) {
                for (const a of animations) a(dt, time);
            },
        };
    },
};

