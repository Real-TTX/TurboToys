// TurboToys · themes/supermarket.js – "Supermarkt-Sprint": a supermarket after hours. A course taped onto the glossy tiles, long shelf aisles full
// of invented products (instanced), end caps with sale displays, a fruit & veg island, freezer chests with glowing lids and a wall of freezers,
// checkouts, shopping carts, pallets of boxes, comic sale signs hanging from the ceiling, rows of ceiling lights mirrored in the floor.
// Raised roads run on rows of pallets with cartons (steel posts beside underpasses), every looping stands in an aisle between two gondolas,
// an aisle shortcut (branch style 'aisle') runs between shelves. Hand-placed pieces of the official lap only when track.key === 'supermarket'.

import * as THREE from 'three';
import { toon, flat, fx, fxLayer, box, roundBox, cyl, sphere, cone, at, group, canvasTexture, LAYER_FX } from '../render/toon.js';
import { scatter, lamp } from './common.js';
import {
    S, productAtlas, Batch, makeProducts, fillShelf, gondola, priceStripTexture, boardTexture, burstSign, freezerChest, freezerLidTexture,
    freezerWall, freezerDoorTexture, checkout, beltTexture, shoppingCart, pallet, fruitCrate, awningTexture, chalkboard, chalkTexture, atlasBox,
} from './supermarket-props.js';

const WALL = 220;

function roadPattern(ctx, w, h) {
    // pale vinyl tiles with grout, floor-marking tape at both edges (yellow/black), a dashed white tape in the middle
    ctx.fillStyle = '#c3ccd6';
    ctx.fillRect(0, 0, w, h);
    const tw = w / 4;
    const th = h / 5;
    for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#bcc6d1' : '#cad2db';
        ctx.fillRect(x * tw + 1, y * th + 1, tw - 2, th - 2);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(w * 0.15, 0);
    ctx.lineTo(w * 0.32, 0);
    ctx.lineTo(w * 0.22, h);
    ctx.lineTo(w * 0.05, h);
    ctx.fill();
    for (const x0 of [w * 0.02, w * 0.9]) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, 0, w * 0.08, h);
        ctx.clip();
        ctx.fillStyle = '#f6c638';
        ctx.fillRect(x0, 0, w * 0.08, h);
        ctx.fillStyle = '#1d1a17';
        for (let y = -40; y < h + 40; y += 48) {
            ctx.beginPath();
            ctx.moveTo(x0, y);
            ctx.lineTo(x0 + w * 0.08, y - 20);
            ctx.lineTo(x0 + w * 0.08, y + 2);
            ctx.lineTo(x0, y + 22);
            ctx.fill();
        }
        ctx.restore();
    }
    ctx.fillStyle = '#f7f3ea';
    ctx.fillRect(w * 0.485, 0, w * 0.03, h * 0.45);
}

function tiles(ctx, w, h) {
    // 512 px = 2 × 2 tiles; cream terrazzo with a few darker chips and a shine
    const t = w / 2;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#e9e4d8' : '#f2eee4';
        ctx.fillRect(x * t, y * t, t, t);
    }
    let s = 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 700; k++) {
        ctx.fillStyle = ['rgba(150,140,125,0.45)', 'rgba(120,150,170,0.35)', 'rgba(200,120,90,0.3)'][k % 3];
        ctx.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3);
    }
    ctx.fillStyle = '#b9b2a3';
    ctx.fillRect(0, 0, w, 4);
    ctx.fillRect(0, t - 2, w, 4);
    ctx.fillRect(0, 0, 4, h);
    ctx.fillRect(t - 2, 0, 4, h);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(40, 0);
    ctx.lineTo(90, 0);
    ctx.lineTo(30, t);
    ctx.lineTo(-20, t);
    ctx.fill();
}

function wallTexture(ctx, w, h) {
    // 512 × 512 = 128 units × WALL: white tiles below, warm yellow paint, a red band
    const unit = h / WALL;
    const tileTop = h - 46 * unit;
    ctx.fillStyle = '#f6e7b8';
    ctx.fillRect(0, 0, w, tileTop);
    ctx.fillStyle = '#eef1f0';
    ctx.fillRect(0, tileTop, w, h - tileTop);
    ctx.strokeStyle = 'rgba(120,130,140,0.35)';
    ctx.lineWidth = 2;
    const ts = 8 * unit * 2;
    for (let y = tileTop; y < h; y += ts) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    for (let x = 0; x < w; x += ts) {
        ctx.beginPath();
        ctx.moveTo(x, tileTop);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    ctx.fillStyle = '#d8382c';
    ctx.fillRect(0, tileTop - 10 * unit, w, 8 * unit);
    ctx.fillStyle = '#2f6fd0';
    ctx.fillRect(0, tileTop - 14 * unit, w, 3 * unit);
}

function outsideTexture(time) {
    const [top, bottom, ground, lampColor] = {
        day: ['#7cc6f2', '#e3f3fb', '#7d8288', '#f7f3ea'],
        dusk: ['#4a3f8f', '#ff9f68', '#5a5560', '#ffd27a'],
        night: ['#0b1430', '#26386e', '#24262e', '#ffd27a'],
    }[time] ?? ['#7cc6f2', '#e3f3fb', '#7d8288', '#f7f3ea'];
    return canvasTexture(256, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h * 0.6);
        g.addColorStop(0, top);
        g.addColorStop(1, bottom);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = ground;
        ctx.fillRect(0, h * 0.62, w, h);
        ctx.fillStyle = '#f7f3ea';
        for (let x = 10; x < w; x += 46) ctx.fillRect(x, h * 0.8, 26, 5);
        ctx.fillStyle = '#3a3d45';
        ctx.fillRect(w * 0.7, h * 0.2, 6, h * 0.45);
        ctx.fillStyle = lampColor;
        ctx.beginPath();
        ctx.arc(w * 0.7 + 3, h * 0.2, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5a6a8a';
        ctx.fillRect(w * 0.12, h * 0.48, 60, 26);
        ctx.fillStyle = '#2b3140';
        ctx.fillRect(w * 0.16, h * 0.42, 34, 12);
    });
}

function wallWords(text, color = '#d8382c') {
    return canvasTexture(1024, 160, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.font = `128px Bangers, Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 16;
        ctx.strokeStyle = '#14100c';
        ctx.strokeText(text, w / 2, h / 2 + 8);
        ctx.fillStyle = color;
        ctx.fillText(text, w / 2, h / 2 + 8);
    });
}

export default {
    key: 'supermarket',
    name: 'Supermarkt-Sprint',
    sky: { top: '#3a4150', bottom: '#8e98a6', fog: '#c9cdd2', fogNear: 420, fogFar: 1150 },
    light: {
        sun: '#fbfbff', sunIntensity: 1.9, sunDirection: [0.25, 1, 0.35],
        ambient: '#f4f7ff', ambientIntensity: 0.7, hemiSky: '#ffffff', hemiGround: '#b8ab92', hemiIntensity: 1.0,
    },
    road: {
        surface: '#c3ccd6', surfaceDark: '#9aa6b3', line: null, edge: null, pattern: roadPattern,
        curb: ['#f6c638', '#1d1a17'], barrier: 'cans', barrierColors: ['#e2392f', '#f7f3ea', '#2f6fd0', '#f6c638', '#3f9b4b'], skirt: '#7d8793',
        kicker: ['#e2392f', '#f7f3ea', '#c9ced6'], gantry: '#22386b',
    },

    build({ root, track, rng, quality, timeOfDay, night }) {
        const q = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
        const time = timeOfDay ?? 'day';
        const b = track.bounds;
        const room = { minX: b.minX - 115, maxX: b.maxX + 115, minZ: b.minZ - 150, maxZ: b.maxZ + 180 };
        // the hand-placed set pieces of the official layout (custom tracks of the editor get the generic, road-avoiding furniture only)
        const official = track.key === 'supermarket';

        // footprints of the placed furniture (circles): set pieces must not stand in each other either
        const taken = [];
        const reserve = (x, z, r) => taken.push({ x, z, r });
        const reserveRect = (cx, cz, yaw, L, D) => {
            const c = Math.cos(yaw);
            const s = Math.sin(yaw);
            const r = Math.min(L, D) / 2;
            const n = Math.max(1, Math.ceil(Math.max(L, D) / r));
            for (let k = 0; k <= n; k++) {
                const u = L >= D ? -L / 2 + r + ((L - 2 * r) * k) / n : 0;
                const v = L >= D ? 0 : -D / 2 + r + ((D - 2 * r) * k) / n;
                reserve(cx + u * c + v * s, cz - u * s + v * c, r);
            }
        };
        const clash = (x, z, r = 0) => taken.some(t => Math.hypot(t.x - x, t.z - z) < t.r + r);
        const free = (x, z, r) => !track.isNearRoad(x, z, r + 5) && !clash(x, z, r);
        const freeRect = (cx, cz, yaw, L, D, margin = 3) => {
            const c = Math.cos(yaw);
            const s = Math.sin(yaw);
            for (let u = -L / 2; u <= L / 2 + 0.01; u += Math.max(4, L / 12)) {
                for (const v of [-D / 2, 0, D / 2]) {
                    const x = cx + u * c + v * s;
                    const z = cz - u * s + v * c;
                    if (track.isNearRoad(x, z, margin + 4) || clash(x, z, 1)) return false;
                }
            }
            return true;
        };
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
        /** Places a rectangular object (L along its local x, D along local z) at the nearest free place around (x, z). */
        const placeRect = (object, x, z, yaw, L, D, { margin = 3, reach = 40 } = {}) => {
            for (let ring = 0; ring <= reach / 4; ring++) {
                const steps = ring === 0 ? 1 : 12;
                for (let k = 0; k < steps; k++) {
                    const a = (k / steps) * Math.PI * 2;
                    const px = x + Math.cos(a) * ring * 4;
                    const pz = z + Math.sin(a) * ring * 4;
                    if (!freeRect(px, pz, yaw, L, D, margin)) continue;
                    object.position.set(px, 0, pz);
                    object.rotation.y = yaw;
                    root.add(object);
                    reserveRect(px, pz, yaw, L, D);
                    return object;
                }
            }
            return null;
        };
        const put = (object, x, z, r, yaw = 0) => {
            const p = spot(x, z, r + 6);
            if (!p) return null;
            object.position.set(p.x, 0, p.z);
            object.rotation.y = yaw;
            root.add(object);
            reserve(p.x, p.z, r);
            return object;
        };

        // ---- materials, the product batch
        const atlasMaterial = toon(0xffffff, { map: productAtlas() });
        const plain = toon(0xffffff);
        const batch = new Batch();
        const kinds = makeProducts(batch, atlasMaterial, plain);
        const priceMaterial = toon(0xffffff, { map: priceStripTexture() });
        const lidMaterial = flat(0xffffff, { map: freezerLidTexture() });
        const doorMaterial = flat(0xffffff, { map: freezerDoorTexture() });
        const categories = {
            breakfast: ['cereal0', 'cereal1', 'cereal2', 'cereal3', 'cereal0', 'cereal2'],
            cans: ['can4', 'can5', 'can6', 'can7', 'jar'],
            drinks: ['bottle', 'bigbottle', 'juice', 'milk'],
            household: ['jug8', 'jug9', 'paper'],
            snacks: ['chips10', 'chips11', 'cereal1', 'cereal3'],
        };
        const aisleNames = { breakfast: 'FRÜHSTÜCK', cans: 'KONSERVEN', drinks: 'GETRÄNKE', household: 'HAUSHALT', snacks: 'KNABBERN' };
        const aisleColors = { breakfast: S.orange, cans: S.red, drinks: S.blue, household: S.purple, snacks: S.green };
        const headerMaterials = {};
        for (const [k, text] of Object.entries(aisleNames)) headerMaterials[k] = toon(0xffffff, { map: boardTexture(text, { bg: aisleColors[k], border: '#f7f3ea' }) });

        // ---- floor, walls, ceiling
        const floorMaterial = toon(0xffffff, { map: canvasTexture(512, 512, tiles, { repeat: [1, 1] }) });
        const floorGeometry = new THREE.PlaneGeometry(1400, 1400);
        const uv = floorGeometry.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (1400 / 48), uv.getY(k) * (1400 / 48));
        const ground = new THREE.Mesh(floorGeometry, floorMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(b.cx, -0.06, b.cz);
        ground.receiveShadow = true;
        root.add(ground);
        buildRoom(root, room, time);

        // ---- shelf gondolas: aisles around the looping and along the aisle shortcut, a row of aisles north of the track, drinks along the west wall
        const placeGondola = (x, z, yaw, L, cats, { sides = [1, -1], levels = 5, header = true, caps = true, D = 32, margin = 3 } = {}) => {
            let length = L;
            const extra = caps ? 46 : 6;
            while (length >= 40 && !freeRect(x, z, yaw, length + extra, D + 2, margin)) length -= 10;
            if (length < 40) return null;
            const color = aisleColors[cats[0]];
            const { group: g, boards } = gondola({ L: length, D, color, priceMaterial, sides, levels });
            g.position.set(x, 0, z);
            g.rotation.y = yaw;
            root.add(g);
            reserveRect(x, z, yaw, length + extra, D + 2);
            g.updateMatrixWorld(true);
            for (const board of boards) {
                const cat = board.dir > 0 ? cats[0] : cats[1] ?? cats[0];
                const list = board.level === 0 && cat !== 'drinks' ? [...categories[cat], 'paper'] : categories[cat];
                fillShelf(batch, kinds, g.matrixWorld, { ...board, category: list, rng, deep: false });
            }
            if (header) {
                const sign = new THREE.Mesh(new THREE.BoxGeometry(46, 12, 1.2), headerMaterials[cats[0]]);
                sign.position.set(0, 128, 0);
                g.add(sign, at(box(0.8, 26, 0.8, S.shelfDark), -16, 115, 0), at(box(0.8, 26, 0.8, S.shelfDark), 16, 115, 0));
            }
            if (caps) for (const end of [-1, 1]) endCap(g, end * (length / 2 + 2.4), end, cats[0]);
            return g;
        };
        const endCap = (g, x, end, cat) => {
            // a low promo table at the gondola's end with a stack of products and a burst sign
            const cap = group(at(box(18, 22, 30, aisleColors[cat]), 0, 11, 0), at(box(19, 2, 31, S.shelf), 0, 23, 0));
            cap.position.set(x + end * 9, 0, 0);
            g.add(cap);
            g.updateMatrixWorld(true);
            cap.updateMatrixWorld(true);
            const list = cat === 'cans' ? ['can4', 'can5', 'can7'] : cat === 'drinks' ? ['bigbottle'] : categories[cat];
            const kind = kinds[rng.pick(list)];
            const yaw = end > 0 ? Math.PI / 2 : -Math.PI / 2;
            const perRow = Math.max(1, Math.floor(26 / (kind.w + 0.4)));
            const rows = kind.h < 8 ? 5 : 2;
            for (let r = 0; r < rows; r++) {
                const n = Math.max(1, perRow - (kind.h < 8 ? r : 0));
                for (let k = 0; k < n; k++) {
                    const zz = (k - (n - 1) / 2) * (kind.w + 0.4);
                    for (const dx of kind.d < 7 ? [-4, 3] : [0]) {
                        batch.add(kind.key, cap.matrixWorld, dx, 24 + r * (kind.h + 0.2), zz, yaw, 0xffffff);
                        if (kind.key.includes('bottle')) batch.add('cap', cap.matrixWorld, dx, 24 + r * (kind.h + 0.2) + kind.h - 0.2, zz, 0, '#f7f3ea', 1.2, 1, 1.2);
                    }
                }
            }
            const burst = burstSign(rng.pick(['SALE!', '-50%', 'NEU!', 'TOP!', '2 FÜR 1']), { radius: 9, fill: rng.pick([S.yellow, S.white, S.lime]), fg: S.red });
            burst.position.set(x + end * 10, 64, 0);
            burst.rotation.y = yaw;
            g.add(burst, at(box(0.8, 30, 0.8, S.shelfDark), x + end * 10, 40, 0));
        };

        // the furniture under the raised roads (pallets with cartons, steel posts beside underpasses) – follows any track
        buildDeckStacks(track, batch);

        // every looping stands in an aisle: a gondola on both sides of its straight, a burst sign on the frame
        const loopCats = [['drinks', 'snacks'], ['cans', 'breakfast']];
        track.loops.forEach((loop, k) => {
            const w = track.w[loop.entry];
            const yaw = Math.atan2(-loop.T[1], loop.T[0]);
            const lateral = loop.D / 2 + w / 2 + 3.5 + 6 + 17;
            for (const side of [1, -1]) {
                const x = loop.P[0] + loop.N[0] * lateral * side + loop.T[0] * 4;
                const z = loop.P[2] + loop.N[1] * lateral * side + loop.T[1] * 4;
                placeGondola(x, z, yaw, 110, loopCats[(k + (side > 0 ? 0 : 1)) % 2], { caps: false });
            }
            const burst = burstSign('LOOPING!', { radius: 10, fill: S.yellow, fg: S.red, size: 70 });
            burst.position.set(loop.P[0], loop.P[1] + loop.radius * 2 + 12.5, loop.P[2]);
            burst.rotation.y = Math.atan2(loop.T[0], loop.T[1]);
            root.add(burst);
        });

        // an aisle shortcut runs between two shelves (narrower ones, close to the road): it reads as a gap in the shop
        for (const branch of track.branches) {
            if (branch.style !== 'aisle') continue;
            const i0 = Math.round(branch.count * 0.2);
            const i1 = Math.round(branch.count * 0.8);
            const dx = branch.x[i1] - branch.x[i0];
            const dz = branch.z[i1] - branch.z[i0];
            const length = Math.hypot(dx, dz);
            const tx = dx / length;
            const tz = dz / length;
            const yaw = Math.atan2(-tz, tx);
            const lateral = branch.w[Math.round(branch.count / 2)] / 2 + 1.9 + 4.5 + 12;
            const mid = Math.round(branch.count / 2);
            const cx = branch.x[mid];
            const cz = branch.z[mid];
            for (const side of [1, -1]) {
                // the longest shelf that fits beside the aisle (shifted a little along it and away from it)
                let best = null;
                for (let shift = -24; shift <= 24; shift += 4) {
                    for (let away = -2; away <= 14; away += 2) {
                        const x = cx + tx * shift - tz * (lateral + away) * side;
                        const z = cz + tz * shift + tx * (lateral + away) * side;
                        let L = Math.round(length / 4) * 4 + 12;
                        while (L >= 40 && !freeRect(x, z, yaw, L + 6, 24, 1)) L -= 4;
                        // long and close to the aisle
                        if (L >= 40 && (!best || L - away * 3 > best.score)) best = { x, z, L, score: L - away * 3 };
                    }
                }
                if (best) placeGondola(best.x, best.z, yaw, best.L, side > 0 ? ['breakfast', 'snacks'] : ['household', 'cans'], { caps: false, D: 22, margin: 1 });
            }
            // the "wet floor" A-frame and a spilled cereal box at the entrance of the aisle
            const e = branch.pointAt(Math.round(branch.count * 0.16), branch.w[0] / 2 + 6);
            if (!track.isNearRoad(e.x, e.z, 3)) root.add(at(wetSign(), e.x, 0, e.z, e.yaw + 0.4));
        }
        if (!official) {
            // inside the track: two long gondolas along z (only where they fit)
            placeGondola(60, 92, Math.PI / 2, 104, ['breakfast', 'snacks']);
            placeGondola(122, 92, Math.PI / 2, 104, ['cans', 'household']);
        }
        // north of the track: aisles running away from the road, the freezer wall behind them
        const northZ0 = b.maxZ + 36;
        const northLen = room.maxZ - 70 - northZ0;
        const cats = [['drinks', 'breakfast'], ['snacks', 'cans'], ['household', 'drinks'], ['breakfast', 'snacks'], ['cans', 'household'], ['snacks', 'breakfast'], ['drinks', 'cans']];
        let kAisle = 0;
        for (let x = room.minX + 70; x < room.maxX - 50; x += 64) {
            placeGondola(x, northZ0 + 20 + northLen / 2, Math.PI / 2, northLen, cats[kAisle % cats.length]);
            kAisle++;
        }
        const fw = freezerWall(room.maxX - room.minX - 60, doorMaterial);
        fw.position.set((room.minX + room.maxX) / 2, 0, room.maxZ - 16);
        root.add(fw);
        // drinks along the west wall (single-sided)
        for (let z = room.minZ + 70; z < room.maxZ - 80; z += 104) {
            placeGondola(room.minX + 17, z, Math.PI / 2, 96, ['drinks'], { sides: [1], header: false, caps: false });
        }

        // ---- the fruit & vegetable island (official track: west of the west straight; otherwise somewhere in the west)
        buildFruitStand(root, batch, rng, placeRect, official ? [[-207, 40]] : [[b.minX - 52, b.cz], [b.minX + 60, 82]]);

        // ---- freezer chests (glowing lids): official track between the start straight and the pallet road's bend
        const lights = [];
        const freezerSpots = [];
        for (const [x, z] of official ? [[112, -40], [168, -40]] : [[-80, 36], [-24, 38]]) {
            const f = freezerChest(52, lidMaterial);
            if (placeRect(f, x, z, 0.04, 54, 36, { reach: 24 })) freezerSpots.push(f.position.clone());
        }
        // a third freezer and a can pyramid outside the east of the track
        placeRect(freezerChest(64, lidMaterial), official ? 252 : 236, 50, Math.PI / 2, 66, 36);
        canPyramid(root, batch, kinds, put, official ? 262 : 236, official ? 150 : 130, rng);
        if (freezerSpots.length) {
            const c = freezerSpots.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / freezerSpots.length);
            const light = lamp('#9fe8ff', night ? 2600 : 900, 120);
            light.position.set(c.x, 30, c.z);
            lights.push(light);
        }

        // ---- checkouts along the start straight (south)
        const beltMaterial = toon(0xffffff, { map: beltTexture() });
        const displayMaterial = flat(0xffffff, { map: canvasTexture(64, 32, (ctx, w, h) => {
            ctx.fillStyle = '#0d2a1a';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#5dff9a';
            ctx.font = '22px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('0,00', w / 2, h / 2 + 1);
        }) });
        const numberMaterials = {};
        const numberMaterial = n => numberMaterials[n] ?? (numberMaterials[n] = flat(0xffffff, { map: canvasTexture(64, 64, (ctx, w, h) => {
            ctx.fillStyle = '#ffd23a';
            ctx.fillRect(0, 0, w, h);
            ctx.font = '54px Bangers, Impact, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#14100c';
            ctx.fillText(String(n), w / 2, h / 2 + 3);
        }) }));
        let lane = 1;
        for (let x = -170; x <= 110; x += 56) {
            const c = checkout(lane, { beltMaterial, displayMaterial, numberMaterial });
            const z = b.minZ - 80;
            if (!freeRect(x, z, 0, 40, 90, 2)) continue;
            c.position.set(x, 0, z);
            root.add(c);
            c.updateMatrixWorld(true);
            // candy on the rack at the lane start
            for (let k = 0; k < 3; k++) {
                let xx = 9;
                while (xx < 27) {
                    const kind = kinds[rng.pick(['chips10', 'chips11', 'can4', 'jar'])];
                    if (kind.h > 10 && k < 2) {
                        batch.add('jar', c.matrixWorld, xx + 2, 10.5 + k * 12, 41, 0, rng.pick(['#e2392f', '#f6c638', '#e86aa6']));
                        xx += 6.5;
                        continue;
                    }
                    batch.add(kind.key, c.matrixWorld, xx + kind.w / 2, 10.5 + k * 12, 41.5, 0, 0xffffff, 0.6, 0.6, 0.6);
                    xx += kind.w * 0.6 + 0.6;
                }
            }
            // some shopping on the belt
            for (let k = 0; k < 4; k++) {
                const kind = kinds[rng.pick(['cereal0', 'milk', 'juice', 'can5', 'chips10', 'jug8'])];
                batch.add(kind.key, c.matrixWorld, (rng() - 0.5) * 8, 24.8, 30 - k * 12, rng() * 6, 0xffffff);
            }
            lane++;
        }

        // ---- shopping carts: a nested row by the entrance, some loose ones
        const cartRow = group();
        for (let k = 0; k < 6; k++) cartRow.add(at(shoppingCart(S.red), k * 14, 0, 0));
        put(cartRow, b.maxX + 40, b.minZ - 70, 50, 0);
        const loose = [[b.maxX + 52, 90, 0.6, S.blue], [-60, b.maxZ + 16, 2.4, S.red], [b.minX - 40, -50, 1.2, S.green], [210, 230, -0.6, S.red]];
        for (const [x, z, yaw, c] of loose) put(shoppingCart(c), x, z, 36, yaw);
        // a cart full of shopping inside the track
        const full = shoppingCart(S.blue);
        const placed = official ? put(full, -95, -8, 30, Math.PI / 2 + 0.25) : put(full, 92, 60, 30, Math.PI / 2 + 0.25);
        if (placed) {
            full.updateMatrixWorld(true);
            for (let k = 0; k < 12; k++) {
                const kind = kinds[rng.pick(['cereal0', 'cereal2', 'milk', 'juice', 'chips11', 'paper', 'bottle'])];
                batch.add(kind.key, full.matrixWorld, (rng() - 0.5) * 40, 35, (rng() - 0.5) * 22, rng() * 6, kind.colors ? rng.pick(kind.colors) : 0xffffff, 1, 1, 1, (rng() - 0.5) * 0.4);
            }
        }

        // ---- pallets with stacked boxes (outside east and west)
        const palletAt = (x, z, yaw, layers) => {
            const p = pallet();
            if (!put(p, x, z, 30, yaw)) return;
            p.updateMatrixWorld(true);
            for (let l = 0; l < layers; l++) {
                for (const [dx, dz] of [[-11, -8], [11, -8], [-11, 9], [11, 9]]) {
                    if (l === layers - 1 && rng() < 0.3) continue;
                    batch.add('crate', p.matrixWorld, dx * 0.95, 6 + l * 18.2, dz, (l % 2) * Math.PI / 2 + (rng() - 0.5) * 0.06, 0xffffff, 0.72, 1, 0.72);
                }
            }
        };
        palletAt(b.maxX + 52, 0, 0.2, 3);
        palletAt(b.maxX + 60, 190, -0.3, 4);
        palletAt(b.minX - 40, 40, 0.1, 3);
        palletAt(b.minX - 46, 120, -0.2, 2);
        palletAt(b.minX - 30, b.maxZ + 6, 0.5, 3);
        // water packs on a pallet
        const water = pallet();
        if (put(water, b.minX - 42, -10, 30, 0.3)) {
            water.updateMatrixWorld(true);
            for (let l = 0; l < 3; l++) for (let ix = 0; ix < 3; ix++) for (let iz = 0; iz < 2; iz++) {
                for (let bx = 0; bx < 3; bx++) for (let bz = 0; bz < 2; bz++) {
                    batch.add('bigbottle', water.matrixWorld, -14 + ix * 14 + (bx - 1) * 4.2, 6 + l * 19.4, -8 + iz * 16 + (bz - 0.5) * 6, 0, '#8fd3ff');
                }
            }
        }

        // ---- hanging comic signs (a few swing over the road)
        const swingers = [];
        const signTexts = [['SALE!', S.yellow, S.red], ['-50%', S.red, S.yellow], ['NEU!', S.lime, S.red], ['ANGEBOT', S.blue, S.yellow], ['SUPER-PREIS', S.yellow, S.blue], ['-30%', S.pink, S.white], ['KNALLER!', S.orange, S.white]];
        const hangAt = (x, z, k, y, swing) => {
            const [text, fill, fg] = signTexts[k % signTexts.length];
            const holder = group();
            holder.position.set(x, WALL, z);
            const burst = burstSign(text, { radius: text.length > 6 ? 17 : 13, fill, fg, size: text.length > 6 ? 70 : 110 });
            burst.position.y = -(WALL - y);
            holder.add(burst, at(box(0.5, WALL - y - 12, 0.5, S.ink), 0, -(WALL - y - 12) / 2, 0));
            holder.rotation.y = rng() * Math.PI;
            if (swing) {
                holder.userData.keep = true;
                holder.userData.phase = rng() * 6;
                swingers.push(holder);
            }
            root.add(holder);
        };
        const overRoad = [0.04, 0.27, 0.5, 0.74];
        overRoad.forEach((f, k) => {
            // (not over a looping: the frame stands there; high enough over raised roads)
            let i = Math.floor(f * track.count);
            while (track.rail[track.wrap(i)]) i += 10;
            const p = track.pointAt(i);
            hangAt(p.x, p.z, k, p.y + 48 + (k % 2) * 8, true);
        });
        for (let k = 0; k < Math.round(6 * q); k++) {
            const x = rng.range(b.minX - 40, b.maxX + 40);
            const z = rng.range(b.minZ - 40, b.maxZ + 90);
            hangAt(x, z, k + 4, 120 + rng() * 30, false);
        }

        // ---- small things beside the road: dropped products, price tags, a mop bucket, cardboard
        const drops = ['cereal0', 'cereal1', 'can4', 'can6', 'milk', 'juice', 'chips10', 'chips11', 'jar', 'bottle'];
        scatter(root, track, {
            count: Math.round(60 * q), rng, clearance: 10, spacing: 6, margin: 40, minDistance: 10, maxDistance: 34,
            make: (r, place) => {
                const kind = kinds[r.pick(drops)];
                const lying = r() < 0.6;
                const color = kind.colors ? r.pick(kind.colors) : 0xffffff;
                const yaw = r() * Math.PI * 2;
                if (lying) batch.add(kind.key, null, place.x, kind.d / 2, place.z, yaw, color, 1, 1, 1, Math.PI / 2);
                else batch.add(kind.key, null, place.x, 0, place.z, yaw, color);
                return group();
            },
        });
        scatter(root, track, {
            count: Math.round(14 * q), rng, clearance: 14, spacing: 30, margin: 60, minDistance: 14, maxDistance: 60,
            make: r => {
                const k = r.int(0, 2);
                if (k === 0) return group(at(box(36, 1, 28, S.cardboard), 0, 0.5, 0), at(box(20, 1, 16, S.cardboard), 6, 1.4, 4, 0.4));
                if (k === 1) return group(cyl(9, 8, 16, S.yellow, 12), at(cyl(1, 1, 60, S.wood, 6), 4, 30, 0).rotateZ(0.25), at(box(14, 8, 6, S.ink), 9, 4, 0));
                return wetSign();
            },
        });

        // ---- ceiling lights and their reflections on the glossy floor
        const panelOn = flat('#ffffff');
        const panelOff = toon('#8d939b');
        const reflection = fx('#ffffff', { opacity: night ? 0.16 : 0.12, additive: true });
        let row = 0;
        for (let z = room.minZ + 40; z < room.maxZ - 20; z += 62) {
            for (let x = room.minX + 60; x < room.maxX - 40; x += 150) {
                const on = !(night && (row + Math.round(x / 150)) % 3 === 0);
                root.add(at(box(110, 3, 12, on ? panelOn : panelOff), x, WALL - 6, z));
                root.add(at(box(114, 2, 16, S.shelfDark), x, WALL - 3.5, z));
                if (on) {
                    const r = new THREE.Mesh(new THREE.PlaneGeometry(100, 9), reflection);
                    r.rotation.x = -Math.PI / 2;
                    r.position.set(x, 0.03, z + 18);
                    root.add(fxLayer(r));
                }
            }
            row++;
        }
        const warm = lamp('#ffe2a8', night ? 1600 : 700, 140);
        const stand = root.getObjectByName('fruitStand');
        if (stand) {
            warm.position.set(stand.position.x, 60, stand.position.z);
            lights.push(warm);
        }
        const cold = lamp('#bfeaff', night ? 2200 : 800, 160);
        cold.position.set((room.minX + room.maxX) / 2, 70, room.maxZ - 50);
        lights.push(cold);

        const instances = batch.build(root);
        root.userData.products = instances;

        return {
            lights,
            update(dt, t) {
                for (const s of swingers) s.rotation.y = s.userData.phase + Math.sin(t * 0.5 + s.userData.phase) * 0.6;
            },
        };
    },
};

// ------------------------------------------------------------------ small pieces

/** The yellow A-frame "Vorsicht, nass!" sign. */
function wetSign() {
    const wet = group();
    for (const s of [-1, 1]) {
        const panel = group(at(roundBox(13, 24, 0.8, 0.3, S.yellow), 0, 12, 0), at(box(2.4, 8, 0.4, S.ink), 0, 14, s * 0.5), at(box(2.4, 2.4, 0.4, S.ink), 0, 7.5, s * 0.5));
        panel.position.z = s * 3.4;
        panel.rotation.x = -s * 0.27;
        wet.add(panel);
    }
    return wet;
}

// ------------------------------------------------------------------ the raised roads stand on pallets of cartons

/**
 * Along every raised stretch (any path, any layout): on both sides under the shoulder a row of pallets with shrink-wrapped cartons up to the
 * road; where another road passes below (a bridge) the stacks give way to steel posts beside the lower road. Instanced through the batch.
 */
function buildDeckStacks(track, batch) {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    unit.translate(0, 0.5, 0);
    batch.type('deck', unit, toon(0xffffff), { shadow: true });
    const post = new THREE.CylinderGeometry(1.1, 1.3, 1, 10);
    post.translate(0, 0.5, 0);
    batch.type('deckPost', post, toon(0xffffff), { shadow: true });
    const STEP = 12.5;
    const LEN = 12;
    const DEPTH = 10;
    const cartons = ['#ffffff', '#f6ecd8', '#ecdcc0'];
    for (const path of track.paths) {
        const n = path.count;
        const last = path.closed ? n : n - 1;
        for (let i = 0; i < last; i += Math.round(STEP)) {
            if (path.rail[i]) continue;
            // the lowest road height along the stack (it must stay under the shoulder on ramps)
            let y = Infinity;
            for (let k = -6; k <= 6; k++) {
                const j = path.wrap(i + k);
                if (path.rail[j]) y = -1;
                else y = Math.min(y, path.y[j]);
            }
            if (y < 2.2) continue;
            const { nx, nz } = path.normalAt(i);
            const yaw = Math.atan2(-path.tz[i], path.tx[i]);
            for (const side of [1, -1]) {
                const lateral = side * (path.w[i] / 2 + 3.9 + DEPTH / 2);
                const x = path.x[i] + nx * lateral;
                const z = path.z[i] + nz * lateral;
                // another road (lower, crossing or joining) near this stack: no stack; a post under the shoulder when it is free of the other road
                // (far enough that the stacks of two roads side by side never meet)
                const other = track.roadsNear(x, z, DEPTH / 2 + 3.9 + DEPTH + 0.5, (h, p, j) => {
                    if (p !== path) return true;
                    const d = Math.abs(i - j);
                    return Math.min(d, path.closed ? n - d : d) > 30;
                });
                if (other) {
                    const px = path.x[i] + nx * side * (path.w[i] / 2 + 2.8);
                    const pz = path.z[i] + nz * side * (path.w[i] / 2 + 2.8);
                    const below = track.roadsNear(px, pz, 2.5, h => h < path.y[i] - 3);
                    if (!below && path.y[i] > 6) batch.add('deckPost', null, px, 0, pz, 0, S.steel, 1, path.y[i] - 0.6, 1);
                    continue;
                }
                // the pallet: runners and a top of boards
                for (const v of [-0.38, 0, 0.38]) batch.add('deck', null, x + nx * side * v * DEPTH, 0, z + nz * side * v * DEPTH, yaw, S.wood, LEN, 3.6, 1.6);
                batch.add('deck', null, x, 3.6, z, yaw, S.woodLight, LEN, 1.2, DEPTH);
                // cartons up to just under the shoulder (one or two layers)
                const top = y - 0.15;
                const base = 4.8;
                if (top - base < 2) continue;
                const layers = top - base > 11 ? 2 : 1;
                const h = (top - base) / layers;
                for (let l = 0; l < layers; l++) {
                    const shift = (l % 2 ? 0.4 : -0.4);
                    batch.add('crate', null, x + path.tx[i] * shift, base + l * h, z + path.tz[i] * shift, yaw + (l % 2 ? Math.PI : 0), cartons[(i + l) % 3], (LEN - 0.6) / 30, h / 18, (DEPTH - 0.6) / 22);
                }
                // the shrink wrap's band and the tape: a dark strip across the stack
                batch.add('deck', null, x, base + (top - base) * 0.55, z, yaw, '#e9edf2', LEN - 0.2, 1, DEPTH + 0.2);
            }
        }
    }
}

// ------------------------------------------------------------------ the room

function buildRoom(root, room, time) {
    const { minX, maxX, minZ, maxZ } = room;
    const material = toon(0xffffff, { map: canvasTexture(512, 512, wallTexture, { repeat: [1, 1] }) });
    const walls = [
        [(minX + maxX) / 2, minZ, maxX - minX, 0],
        [(minX + maxX) / 2, maxZ, maxX - minX, Math.PI],
        [minX, (minZ + maxZ) / 2, maxZ - minZ, Math.PI / 2],
        [maxX, (minZ + maxZ) / 2, maxZ - minZ, -Math.PI / 2],
    ];
    for (const [x, z, length, yaw] of walls) {
        const geometry = new THREE.PlaneGeometry(length, WALL);
        const uv = geometry.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * (length / 128));
        const wall = new THREE.Mesh(geometry, material);
        wall.position.set(x, WALL / 2, z);
        wall.rotation.y = yaw;
        wall.receiveShadow = true;
        root.add(wall);
    }
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), toon('#5f6670'));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set((minX + maxX) / 2, WALL, (minZ + maxZ) / 2);
    root.add(ceiling);

    // department words painted on the walls
    const words = [
        ['TIEFKÜHL', '#2f6fd0', (minX + maxX) / 2, maxZ - 0.6, Math.PI, 520],
        ['OBST & GEMÜSE', '#3f9b4b', minX + 0.6, (minZ + maxZ) / 2 + 60, Math.PI / 2, 380],
        ['GETRÄNKE', '#2f6fd0', minX + 0.6, minZ + 120, Math.PI / 2, 260],
        ['ANGEBOTE', '#d8382c', maxX - 0.6, (minZ + maxZ) / 2, -Math.PI / 2, 360],
        ['KASSE', '#d8382c', (minX + maxX) / 2 + 160, minZ + 0.6, 0, 240],
    ];
    for (const [text, color, x, z, yaw, w] of words) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.156), toon(0xffffff, { map: wallWords(text, color), transparent: true }));
        m.position.set(x, 170, z);
        m.rotation.y = yaw;
        root.add(m);
    }

    // the shop front (south wall): glass doors and windows with the outside
    const outside = flat(0xffffff, { map: outsideTexture(time), fog: false });
    for (let x = minX + 90; x < maxX - 60; x += 130) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(110, 120), outside);
        pane.position.set(x, 66, minZ + 0.5);
        root.add(pane);
        root.add(at(box(114, 4, 3, S.shelfDark), x, 128, minZ + 1.5), at(box(114, 4, 3, S.shelfDark), x, 5, minZ + 1.5));
        root.add(at(box(4, 128, 3, S.shelfDark), x - 57, 64, minZ + 1.5), at(box(4, 128, 3, S.shelfDark), x + 57, 64, minZ + 1.5));
        root.add(at(box(3, 120, 2, S.shelfDark), x, 64, minZ + 1.2));
    }
    // a green exit sign
    root.add(at(box(40, 14, 3, '#1f8a4c'), (minX + maxX) / 2 - 120, 150, minZ + 2));
}

// ------------------------------------------------------------------ the fruit & vegetable island

function buildFruitStand(root, batch, rng, placeRect, wanted) {
    const fruitGeometry = new THREE.SphereGeometry(1, 8, 6);
    const plain = toon(0xffffff);
    batch.type('fruit', fruitGeometry, plain, { shadow: false });
    const banana = new THREE.TorusGeometry(4, 1, 5, 8, Math.PI * 0.6);
    batch.type('banana', banana, plain);
    const carrot = new THREE.ConeGeometry(1.2, 8, 6);
    batch.type('carrot', carrot, plain);

    const L = 96;
    const stand = group();
    stand.name = 'fruitStand';
    // the base: a wooden island with two tilted crate rows on each side
    stand.add(at(box(28, 16, L, S.wood), 0, 8, 0));
    stand.add(at(box(30, 2, L + 2, S.woodLight), 0, 17, 0));
    const produce = [
        { kind: 'apple', r: 3.2, colors: ['#d8382c', '#e2392f', '#b8241c'] },
        { kind: 'apple', r: 3.2, colors: ['#9bd23c', '#7fbf2a'] },
        { kind: 'orange', r: 3.6, colors: ['#f28c28'] },
        { kind: 'lemon', r: 2.8, colors: ['#f6d838'], sy: 0.8 },
        { kind: 'melon', r: 7, colors: ['#3f9b4b', '#5aa83a'] },
        { kind: 'lettuce', r: 5, colors: ['#9bd23c'] },
        { kind: 'tomato', r: 2.6, colors: ['#e2392f'] },
        { kind: 'pumpkin', r: 6.5, colors: ['#f28c28'], sy: 0.7 },
        { kind: 'banana' },
        { kind: 'carrot' },
    ];
    const crates = [];
    const segments = 4;
    for (const side of [1, -1]) {
        for (let s = 0; s < segments; s++) {
            const z = -L / 2 + (L / segments) * (s + 0.5);
            const crate = fruitCrate(L / segments - 2, 14, side * 0.42);
            crate.group.position.set(side * 14, 20, z);
            crate.group.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
            crate.inner.rotation.x = 0.42;
            stand.add(crate.group);
            crates.push({ crate, produce: produce[(s * 2 + (side > 0 ? 0 : 1) + rng.int(0, 1)) % produce.length] });
            // the leg under the crate's front edge
            stand.add(at(box(L / segments - 6, 20, 2, S.wood), side * 20.5, 10, z).rotateY(Math.PI / 2));
        }
    }
    // the awning on four posts
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) stand.add(at(cyl(1.4, 1.4, 92, S.wood, 8), sx * 15, 46, sz * (L / 2 - 4)));
    const awningMat = toon(0xffffff, { map: awningTexture(), side: THREE.DoubleSide });
    for (const side of [1, -1]) {
        const roof = new THREE.Mesh(new THREE.PlaneGeometry(L + 8, 24), awningMat);
        roof.position.set(side * 9.5, 96, 0);
        roof.rotation.order = 'YXZ';
        roof.rotation.y = Math.PI / 2;
        roof.rotation.x = -Math.PI / 2 + side * 0.5;
        stand.add(roof);
        // scalloped edge
        for (let k = 0; k < 10; k++) stand.add(at(cyl(5.5, 5.5, 0.6, k % 2 ? S.white : S.red, 10), side * 20.5, 90.5, -L / 2 + (k + 0.5) * ((L + 8) / 10) - 4).rotateZ(Math.PI / 2));
    }
    stand.add(at(box(4, 6, L + 8, S.red), 0, 102, 0));
    const signMat = toon(0xffffff, { map: boardTexture('FRISCH VOM FELD', { bg: '#3f9b4b', fg: '#f6c638', border: '#f7f3ea' }) });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 56), signMat);
    sign.position.set(0, 112, 0);
    stand.add(sign);

    // place it (long axis along z) at the nearest free place around the wanted one
    if (!wanted.some(([x, z]) => placeRect(stand, x, z, 0, 54, 114, { margin: 0, reach: 40 }))) return;
    // a chalkboard and loose melons / crates beside it
    stand.updateMatrixWorld(true);
    const chalkMat = toon(0xffffff, { map: chalkTexture([['HEUTE', 54, '#f7f3ea'], ['ÄPFEL', 60, '#ff7a6a'], ['NUR', 40, '#f7f3ea'], ['0,99', 70, '#f6c638']]) });
    const board = chalkboard('', '', chalkMat);
    board.position.set(0, 0, -L / 2 - 6);
    board.rotation.y = Math.PI;
    stand.add(board);

    // fill the crates
    for (const { crate, produce: p } of crates) {
        crate.group.updateMatrixWorld(true);
        const m = crate.inner.matrixWorld;
        const W = L / segments - 6;
        const D = 10;
        if (p.kind === 'banana') {
            for (let k = 0; k < 8; k++) {
                for (let f = 0; f < 4; f++) batch.add('banana', m, -W / 2 + 3 + k * (W / 8), 3 + f * 0.9, -3 + f * 1.6, 0, '#f6d23a', 1, 1, 1, -Math.PI / 2 + 0.3);
            }
            continue;
        }
        if (p.kind === 'carrot') {
            for (let k = 0; k < 18; k++) batch.add('carrot', m, -W / 2 + 2 + (k % 9) * (W / 9), 3, -3 + Math.floor(k / 9) * 6, rng() * 3, '#f28c28', 1, 1, 1, Math.PI / 2);
            continue;
        }
        const r = p.r;
        for (let layer = 0; layer < 2; layer++) {
            for (let x = -W / 2 + r; x <= W / 2 - r + 0.01; x += r * 2.05) {
                for (let z = -D / 2 + r; z <= D / 2 - r + 0.01; z += r * 2.05) {
                    const off = layer ? r : 0;
                    if (layer && (x + off > W / 2 - r || z + off > D / 2 - r)) continue;
                    batch.add('fruit', m, x + off, 1.2 + r * (p.sy ?? 1) + layer * r * 1.5, z + off, rng() * 6, rng.pick(p.colors), r, r * (p.sy ?? 1), r);
                }
            }
        }
    }
    // loose crates of produce on the floor around the island
    for (const [dx, dz, kind] of [[0, L / 2 + 6, 'melon']]) {
        const p = produce.find(pp => pp.kind === kind);
        const c = group(at(box(24, 8, 20, S.woodLight), 0, 4, 0));
        c.position.set(dx, 0, dz);
        c.rotation.y = rng() * 0.6;
        stand.add(c);
        c.updateMatrixWorld(true);
        for (let k = 0; k < 4; k++) batch.add('fruit', c.matrixWorld, -6 + (k % 2) * 12 * (p.r > 5 ? 1 : 0.6), 8 + p.r * (p.sy ?? 1) * 0.9, -4 + Math.floor(k / 2) * 8, rng() * 6, rng.pick(p.colors), p.r, p.r * (p.sy ?? 1), p.r);
    }
}

// ------------------------------------------------------------------ the can pyramid with its banner

function canPyramid(root, batch, kinds, put, x, z, rng) {
    const base = group(at(box(64, 6, 34, S.red), 0, 3, 0), at(box(66, 1.2, 36, S.shelf), 0, 6.6, 0));
    if (!put(base, x, z, 36, rng() * 0.4 - 0.2)) return;
    base.updateMatrixWorld(true);
    const kind = kinds.can4;
    const step = kind.w + 0.2;
    const rows = 8;
    for (let r = 0; r < rows; r++) {
        const n = 12 - r;
        for (let k = 0; k < n; k++) {
            for (const dz of [-3, 3]) batch.add(rng() < 0.75 ? 'can4' : 'can7', base.matrixWorld, (k - (n - 1) / 2) * step, 7.2 + r * 6.05, dz, 0, 0xffffff);
        }
    }
    const burst = burstSign('SALE!', { radius: 15, fill: S.yellow, fg: S.red });
    burst.position.set(0, 68, 6);
    base.add(burst, at(box(1, 40, 1, S.ink), 0, 48, 4));
    void atlasBox;
}
