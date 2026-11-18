// TurboToys · showcase.js – the 3D pictures behind the menus:
//   DemoRace – a race of bots only on a world of the game (no server, no HUD), filmed by a cinematic camera: the living background of the menu
//   Garage   – the own car on a turning platform in a toy-shop corner, with spotlights (garage, tuning, paint, car dealer)

import * as THREE from 'three';
import { Race } from './race/race.js';
import { stage } from './render/stage.js';
import { buildCar } from './cars/models.js';
import { toon, roundBox, cyl, box, canvasTexture, PALETTE, LAYER_FX } from './render/toon.js';
import { SeedCars } from './catalog.js';

const LAYOUTS = ['kidsroom', 'garden', 'kitchen', 'workshop', 'supermarket', 'attic'];

class NoHud {
    update() {}
    feed() {}
    hint() {}
    hide() {}
}

/** A bots-only race as the menu's background. */
export class DemoRace extends Race {
    constructor({ layout, timeOfDay = 'day', cars = 5 }) {
        const seats = [];
        const pool = SeedCars;
        for (let k = 0; k < cars; k++) {
            const c = pool[(k * 3 + Math.floor(Math.random() * pool.length)) % pool.length];
            seats.push({
                index: k, kind: 'Bot', playerId: null, name: c.name, grid: k, skill: 2 + (k % 4), avatar: null,
                car: { ...c, paint: c.paint, decal: ['stripes', 'flames', 'stars', 'checker', 'bolt'][k % 5], number: 3 + k * 11 },
            });
        }
        super({
            start: {
                token: 'demo', kind: 'Quick', track: { id: 0, layout, name: '', timeOfDay, laps: 99 }, laps: 99, weapons: true, countdownMs: 0, seed: Math.floor(Math.random() * 1e6),
                botDriver: -1, pickupSlots: 0, weaponRules: DEMO_WEAPONS, seats,
            },
            me: -1, onResults() {}, onSaved() {}, onPause() {}, onClosed() {},
        });
        this.botDriver = true;
        this.demo = true;
        this.shot = 0;
        this.shotTime = 0;
        this.pickTimer = 0;
    }

    send(method, ...args) {
        // no server: crates are handed out here, hits applied here
        if (method === 'Pickup') {
            const [seat, slot] = args;
            const kinds = ['Rocket', 'Mine', 'Oil', 'Shock', 'Shield'];
            const roll = Math.random();
            const content = roll < 0.6 ? { kind: 'weapon', weapon: kinds[Math.floor(Math.random() * kinds.length)], amount: 2, hp: 0 } : { kind: 'turbo', weapon: null, amount: 1, hp: 0 };
            this.picked(seat, slot, content);
            setTimeout(() => !this.disposed && this.slotBack(slot), 8000);
        } else if (method === 'Hit') {
            const [attacker, target, , amount] = args;
            const car = this.cars[target];
            if (!car || car.wrecked) return;
            const hp = Math.max(0, car.hp - amount);
            this.damaged(target, hp, attacker, args[2]);
            if (hp <= 0) {
                this.wrecked(target, attacker, args[2], 2500);
                setTimeout(() => !this.disposed && this.respawned(target, car.maxHp), 2500);
            }
        }
    }

    listen() {}

    createHud() {
        return new NoHud();
    }

    async build() {
        await super.build();
        // the demo's own camera, no race music
        this.raceTime = 0;
        this.countdown = 0;
        for (const c of this.cars) if (c.body) c.body.frozen = false;
        this.setLights(4);
        return this;
    }

    inset() {}

    frame(dt, t) {
        if (this.disposed) return;
        this.raceTime = Math.max(this.raceTime, 0.01);
        this.countdown = -1;
        super.frame(dt, t);
    }

    updateSound() {}

    updateHud() {}

    /** A cinematic camera: changes car and angle every few seconds. */
    updateCamera(dt) {
        this.shotTime -= dt;
        if (this.shotTime <= 0) {
            this.shotTime = 5 + Math.random() * 4;
            this.shot = Math.floor(Math.random() * 4);
            this.focus = this.cars[Math.floor(Math.random() * this.cars.length)];
            this.side = Math.random() < 0.5 ? -1 : 1;
        }
        const car = this.focus ?? this.cars[0];
        const s = car.vehicle.state;
        const fx = Math.sin(s.yaw);
        const fz = Math.cos(s.yaw);
        const sx = Math.cos(s.yaw) * this.side;
        const sz = -Math.sin(s.yaw) * this.side;
        let pos;
        let look = new THREE.Vector3(s.x, s.y + 1, s.z);
        if (this.shot === 0) pos = new THREE.Vector3(s.x - fx * 10 + sx * 3, s.y + 3.5, s.z - fz * 10 + sz * 3);
        else if (this.shot === 1) pos = new THREE.Vector3(s.x + fx * 9 + sx * 5, s.y + 1.6, s.z + fz * 9 + sz * 5);
        else if (this.shot === 2) pos = new THREE.Vector3(s.x + sx * 11, s.y + 2.2, s.z + sz * 11);
        else {
            pos = new THREE.Vector3(s.x - fx * 18, s.y + 14, s.z - fz * 18);
            look = new THREE.Vector3(s.x + fx * 10, s.y, s.z + fz * 10);
        }
        const p = this.track.locate(pos.x, pos.z, -1);
        // stay above the road between the barriers (props beside it would fill the picture)
        const limit = p.half + 1.2;
        if (Math.abs(p.lateral) > limit) {
            const { nx, nz } = this.track.normalAt(p.index);
            const over = Math.abs(p.lateral) - limit;
            pos.x -= nx * Math.sign(p.lateral) * over;
            pos.z -= nz * Math.sign(p.lateral) * over;
        }
        pos.y = Math.max(pos.y, p.height + 1.2);
        this.camera.position.lerp(pos, 1 - Math.exp(-dt * 3));
        this.cameraLook.lerp(look, 1 - Math.exp(-dt * 6));
        this.camera.lookAt(this.cameraLook);
        this.camera.fov = 58;
        this.camera.updateProjectionMatrix();
    }
}

const DEMO_WEAPONS = [
    { kind: 'MachineGun', name: 'MG', damage: 3, amount: 0, cooldownMs: 90, crateWeight: 0 },
    { kind: 'Rocket', name: 'Rakete', damage: 34, amount: 2, cooldownMs: 700, crateWeight: 26 },
    { kind: 'Mine', name: 'Mine', damage: 28, amount: 3, cooldownMs: 400, crateWeight: 24 },
    { kind: 'Oil', name: 'Öl', damage: 0, amount: 2, cooldownMs: 600, crateWeight: 20 },
    { kind: 'Shock', name: 'Schock', damage: 14, amount: 1, cooldownMs: 1500, crateWeight: 14 },
    { kind: 'Shield', name: 'Schild', damage: 0, amount: 1, cooldownMs: 4000, crateWeight: 16 },
];

let demo = null;
let demoLoading = null;

/** Shows the menu's background race (builds one the first time; keeps it while the menu is open). */
export async function showDemo() {
    if (demo && !demo.disposed) {
        const current = demo;
        stage.show(current.scene, current.camera, (dt, t) => current.frame(dt, t));
        return current;
    }
    if (demoLoading) return demoLoading;
    const layout = LAYOUTS[Math.floor(Math.random() * LAYOUTS.length)];
    const loading = new DemoRace({ layout, timeOfDay: layout === 'attic' ? 'night' : Math.random() < 0.2 ? 'dusk' : 'day', cars: 5 }).build();
    demoLoading = loading.then(d => {
        demo = d;
        demoLoading = null;
        if (d.disposed) return d;
        stage.show(d.scene, d.camera, (dt, t) => d.frame(dt, t));
        return d;
    }).catch(error => {
        demoLoading = null;
        throw error;
    });
    return demoLoading;
}

/** Ends the background race (before a real race: memory). */
export function stopDemo() {
    demo?.dispose();
    demo = null;
}

// ------------------------------------------------------------------ the garage

export class Garage {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = canvasTexture(4, 256, (ctx, w, h) => {
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, '#2b2f55');
            g.addColorStop(1, '#151726');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        });
        this.camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.5, 400);
        this.angle = 0.6;
        this.zoom = 1;
        this.car = null;
        this.key = null;
        this.offset = 0;

        const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a2a20, 1.1);
        const key = new THREE.SpotLight(0xfff2d8, 2200, 120, 0.45, 0.5, 1.2);
        key.position.set(12, 26, 14);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        const rim = new THREE.SpotLight(0x8fc8ff, 900, 120, 0.5, 0.6, 1.2);
        rim.position.set(-16, 14, -12);
        this.scene.add(hemi, key, rim, key.target, rim.target);

        // the platform: a toy turntable on a shelf board with a checkered top
        const platformTop = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 0.6, 48), toon(0xffffff, {
            map: canvasTexture(256, 256, (ctx, w, h) => {
                const s = 32;
                for (let x = 0; x < w / s; x++) for (let y = 0; y < h / s; y++) {
                    ctx.fillStyle = (x + y) % 2 ? '#2a2c36' : '#e9e2cf';
                    ctx.fillRect(x * s, y * s, s, s);
                }
            }),
        }));
        platformTop.position.y = 0.3;
        platformTop.receiveShadow = true;
        this.platform = new THREE.Group();
        this.platform.add(platformTop);
        const rimRing = cyl(7.8, 8, 0.5, toon(PALETTE.red), 48);
        rimRing.position.y = 0.05;
        this.platform.add(rimRing);
        this.scene.add(this.platform);
        const base = cyl(9, 9.6, 1.2, toon(0x3a3d48), 48);
        base.position.y = -0.6;
        this.scene.add(base);
        const floor = new THREE.Mesh(new THREE.CircleGeometry(80, 48), toon(0x232536));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -1.2;
        floor.receiveShadow = true;
        this.scene.add(floor);
        // toy boxes and tools around, out of focus
        const props = [
            [-16, 2.5, -10, roundBox(6, 6, 6, 0.4, toon(PALETTE.yellow))],
            [-21, 1.5, -2, roundBox(4, 4, 4, 0.3, toon(PALETTE.blue))],
            [17, 3.5, -12, roundBox(5, 8, 5, 0.3, toon(PALETTE.red))],
            [20, 1.2, -3, cyl(2.4, 2.4, 2.4, toon(PALETTE.green), 20)],
            [-12, 0.8, 8, box(8, 0.8, 3, toon(PALETTE.wood))],
        ];
        for (const [x, y, z, mesh] of props) {
            mesh.position.set(x, y - 1.2, z);
            mesh.rotation.y = Math.random();
            this.scene.add(mesh);
        }
        // light beams (comic)
        const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 30, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.set(0, 14, 0);
        beam.layers.set(LAYER_FX);
        this.scene.add(beam);
    }

    /** Shows a car (body + look); rebuilds only when something changed. */
    setCar(body, look) {
        const key = JSON.stringify([body, look]);
        if (key === this.key) return;
        this.key = key;
        if (this.car) this.platform.remove(this.car.group);
        this.car = buildCar(body, { paint: look.paint, decal: look.decal, number: look.number, drive: (look.drive ?? 'electric').toLowerCase(), quality: 'high' });
        this.car.group.position.y = 0.6;
        this.car.group.scale.setScalar(1.6);
        this.platform.add(this.car.group);
        this.pop = 0.25;
    }

    show() {
        stage.show(this.scene, this.camera, (dt, t) => this.frame(dt, t));
    }

    frame(dt, t) {
        this.angle += dt * 0.35;
        this.platform.rotation.y = this.angle;
        if (this.pop > 0) {
            this.pop = Math.max(0, this.pop - dt);
            const s = 1.6 * (1 + Math.sin(this.pop * 20) * this.pop * 0.3);
            this.car?.group.scale.setScalar(s);
        }
        if (this.car?.antenna) this.car.antenna.rotation.x = Math.sin(t * 2.2) * 0.08;
        // the car sits a little right of the middle (the panels are left)
        const wide = innerWidth > 900;
        const d = 26 / this.zoom;
        this.camera.position.set(wide ? -6 : 0, 8.5, d);
        this.camera.lookAt(wide ? -6 + this.offset : 0, 2.2, 0);
        this.camera.aspect = innerWidth / innerHeight;
        this.camera.updateProjectionMatrix();
    }
}
