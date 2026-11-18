// TurboToys · themes/attic.js – "Dachboden bei Nacht": a dusty attic at night under a steep roof. Moonlight falls through a round gable window,
// candles line the plank road, strings of warm bulbs hang across it between old posts, a lantern glows on a trunk. Around the track: trunks
// and suitcases, ghostly sheets over furniture, a rocking horse, a dress form, stacks of old books, labelled boxes, cobwebs and floating dust.
// The road climbs onto a plateau of giant old books (y ≈ 5) in its first third.

import * as THREE from 'three';
import { toon, flat, fx, fxLayer, box, cyl, sphere, at, group, canvasTexture, LAYER_FX } from '../render/toon.js';
import { scatter, lamp } from './common.js';
import {
    A, BOOK_COLORS, sunkenFloor, floorBoards, roofBoards, brickTexture, windowTexture, webTexture, boxLabel, portraitTexture, book, bookStack,
    openBook, trunk, suitcase, cardboardBox, toyChest, drape, rockingHorse, mannequin, lantern, gramophone, birdcage, painting, rolledCarpet,
    floorLamp, chimney, candle,
} from './attic-props.js';

const KNEE = 40; // height of the knee walls
const RIDGE = 262; // height of the ridge
const SUN = new THREE.Vector3(182, 150, 18).normalize(); // towards the round window (the moon)

function roadPattern(ctx, w, h) {
    // boards across the road: warm, worn, nailed
    const tones = ['#a8784a', '#b08050', '#9c6e44', '#a67a4c', '#b4865a'];
    const step = 48;
    for (let y = 0, k = 0; y < h; y += step, k++) {
        ctx.fillStyle = tones[k % tones.length];
        ctx.fillRect(0, y, w, step);
        ctx.strokeStyle = 'rgba(70,40,20,0.3)';
        ctx.lineWidth = 2;
        for (let g = 0; g < 2; g++) {
            const gy = y + 14 + g * 18;
            ctx.beginPath();
            ctx.moveTo(0, gy);
            ctx.bezierCurveTo(w * 0.35, gy + 5, w * 0.65, gy - 5, w, gy + 2);
            ctx.stroke();
        }
        ctx.fillStyle = '#3a2412';
        ctx.fillRect(0, y, w, 4);
        ctx.fillStyle = '#5a5048';
        for (const x of [0.13, 0.87]) {
            ctx.beginPath();
            ctx.arc(w * x, y + step / 2, 3.2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // a knot and a worn track in the middle
    ctx.fillStyle = 'rgba(60,34,16,0.5)';
    ctx.beginPath();
    ctx.ellipse(w * 0.3, h * 0.4, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,230,190,0.08)';
    ctx.fillRect(w * 0.25, 0, w * 0.18, h);
    ctx.fillRect(w * 0.57, 0, w * 0.18, h);
}

export default {
    key: 'attic',
    name: 'Dachboden bei Nacht',
    forceTime: 'night',
    sky: { top: '#1a1630', bottom: '#3a3050', fog: '#2c2444', fogNear: 170, fogFar: 720 },
    light: {
        sun: '#b4c6ff', sunIntensity: 6.5, sunDirection: [SUN.x, SUN.y, SUN.z],
        ambient: '#7c78c0', ambientIntensity: 0.9, hemiSky: '#7d8ae0', hemiGround: '#4a3428', hemiIntensity: 1.3,
    },
    road: {
        surface: '#a8784a', surfaceDark: '#6a4628', pattern: roadPattern, line: '#f3e2b0', edge: '#f5c060',
        curb: ['#c9a36a', '#5b3b24'], barrier: 'books', barrierColors: BOOK_COLORS, skirt: '#4a3020',
        kicker: ['#e8c87a', '#5b3b24', '#4a3020'], gantry: '#3a2a20',
    },

    build({ root, track, rng, quality }) {
        const q = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
        const b = track.bounds;
        const room = { minX: b.minX - 100, maxX: b.maxX + 100, minZ: b.minZ - 90, maxZ: b.maxZ + 90 };
        room.ridgeZ = (room.minZ + room.maxZ) / 2;
        room.half = (room.maxZ - room.minZ) / 2;
        const roofY = z => KNEE + (RIDGE - KNEE) * Math.max(0, 1 - Math.abs(z - room.ridgeZ) / room.half);

        const free = (x, z, r) => !track.isNearRoad(x, z, r + 5);
        const spot = (x, z, r, height = 0) => {
            const ok = (px, pz) => free(px, pz, r) && roofY(pz) > height + 8 && px > room.minX + r && px < room.maxX - r && pz > room.minZ + r && pz < room.maxZ - r;
            if (ok(x, z)) return { x, z };
            for (let ring = 1; ring < 25; ring++) {
                for (let k = 0; k < 16; k++) {
                    const a = (k / 16) * Math.PI * 2;
                    const px = x + Math.cos(a) * ring * 5;
                    const pz = z + Math.sin(a) * ring * 5;
                    if (ok(px, pz)) return { x: px, z: pz };
                }
            }
            return null;
        };
        /** Places a prop near (x, z) (moved off the road if needed); r = footprint radius, height for the sloped roof. */
        const put = (object, x, z, r, yaw = 0, height = 0) => {
            const p = spot(x, z, r + 6, height);
            if (!p) return null;
            object.position.set(p.x, object.position.y, p.z);
            object.rotation.y = yaw;
            root.add(object);
            return object;
        };
        /** Turns an object at (x, z) to face the nearest road point. */
        const faceRoad = (x, z) => {
            const p = track.locate(x, z);
            return Math.atan2(track.x[p.index] - x, track.z[p.index] - z);
        };

        // ---- floor, roof, gables, the round window with the moon
        const floorMaterial = toon(0xffffff, { map: canvasTexture(512, 512, floorBoards, { repeat: [1, 1] }) });
        root.add(sunkenFloor(track, { size: 1200, tile: 60, material: floorMaterial }));
        buildShell(root, room, roofY, rng);

        // ---- the plateau of giant books and the book stacks under the ramps
        const glow = { flames: [], bulbs: [] };
        buildPlateau(root, track, rng, glow);

        // ---- candles along both road edges (on the floor; the plateau places its own)
        const n = track.count;
        const candleStep = 13;
        for (const side of [1, -1]) {
            let next = side > 0 ? 0 : candleStep / 2;
            for (let i = 0; i < n; i++) {
                if (track.s[i] < next) continue;
                next += candleStep;
                if (track.y[i] > 0.3) continue;
                if (track.s[i] < 16 || track.s[i] > track.length - 16) continue; // the start gantry
                const p = track.pointAt(i, side * (track.w[i] / 2 + 4.6));
                if (track.isNearRoad(p.x, p.z, 3.2)) continue;
                const c = candle(rng);
                c.position.set(p.x, 0, p.z);
                root.add(c);
                glow.flames.push(new THREE.Vector3(p.x, c.userData.flameY, p.z));
            }
        }

        // ---- strings of bulbs across the road between old posts; the lights of the world
        const lights = [];
        const garlands = Math.round(11 * (q < 1 ? 0.8 : 1));
        const lightAt = new Set([2, 5, 8]);
        for (let k = 0; k < garlands; k++) {
            const i = Math.floor(((k + 0.5) / garlands) * n);
            const half = track.w[i] / 2 + 17;
            const a = track.pointAt(i, half);
            const c = track.pointAt(i, -half);
            if (!free(a.x, a.z, 1) || !free(c.x, c.z, 1)) continue;
            const base = Math.max(0, track.heightAt(i));
            for (const p of [a, c]) {
                const top = roofY(p.z);
                root.add(at(box(5, top, 5, A.beam), p.x, top / 2, p.z));
                root.add(at(box(9, 3, 9, A.woodDark), p.x, 1.5, p.z));
                root.add(at(box(7, 2, 7, A.woodDark), p.x, base + 36, p.z));
            }
            const y0 = base + 36;
            const sag = 11;
            const segments = 14;
            const pts = [];
            for (let s = 0; s <= segments; s++) {
                const t = s / segments;
                pts.push(new THREE.Vector3(a.x + (c.x - a.x) * t, y0 - sag * 4 * t * (1 - t), a.z + (c.z - a.z) * t));
            }
            for (let s = 0; s < segments; s++) root.add(wire(pts[s], pts[s + 1]));
            for (let s = 1; s < segments; s++) {
                const t = s / segments;
                glow.bulbs.push(new THREE.Vector3(a.x + (c.x - a.x) * t, y0 - sag * 4 * t * (1 - t) - 1.1, a.z + (c.z - a.z) * t));
            }
            if (lightAt.has(k) && lights.length < 3) {
                const l = lamp('#ffb25e', 1100, 150);
                l.position.set(track.x[i], y0 - sag - 3, track.z[i]);
                lights.push(l);
            }
        }

        // ---- the lantern on a trunk by the start
        const lanternGlow = flat('#ffc860');
        const lanternTrunk = group(trunk(A.green), at(lantern(lanternGlow), 8, 30, 2));
        const lt = put(lanternTrunk, 22, -46, 32, 0.08, 60);
        if (lt) {
            const l = lamp('#ffb050', 1200, 140);
            l.position.set(lt.position.x, 42, lt.position.z + 8);
            lights.push(l);
            glow.lantern = l;
        }

        // ---- the big characters
        const labels = ['WEIHNACHTEN', 'OMAS GESCHIRR', 'KRAM', 'BÜCHER', 'VORSICHT GLAS!', 'FOTOS 1970', 'NICHT ÖFFNEN!'].map(t => toon(0xffffff, { map: boxLabel(t) }));
        const ghost = [['wardrobe', 40, 64, 40, 165], ['chair', 92, 58, 45, 70], ['table', -20, 50, 50, 50], ['clock', -110, 40, 24, 200], ['wardrobe', -185, -40, 40, 165], ['chair', 205, 170, 45, 70]];
        for (const [kind, x, z, r, h] of ghost) put(drape(kind), x, z, r, faceRoad(x, z) + (rng() - 0.5) * 0.6, h);
        put(rockingHorse(), -64, 50, 34, faceRoad(-64, 50) + 1.2, 75);
        put(mannequin(), 214, 32, 24, faceRoad(214, 32), 135);
        put(mannequin('#c8a882'), -200, 128, 24, 0.6, 135);
        put(gramophone(), 70, -58, 26, faceRoad(70, -58), 60);
        put(birdcage(), 128, -52, 22, 0.4, 90);
        put(toyChest(toon(0xffffff, { map: boxLabel('SPIELZEUG', '#f6c638') })), -78, -56, 34, faceRoad(-78, -56), 45);
        put(rolledCarpet(110), -150, -60, 58, 0.3, 20);
        put(rolledCarpet(90, '#2f4a6a'), 90, 200, 48, 0.1, 20);
        put(floorLamp(), -150, 160, 22, 0, 110);
        put(painting(toon(0xffffff, { map: canvasTexture(128, 160, portraitTexture) })), 40, room.minZ + 10, 34, 0, 80);
        put(painting(toon(0xffffff, { map: canvasTexture(128, 160, portraitTexture) }), 40, 50), -60, room.maxZ - 10, 30, Math.PI, 70);
        const chim = chimney(RIDGE, toon(0xffffff, { map: canvasTexture(256, 256, brickTexture, { repeat: [2, 11] }) }));
        put(chim, room.minX + 70, room.ridgeZ + 10, 34, 0, 0);

        // stacks of trunks and suitcases (tall: away from the road)
        const trunkColors = [A.green, A.red, A.navy, A.leather, A.plum, '#6a5a3a'];
        const stack = (r) => {
            const g = group();
            let y = 0;
            const t = trunk(r.pick(trunkColors), 56 + r() * 10, 30, 38 + r() * 6);
            g.add(t);
            y = 30;
            const cases = r.int(1, 3);
            for (let k = 0; k < cases; k++) {
                const s = suitcase(r.pick(trunkColors), 40 - k * 4 + r() * 6, 11 + r() * 3, 28 - k * 2);
                s.position.set((r() - 0.5) * 6, y, (r() - 0.5) * 4);
                s.rotation.y = (r() - 0.5) * 0.5;
                g.add(s);
                y += 12;
            }
            if (r() < 0.5) {
                const books = bookStack(r, r.int(2, 4), 1.2);
                books.position.set((r() - 0.5) * 10, y, 0);
                g.add(books);
            }
            return g;
        };
        for (const [x, z] of [[-130, -40], [150, -50], [-40, -60], [180, 130], [-170, 90], [40, 175], [-90, 170], [230, -40]]) put(stack(rng), x, z, 36, faceRoad(x, z) + (rng() - 0.5) * 0.4, 75);
        // labelled boxes in towers
        const tower = (r) => {
            const g = group();
            let y = 0;
            const levels = r.int(1, 3);
            for (let k = 0; k < levels; k++) {
                const w = 40 - k * 5 + r() * 6;
                const h = 22 + r() * 8;
                const bx = cardboardBox(w, h, 32 - k * 3, r() < 0.8 ? r.pick(labels) : null);
                bx.position.set((r() - 0.5) * 4, y, (r() - 0.5) * 4);
                bx.rotation.y = (r() - 0.5) * 0.3;
                g.add(bx);
                y += h + 0.4;
            }
            return g;
        };
        for (const [x, z] of [[100, -70], [-100, -75], [0, -80], [120, 190], [-30, 195], [-200, 20], [240, 90], [-140, 205]]) put(tower(rng), x, z, 30, faceRoad(x, z), 95);

        // ---- more things scattered: medium further out, low things near the road
        scatter(root, track, {
            count: Math.round(22 * q), rng, clearance: 32, spacing: 40, margin: 80, minDistance: 32,
            inside: (x, z) => roofY(z) > 70 && x > room.minX + 30 && x < room.maxX - 30,
            make: r => {
                const k = r.int(0, 4);
                if (k === 0) return stack(r);
                if (k === 1) return tower(r);
                if (k === 2) return suitcase(r.pick(trunkColors));
                if (k === 3) return trunk(r.pick(trunkColors));
                return bookStack(r, r.int(4, 8), 1.6);
            },
        });
        const smallThings = [
            r => bookStack(r, r.int(1, 3)),
            r => bookStack(r, r.int(3, 6)),
            r => { const o = openBook(r.pick(BOOK_COLORS)); o.scale.setScalar(0.7); return group(o); },
            r => group(at(cyl(2.4, 2.4, 6, r.pick(['#c84a4a', '#3a6aa8', '#e8c040']), 10), 0, 3, 0), at(cyl(3.2, 3.2, 0.8, A.woodLight, 10), 0, 0.4, 0), at(cyl(3.2, 3.2, 0.8, A.woodLight, 10), 0, 5.6, 0)),
            r => group(...[0, 1, 2].map(k => at(sphere(1.6, r.pick(['#e2392f', '#2f6fd0', '#3f9b4b', '#f6c638']), 8, 6), (r() - 0.5) * 8, 1.6, (r() - 0.5) * 8))),
            r => group(at(box(10, 4, 7, r.pick([A.red, A.navy, A.plum])), 0, 2, 0), at(box(10.4, 1, 7.4, A.brass), 0, 4.2, 0)),
            r => group(at(cyl(3, 2.2, 3.4, A.white, 10), 0, 1.7, 0), at(cyl(4.4, 4.4, 0.5, A.white, 12), 0, 0.25, 0)),
        ];
        scatter(root, track, {
            count: Math.round(90 * q), rng, clearance: 11, spacing: 9, margin: 40, minDistance: 11, maxDistance: 36,
            make: r => r.pick(smallThings)(r),
        });

        // ---- cobwebs in the corners of rafters and knee walls
        const webMaterial = fx('#e4e8f8', { map: canvasTexture(256, 256, webTexture), opacity: 0.42 });
        for (let x = room.minX + 30; x < room.maxX - 20; x += 55) {
            for (const side of [1, -1]) {
                if (rng() < 0.35) continue;
                const size = 18 + rng() * 14;
                const web = new THREE.Mesh(new THREE.PlaneGeometry(size, size), webMaterial);
                web.geometry.translate(size / 2, size / 2, 0);
                web.position.set(x + 4, KNEE + 1, side > 0 ? room.minZ + 0.8 : room.maxZ - 0.8);
                web.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2);
                web.rotateX(Math.PI);
                root.add(fxLayer(web));
            }
        }

        // ---- the glow: flickering flames, bulbs, halos, dust in the moonbeam
        const fxState = buildGlow(root, glow, room, rng, q);

        return {
            lights,
            update(dt, t) {
                fxState.update(dt, t);
                if (glow.lantern) glow.lantern.intensity = 1200 * (0.9 + Math.sin(t * 9) * 0.04 + Math.sin(t * 23.7) * 0.05);
            },
        };
    },
};

/** A wire segment (thin dark cylinder) from a to b. */
function wire(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const mesh = cyl(0.22, 0.22, d.length(), A.ink, 4);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    mesh.castShadow = false;
    return mesh;
}

// ------------------------------------------------------------------ the roof, the gables, the window

function buildShell(root, room, roofY, rng) {
    const { minX, maxX, minZ, maxZ, ridgeZ, half } = room;
    const tile = 60;
    const material = toon(0xffffff, { map: canvasTexture(256, 256, roofBoards, { repeat: [1, 1] }) });
    const slope = Math.hypot(half, RIDGE - KNEE);
    const quad = (p, uv) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv.flat(), 2));
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, material);
        m.receiveShadow = true;
        return m;
    };
    const L = (maxX - minX) / tile;
    const S = slope / tile;
    // south slope (A, B, C | A, C, D), north slope reversed: both face into the room
    const sA = [minX, KNEE, minZ], sB = [maxX, KNEE, minZ], sC = [maxX, RIDGE, ridgeZ], sD = [minX, RIDGE, ridgeZ];
    root.add(quad([sA, sB, sC, sA, sC, sD], [[0, 0], [L, 0], [L, S], [0, 0], [L, S], [0, S]]));
    const nA = [minX, KNEE, maxZ], nB = [maxX, KNEE, maxZ], nC = [maxX, RIDGE, ridgeZ], nD = [minX, RIDGE, ridgeZ];
    root.add(quad([nA, nC, nB, nA, nD, nC], [[0, 0], [L, S], [L, 0], [0, 0], [0, S], [L, S]]));
    // knee walls
    const K = KNEE / tile;
    root.add(quad([[minX, 0, minZ], [maxX, 0, minZ], [maxX, KNEE, minZ], [minX, 0, minZ], [maxX, KNEE, minZ], [minX, KNEE, minZ]], [[0, 0], [L, 0], [L, K], [0, 0], [L, K], [0, K]]));
    root.add(quad([[minX, 0, maxZ], [maxX, KNEE, maxZ], [maxX, 0, maxZ], [minX, 0, maxZ], [minX, KNEE, maxZ], [maxX, KNEE, maxZ]], [[0, 0], [L, K], [L, 0], [0, 0], [0, K], [L, K]]));
    // gables (the east one has the round window)
    const windowY = 150;
    const windowR = 36;
    for (const east of [true, false]) {
        const u = z => (east ? z : -z);
        const pts = [[u(minZ), 0], [u(maxZ), 0], [u(maxZ), KNEE], [u(ridgeZ), RIDGE], [u(minZ), KNEE]].map(([x, y]) => new THREE.Vector2(x, y));
        const s = new THREE.Shape(pts);
        if (east) {
            const hole = new THREE.Path();
            hole.absarc(u(ridgeZ), windowY, windowR, 0, Math.PI * 2, true);
            s.holes.push(hole);
        }
        const g = new THREE.ShapeGeometry(s, 24);
        const uv = g.attributes.uv;
        const p = g.attributes.position;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, p.getX(k) / tile, p.getY(k) / tile);
        const m = new THREE.Mesh(g, material);
        m.rotation.y = east ? -Math.PI / 2 : Math.PI / 2;
        m.position.x = east ? maxX : minX;
        m.receiveShadow = true;
        root.add(m);
    }
    // the window: moon sky (unlit), frame, mullions, sill
    const glass = new THREE.Mesh(new THREE.CircleGeometry(windowR + 1, 28), flat(0xffffff, { map: canvasTexture(256, 256, windowTexture), fog: false }));
    glass.position.set(maxX + 1.5, windowY, ridgeZ);
    glass.rotation.y = -Math.PI / 2;
    root.add(glass);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(windowR + 1, 3.4, 6, 28), toon(A.woodDark));
    frame.position.set(maxX - 1, windowY, ridgeZ);
    frame.rotation.y = Math.PI / 2;
    root.add(frame);
    root.add(at(box(3, windowR * 2, 3, A.woodDark), maxX, windowY, ridgeZ), at(box(3, 3, windowR * 2, A.woodDark), maxX, windowY, ridgeZ));
    root.add(at(box(10, 3, windowR * 1.6, A.woodDark), maxX - 4, windowY - windowR - 3, ridgeZ));
    // the moonbeam and the patch of moonlight on the floor (additive, no ink)
    const from = new THREE.Vector3(maxX, windowY, ridgeZ);
    const to = from.clone().addScaledVector(SUN, -windowY / SUN.y);
    const beamLength = from.distanceTo(to);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(windowR, windowR * 1.1, beamLength, 20, 1, true), fx('#8a9ee6', { opacity: 0.035, additive: true }));
    beam.position.copy(from).add(to).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SUN);
    root.add(fxLayer(beam));
    const patch = new THREE.Mesh(new THREE.CircleGeometry(1, 28), fx('#b4c6ff', { opacity: 0.22, additive: true }));
    patch.rotation.x = -Math.PI / 2;
    patch.scale.set((windowR * SUN.x) / SUN.y + 4, windowR + 2, 1);
    patch.position.set(to.x, 0.1, to.z);
    root.add(fxLayer(patch));
    // cross shadow of the mullions in the patch
    const bar = fx('#000000', { opacity: 0.25 });
    for (const [w, d] of [[(windowR * 2 * SUN.x) / SUN.y, 3], [3.6, windowR * 2]]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), bar);
        m.rotation.x = -Math.PI / 2;
        m.position.set(to.x, 0.12, to.z);
        root.add(fxLayer(m));
    }
    room.beam = { from, to, radius: windowR };

    // rafters, ridge beam, purlins, collar ties
    const beamColor = A.beam;
    const noShadow = { cast: false, receive: true };
    const phi = Math.atan2(RIDGE - KNEE, half);
    const inS = new THREE.Vector3(0, -half, RIDGE - KNEE).normalize();
    const inN = new THREE.Vector3(0, -half, -(RIDGE - KNEE)).normalize();
    for (let x = minX + 25; x < maxX; x += 55) {
        for (const north of [false, true]) {
            const r = box(7, 10, slope, beamColor, noShadow);
            const zMid = north ? (maxZ + ridgeZ) / 2 : (minZ + ridgeZ) / 2;
            const n = north ? inN : inS;
            r.position.set(x, (KNEE + RIDGE) / 2, zMid).addScaledVector(n, 5);
            r.rotation.x = north ? phi : -phi;
            root.add(r);
        }
    }
    root.add(at(box(maxX - minX, 14, 12, beamColor, noShadow), (minX + maxX) / 2, RIDGE - 9, ridgeZ));
    for (const north of [false, true]) {
        const y = 150;
        const z = ridgeZ + (north ? 1 : -1) * half * (1 - (y - KNEE) / (RIDGE - KNEE));
        const p = at(box(maxX - minX, 9, 9, A.woodDark, noShadow), (minX + maxX) / 2, y, z);
        p.position.addScaledVector(north ? inN : inS, 9);
        root.add(p);
    }
    for (let x = minX + 25; x < maxX; x += 110) {
        const y = 190;
        const span = 2 * half * (1 - (y - KNEE) / (RIDGE - KNEE));
        root.add(at(box(6, 9, span + 6, beamColor, noShadow), x, y, ridgeZ));
    }
    void roofY;
    void rng;
}

// ------------------------------------------------------------------ the plateau of giant books

function buildPlateau(root, track, rng, glow) {
    const n = track.count;
    const flatTop = [];
    for (let i = 0; i < n; i++) if (track.y[i] > 4.3) flatTop.push(i);
    const frame = (i, j) => {
        const dx = track.x[j] - track.x[i];
        const dz = track.z[j] - track.z[i];
        const len = Math.hypot(dx, dz) || 1;
        return { cx: (track.x[i] + track.x[j]) / 2, cz: (track.z[i] + track.z[j]) / 2, yaw: Math.atan2(dx, dz), len };
    };
    if (flatTop.length) {
        const first = flatTop[0];
        const last = flatTop[flatTop.length - 1];
        // two layers of giant books lying across the road, the upper one shifted by half a book
        for (const layer of [0, 1]) {
            const chunk = 11;
            for (let i = first - (layer ? Math.floor(chunk / 2) : 0); i < last; i += chunk) {
                const i0 = Math.max(first, i);
                const i1 = Math.min(last, i + chunk);
                if (i1 - i0 < 2) continue;
                const f = frame(i0, i1);
                let top = Infinity;
                for (let k = i0; k <= i1; k++) top = Math.min(top, track.heightAt(k));
                top -= 0.06;
                const t = layer ? top * 0.48 : top * 0.52;
                const y = layer ? top - t : 0;
                const w = track.w[i0] + 13 + rng() * 3;
                const color = rng.pick(BOOK_COLORS);
                const g = group();
                g.position.set(f.cx, y, f.cz);
                g.rotation.y = f.yaw + (rng() - 0.5) * 0.05;
                const shift = (rng() - 0.5) * 2;
                g.add(at(box(w, t, f.len + 0.4, color), shift, t / 2, 0));
                const pagesSide = rng() < 0.5 ? 1 : -1;
                g.add(at(box(0.8, t * 0.72, (f.len + 0.4) * 0.92, A.cream), shift + pagesSide * (w / 2 + 0.1), t / 2, 0));
                g.add(at(box(1.2, t + 0.3, f.len + 0.6, '#d1a64a'), shift - pagesSide * (w / 2 - 0.4), t / 2, 0));
                root.add(g);
            }
        }
        // candles on the plateau's edges
        let next = track.s[first] + 5;
        for (const i of flatTop) {
            if (track.s[i] < next) continue;
            next = track.s[i] + 13;
            for (const side of [1, -1]) {
                const p = track.pointAt(i, side * (track.w[i] / 2 + 4.6));
                const c = candle(rng);
                c.position.set(p.x, p.y - 0.06, p.z);
                root.add(c);
                glow.flames.push(new THREE.Vector3(p.x, p.y - 0.06 + c.userData.flameY, p.z));
            }
        }
    }
    // the ramps: stacks of old books of exactly the right height at both edges, a candle on every second one
    let lastS = -100;
    let count = 0;
    for (let i = 0; i < n; i++) {
        const h = track.y[i];
        if (h <= 0.3 || h > 4.3) continue;
        if (Math.abs(track.s[i] - lastS) < 6.5) continue;
        lastS = track.s[i];
        count++;
        let top = Infinity;
        for (let k = -3; k <= 3; k++) top = Math.min(top, track.heightAt((i + k + n) % n));
        top -= 0.06;
        if (top < 0.4) continue;
        for (const side of [1, -1]) {
            const p = track.pointAt(i, side * (track.w[i] / 2 + 4.6));
            const g = group();
            g.position.set(p.x, 0, p.z);
            g.rotation.y = p.yaw;
            let y = 0;
            while (y < top - 0.01) {
                let t = 1.2 + rng() * 1.2;
                if (top - y - t < 0.7) t = top - y;
                const bk = book(9 + rng() * 3, t, 7 + rng() * 2, rng.pick(BOOK_COLORS));
                bk.position.set((rng() - 0.5) * 1.2, y, (rng() - 0.5) * 1.2);
                bk.rotation.y = Math.PI / 2 + (rng() - 0.5) * 0.25;
                g.add(bk);
                y += t;
            }
            root.add(g);
            if (count % 2 === 0) {
                const c = candle(rng);
                c.position.set(p.x, top, p.z);
                root.add(c);
                glow.flames.push(new THREE.Vector3(p.x, top + c.userData.flameY, p.z));
            }
        }
    }
}

// ------------------------------------------------------------------ flames, bulbs, halos, dust (instanced, animated)

function buildGlow(root, glow, room, rng, q) {
    const flames = glow.flames;
    const bulbs = glow.bulbs;
    const m = new THREE.Matrix4();
    const qn = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();

    const flameGeometry = new THREE.SphereGeometry(0.55, 8, 6);
    flameGeometry.scale(1, 1.7, 1);
    flameGeometry.translate(0, 0.6, 0);
    const flameMesh = new THREE.InstancedMesh(flameGeometry, flat('#ffd25a'), flames.length);
    flameMesh.userData.keep = true;
    flameMesh.frustumCulled = false;
    root.add(flameMesh);

    const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.95, 8, 6), flat(0xffffff), bulbs.length);
    bulbMesh.userData.keep = true;
    bulbMesh.frustumCulled = false;
    const bulbColors = ['#ffd27a', '#ff9a5c', '#fff1b8', '#ffc04a', '#ff7a6a'].map(c => new THREE.Color(c));
    const bulbBase = bulbs.map(() => rng.pick(bulbColors));
    bulbs.forEach((p, k) => {
        m.makeTranslation(p.x, p.y, p.z);
        bulbMesh.setMatrixAt(k, m);
        bulbMesh.setColorAt(k, bulbBase[k]);
    });
    root.add(bulbMesh);

    // halos around flames and bulbs (additive, no ink)
    const haloCount = flames.length + bulbs.length;
    const halo = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), fx('#ffffff', { opacity: 0.2, additive: true }), haloCount);
    halo.userData.keep = true;
    halo.frustumCulled = false;
    halo.layers.set(LAYER_FX);
    const warm = new THREE.Color('#ff9a40');
    for (let k = 0; k < haloCount; k++) halo.setColorAt(k, k < flames.length ? warm : bulbBase[k - flames.length]);
    bulbs.forEach((p, k) => {
        m.compose(p, qn, s.setScalar(2.0));
        halo.setMatrixAt(flames.length + k, m);
    });
    root.add(halo);

    // dust: in the moonbeam (cold) and over the road lights (warm)
    const beam = room.beam;
    const dustCount = Math.round(260 * q);
    const dust = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.36, 0), fx('#ffffff', { opacity: 0.7, additive: true }), dustCount);
    dust.userData.keep = true;
    dust.frustumCulled = false;
    dust.layers.set(LAYER_FX);
    const axis = new THREE.Vector3().subVectors(beam.to, beam.from);
    const side1 = new THREE.Vector3(0, 0, 1);
    const side2 = new THREE.Vector3().crossVectors(axis.clone().normalize(), side1).normalize();
    const seeds = [];
    const cold = new THREE.Color('#b8c8ff');
    const amber = new THREE.Color('#ffc070');
    for (let k = 0; k < dustCount; k++) {
        const inBeam = k < dustCount * 0.75 || !bulbs.length;
        const anchor = inBeam ? null : bulbs[Math.floor(rng() * bulbs.length)];
        seeds.push({ t: rng(), a: rng() * Math.PI * 2, r: Math.sqrt(rng()) * beam.radius * 0.9, speed: 0.004 + rng() * 0.01, phase: rng() * 10, anchor, off: [(rng() - 0.5) * 30, -2 - rng() * 12, (rng() - 0.5) * 30] });
        dust.setColorAt(k, inBeam ? cold : amber);
    }
    root.add(dust);

    return {
        update(dt, t) {
            for (let k = 0; k < flames.length; k++) {
                const p = flames[k];
                const f = 0.85 + Math.sin(t * 13 + k * 1.7) * 0.12 + Math.sin(t * 31 + k * 0.7) * 0.08;
                qn.setFromAxisAngle(v.set(0, 0, 1), Math.sin(t * 5 + k) * 0.12);
                m.compose(p, qn, s.set(1, f, 1));
                flameMesh.setMatrixAt(k, m);
                qn.identity();
                m.compose(p, qn, s.setScalar(1.7 * (0.9 + f * 0.15)));
                halo.setMatrixAt(k, m);
            }
            flameMesh.instanceMatrix.needsUpdate = true;
            // a few bulbs twinkle
            for (let k = 0; k < bulbs.length; k += 7) {
                const on = Math.sin(t * 2.3 + k * 0.91) > -0.6 ? 1 : 0.35;
                bulbMesh.setColorAt(k, v.set(bulbBase[k].r * on, bulbBase[k].g * on, bulbBase[k].b * on));
            }
            if (bulbMesh.instanceColor) bulbMesh.instanceColor.needsUpdate = true;
            halo.instanceMatrix.needsUpdate = true;
            for (let k = 0; k < dustCount; k++) {
                const d = seeds[k];
                if (d.anchor) {
                    v.set(d.anchor.x + d.off[0] + Math.sin(t * 0.3 + d.phase) * 4, d.anchor.y + d.off[1] + Math.sin(t * 0.21 + d.phase * 2) * 3, d.anchor.z + d.off[2] + Math.cos(t * 0.27 + d.phase) * 4);
                } else {
                    const u = (d.t + t * d.speed) % 1;
                    const a = d.a + t * 0.05;
                    v.copy(beam.from).addScaledVector(axis, u).addScaledVector(side1, Math.cos(a) * d.r).addScaledVector(side2, Math.sin(a) * d.r);
                    v.y += Math.sin(t * 0.4 + d.phase) * 2;
                }
                m.makeTranslation(v.x, v.y, v.z);
                dust.setMatrixAt(k, m);
            }
            dust.instanceMatrix.needsUpdate = true;
        },
    };
}
