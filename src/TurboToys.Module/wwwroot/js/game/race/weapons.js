// TurboToys · race/weapons.js – what flies and lies on the track: machine-gun bullets, firework rockets (homing), thumbtack mines, oil puddles and the
// battery shock. Every browser draws everything; who reports a hit to the server (RaceRoom.Hit) follows one rule:
//   machine gun, rocket, shock → the browser of the shooter (it sees the targets where it draws them)
//   mine, oil                  → the browser that drives the car that touched it (its own car or its bots)
// The callbacks of the owner (race.js) do the reporting and the comic words.

import * as THREE from 'three';
import { LAYER_FX, toon, flat, cyl, cone, box, sphere, group } from '../render/toon.js';

const CAR_RADIUS = 2.3;
const BULLET_SPEED = 260;
const ROCKET_SPEED = 115;

function rocketModel() {
    const body = cyl(0.32, 0.32, 2.2, toon(0xe2392f), 10);
    body.rotation.x = Math.PI / 2;
    const tip = cone(0.32, 0.8, toon(0xf6c638), 10);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 1.5;
    const stripe = cyl(0.34, 0.34, 0.35, toon(0xf7f3ea), 10);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.z = 0.4;
    const fins = [];
    for (let k = 0; k < 3; k++) {
        const fin = box(0.08, 0.6, 0.6, toon(0x2f6fd0));
        const a = (k / 3) * Math.PI * 2;
        fin.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.4, -0.9);
        fin.rotation.z = a;
        fins.push(fin);
    }
    return group(body, tip, stripe, ...fins);
}

function mineModel() {
    // a giant thumbtack: a coloured head on a pin, with a blinking light
    const head = cyl(1.1, 1.25, 0.45, toon(0xe2392f), 16);
    head.position.y = 0.45;
    const cap = cyl(0.75, 1.0, 0.3, toon(0xff6a5a), 16);
    cap.position.y = 0.8;
    const pin = cone(0.12, 0.5, toon(0xc9d1d9), 8);
    pin.position.y = 0.12;
    pin.rotation.x = Math.PI;
    const light = sphere(0.22, flat(0xffe25a, { unique: true }), 8, 6);
    light.position.y = 1.0;
    const g = group(head, cap, pin, light);
    g.userData.light = light;
    return g;
}

function oilModel(seed) {
    const shape = new THREE.Shape();
    const n = 14;
    for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const r = 3.4 + Math.sin(a * 3 + seed) * 0.6 + Math.cos(a * 5 + seed * 2) * 0.4;
        if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0x17151c, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    mesh.rotation.x = -Math.PI / 2;
    const shine = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), new THREE.MeshBasicMaterial({ color: 0x8f86b8, transparent: true, opacity: 0.55, depthWrite: false }));
    shine.position.set(-1, 0.6, 0.02);
    mesh.add(shine);
    mesh.layers.set(LAYER_FX);
    shine.layers.set(LAYER_FX);
    return mesh;
}

export class Weapons {
    /**
     * @param {THREE.Scene} scene
     * @param {import('../tracks/track.js').Track} track
     * @param {import('./fx.js').Effects} effects
     * @param {{ onHit:(attacker:number, target:number, kind:string, amount:number, point:{x:number,y:number,z:number})=>void, onBlast:(kind:string, point:any)=>void, onOil:(target:number)=>void }} owner
     */
    constructor(scene, track, effects, owner) {
        this.scene = scene;
        this.track = track;
        this.effects = effects;
        this.owner = owner;
        this.bullets = [];
        this.rockets = [];
        this.mines = [];
        this.oils = [];
        this.rules = new Map();
        const tracer = new THREE.BoxGeometry(0.12, 0.12, 2.6);
        this.tracerMesh = new THREE.InstancedMesh(tracer, new THREE.MeshBasicMaterial({ color: 0xffe066 }), 256);
        this.tracerMesh.count = 0;
        this.tracerMesh.frustumCulled = false;
        this.tracerMesh.layers.set(LAYER_FX);
        scene.add(this.tracerMesh);
        this.tmp = new THREE.Object3D();
    }

    setRules(rules) {
        for (const r of rules) this.rules.set(r.kind, r);
    }

    damageOf(kind, fallback) {
        return this.rules.get(kind)?.damage ?? fallback;
    }

    // ---------------------------------------------------------------- firing

    /** A machine-gun bullet from a point in a direction (yaw). local: this browser reports what it hits. */
    gun(seat, x, y, z, yaw, local, damage) {
        const spread = (Math.random() - 0.5) * 0.05;
        const a = yaw + spread;
        this.bullets.push({ seat, x, y, z, vx: Math.sin(a) * BULLET_SPEED, vz: Math.cos(a) * BULLET_SPEED, life: 0.34, local, damage });
        this.effects.glow(x, y, z, 2.2, 'yellow', 0.05);
    }

    /** data: [x, y, z, yaw, target seat or -1] */
    rocket(seat, data, local) {
        const mesh = rocketModel();
        mesh.position.set(data[0], data[1], data[2]);
        mesh.rotation.y = data[3];
        this.scene.add(mesh);
        this.rockets.push({ seat, mesh, x: data[0], y: data[1], z: data[2], yaw: data[3], target: data[4] ?? -1, life: 3.2, local, index: -1 });
    }

    /** data: [x, y, z] */
    mine(seat, data, local) {
        const mesh = mineModel();
        mesh.position.set(data[0], data[1], data[2]);
        this.scene.add(mesh);
        this.mines.push({ seat, mesh, x: data[0], y: data[1], z: data[2], armed: 0.6, life: 50, local });
    }

    /** data: [x, y, z] */
    oil(seat, data) {
        const mesh = oilModel(seat + data[0]);
        mesh.position.set(data[0], data[1] + 0.08, data[2]);
        this.scene.add(mesh);
        this.oils.push({ seat, mesh, x: data[0], z: data[2], life: 22, touched: new Set() });
    }

    /** The battery shock around a car: data [x, y, z]. The shooter's browser reports every car in the radius. */
    shock(seat, data, local, cars, damage) {
        const [x, y, z] = data;
        this.effects.ring(x, y + 0.5, z, 26, 0x58c8ff, 0.5);
        this.effects.ring(x, y + 1.5, z, 18, 0xbfeaff, 0.35);
        this.effects.sparks(x, y + 1, z, 30, { speed: 26, color: 'blue' });
        this.owner.onBlast('Shock', { x, y, z });
        if (!local) return;
        for (const c of cars) {
            if (c.seat === seat || !c.alive) continue;
            if (Math.hypot(c.x - x, c.z - z) < 26) this.owner.onHit(seat, c.seat, 'Shock', damage, c);
        }
    }

    // ---------------------------------------------------------------- the world moves on

    /**
     * @param {number} dt
     * @param {Array<{ seat:number, x:number, y:number, z:number, alive:boolean, local:boolean, shield:boolean }>} cars
     */
    update(dt, cars, time) {
        // bullets: segment against car spheres
        let n = 0;
        for (let k = this.bullets.length - 1; k >= 0; k--) {
            const b = this.bullets[k];
            b.life -= dt;
            const nx = b.x + b.vx * dt;
            const nz = b.z + b.vz * dt;
            let hit = null;
            for (const c of cars) {
                if (c.seat === b.seat || !c.alive) continue;
                if (segmentHits(b.x, b.z, nx, nz, c.x, c.z, CAR_RADIUS) && Math.abs(b.y - (c.y + 0.9)) < 2.5) {
                    hit = c;
                    break;
                }
            }
            b.x = nx;
            b.z = nz;
            const p = this.track.locate(b.x, b.z, b.index ?? -1);
            b.index = p.index;
            const wall = Math.abs(p.lateral) > p.half + 2.1;
            if (hit || wall || b.life <= 0) {
                if (hit) {
                    this.effects.sparks(b.x, b.y, b.z, 4, { speed: 10 });
                    if (b.local && !hit.shield) this.owner.onHit(b.seat, hit.seat, 'MachineGun', b.damage, hit);
                } else if (wall) {
                    this.effects.sparks(b.x, b.y, b.z, 2, { speed: 6 });
                }
                this.bullets.splice(k, 1);
                continue;
            }
            if (n < 256) {
                this.tmp.position.set(b.x, b.y, b.z);
                this.tmp.rotation.set(0, Math.atan2(b.vx, b.vz), 0);
                this.tmp.updateMatrix();
                this.tracerMesh.setMatrixAt(n++, this.tmp.matrix);
            }
        }
        this.tracerMesh.count = n;
        this.tracerMesh.instanceMatrix.needsUpdate = true;

        // rockets: home on the target (or the nearest car ahead), explode on cars and walls
        for (let k = this.rockets.length - 1; k >= 0; k--) {
            const r = this.rockets[k];
            r.life -= dt;
            let target = cars.find(c => c.seat === r.target && c.alive);
            if (!target) {
                let best = Infinity;
                for (const c of cars) {
                    if (c.seat === r.seat || !c.alive) continue;
                    const dx = c.x - r.x;
                    const dz = c.z - r.z;
                    const forward = dx * Math.sin(r.yaw) + dz * Math.cos(r.yaw);
                    const d = Math.hypot(dx, dz);
                    if (forward > 0 && d < 90 && d < best) {
                        best = d;
                        target = c;
                    }
                }
            }
            if (target) {
                let want = Math.atan2(target.x - r.x, target.z - r.z) - r.yaw;
                while (want > Math.PI) want -= Math.PI * 2;
                while (want < -Math.PI) want += Math.PI * 2;
                r.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, want));
                r.y += ((target.y + 1) - r.y) * Math.min(1, dt * 3);
            }
            r.x += Math.sin(r.yaw) * ROCKET_SPEED * dt;
            r.z += Math.cos(r.yaw) * ROCKET_SPEED * dt;
            r.mesh.position.set(r.x, r.y, r.z);
            r.mesh.rotation.set(0, r.yaw, Math.sin(time * 20) * 0.2);
            this.effects.smoke(r.x - Math.sin(r.yaw) * 1.4, r.y, r.z - Math.cos(r.yaw) * 1.4, { size: 1.2, vy: 0.5, life: 0.8, alpha: 0.7 });
            this.effects.glow(r.x - Math.sin(r.yaw) * 1.2, r.y, r.z - Math.cos(r.yaw) * 1.2, 2.5, 'fire', 0.05);
            const p = this.track.locate(r.x, r.z, r.index);
            r.index = p.index;
            const hit = cars.find(c => c.seat !== r.seat && c.alive && Math.hypot(c.x - r.x, c.z - r.z) < CAR_RADIUS + 0.5 && Math.abs(c.y + 1 - r.y) < 3);
            if (hit || Math.abs(p.lateral) > p.half + 2.2 || r.life <= 0) {
                this.explode(r, 'Rocket');
                if (hit && r.local && !hit.shield) this.owner.onHit(r.seat, hit.seat, 'Rocket', this.damageOf('Rocket', 34), hit);
                this.rockets.splice(k, 1);
            }
        }

        // mines: armed after a moment; the car that touches one (if this browser drives it) reports
        for (let k = this.mines.length - 1; k >= 0; k--) {
            const m = this.mines[k];
            m.life -= dt;
            m.armed -= dt;
            const light = m.mesh.userData.light;
            if (light) light.material.color.setHex(Math.sin(time * 10 + k) > 0 ? 0xff3a2a : 0xffe25a);
            let trigger = null;
            if (m.armed <= 0) trigger = cars.find(c => c.alive && Math.hypot(c.x - m.x, c.z - m.z) < 2.6);
            if (trigger || m.life <= 0) {
                this.explode(m, 'Mine');
                if (trigger && trigger.local && !trigger.shield) this.owner.onHit(m.seat, trigger.seat, 'Mine', this.damageOf('Mine', 28), trigger);
                this.mines.splice(k, 1);
            }
        }

        // oil: cars that touch it spin (each car once per puddle)
        for (let k = this.oils.length - 1; k >= 0; k--) {
            const o = this.oils[k];
            o.life -= dt;
            if (o.life < 2) o.mesh.material.opacity = Math.max(0, o.life / 2) * 0.92;
            for (const c of cars) {
                if (!c.alive || o.touched.has(c.seat) || c.seat === o.seat && o.life > 20.5) continue;
                if (Math.hypot(c.x - o.x, c.z - o.z) < 3.8) {
                    o.touched.add(c.seat);
                    if (c.local && !c.shield) this.owner.onOil(c.seat);
                }
            }
            if (o.life <= 0) {
                this.scene.remove(o.mesh);
                this.oils.splice(k, 1);
            }
        }
    }

    explode(thing, kind) {
        this.scene.remove(thing.mesh);
        const p = { x: thing.x, y: thing.y, z: thing.z };
        this.effects.explosion(p.x, p.y, p.z, { size: kind === 'Mine' ? 0.8 : 0.7, paint: kind === 'Mine' ? 0xe2392f : 0xf6c638 });
        this.owner.onBlast(kind, p);
    }

    /** Where the hazards lie (the bots avoid them). */
    hazards() {
        return [...this.mines.map(m => ({ x: m.x, z: m.z })), ...this.oils.map(o => ({ x: o.x, z: o.z }))];
    }

    /** A mine went off somewhere else (a Damage message of kind Mine): the nearest one to the car disappears here too. */
    removeMineNear(x, z) {
        let best = -1;
        let bestD = 6;
        this.mines.forEach((m, k) => {
            const d = Math.hypot(m.x - x, m.z - z);
            if (d < bestD) {
                bestD = d;
                best = k;
            }
        });
        if (best >= 0) {
            this.explode(this.mines[best], 'Mine');
            this.mines.splice(best, 1);
        }
    }

    dispose() {
        for (const r of this.rockets) this.scene.remove(r.mesh);
        for (const m of this.mines) this.scene.remove(m.mesh);
        for (const o of this.oils) this.scene.remove(o.mesh);
        this.scene.remove(this.tracerMesh);
    }
}

function segmentHits(x0, z0, x1, z1, cx, cz, r) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((cx - x0) * dx + (cz - z0) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x0 + dx * t - cx;
    const pz = z0 + dz * t - cz;
    return px * px + pz * pz < r * r;
}
