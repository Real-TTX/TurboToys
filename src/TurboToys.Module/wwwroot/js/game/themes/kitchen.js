// TurboToys · themes/kitchen.js – "Küchen-Chaos": a giant kitchen floor. Checkered tiles, cabinets with counters along two walls, the oven,
// the fridge, a pantry, the window over the sink; the cardboard track runs under the kitchen table between its legs and the chairs';
// spilled cereal, a fallen fruit bowl with apples and oranges rolling about, the cat's bowls and the sleeping cat, mop and bucket, pots,
// a paper towel roll, jars, cans and broken eggs.

import * as THREE from 'three';
import { floor, scatter, lamp } from './common.js';
import {
    K, counterRun, wallCabinets, oven, pot, pan, fridge, chair, table, pantry, cerealBox, jar, can, apple, orange, banana, fallenBowl, catBowl,
    sleepingCat, mopBucket, paperRoll, spoon, milk, egg, pendantLamp, colander, sponge, rollingPin, measuringJug, ovenMitt,
    flat, toon, box, roundBox, cyl, sphere, cone, torus, shape, at, group, canvasTexture,
} from './kitchen-props.js';
import { fx, fxLayer } from '../render/toon.js';

const footprintBox = new THREE.Box3();
/** The horizontal reach of an object around its origin (any turn): what must stay off the road. */
function footprint(object) {
    footprintBox.setFromObject(object);
    if (footprintBox.isEmpty()) return 0;
    return Math.hypot(Math.max(-footprintBox.min.x, footprintBox.max.x), Math.max(-footprintBox.min.z, footprintBox.max.z));
}

function drawTiles(ctx, w, h) {
    const n = 2;
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#2f7f86' : '#f2ead6';
        ctx.fillRect(i * s, j * s, s, s);
    }
    ctx.strokeStyle = 'rgba(60,50,40,0.35)';
    ctx.lineWidth = 4;
    for (let k = 0; k <= n; k++) {
        ctx.beginPath();
        ctx.moveTo(k * s, 0);
        ctx.lineTo(k * s, h);
        ctx.moveTo(0, k * s);
        ctx.lineTo(w, k * s);
        ctx.stroke();
    }
    // a little shine on every tile
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) ctx.fillRect(i * s + s * 0.12, j * s + s * 0.12, s * 0.22, s * 0.06);
}

function drawWall(ctx, w, h) {
    // upper part: warm mint paint; lower part (to ~45 %): white tiles with a coloured border row
    const split = h * 0.55;
    ctx.fillStyle = '#cfe9d6';
    ctx.fillRect(0, 0, w, split);
    ctx.fillStyle = '#f7f3ea';
    ctx.fillRect(0, split, w, h - split);
    ctx.strokeStyle = '#cfc6b4';
    ctx.lineWidth = 3;
    const t = 32;
    for (let y = split; y < h; y += t) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    for (let x = 0; x <= w; x += t) {
        ctx.beginPath();
        ctx.moveTo(x, split);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    ctx.fillStyle = '#2f7f86';
    ctx.fillRect(0, split, w, 14);
    ctx.fillStyle = '#e2392f';
    for (let x = 8; x < w; x += 32) ctx.fillRect(x, split + 3, 16, 8);
}

function drawCardboard(ctx, w, h) {
    ctx.fillStyle = '#c49a62';
    ctx.fillRect(0, 0, w, h);
    // corrugation ribs across the strip
    for (let y = 0; y < h; y += 10) {
        ctx.fillStyle = (y / 10) % 2 ? 'rgba(120,80,40,0.10)' : 'rgba(255,240,200,0.07)';
        ctx.fillRect(0, y, w, 5);
    }
    // a strip of masking tape across (a patch)
    ctx.fillStyle = 'rgba(240,226,180,0.85)';
    ctx.save();
    ctx.translate(w * 0.5, h * 0.55);
    ctx.rotate(0.08);
    ctx.fillRect(-w * 0.42, -14, w * 0.84, 28);
    ctx.restore();
}

function drawWindow(night, dusk) {
    return (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, night ? '#101c40' : dusk ? '#5a6ec8' : '#5cb7e6');
        g.addColorStop(1, night ? '#2a3a70' : dusk ? '#ffb070' : '#d4f0fc');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = night ? '#1b3324' : '#5fae46';
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, h * 0.7);
        for (let x = 0; x <= w; x += 32) ctx.lineTo(x, h * 0.62 + Math.sin(x * 0.05) * 14);
        ctx.lineTo(w, h);
        ctx.fill();
        ctx.fillStyle = night ? '#fff6c8' : '#ffffff';
        if (night) {
            ctx.beginPath();
            ctx.arc(w * 0.3, h * 0.25, 18, 0, Math.PI * 2);
            ctx.fill();
        } else {
            for (const [x, y, r] of [[60, 50, 16], [80, 44, 20], [100, 52, 14]]) {
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    };
}

function drawKidsDrawing(ctx, w, h) {
    ctx.fillStyle = '#fbf6e8';
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    // a cat
    ctx.strokeStyle = '#f28c28';
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.6, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.32, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 18, h * 0.24);
    ctx.lineTo(w / 2 - 14, h * 0.12);
    ctx.lineTo(w / 2 - 4, h * 0.2);
    ctx.moveTo(w / 2 + 18, h * 0.24);
    ctx.lineTo(w / 2 + 14, h * 0.12);
    ctx.lineTo(w / 2 + 4, h * 0.2);
    ctx.stroke();
    ctx.strokeStyle = '#2f6fd0';
    ctx.beginPath();
    ctx.moveTo(10, h - 14);
    ctx.lineTo(w - 10, h - 14);
    ctx.stroke();
}

function drawCalendar(ctx, w, h) {
    ctx.fillStyle = '#fbf6e8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e2392f';
    ctx.fillRect(0, 0, w, h * 0.42);
    ctx.fillStyle = '#f6c638';
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.22, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9c3b6';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) ctx.fillRect(10 + c * 20, h * 0.5 + r * 18, 14, 12);
    ctx.strokeStyle = '#e2392f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(10 + 3 * 20 + 7, h * 0.5 + 18 + 6, 11, 0, Math.PI * 2);
    ctx.stroke();
}

function drawClock(ctx, w, h) {
    ctx.fillStyle = '#fbf6e8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#14100c';
    for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(w / 2 + Math.cos(a) * w * 0.38, h / 2 + Math.sin(a) * h * 0.38, k % 3 ? 4 : 8, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#14100c';
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2 + 30, h / 2 - 34);
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2 - 4, h / 2 + 52);
    ctx.stroke();
}

export default {
    key: 'kitchen',
    name: 'Küchen-Chaos',
    sky: { top: '#f3e2c0', bottom: '#fff1d8', fog: '#f4e4c4', fogNear: 320, fogFar: 950 },
    light: {
        sun: '#fff2d6', sunIntensity: 2.4, sunDirection: [-0.6, 1, 0.3],
        ambient: '#fff0dc', ambientIntensity: 0.55, hemiSky: '#fff6e6', hemiGround: '#b48a5a', hemiIntensity: 0.9,
    },
    road: {
        surface: '#c49a62', surfaceDark: '#a37c4a', line: '#e2392f', edge: '#efe2b8', curb: ['#f7f3ea', '#2f6fd0'],
        barrier: 'cans', barrierColors: ['#e2392f', '#f6c638', '#3f9b4b', '#2f6fd0', '#f28c28'], skirt: '#a37c4a',
        kicker: ['#f6c638', '#14100c', '#e0b27a'], gantry: '#e2392f', pattern: drawCardboard,
    },

    build({ root, track, rng, quality, timeOfDay }) {
        const q = quality === 'low' ? 0.45 : quality === 'medium' ? 0.7 : 1;
        const night = timeOfDay === 'night';
        const dusk = timeOfDay === 'dusk';
        const b = track.bounds;
        const room = { minX: b.minX - 90, maxX: b.maxX + 95, minZ: b.minZ - 90, maxZ: b.maxZ + 95, height: 260 };
        const reserved = [];
        const reserve = (x, z, r) => reserved.push({ x, z, r });
        const isFree = (x, z, r = 0) => x > room.minX + 66 + r && x < room.maxX - 12 - r && z > room.minZ + 66 + r && z < room.maxZ - 12 - r
            && !reserved.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r);
        const clear = (x, z, r) => !track.isNearRoad(x, z, 4.5 + r);
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
        const H = room.height;
        const cxR = (room.minX + room.maxX) / 2;
        const czR = (room.minZ + room.maxZ) / 2;

        // ---------------------------------------------------------- floor and walls
        const tiles = floor({ track, size: 1000, draw: drawTiles, tile: 60 });
        tiles.position.y = -0.04;
        root.add(tiles);
        const wallMaterial = toon(0xffffff, { map: canvasTexture(256, 512, drawWall, { repeat: [1, 1] }) });
        const sx = room.maxX - room.minX;
        const sz = room.maxZ - room.minZ;
        for (const [x, z, length, yaw] of [[cxR, room.minZ, sx, 0], [cxR, room.maxZ, sx, Math.PI], [room.minX, czR, sz, Math.PI / 2], [room.maxX, czR, sz, -Math.PI / 2]]) {
            const g = new THREE.PlaneGeometry(length, H);
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * length / 64);
            const wall = new THREE.Mesh(g, wallMaterial);
            wall.position.set(x, H / 2, z);
            wall.rotation.y = yaw;
            wall.receiveShadow = true;
            root.add(wall);
            const skirting = box(length, 6, 2, '#2f7f86');
            skirting.position.set(x + Math.sin(yaw), 3, z + Math.cos(yaw));
            skirting.rotation.y = yaw;
            root.add(skirting);
        }

        // ---------------------------------------------------------- the back wall: counters, oven with hood, wall cabinets, fridge
        const backZ = room.minZ + 30;
        const ovenX = -60;
        const runA = counterRun(ovenX - 30 - room.minX);
        runA.position.set((room.minX + ovenX - 30) / 2, 0, backZ);
        root.add(runA);
        const runBEnd = 105;
        const runB = counterRun(runBEnd - (ovenX + 30));
        runB.position.set((ovenX + 30 + runBEnd) / 2, 0, backZ);
        root.add(runB);
        const theOven = oven();
        theOven.position.set(ovenX, 0, backZ + 1);
        root.add(theOven);
        root.add(at(pot(K.red, 12), ovenX - 14, 91, backZ - 12));
        root.add(at(pan(11), ovenX + 12, 91, backZ + 12, 0.4));
        // the hood
        root.add(at(box(64, 10, 50, K.steel), ovenX, 162, backZ - 5));
        root.add(at(box(26, 70, 24, K.steel), ovenX, 205, backZ - 18));
        const upA = wallCabinets(ovenX - 40 - room.minX - 60);
        upA.position.set((room.minX + 60 + ovenX - 40) / 2, 0, room.minZ + 18);
        root.add(upA);
        const upB = wallCabinets(runBEnd - (ovenX + 40));
        upB.position.set((ovenX + 40 + runBEnd) / 2, 0, room.minZ + 18);
        root.add(upB);
        // things on the back counter
        const counterTop = 92;
        root.add(at(jar(K.orange, K.red, 20), 70, counterTop, backZ + 10));
        root.add(at(jar('#7a4a26', K.yellow, 24, 8), 88, counterTop, backZ + 6));
        root.add(at(jar(K.white, K.blue, 16, 6), 54, counterTop, backZ + 16));
        // a toaster
        const toaster = group(at(roundBox(30, 20, 16, 4, K.red, 2), 0, 10, 0), at(box(20, 1, 3, K.black), 0, 20.2, -3), at(box(20, 1, 3, K.black), 0, 20.2, 3), at(box(3, 4, 2, K.steel), 12, 14, 8.6));
        toaster.add(at(roundBox(18, 3, 2, 1, K.woodLight, 1), 0, 22, -3));
        root.add(at(toaster, 10, counterTop, backZ + 10, -0.2));
        // a knife block (no knives: wooden handles only) and a bread loaf
        root.add(at(group(at(box(12, 22, 16, K.woodDark), 0, 11, 0).rotateX(-0.25), at(box(2, 8, 2, K.black), -3, 25, 3), at(box(2, 9, 2, K.black), 2, 25.5, 2)), -150, counterTop, backZ + 8));
        root.add(at(group(at(roundBox(30, 14, 16, 6, '#d99a4e', 2), 0, 7, 0), ...[0, 1, 2].map(k => at(box(2, 2, 14, '#b06e2a'), -8 + k * 8, 13.6, 0))), -110, counterTop, backZ + 12, 0.3));
        // the fridge
        const drawingMaterial = toon(0xffffff, { map: canvasTexture(128, 160, drawKidsDrawing) });
        const theFridge = fridge(drawingMaterial);
        theFridge.position.set(runBEnd + 45, 0, room.minZ + 36);
        root.add(theFridge);
        reserve(runBEnd + 45, room.minZ + 36, 45);

        // ---------------------------------------------------------- the left wall: sink counter, the window above it, a plant
        const leftX = room.minX + 30;
        const runL0 = room.minZ + 60;
        const runL1 = 40;
        const runL = counterRun(runL1 - runL0);
        runL.position.set(leftX, 0, (runL0 + runL1) / 2);
        runL.rotation.y = Math.PI / 2;
        root.add(runL);
        const sinkZ = -40;
        root.add(at(box(36, 1, 50, K.steelDark), leftX - 2, 94.6, sinkZ));
        root.add(at(box(30, 1, 44, K.steel), leftX - 2, 95.2, sinkZ));
        const faucet = group(at(cyl(1.6, 1.6, 18, K.steel, 8), 0, 9, 0), at(cyl(1.4, 1.4, 14, K.steel, 8), 6, 18, 0).rotateZ(Math.PI / 2), at(cyl(1.6, 1.2, 4, K.steel, 8), 12.5, 16, 0));
        root.add(at(faucet, leftX - 24, counterTop, sinkZ));
        // window
        const winZ = sinkZ;
        const winY = 125;
        const winW = 110;
        const winH = 95;
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), flat(0xffffff, { map: canvasTexture(256, 220, drawWindow(night, dusk)), fog: false }));
        glass.position.set(room.minX + 0.6, winY + winH / 2, winZ);
        glass.rotation.y = Math.PI / 2;
        root.add(glass);
        for (const [dz, dy, w, h] of [[0, winH + 3, winW + 12, 6], [0, -3, winW + 18, 6], [-winW / 2 - 3, winH / 2, 6, winH], [winW / 2 + 3, winH / 2, 6, winH], [0, winH / 2, 4, winH], [0, winH * 0.55, winW, 4]]) {
            const f = box(3, h, w, K.white);
            f.position.set(room.minX + 1.5, winY + dy, winZ + dz);
            root.add(f);
        }
        // a curtain valance (scalloped, checked) and a plant on the sill
        for (let k = 0; k < 8; k++) {
            const scallop = sphere(8, k % 2 ? K.red : K.white, 10, 8);
            scallop.scale.set(0.4, 1, 1);
            root.add(at(scallop, room.minX + 6, winY + winH + 4, winZ - winW / 2 + 7 + k * 13.7));
        }
        root.add(at(group(at(cyl(9, 7, 14, '#c8643a', 12), 0, 7, 0), at(sphere(9, K.green, 10, 8), 0, 20, 0), at(sphere(6, K.green, 10, 8), 6, 26, 3), at(sphere(2, K.red, 8, 6), 3, 28, 6)), leftX - 10, counterTop, sinkZ + 40));
        root.add(at(group(at(cyl(7, 7, 4, K.white, 14), 0, 2, 0), at(cyl(6, 6, 14, K.blue, 14), 0, 9, 0)), leftX - 8, counterTop, sinkZ - 48));
        const upL = wallCabinets(runL1 - (winZ + winW / 2 + 15));
        upL.position.set(room.minX + 18, 0, (runL1 + winZ + winW / 2 + 15) / 2);
        upL.rotation.y = Math.PI / 2;
        root.add(upL);
        for (let z = runL0; z <= runL1; z += 40) reserve(leftX, z, 34);
        for (let x = room.minX; x <= runBEnd; x += 40) reserve(x, backZ, 34);

        // ---------------------------------------------------------- the front wall: pantry, clock, calendar; the right wall: the door, the radiator
        const thePantry = pantry(84, 215);
        thePantry.position.set(room.minX + 70, 0, room.maxZ - 30);
        thePantry.rotation.y = Math.PI;
        root.add(thePantry);
        reserve(room.minX + 70, room.maxZ - 30, 45);
        const clock = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 3, 24), [toon(K.red), toon(0xffffff, { map: canvasTexture(256, 256, drawClock) }), toon(K.red)]);
        clock.rotation.x = Math.PI / 2;
        clock.rotation.y = Math.PI;
        clock.position.set(20, 200, room.maxZ - 2);
        root.add(clock);
        const cal = new THREE.Mesh(new THREE.PlaneGeometry(34, 50), toon(0xffffff, { map: canvasTexture(160, 230, drawCalendar) }));
        cal.position.set(110, 150, room.maxZ - 0.8);
        cal.rotation.y = Math.PI;
        root.add(cal);
        // door on the right wall
        const doorZ = 20;
        root.add(at(box(2, 214, 98, K.white), room.maxX - 1, 107, doorZ));
        root.add(at(box(3, 204, 86, '#e0b27a'), room.maxX - 2.4, 102, doorZ));
        for (const y of [55, 150]) root.add(at(box(1, 70, 64, '#d39a5e'), room.maxX - 4.2, y, doorZ));
        root.add(at(roundBox(3, 3, 14, 1.2, K.steel, 1), room.maxX - 6, 100, doorZ - 32));
        // radiator with the sleeping cat in front
        const radZ = room.maxZ - 70;
        for (let k = 0; k < 10; k++) root.add(at(roundBox(6, 60, 6, 2, K.white, 1), room.maxX - 7, 42, radZ - 40 + k * 9));
        root.add(at(cyl(1.5, 1.5, 90, K.white, 8), room.maxX - 7, 14, radZ).rotateX(Math.PI / 2));
        const cat = sleepingCat();
        if (put(cat.group, room.maxX - 60, radZ, 34, -Math.PI / 2 - 0.2)) {
            cat.group.add(cat.tail);
            cat.tail.userData.keep = true;
            const tail = cat.tail;
            animations.push((dt, time) => {
                tail.rotation.y = Math.sin(time * 1.4) * 0.35;
            });
        }
        put(catBowl(false, K.pink), room.maxX - 60, radZ - 70, 13, 0.3);
        put(catBowl(true, K.blue), room.maxX - 40, radZ - 92, 13, -0.4);

        // ---------------------------------------------------------- the table over the track (legs beside the road) and the chairs
        const T = table(150, 100);
        let tableAt = null;
        for (let r = 0; r <= 30 && !tableAt; r += 3) {
            for (let k = 0; k < 12 && !tableAt; k++) {
                const x = 20 + Math.cos(k * 0.52) * r;
                const z = 0 + Math.sin(k * 0.52) * r;
                if (T.legs.every(([lx, lz]) => clear(x + lx, z + lz, 5))) tableAt = [x, z];
            }
        }
        if (tableAt) {
            T.group.position.set(tableAt[0], 0, tableAt[1]);
            root.add(T.group);
            for (const [lx, lz] of T.legs) reserve(tableAt[0] + lx, tableAt[1] + lz, 6);
            // chairs: around the table where all four legs keep off the road; facing the table
            const spots = [];
            for (const sz2 of [-1, 1]) for (const ox of [-38, 0, 38]) spots.push([ox, sz2 * (50 + 16), sz2 > 0 ? Math.PI : 0]);
            for (const sx2 of [-1, 1]) for (const oz of [-20, 0, 20]) spots.push([sx2 * (75 + 16), oz, sx2 > 0 ? -Math.PI / 2 : Math.PI / 2]);
            let chairs = 0;
            for (const [ox, oz, yaw] of spots) {
                if (chairs >= 4) break;
                const x = tableAt[0] + ox + (rng() - 0.5) * 6;
                const z = tableAt[1] + oz + (rng() - 0.5) * 6;
                const yy = yaw + (rng() - 0.5) * 0.4;
                const legs = [[-18.5, -18.5], [18.5, -18.5], [-18.5, 18.5], [18.5, 18.5]].map(([a, c]) => [x + a * Math.cos(yy) + c * Math.sin(yy), z - a * Math.sin(yy) + c * Math.cos(yy)]);
                if (!legs.every(([a, c]) => clear(a, c, 3)) || reserved.some(p => Math.hypot(p.x - x, p.z - z) < p.r + 20)) continue;
                const ch = chair(K.wood);
                ch.position.set(x, 0, z);
                ch.rotation.y = yy;
                root.add(ch);
                reserve(x, z, 24);
                chairs++;
            }
            // the pendant lamp over the table
            const pl = pendantLamp(H, 165);
            pl.group.position.set(tableAt[0], 0, tableAt[1]);
            root.add(pl.group);
            tableAt.lightY = pl.lightY;
        }
        // one chair knocked over (lying on its back)
        {
            const ch = chair('#d97a4a');
            ch.rotation.x = -Math.PI / 2;
            ch.position.set(0, 23, 0);
            const holder = group(ch);
            for (const [x, z] of [[150, 120], [90, 140], [-60, 150], [160, 60]]) {
                if (clear(x, z, 34) && isFree(x, z, 30)) {
                    holder.position.set(x, 0, z);
                    holder.rotation.y = rng() * Math.PI * 2;
                    root.add(holder);
                    reserve(x, z, 34);
                    break;
                }
            }
        }

        // ---------------------------------------------------------- the spilled cereal and the fallen fruit bowl
        const cerealItems = [];
        const spill = (x0, z0, count, radius, dirYaw) => {
            for (let k = 0; k < count * q; k++) {
                const t = Math.pow(rng(), 0.7);
                const a = dirYaw + (rng() - 0.5) * 1.6 * (1 - t * 0.4);
                const x = x0 + Math.sin(a) * t * radius + (rng() - 0.5) * 6;
                const z = z0 + Math.cos(a) * t * radius + (rng() - 0.5) * 6;
                if (track.isNearRoad(x, z, 4.2)) continue;
                const s = rng.range(0.8, 1.2);
                cerealItems.push({ x, y: 0.55 * s, z, rx: Math.PI / 2 + (rng() - 0.5) * 0.5, rz: rng() * 6, s, color: rng.pick(['#e8a03a', '#f2c25a', '#d07a2a', '#e86a4a', '#f6d16a']) });
            }
        };
        {
            const boxSpot = [-85, -25];
            const cb = cerealBox();
            cb.rotation.set(0, 0, 0);
            const tipped = group(cb);
            cb.rotation.x = -Math.PI / 2 + 0.05;
            cb.position.set(0, 4.6, 0);
            if (put(tipped, boxSpot[0], boxSpot[1], 22, 0.7, 0, { exact: true })) spill(boxSpot[0] + Math.sin(0.7) * 20, boxSpot[1] + Math.cos(0.7) * 20, 160, 46, 0.7);
            // a second box standing, and a bowl with a spoon
            const sb = cerealBox();
            put(sb, room.minX + 86, 70, 18, 1.2);
            spill(room.minX + 92, 96, 70, 30, 0.2);
            const bowl = group(at(cyl(10, 6, 7, K.sky, 16), 0, 3.5, 0), at(cyl(9.3, 9.3, 0.4, K.white, 16), 0, 6, 0), at(torus(2, 0.6, '#e8a03a', 5, 8), 2, 6.6, 1).rotateX(Math.PI / 2), at(torus(2, 0.6, '#d07a2a', 5, 8), -3, 6.6, -2).rotateX(Math.PI / 2));
            put(bowl, -60, 0, 12, 0);
            const sp = spoon();
            sp.rotation.z = 0.3;
            put(group(sp), -56, -16, 14, 0.8);
        }
        {
            const bowlSpot = [-80, 38];
            const fb = fallenBowl();
            if (put(fb, bowlSpot[0], bowlSpot[1], 20, -0.6, 0, { exact: true })) {
                const fruits = [];
                for (let k = 0; k < 9; k++) {
                    const a = -0.6 + Math.PI / 2 + (rng() - 0.5) * 2;
                    const d = rng.range(18, 60);
                    fruits.push([bowlSpot[0] + Math.sin(a) * d, bowlSpot[1] + Math.cos(a) * d]);
                }
                fruits.forEach(([x, z], k) => {
                    const f = k % 3 === 0 ? orange(rng.range(5.5, 7)) : k % 3 === 1 ? apple(rng.range(5.5, 6.5), rng() < 0.6 ? K.red : K.lime) : (k === 2 ? banana() : apple(6, K.red));
                    if (clear(x, z, 6)) {
                        f.position.set(x, 0, z);
                        f.rotation.y = rng() * 6.3;
                        root.add(f);
                    }
                });
                // one orange keeps rolling slowly back and forth (animated)
                const roller = orange(6.5);
                const r0 = [bowlSpot[0] + 26, bowlSpot[1] - 30];
                if (clear(r0[0], r0[1], 18)) {
                    roller.userData.keep = true;
                    root.add(roller);
                    animations.push((dt, time) => {
                        const s = Math.sin(time * 0.6) * 12;
                        roller.position.set(r0[0] + s, 0, r0[1] + s * 0.4);
                        roller.rotation.z = -s / 6.5;
                    });
                }
            }
        }

        // ---------------------------------------------------------- pots, pan, mop, paper towels, jars, cans, eggs, milk, flour
        put(pot(K.blue, 13, true), 66, -46, 24, 0.4);
        put(pot(K.orange, 9), 90, 120, 14, 1.0);
        put(group(pan(14)), 160, -40, 30, 2.2);
        put(mopBucket(), room.minX + 140, room.maxZ - 40, 22, 0.3);
        put(paperRoll(80), 40, 150, 46, 0.25);
        put(milk(), 140, 160, 10, 0.4);
        {
            // a tipped milk carton with a white puddle
            const m = milk();
            m.rotation.z = Math.PI / 2;
            m.position.set(0, 5, 0);
            const g = group(m);
            const puddle = shape([[0, 0], [10, -6], [26, -4], [34, 6], [24, 14], [8, 12], [-2, 6]], K.white, 0.25);
            puddle.rotation.x = -Math.PI / 2;
            puddle.position.set(12, 0.05, 6);
            g.add(puddle);
            put(g, 120, 110, 26, 1.8);
        }
        // a stack of cans (pyramid) and a few lying cans
        {
            const g = new THREE.Group();
            const colors = [K.red, K.green, K.yellow, K.blue, K.orange];
            let n = 0;
            for (let row = 0; row < 3; row++) for (let k = 0; k < 3 - row; k++) g.add(at(can(colors[n++ % colors.length], 5.5, 12), (k - (2 - row) / 2) * 11.4, row * 12, 0));
            put(g, 60, -128, 22, 0.15);
            for (const [x, z] of [[90, -135], [30, -140], [-40, 130]]) {
                const c = can(rng.pick(colors), 5.5, 12);
                c.rotation.z = Math.PI / 2;
                c.position.set(-6, 5.5, 0);
                put(group(c), x, z, 10, rng() * 6);
            }
        }
        // jars fallen from the counter
        for (const [x, z, c, l] of [[-150, -125, K.red, K.yellow], [-110, -135, '#7a4a26', K.red], [0, -130, K.lime, K.blue]]) {
            const j = jar(c, l, 20, 7);
            if (rng() < 0.6) {
                j.rotation.z = Math.PI / 2;
                j.position.set(0, 7, 0);
            }
            put(group(j), x, z, 12, rng() * 6);
        }
        // eggs and a broken one
        put(group(egg(false), at(egg(false), 8, 0, 3), at(egg(true), 22, 0, -4)), -40, -130, 18, 0.4);
        // a flour bag with a spill
        {
            const g = new THREE.Group();
            g.add(at(roundBox(22, 30, 14, 4, K.cream, 2), 0, 7, 0).rotateZ(Math.PI / 2 - 0.1));
            g.add(at(box(14, 6, 14.4, K.blue), 6, 7, 0));
            const dust = shape([[0, 0], [14, -10], [36, -8], [44, 4], [30, 16], [8, 14]], K.white, 0.3);
            dust.rotation.x = -Math.PI / 2;
            dust.position.set(12, 0.05, 2);
            g.add(dust);
            for (let k = 0; k < 5; k++) {
                const heap = sphere(rng.range(2, 4), K.white, 8, 6);
                heap.scale.set(1, 0.4, 1);
                g.add(at(heap, 22 + rng.range(-8, 14), 0.4, rng.range(-6, 8)));
            }
            put(g, room.minX + 90, -120, 30, 0.6);
        }

        // ---------------------------------------------------------- more kitchen life: groceries, cookies, broom, dish towel, a spice shelf, light through the window
        {
            // a paper shopping bag fallen over: a baguette, carrots, a leek, a lemon
            const g = new THREE.Group();
            const bag = box(30, 40, 18, '#c9a46a');
            bag.rotation.z = Math.PI / 2;
            bag.position.set(0, 9, 0);
            g.add(bag);
            g.add(at(box(0.6, 18.4, 30.4, '#a8834a'), 20, 9, 0));
            const baguette = cyl(4, 4, 46, '#d99a4e', 10);
            baguette.rotation.z = Math.PI / 2 - 0.15;
            baguette.position.set(30, 4.5, -4);
            g.add(baguette);
            // the baguette's cuts
            for (let k = 0; k < 3; k++) g.add(at(box(4, 0.8, 1.5, '#b06e2a'), 18 + k * 12, 8.4 - k * 1.6, -4));
            for (let k = 0; k < 3; k++) {
                const carrot = cone(2.2, 16, K.orange, 8);
                carrot.rotation.z = -Math.PI / 2 + (k - 1) * 0.25;
                carrot.position.set(30 + k * 2, 2.2, 10 + k * 5);
                g.add(carrot);
                g.add(at(cone(1.6, 6, K.green, 5), 20 + k * 2, 2.2, 10 + k * 5).rotateZ(Math.PI / 2));
            }
            const leek = group(at(cyl(2.6, 2.6, 30, K.white, 10), 0, 0, 0), at(cyl(2.6, 4, 20, K.green, 10), 0, 25, 0));
            leek.rotation.z = Math.PI / 2 + 0.2;
            leek.position.set(10, 3, 16);
            g.add(leek);
            const lemon = sphere(4, toon(K.yellow, { steps: 4 }), 12, 8);
            lemon.scale.set(1.3, 1, 1);
            g.add(at(lemon, 48, 4, 14));
            put(g, room.maxX - 70, -60, 34, 2.6);
        }
        {
            // cookies: a tipped cookie jar and cookies rolling out
            const g = new THREE.Group();
            const jarBody = group(at(cyl(10, 10, 22, K.glass, 16), 0, 0, 0), at(cyl(10.6, 10.6, 3, K.red, 16), 0, 12, 0));
            jarBody.rotation.z = Math.PI / 2;
            jarBody.position.set(0, 10, 0);
            g.add(jarBody);
            for (let k = 0; k < 9; k++) {
                const cookie = group(at(cyl(4.4, 4.4, 1.6, '#c8873e', 12), 0, 0.8, 0), ...[0, 1, 2].map(i => at(sphere(0.9, '#4a2a14', 6, 4), Math.cos(i * 2.1 + k) * 2.2, 1.6, Math.sin(i * 2.1 + k) * 2.2)));
                const d = 16 + k * 4.5;
                const a = (k - 4) * 0.22;
                cookie.position.set(Math.cos(a) * d, k % 4 === 0 ? 3.4 : 0, Math.sin(a) * d);
                if (k % 4 === 0) cookie.rotation.x = 1.3;
                g.add(cookie);
            }
            for (const [x, z] of [[110, 60], [130, 40], [-30, 140], [100, 150]]) if (put(g, x, z, 40, rng() * 6)) break;
        }
        {
            // the broom leaning on the wall next to the fridge
            const broom = new THREE.Group();
            broom.add(at(cyl(1.4, 1.4, 130, K.green, 8), 0, 65, 0));
            broom.add(at(roundBox(30, 8, 8, 2, K.yellow, 1), 0, 4, 0));
            for (let k = 0; k < 7; k++) broom.add(at(box(2.4, 6, 6, K.red), -12 + k * 4, -2, 0));
            broom.position.set(room.maxX - 16, 6, room.minZ + 90);
            broom.rotation.z = 0.18;
            broom.rotation.y = Math.PI / 2;
            root.add(broom);
            // a dish towel over the oven handle
            const towel = group(at(box(16, 30, 0.8, K.white), 0, -15, 0), ...[0, 1, 2].map(k => at(box(16.2, 3, 1, K.red), 0, -6 - k * 9, 0)));
            towel.position.set(ovenX + 8, 67, backZ + 32);
            root.add(towel);
            // a wall shelf with spice jars above the radiator, a framed picture beside the door
            root.add(at(box(14, 3, 90, K.woodLight), room.maxX - 7, 130, radZ));
            const spice = [K.red, K.orange, K.yellow, K.green, K.brown, K.purple, K.lime];
            for (let k = 0; k < 7; k++) root.add(at(jar(spice[k], K.white, 12 + (k % 3) * 2, 3.6), room.maxX - 8, 131.5, radZ - 36 + k * 12));
            root.add(at(box(2, 60, 46, K.woodDark), room.maxX - 1.5, 160, doorZ - 90));
            root.add(at(box(2.2, 50, 36, K.sky), room.maxX - 2, 160, doorZ - 90));
            root.add(at(sphere(7, K.yellow, 10, 8), room.maxX - 3, 170, doorZ - 82));
            root.add(at(box(2.6, 14, 36, K.green), room.maxX - 2.4, 142, doorZ - 90));
        }
        if (!night) {
            // light falling through the kitchen window (no ink)
            const beam = fx(dusk ? '#ffb070' : '#fff1b8', { opacity: 0.12, additive: true });
            for (let k = 0; k < 2; k++) {
                const g = new THREE.BufferGeometry();
                const z0 = winZ - winW / 2 + 8 + k * 52;
                const z1 = z0 + 44;
                const x = room.minX + 1;
                const pts = [x, winY + winH - 6, z0, x, winY + winH - 6, z1, x + 150, 0.5, z1 + 50, x + 150, 0.5, z0 + 50];
                g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
                g.setIndex([0, 1, 2, 0, 2, 3]);
                root.add(fxLayer(new THREE.Mesh(g, beam)));
            }
        }

        // ---------------------------------------------------------- loose clutter close to the road (what the chase cam sees)
        const inside = (x, z) => isFree(x, z, 4);
        /** Wraps a scatter factory: objects whose footprint would reach the road (barriers included) are skipped. */
        const fits = make => (r, place) => {
            const object = make(r, place);
            return object && !track.isNearRoad(place.x, place.z, 4.5 + footprint(object)) ? object : null;
        };
        const scatterSet = (count, opts) => scatter(root, track, { rng, inside, margin: 80, ...opts, make: fits(opts.make), count: Math.max(1, Math.round(count * q)) });
        scatterSet(20, { clearance: 6, spacing: 20, maxDistance: 30, make: r => (r() < 0.5 ? apple(r.range(5, 6.5), r() < 0.7 ? K.red : K.lime) : orange(r.range(5.5, 7))) });
        scatterSet(10, { clearance: 6, spacing: 26, maxDistance: 30, make: r => {
            const c = can(r.pick([K.red, K.green, K.yellow, K.blue]), 5.5, 12);
            if (r() < 0.5) {
                c.rotation.z = Math.PI / 2;
                c.position.y = 5.5;
            }
            return group(c);
        } });
        scatterSet(6, { clearance: 7, spacing: 30, maxDistance: 34, make: r => jar(r.pick([K.orange, '#7a4a26', K.lime, K.red, K.purple]), r.pick([K.red, K.yellow, K.blue]), r.range(16, 24), r.range(6, 8)) });
        scatterSet(8, { clearance: 6, spacing: 24, maxDistance: 26, make: r => {
            // a cluster of cereal crumbs and a couple of rings
            const g = new THREE.Group();
            for (let k = 0; k < 4; k++) g.add(at(torus(1.7, 0.75, r.pick(['#e8a03a', '#d07a2a', '#f2c25a']), 5, 9), r.range(-5, 5), 0.75, r.range(-5, 5)).rotateX(Math.PI / 2));
            return g;
        } });
        scatterSet(4, { clearance: 8, spacing: 40, maxDistance: 40, make: () => spoon() });
        scatterSet(3, { clearance: 9, spacing: 50, maxDistance: 40, make: r => colander(r.range(12, 15), r.pick([K.lime, K.red, K.sky])) });
        scatterSet(4, { clearance: 6, spacing: 40, maxDistance: 30, make: () => sponge() });
        scatterSet(2, { clearance: 7, spacing: 60, maxDistance: 34, make: () => rollingPin() });
        scatterSet(2, { clearance: 7, spacing: 60, maxDistance: 40, make: () => measuringJug() });
        scatterSet(3, { clearance: 6, spacing: 50, maxDistance: 36, make: r => ovenMitt(r.pick([K.red, K.blue, K.teal])) });
        scatterSet(5, { clearance: 10, spacing: 40, maxDistance: 60, make: r => pot(r.pick([K.red, K.blue, K.orange, K.teal]), r.range(8, 11), r() < 0.4) });

        // the cereal crumbs (instanced rings)
        if (cerealItems.length) {
            const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1.7, 0.75, 5, 9), toon(0xffffff), cerealItems.length);
            const m4 = new THREE.Matrix4();
            const qq = new THREE.Quaternion();
            const e = new THREE.Euler();
            const v = new THREE.Vector3();
            const s = new THREE.Vector3();
            const c = new THREE.Color();
            cerealItems.forEach((it, k) => {
                e.set(it.rx, 0, it.rz);
                qq.setFromEuler(e);
                m4.compose(v.set(it.x, it.y, it.z), qq, s.set(it.s, it.s, it.s));
                rings.setMatrixAt(k, m4);
                rings.setColorAt(k, c.set(it.color));
            });
            rings.computeBoundingSphere();
            rings.castShadow = true;
            rings.receiveShadow = true;
            rings.userData.keep = true;
            root.add(rings);
        }

        // ---------------------------------------------------------- lights: the pendant over the table, the oven glow (stronger at night)
        const lights = [];
        if (tableAt) {
            const l = lamp('#ffe2a8', night ? 2200 : dusk ? 900 : 380, 220);
            l.position.set(tableAt[0], tableAt.lightY, tableAt[1]);
            lights.push(l);
        }
        const ovenGlow = lamp('#ff8a3a', night ? 700 : 250, 110);
        ovenGlow.position.set(ovenX, 40, backZ + 50);
        lights.push(ovenGlow);
        if (night) {
            const moon = lamp('#9fb8ff', 900, 300);
            moon.position.set(room.minX + 40, 170, winZ);
            lights.push(moon);
        }

        return {
            lights,
            update(dt, time) {
                for (const a of animations) a(dt, time);
            },
        };
    },
};
