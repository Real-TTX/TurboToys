// TurboToys · themes/kidsroom.js – "Kinderzimmer": a giant kid's bedroom. Floorboards and a play rug, the bed, the toy chest, a bookcase,
// a desk under the window, a play tent, posters, a rocket lamp; toys everywhere (blocks, bricks, crayons, a teddy, a wooden train);
// the raised part of the track rests on stacks of giant books.

import * as THREE from 'three';
import { toon, flat, fx, fxLayer, box, roundBox, cyl, sphere, torus, shape, at, group, canvasTexture } from '../render/toon.js';
import { floor, scatter, lamp } from './common.js';
import {
    C, woodBlock, blockTower, blockGate, looseBlocks, brickPile, brickHouse, crayon, crayonBox, ball, stackingRings,
    spinningTop, drum, robot, dino, paperPlane, sock, teddy, lyingBook, standingBook, openBook, locomotive, wagon, animated, trainTrack,
    rocketLamp, deskLamp, bed, toyChest, bookcase, desk, basket, globe, pencilCup,
} from './kidsroom-props.js';

// ------------------------------------------------------------------ textures

function drawPlanks(ctx, w, h) {
    const rows = 4;
    const ph = h / rows;
    const tones = ['#cf9a5f', '#c48b52', '#d6a36a', '#c99258'];
    for (let r = 0; r < rows; r++) {
        ctx.fillStyle = tones[r];
        ctx.fillRect(0, r * ph, w, ph);
        // grain
        ctx.strokeStyle = 'rgba(120,70,30,0.18)';
        ctx.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
            const y = r * ph + 14 + k * (ph / 4.4);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 2);
            ctx.stroke();
        }
        ctx.fillStyle = '#6e4122';
        ctx.fillRect(0, r * ph, w, 4);
        const seam = ((r * 0.37 + 0.2) % 1) * w;
        ctx.fillRect(seam, r * ph, 4, ph);
    }
}

function drawRug(ctx, w, h) {
    ctx.fillStyle = '#e2392f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f6c638';
    ctx.fillRect(14, 14, w - 28, h - 28);
    // a zig-zag border
    ctx.fillStyle = '#e2392f';
    const z = 22;
    for (let x = 14; x < w - 14; x += z) {
        for (const y of [14, h - 14]) {
            const d = y < h / 2 ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + z / 2, y + d * 14);
            ctx.lineTo(x + z, y);
            ctx.fill();
        }
    }
    ctx.fillStyle = '#2f6fd0';
    ctx.fillRect(40, 40, w - 80, h - 80);
    // polka dots, stars, planets
    ctx.fillStyle = '#4f8fe6';
    for (let y = 60; y < h - 50; y += 40) for (let x = 60 + ((y / 40) % 2) * 20; x < w - 50; x += 40) {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
    }
    const star = (x, y, r, c) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
            const rr = k % 2 ? r * 0.45 : r;
            ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#14305f';
        ctx.stroke();
    };
    const planet = (x, y, r, c, ring) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#14305f';
        ctx.stroke();
        if (ring) {
            ctx.strokeStyle = ring;
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.ellipse(x, y, r * 1.7, r * 0.45, -0.3, 0, Math.PI * 2);
            ctx.stroke();
        }
    };
    planet(w * 0.18, h * 0.3, 46, '#f28c28', '#f7f3ea');
    planet(w * 0.78, h * 0.68, 60, '#9bd23c', null);
    planet(w * 0.55, h * 0.25, 30, '#e86aa6', '#f6c638');
    star(w * 0.36, h * 0.7, 40, '#f6c638');
    star(w * 0.9, h * 0.25, 30, '#f7f3ea');
    star(w * 0.1, h * 0.75, 28, '#f7f3ea');
    star(w * 0.66, h * 0.52, 22, '#f6c638');
}

function drawWallpaper(ctx, w, h) {
    // upper part: pale aqua with stripes and little stars; lower part: warm wainscot; a white rail between
    const split = h * 0.62;
    ctx.fillStyle = '#cfe8ee';
    ctx.fillRect(0, 0, w, split);
    ctx.fillStyle = '#bcdde6';
    for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 30, split);
    ctx.fillStyle = '#f7f3ea';
    for (const [x, y] of [[46, 60], [176, 150], [100, 250], [220, 330], [30, 400]]) {
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
            const r = k % 2 ? 5 : 11;
            ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.fill();
    }
    ctx.fillStyle = '#f3c76c';
    ctx.fillRect(0, split, w, h - split);
    ctx.fillStyle = '#e2b154';
    for (let x = 0; x < w; x += 42) ctx.fillRect(x, split, 5, h - split);
    ctx.fillStyle = '#f7f3ea';
    ctx.fillRect(0, split - 10, w, 16);
    ctx.fillStyle = '#d6c7a8';
    ctx.fillRect(0, split + 6, w, 3);
}

function drawWindow(night, dusk) {
    return (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        if (night) {
            g.addColorStop(0, '#0d1838');
            g.addColorStop(1, '#2a3f7a');
        } else if (dusk) {
            g.addColorStop(0, '#5a6ec8');
            g.addColorStop(1, '#ffb070');
        } else {
            g.addColorStop(0, '#4fb1ec');
            g.addColorStop(1, '#bfe6fb');
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        if (night) {
            ctx.fillStyle = '#fff6c8';
            ctx.beginPath();
            ctx.arc(w * 0.72, h * 0.25, 26, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0d1838';
            ctx.beginPath();
            ctx.arc(w * 0.68, h * 0.22, 24, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff6c8';
            for (const [x, y] of [[40, 40], [90, 110], [160, 60], [220, 140], [60, 170], [130, 30], [200, 20]]) ctx.fillRect(x, y, 4, 4);
        } else {
            ctx.fillStyle = dusk ? '#ffd27a' : '#fff4b0';
            ctx.beginPath();
            ctx.arc(w * 0.75, h * 0.28, 22, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            for (const [x, y, r] of [[60, 60, 18], [84, 52, 22], [108, 62, 16], [170, 120, 14], [190, 112, 18]]) {
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        // hills and a tree
        ctx.fillStyle = night ? '#1d3a2c' : '#6dbb4a';
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.quadraticCurveTo(w * 0.25, h * 0.62, w * 0.55, h * 0.8);
        ctx.quadraticCurveTo(w * 0.8, h * 0.68, w, h * 0.78);
        ctx.lineTo(w, h);
        ctx.fill();
        ctx.fillStyle = night ? '#132a20' : '#3f9b4b';
        ctx.beginPath();
        ctx.arc(w * 0.28, h * 0.6, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = night ? '#2a1c12' : '#8a5a32';
        ctx.fillRect(w * 0.28 - 5, h * 0.62, 10, 40);
    };
}

/** Four posters side by side (each 256 × 512): rocket, dinosaur, race car, rainbow. */
function drawPosters(ctx, w, h) {
    const pw = w / 4;
    const frame = (x, bg) => {
        ctx.fillStyle = '#fbf6e8';
        ctx.fillRect(x, 0, pw, h);
        ctx.fillStyle = bg;
        ctx.fillRect(x + 14, 14, pw - 28, h - 28);
    };
    const outline = () => {
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#14100c';
        ctx.stroke();
    };
    // 1: rocket in space
    frame(0, '#1d3263');
    ctx.fillStyle = '#f6c638';
    for (const [x, y] of [[40, 60], [200, 90], [60, 300], [210, 380], [120, 460], [30, 420]]) ctx.fillRect(x, y, 6, 6);
    ctx.beginPath();
    ctx.moveTo(128, 70);
    ctx.quadraticCurveTo(190, 170, 170, 330);
    ctx.lineTo(86, 330);
    ctx.quadraticCurveTo(66, 170, 128, 70);
    ctx.fillStyle = '#f7f3ea';
    ctx.fill();
    outline();
    ctx.beginPath();
    ctx.arc(128, 190, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#5cb7e6';
    ctx.fill();
    outline();
    ctx.beginPath();
    ctx.moveTo(86, 270);
    ctx.lineTo(50, 350);
    ctx.lineTo(90, 330);
    ctx.moveTo(170, 270);
    ctx.lineTo(206, 350);
    ctx.lineTo(166, 330);
    ctx.fillStyle = '#e2392f';
    ctx.fill();
    outline();
    ctx.beginPath();
    ctx.moveTo(96, 334);
    ctx.lineTo(128, 440);
    ctx.lineTo(160, 334);
    ctx.fillStyle = '#f28c28';
    ctx.fill();
    // 2: dinosaur
    frame(pw, '#9bd23c');
    ctx.save();
    ctx.translate(pw, 0);
    ctx.fillStyle = '#3f9b4b';
    ctx.beginPath();
    ctx.ellipse(120, 330, 80, 55, 0, 0, Math.PI * 2);
    ctx.fill();
    outline();
    ctx.beginPath();
    ctx.moveTo(170, 300);
    ctx.quadraticCurveTo(220, 200, 190, 130);
    ctx.lineTo(160, 140);
    ctx.quadraticCurveTo(170, 220, 140, 290);
    ctx.fill();
    outline();
    ctx.beginPath();
    ctx.ellipse(186, 128, 34, 22, 0.2, 0, Math.PI * 2);
    ctx.fill();
    outline();
    ctx.fillStyle = '#14100c';
    ctx.beginPath();
    ctx.arc(196, 120, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f9b4b';
    for (const x of [70, 110, 150]) {
        ctx.fillRect(x, 370, 22, 70);
        ctx.strokeRect(x, 370, 22, 70);
    }
    ctx.fillStyle = '#f28c28';
    for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.moveTo(60 + k * 26, 290 - k * 4);
        ctx.lineTo(73 + k * 26, 258 - k * 4);
        ctx.lineTo(86 + k * 26, 290 - k * 4);
        ctx.fill();
    }
    ctx.restore();
    // 3: race car + chequered flag
    frame(pw * 2, '#f6c638');
    ctx.save();
    ctx.translate(pw * 2, 0);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#14100c' : '#f7f3ea';
        ctx.fillRect(38 + x * 30, 60 + y * 30, 30, 30);
    }
    ctx.beginPath();
    ctx.moveTo(30, 360);
    ctx.lineTo(60, 300);
    ctx.lineTo(150, 290);
    ctx.lineTo(190, 320);
    ctx.lineTo(230, 330);
    ctx.lineTo(230, 370);
    ctx.lineTo(30, 370);
    ctx.closePath();
    ctx.fillStyle = '#e2392f';
    ctx.fill();
    outline();
    for (const x of [75, 190]) {
        ctx.beginPath();
        ctx.arc(x, 372, 26, 0, Math.PI * 2);
        ctx.fillStyle = '#14100c';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, 372, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#c9d1d9';
        ctx.fill();
    }
    ctx.font = '64px Bangers, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2392f';
    ctx.lineWidth = 6;
    ctx.strokeText('TURBO!', 128, 470);
    ctx.fillText('TURBO!', 128, 470);
    ctx.restore();
    // 4: rainbow and sun
    frame(pw * 3, '#bfe6fb');
    ctx.save();
    ctx.translate(pw * 3, 0);
    ['#e2392f', '#f28c28', '#f6c638', '#3f9b4b', '#2f6fd0', '#7a4bc4'].forEach((c, k) => {
        ctx.beginPath();
        ctx.arc(128, 360, 110 - k * 14, Math.PI, 0);
        ctx.lineWidth = 14;
        ctx.strokeStyle = c;
        ctx.stroke();
    });
    ctx.beginPath();
    ctx.arc(190, 110, 40, 0, Math.PI * 2);
    ctx.fillStyle = '#f6c638';
    ctx.fill();
    outline();
    ctx.fillStyle = '#ffffff';
    for (const [x, y, r] of [[40, 360, 26], [70, 352, 30], [200, 362, 28], [226, 356, 22]]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

/** A poster plane showing cell k (0..3) of the poster atlas. */
function poster(material, k, w, h) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (k + 0.01 + uv.getX(i) * 0.98) / 4);
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = true;
    return m;
}

/** A scribbled drawing lying on the floor (sheet of paper). */
function drawDrawings(ctx, w, h) {
    const pw = w / 2;
    for (let k = 0; k < 2; k++) {
        const x = k * pw;
        ctx.fillStyle = '#fbf6e8';
        ctx.fillRect(x, 0, pw, h);
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        if (k === 0) {
            // a house and a sun
            ctx.strokeStyle = '#e2392f';
            ctx.strokeRect(x + 60, 150, 120, 90);
            ctx.beginPath();
            ctx.moveTo(x + 50, 150);
            ctx.lineTo(x + 120, 90);
            ctx.lineTo(x + 190, 150);
            ctx.stroke();
            ctx.strokeStyle = '#f6c638';
            ctx.beginPath();
            ctx.arc(x + 200, 50, 26, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = '#3f9b4b';
            ctx.beginPath();
            ctx.moveTo(x + 10, 240);
            ctx.lineTo(x + 246, 236);
            ctx.stroke();
        } else {
            // a car
            ctx.strokeStyle = '#2f6fd0';
            ctx.beginPath();
            ctx.moveTo(x + 30, 170);
            ctx.lineTo(x + 70, 110);
            ctx.lineTo(x + 170, 110);
            ctx.lineTo(x + 220, 170);
            ctx.closePath();
            ctx.stroke();
            ctx.strokeStyle = '#14100c';
            for (const cx of [70, 180]) {
                ctx.beginPath();
                ctx.arc(x + cx, 180, 22, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.strokeStyle = '#f28c28';
            ctx.beginPath();
            ctx.moveTo(x + 20, 60);
            ctx.lineTo(x + 60, 40);
            ctx.lineTo(x + 100, 60);
            ctx.stroke();
        }
    }
}

const footprintBox = new THREE.Box3();
/** The horizontal reach of an object around its origin (any turn): what must stay off the road. */
function footprint(object) {
    footprintBox.setFromObject(object);
    if (footprintBox.isEmpty()) return 0;
    return Math.hypot(Math.max(-footprintBox.min.x, footprintBox.max.x), Math.max(-footprintBox.min.z, footprintBox.max.z));
}

// ------------------------------------------------------------------ the theme

/** The floor level (slightly below 0, see build). */
const GROUND = -0.22;

export default {
    key: 'kidsroom',
    name: 'Kinderzimmer',
    sky: { top: '#f1d7ad', bottom: '#fbe9c9', fog: '#f4dfbd', fogNear: 320, fogFar: 950 },
    light: {
        sun: '#fff0d2', sunIntensity: 2.3, sunDirection: [0.35, 1, -0.55],
        ambient: '#ffe6c4', ambientIntensity: 0.55, hemiSky: '#fff1dc', hemiGround: '#b07a4a', hemiIntensity: 0.9,
    },
    road: {
        surface: '#575b64', surfaceDark: '#3e4148', line: '#f7f3ea', edge: '#f7f3ea', curb: ['#e2392f', '#f7f3ea'],
        barrier: 'blocks', barrierColors: ['#e2392f', '#f6c638', '#2f6fd0', '#3f9b4b', '#f28c28'],
        skirt: '#f1e4c2', kicker: ['#f6c638', '#14100c', '#2f6fd0'], gantry: '#2f6fd0',
    },

    build({ root: world, track, rng, quality, timeOfDay }) {
        // everything stands on a slightly lowered ground: the road dips a little below y = 0 where it starts to climb (spline overshoot)
        const root = new THREE.Group();
        root.position.y = GROUND;
        world.add(root);
        const q = quality === 'low' ? 0.45 : quality === 'medium' ? 0.7 : 1;
        const night = timeOfDay === 'night';
        const dusk = timeOfDay === 'dusk';
        const b = track.bounds;
        // the room: the walls stand ~100 units around the track
        const room = { minX: b.minX - 98, maxX: b.maxX + 100, minZ: b.minZ - 100, maxZ: b.maxZ + 100, height: 250 };
        const reserved = [];
        const reserve = (x, z, r) => reserved.push({ x, z, r });
        const isFree = (x, z, r = 0) => x > room.minX + 8 + r && x < room.maxX - 8 - r && z > room.minZ + 8 + r && z < room.maxZ - 8 - r
            && !reserved.some(p => Math.hypot(p.x - x, p.z - z) < p.r + r);
        /** Places a big piece if it keeps off the road; returns whether it was placed. */
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

        // ---------------------------------------------------------- floor, rug, walls
        const boards = floor({ track, size: 1000, draw: drawPlanks, tile: 64 });
        boards.position.y = -0.03;
        root.add(boards);
        const rug = new THREE.Mesh(new THREE.PlaneGeometry(300, 160), toon(0xffffff, { map: canvasTexture(1024, 544, drawRug) }));
        rug.rotation.x = -Math.PI / 2;
        rug.position.set(30, 0, 52);
        rug.receiveShadow = true;
        root.add(rug);

        const wallTexture = canvasTexture(256, 512, drawWallpaper, { repeat: [1, 1] });
        const wallMaterial = toon(0xffffff, { map: wallTexture });
        const sx = room.maxX - room.minX;
        const sz = room.maxZ - room.minZ;
        const cx = (room.minX + room.maxX) / 2;
        const cz = (room.minZ + room.maxZ) / 2;
        const H = room.height;
        for (const [x, z, length, yaw] of [[cx, room.minZ, sx, 0], [cx, room.maxZ, sx, Math.PI], [room.minX, cz, sz, Math.PI / 2], [room.maxX, cz, sz, -Math.PI / 2]]) {
            const g = new THREE.PlaneGeometry(length, H);
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * length / 110);
            const wall = new THREE.Mesh(g, wallMaterial);
            wall.position.set(x, H / 2, z);
            wall.rotation.y = yaw;
            wall.receiveShadow = true;
            root.add(wall);
            const skirting = box(length, 7, 2, C.white);
            const inward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
            skirting.position.set(x + inward.x, 3.5, z + inward.z);
            skirting.rotation.y = yaw;
            root.add(skirting);
        }

        // ---------------------------------------------------------- the window (front wall) with curtains and a desk below
        const winX = 95;
        const winW = 130;
        const winY = 100;
        const winH = 112;
        const wz = room.minZ + 0.6;
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), flat(0xffffff, { map: canvasTexture(256, 220, drawWindow(night, dusk)), fog: false }));
        glass.position.set(winX, winY + winH / 2, wz);
        root.add(glass);
        root.add(at(box(winW + 12, 6, 3, C.white), winX, winY + winH + 3, wz + 1.5));
        root.add(at(box(winW + 20, 5, 14, C.white), winX, winY - 2.5, wz + 7));
        root.add(at(box(6, winH, 3, C.white), winX - winW / 2 - 3, winY + winH / 2, wz + 1.5));
        root.add(at(box(6, winH, 3, C.white), winX + winW / 2 + 3, winY + winH / 2, wz + 1.5));
        root.add(at(box(4, winH, 2.4, C.white), winX, winY + winH / 2, wz + 1.2));
        root.add(at(box(winW, 4, 2.4, C.white), winX, winY + winH * 0.55, wz + 1.2));
        // curtain rod + pleated curtains
        const rod = cyl(1.6, 1.6, winW + 110, C.woodDark, 8);
        rod.rotation.z = Math.PI / 2;
        rod.position.set(winX, winY + winH + 16, wz + 8);
        root.add(rod);
        for (const s of [-1, 1]) {
            root.add(at(sphere(3.2, C.woodDark, 10, 8), winX + s * (winW / 2 + 55), winY + winH + 16, wz + 8));
            for (let k = 0; k < 7; k++) {
                const x = winX + s * (winW / 2 + 8 + k * 6.4);
                const curtainH = winY + winH + 14 - 4;
                const pleat = cyl(4, 4.6, curtainH, k % 2 ? '#f28c28' : '#f6a33c', 8);
                pleat.position.set(x, curtainH / 2 + 4, wz + 9 + (k % 2) * 1.5);
                root.add(pleat);
            }
            const tie = torus(22, 1.8, C.red, 6, 16);
            tie.rotation.x = Math.PI / 2;
            tie.scale.set(1, 0.35, 1);
            tie.position.set(winX + s * (winW / 2 + 27), 92, wz + 10);
            root.add(tie);
        }
        // light shafts through the window (day only)
        if (!night) {
            const beam = fx(dusk ? '#ffb070' : '#fff1b8', { opacity: 0.13, additive: true });
            for (let k = 0; k < 3; k++) {
                const g = new THREE.BufferGeometry();
                const x0 = winX - winW / 2 + 10 + k * 40;
                const x1 = x0 + 34;
                const pts = [x0, winY + winH - 8, wz + 1, x1, winY + winH - 8, wz + 1, x1 - 60, 0.4, wz + 190, x0 - 60, 0.4, wz + 190];
                g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
                g.setIndex([0, 1, 2, 0, 2, 3]);
                const m = new THREE.Mesh(g, beam);
                root.add(fxLayer(m));
            }
        }
        const deskZ = room.minZ + 32;
        const theDesk = desk(150, 60);
        theDesk.group.position.set(winX, 0, deskZ);
        root.add(theDesk.group);
        reserve(winX - 40, deskZ, 40);
        reserve(winX + 40, deskZ, 40);
        const dl = deskLamp(C.red);
        dl.group.position.set(winX - 55, theDesk.top, deskZ - 12);
        dl.group.rotation.y = 0.5;
        root.add(dl.group);
        const gl = globe();
        gl.position.set(winX + 50, theDesk.top, deskZ - 10);
        root.add(gl);
        const pc = pencilCup();
        pc.position.set(winX + 20, theDesk.top, deskZ - 14);
        root.add(pc);
        const deskBooks = group(lyingBook(30, 22, 4, C.blue), at(lyingBook(28, 20, 3.4, C.yellow), 0, 4, 0, 0.2), at(lyingBook(26, 19, 3, C.red), 0, 7.4, 0, -0.15));
        deskBooks.position.set(winX - 10, theDesk.top, deskZ - 8);
        root.add(deskBooks);
        const paperOnDesk = box(26, 0.3, 20, C.paper);
        paperOnDesk.position.set(winX + 24, theDesk.top + 0.15, deskZ + 12);
        paperOnDesk.rotation.y = -0.3;
        root.add(paperOnDesk);
        // the chair in front of the desk (a stool)
        const stool = group(at(cyl(17, 17, 4, C.yellow, 16), 0, 44, 0), ...[0, 1, 2, 3].map(k => at(cyl(1.8, 1.8, 42, C.woodDark, 8), Math.cos(k * Math.PI / 2 + 0.78) * 12, 21, Math.sin(k * Math.PI / 2 + 0.78) * 12)));
        put(stool, winX - 18, deskZ + 50, 18);
        put(basket(), winX + 100, room.minZ + 22, 16);

        // ---------------------------------------------------------- the bed (left wall, back), toy chest, rocket lamp, door
        const theBed = bed(rng);
        theBed.position.set(room.minX + 103, 0, room.maxZ - 46);
        root.add(theBed);
        reserve(room.minX + 40, room.maxZ - 46, 50);
        reserve(room.minX + 103, room.maxZ - 46, 50);
        reserve(room.minX + 165, room.maxZ - 46, 50);
        put(toyChest(rng), 38, room.maxZ - 26, 36, Math.PI);
        put(drum(), -26, room.maxZ - 30, 18, 0.4);

        const rl = rocketLamp();
        const rocketX = room.minX + 40;
        const rocketZ = room.minZ + 44;
        rl.group.position.set(rocketX, 0, rocketZ);
        rl.group.rotation.y = 0.6;
        root.add(rl.group);
        reserve(rocketX, rocketZ, 22);

        // door in the back wall (right part)
        const doorX = room.maxX - 70;
        const dz = room.maxZ - 0.5;
        root.add(at(box(92, 206, 2, '#f7f3ea'), doorX, 103, dz - 1));
        root.add(at(box(80, 200, 3, '#e8dcc0'), doorX, 100, dz - 2.4));
        for (const y of [52, 150]) root.add(at(box(64, 70, 1, '#f7f3ea'), doorX, y, dz - 4));
        root.add(at(sphere(3, C.yellow, 10, 8), doorX - 30, 100, dz - 6));
        root.add(at(box(10, 6, 1, C.white), doorX - 120, 110, dz - 1));

        // ---------------------------------------------------------- the bookcase (right wall), the play tent (front right corner)
        const shelf = bookcase(rng, 160);
        shelf.position.set(room.maxX - 17, 0, (room.minZ + room.maxZ) / 2 + 20);
        shelf.rotation.y = -Math.PI / 2;
        root.add(shelf);
        for (let k = -2; k <= 2; k++) reserve(room.maxX - 17, (room.minZ + room.maxZ) / 2 + 20 + k * 32, 20);

        const tent = new THREE.Group();
        const tentColors = [C.red, C.white, C.yellow, C.white, C.blue, C.white, C.green, C.white];
        for (let k = 0; k < 8; k++) {
            const geo = new THREE.ConeGeometry(42, 120, 2, 1, true, (k / 8) * Math.PI * 2, Math.PI / 4);
            const m = new THREE.Mesh(geo, toon(tentColors[k], { side: THREE.DoubleSide }));
            m.position.y = 60;
            m.castShadow = m.receiveShadow = true;
            tent.add(m);
        }
        for (let k = 0; k < 5; k++) {
            const pole = cyl(1.4, 1.4, 40, C.woodDark, 6);
            const a = (k / 5) * Math.PI * 2;
            pole.position.set(Math.cos(a) * 3, 132, Math.sin(a) * 3);
            pole.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
            tent.add(pole);
        }
        tent.add(at(sphere(4, C.yellow, 10, 8), 0, 150, 0));
        // flag
        const flag = shape([[0, 0], [16, -5], [0, -10]], toon(C.red, { side: THREE.DoubleSide }), 0);
        flag.position.set(0, 168, 0);
        tent.add(flag);
        tent.add(at(cyl(0.6, 0.6, 22, C.dark, 6), 0, 158, 0));
        // a cushion in the opening
        tent.add(at(roundBox(30, 8, 26, 4, C.pink, 2), 4, 4, 18, 0.3));
        put(tent, room.maxX - 62, room.minZ + 62, 45, -0.7);

        // ---------------------------------------------------------- posters
        const posterMaterial = toon(0xffffff, { map: canvasTexture(1024, 512, drawPosters) });
        const posters = [
            [0, room.minX + 0.8, 150, -60, Math.PI / 2],
            [1, room.minX + 0.8, 150, 30, Math.PI / 2],
            [2, room.maxX - 0.8, 160, room.minZ + 140, -Math.PI / 2],
            [3, 10, 150, room.maxZ - 0.8, Math.PI],
            [2, -110, 165, room.minZ + 0.8, 0],
            [0, room.minX + 110, 150, room.maxZ - 0.8, Math.PI],
        ];
        for (const [k, x, y, z, yaw] of posters) {
            const p = poster(posterMaterial, k, 44, 88);
            p.position.set(x, y, z);
            p.rotation.y = yaw;
            root.add(p);
        }

        // ---------------------------------------------------------- the book plateau: stacks of giant books carry the raised road
        const bookColors = [C.red, C.blue, C.green, C.navy, C.purple, C.orange, C.teal, C.yellow];
        const n = track.count;
        /** A stack of lying books exactly 'height' tall (L along x, D across). */
        const bookStack = (height, L, D) => {
            const stack = new THREE.Group();
            const count = Math.max(1, Math.round(height / 3));
            const weights = Array.from({ length: count }, () => rng.range(0.7, 1.3));
            const sum = weights.reduce((a, w) => a + w, 0);
            let y = 0;
            for (const w of weights) {
                const t = (height * w) / sum;
                const book = lyingBook(L - rng.range(0, 2.5), D - rng.range(0, 1.5), t, rng.pick(bookColors));
                book.position.y = y;
                book.rotation.y = (rng() - 0.5) * 0.08 + (rng() < 0.5 ? Math.PI : 0);
                stack.add(book);
                y += t;
            }
            return stack;
        };
        // two rows per side: the inner row carries the barrier blocks (top just under them), the outer row rises above the road like a parapet
        for (const side of [1, -1]) {
            for (const row of [0, 1]) {
                let last = null;
                for (let i = 0; i < n; i++) {
                    const hRoad = track.y[i];
                    if (hRoad < (row ? 1.5 : 0.5)) {
                        last = null;
                        continue;
                    }
                    const D = row ? 18 : 15.5;
                    const lateral = track.w[i] / 2 + 1.35 + (row ? 15.5 + 3 : 0) + D / 2;
                    const { nx, nz } = track.normalAt(i);
                    const x = track.x[i] + nx * side * lateral;
                    const z = track.z[i] + nz * side * lateral;
                    const L = rng.range(17, 24);
                    if (last && Math.hypot(x - last.x, z - last.z) < last.L / 2 + L / 2 + 0.4) continue;
                    if (row && track.isNearRoad(x, z, 4 + D / 2)) continue;
                    // the inner row must stay under the lowest road (and barrier) along its whole length
                    let low = hRoad;
                    for (let k = -Math.ceil(L / 2) - 2; k <= Math.ceil(L / 2) + 2; k++) low = Math.min(low, track.y[(i + k + n) % n]);
                    if (!row && low < 0.4) continue;
                    const height = row ? hRoad + rng.range(3, 10) : low - 0.08 - GROUND;
                    const stack = bookStack(height, L, D);
                    stack.position.set(x, 0, z);
                    stack.rotation.y = Math.atan2(-track.tz[i], track.tx[i]);
                    root.add(stack);
                    reserve(x, z, 10);
                    last = { x, z, L };
                }
            }
        }
        // giant standing books beside the plateau (outer side) and an open book
        {
            const pts = [];
            for (let i = 0; i < n; i += 4) if (track.y[i] > 3.5) pts.push(i);
            const mid = pts[Math.floor(pts.length * 0.4)] ?? 0;
            const { nx, nz } = track.normalAt(mid);
            const out = track.x[mid] + nx * 40 < track.bounds.minX + 20 ? 1 : -1;
            const bx = track.x[mid] + nx * out * (track.w[mid] / 2 + 52);
            const bz = track.z[mid] + nz * out * (track.w[mid] / 2 + 52);
            const row = new THREE.Group();
            let x = -40;
            for (let k = 0; k < 11; k++) {
                const t = rng.range(4, 7);
                const h = rng.range(26, 42);
                const book = standingBook(h, rng.range(20, 26), t, rng.pick(bookColors), rng() < 0.5 ? C.yellow : null);
                book.position.set(x, 0, 0);
                if (k === 6) {
                    book.rotation.z = -0.5;
                    x += 16;
                }
                row.add(book);
                x += t + 0.4;
            }
            // bookends
            row.add(at(roundBox(2, 20, 18, 0.6, C.red, 1), -42, 10, 0));
            row.add(at(roundBox(14, 2, 18, 0.6, C.red, 1), -48, 1, 0));
            // the spines face the road
            put(row, bx, bz, 30, Math.atan2(-track.tz[mid], track.tx[mid]) + (out > 0 ? Math.PI : 0));
            const ob = openBook(44, 32, C.red);
            put(ob, track.x[mid] + nx * out * (track.w[mid] / 2 + 88), track.z[mid] + nz * out * (track.w[mid] / 2 + 88), 26, rng() * 3);
        }

        // ---------------------------------------------------------- the wooden train on its oval (left lobe), animated
        const train = { cx: -62, cz: 58, rx: 40, rz: 28 };
        let trainOk = !track.isNearRoad(train.cx - train.rx, train.cz, 9) && !track.isNearRoad(train.cx + train.rx, train.cz, 9)
            && !track.isNearRoad(train.cx, train.cz - train.rz, 9) && !track.isNearRoad(train.cx, train.cz + train.rz, 9);
        if (trainOk) {
            const tt = trainTrack(train.rx, train.rz, 8);
            tt.position.set(train.cx, 0, train.cz);
            root.add(tt);
            reserve(train.cx, train.cz, train.rx + 6);
            // a little station / tunnel of blocks inside the oval
            const station = group(
                at(roundBox(22, 12, 12, 1, C.yellow, 1), 0, 6, 0),
                at(roundBox(26, 2.5, 16, 0.8, C.red, 1), 0, 13.2, 0),
                at(woodBlock('roof', C.red, 14), 0, 18.5, 0),
                at(box(5, 7, 0.6, C.blue), -5, 5, 6.1),
                at(box(5, 5, 0.6, C.sky), 5, 7, 6.1),
            );
            station.position.set(train.cx, 0, train.cz);
            station.rotation.y = 0.15;
            root.add(station);
            const tower = blockTower(rng, 6);
            tower.position.set(train.cx + 20, 0, train.cz + 6);
            root.add(tower);
            const cars = [animated(locomotive()), animated(wagon('logs', C.green)), animated(wagon('blocks', C.yellow)), animated(wagon('logs', C.purple))];
            cars.forEach(c => root.add(c));
            const perimeter = Math.PI * (3 * (train.rx + train.rz) - Math.sqrt((3 * train.rx + train.rz) * (train.rx + 3 * train.rz)));
            animations.push((dt, time) => {
                const base = (time * 9) / perimeter * Math.PI * 2;
                cars.forEach((car, k) => {
                    const a = base - k * (16.5 / perimeter) * Math.PI * 2;
                    const x = train.cx + Math.cos(a) * train.rx;
                    const z = train.cz + Math.sin(a) * train.rz;
                    const dx = -Math.sin(a) * train.rx;
                    const dz = Math.cos(a) * train.rz;
                    car.position.set(x, 1.4 + GROUND, z);
                    car.rotation.set(0, Math.atan2(dx, dz), 0);
                });
            });
        }

        // ---------------------------------------------------------- hero toys
        put(teddy(), 122, 82, 22, -0.9);
        put(stackingRings(), 112, 32, 11, 0.3);
        const top = spinningTop();
        const topHolder = group(top);
        topHolder.userData.keep = true;
        if (put(topHolder, 46, 34, 10, 0, 0, { reach: 14 })) {
            const home = topHolder.position.clone();
            animations.push((dt, time) => {
                top.rotation.y += dt * 9;
                top.rotation.x = Math.sin(time * 2.1) * 0.07;
                top.rotation.z = Math.cos(time * 2.1) * 0.07;
                topHolder.position.x = home.x + Math.sin(time * 0.6) * 3;
                topHolder.position.z = home.z + Math.cos(time * 0.9) * 2;
            });
        }
        put(ball(14), 226, 190, 16);
        put(ball(9, [C.pink, C.white, C.sky, C.white]), -150, -95, 10);
        put(robot(C.sky), 230, -25, 12, -1.9);
        put(dino(C.lime), 40, 120, 26, 2.6);
        put(crayonBox(rng), 120, -60, 26, 0.3);
        put(brickHouse(rng), -10, -84, 16, 0.4);
        put(brickHouse(rng), 210, 120, 16, -0.6);
        put(robot(C.orange), -205, 120, 12, 1.2);

        // drawings on the floor (paper sheets)
        const drawingMaterial = toon(0xffffff, { map: canvasTexture(512, 256, drawDrawings) });
        for (const [k, x, z, yaw] of [[0, 30, -60, 0.4], [1, 64, -70, -0.5], [0, -60, 120, 1.2], [1, 160, 150, 0.2]]) {
            const g = new THREE.BoxGeometry(24, 0.2, 18);
            const uv = g.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i)) / 2);
            const sheet = new THREE.Mesh(g, drawingMaterial);
            sheet.receiveShadow = true;
            if (!track.isNearRoad(x, z, 18)) put(sheet, x, z, 0, yaw, 0.1);
        }

        // ---------------------------------------------------------- scattered toys (close to the road first: that is what the chase cam sees)
        const roomInside = (x, z) => isFree(x, z, 6);
        /** Wraps a scatter factory: objects whose footprint would reach the road (barriers included) are skipped. */
        const fits = make => (r, place) => {
            const object = make(r, place);
            return object && !track.isNearRoad(place.x, place.z, 4.5 + footprint(object)) ? object : null;
        };
        const scatterSet = (count, opts) => scatter(root, track, { rng, inside: roomInside, margin: 90, ...opts, make: fits(opts.make), count: Math.max(1, Math.round(count * q)) });
        const crayonColors = [C.red, C.blue, C.green, C.yellow, C.orange, C.purple, C.pink, C.teal];
        scatterSet(26, { clearance: 6, spacing: 9, maxDistance: 26, make: r => crayon(r.pick(crayonColors), r.range(16, 20)) });
        scatterSet(18, { clearance: 7, spacing: 14, maxDistance: 34, make: r => looseBlocks(r, r.range(5, 7)) });
        scatterSet(12, { clearance: 9, spacing: 22, maxDistance: 40, make: r => blockTower(r, r.range(5.5, 7.5)) });
        scatterSet(6, { clearance: 10, spacing: 30, maxDistance: 46, make: r => blockGate(r, 6.5) });
        scatterSet(9, { clearance: 11, spacing: 26, maxDistance: 50, make: r => brickPile(r, r.int(12, 22), r.range(7, 10)) });
        scatterSet(5, { clearance: 8, spacing: 30, maxDistance: 60, make: () => paperPlane() });
        scatterSet(4, { clearance: 8, spacing: 40, maxDistance: 70, make: r => sock(r.pick([C.red, C.blue, C.green])) });
        scatterSet(6, { clearance: 9, spacing: 30, maxDistance: 60, make: r => ball(r.range(4, 6), r.pick([[C.red, C.yellow], [C.blue, C.white], [C.green, C.orange]])) });
        // further away: bigger arrangements
        scatterSet(10, { clearance: 30, spacing: 30, make: r => (r() < 0.5 ? brickPile(r, r.int(20, 30), r.range(10, 14)) : blockTower(r, r.range(7, 9))) });
        scatterSet(14, { clearance: 20, spacing: 22, make: r => looseBlocks(r, r.range(6, 8)) });
        scatterSet(10, { clearance: 16, spacing: 20, make: r => crayon(r.pick(crayonColors), r.range(16, 20)) });

        // ---------------------------------------------------------- lights: the rocket lamp and the desk lamp glow (strongest at night)
        const lights = [];
        const rocketLight = lamp('#ffcf7a', night ? 1600 : dusk ? 700 : 300, 170);
        rocketLight.position.set(rocketX, rl.lightY, rocketZ + 6);
        lights.push(rocketLight);
        const deskLight = lamp('#fff0c0', night ? 1200 : dusk ? 500 : 200, 140);
        deskLight.position.set(winX - 40, theDesk.top + 26, deskZ + 20);
        lights.push(deskLight);
        if (night) {
            const nightLight = lamp('#9fb8ff', 900, 260);
            nightLight.position.set(winX, 150, room.minZ + 40);
            lights.push(nightLight);
        }

        return {
            lights,
            update(dt, time) {
                for (const a of animations) a(dt, time);
            },
        };
    },
};

