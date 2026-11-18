// TurboToys · race/vehicle.js – a car as it is seen: the model of cars/models.js moved by its physics (own car, own bots) or by the states of
// another browser (interpolated 110 ms behind), with everything that makes it alive: spinning and steering wheels, suspension, the wobbling antenna,
// exhaust smoke and backfires, the turbo glow and flame, skid marks, brake lights, headlights at night, the shield bubble, the wreck, a name tag.

import * as THREE from 'three';
import { buildCar } from '../cars/models.js';
import { LAYER_FX, canvasTexture, toon } from '../render/toon.js';
import { FLAG } from './physics.js';

const INTERP_MS = 110;
const charred = toon(0x2a2624);

function nameTag(text, color) {
    const texture = canvasTexture(256, 64, (ctx, w, h) => {
        ctx.font = '40px Bangers, Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 9;
        ctx.strokeStyle = '#14100c';
        ctx.fillStyle = color;
        ctx.strokeText(text, w / 2, h / 2 + 2);
        ctx.fillText(text, w / 2, h / 2 + 2);
    });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: true, sizeAttenuation: false }));
    // a fixed size on the screen (a share of the view height), not huge when the car is close
    sprite.scale.set(0.16, 0.04, 1);
    sprite.layers.set(LAYER_FX);
    return sprite;
}

export class Vehicle {
    /**
     * @param {{ seat: number, name: string, car: any, kind: string, local: boolean, effects: import('./fx.js').Effects, night: boolean, quality: string, showName: boolean }} options
     */
    constructor({ seat, name, car, local, effects, night, quality, showName }) {
        this.seat = seat;
        this.name = name;
        this.car = car;
        this.local = local;
        this.effects = effects;
        this.paint = car.paint;
        this.model = buildCar(car.body, { paint: car.paint, decal: car.decal, number: car.number, drive: car.drive.toLowerCase(), quality });
        this.group = new THREE.Group();
        this.group.add(this.model.group);
        this.wheelSpin = 0;
        this.antennaWobble = 0;
        this.antennaVel = 0;
        this.suspension = 0;
        this.suspensionVel = 0;
        this.exhaustTimer = 0;
        this.backfireTimer = 0;
        this.snapshots = [];
        this.state = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, vx: 0, vy: 0, vz: 0, steer: 0, speed: 0, flags: 0, progress: 0 };
        this.wrecked = false;
        this.originals = null;
        this.lastThrottle = 0;
        this.shield = new THREE.Mesh(new THREE.SphereGeometry(3.3, 20, 14), new THREE.MeshBasicMaterial({ color: 0x7fd3ff, transparent: true, opacity: 0.28, depthWrite: false }));
        this.shield.position.y = 1;
        this.shield.layers.set(LAYER_FX);
        this.shield.visible = false;
        this.group.add(this.shield);
        if (showName) {
            this.tag = nameTag(name, local ? '#ffd23a' : '#ffffff');
            this.tag.position.y = 4.4;
            this.group.add(this.tag);
        }
        // headlight cones at night (cheap: glowing cones, a real spotlight only for the own car)
        this.lights = [];
        if (night) {
            for (const p of this.model.headlights ?? []) {
                const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 12, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
                cone.rotation.x = -Math.PI / 2;
                cone.position.set(p.x, p.y, p.z + 6);
                cone.layers.set(LAYER_FX);
                this.model.body.add(cone);
                this.lights.push(cone);
            }
            if (local) {
                const spot = new THREE.SpotLight(0xfff1c8, 900, 90, 0.55, 0.5, 1.4);
                spot.position.set(0, 1.4, 1.8);
                spot.target.position.set(0, 0, 14);
                this.model.body.add(spot, spot.target);
                this.spot = spot;
            }
        }
    }

    // ---------------------------------------------------------------- remote cars: the states of the other browser

    /** A state message ("S") of this car arrived. */
    receive(data, now) {
        const s = {
            t: now, x: data[0], y: data[1], z: data[2], yaw: data[3], pitch: data[4], roll: data[5], vx: data[6], vy: data[7], vz: data[8], steer: data[9], speed: data[10],
            flags: data[11], progress: data[12],
        };
        const list = this.snapshots;
        list.push(s);
        if (list.length > 20) list.shift();
    }

    /** The interpolated state at render time (110 ms back; extrapolated a little when states are late). */
    interpolate(now) {
        const list = this.snapshots;
        if (list.length === 0) return this.state;
        const t = now - INTERP_MS;
        let a = list[0];
        let b = null;
        for (let k = 0; k < list.length; k++) {
            if (list[k].t <= t) a = list[k];
            else {
                b = list[k];
                break;
            }
        }
        const s = this.state;
        if (!b) {
            const dt = Math.min(0.25, (t - a.t) / 1000);
            s.x = a.x + a.vx * dt;
            s.y = a.y + a.vy * dt;
            s.z = a.z + a.vz * dt;
            s.yaw = a.yaw;
        } else {
            const k = (t - a.t) / Math.max(1, b.t - a.t);
            s.x = a.x + (b.x - a.x) * k;
            s.y = a.y + (b.y - a.y) * k;
            s.z = a.z + (b.z - a.z) * k;
            let dy = b.yaw - a.yaw;
            while (dy > Math.PI) dy -= Math.PI * 2;
            while (dy < -Math.PI) dy += Math.PI * 2;
            s.yaw = a.yaw + dy * k;
        }
        const last = b ?? a;
        if (b) {
            // the pitch goes all the way round in a looping: interpolate the angle
            let dp = b.pitch - a.pitch;
            while (dp > Math.PI) dp -= Math.PI * 2;
            while (dp < -Math.PI) dp += Math.PI * 2;
            s.pitch = a.pitch + dp * Math.min(1, Math.max(0, (t - a.t) / Math.max(1, b.t - a.t)));
        } else {
            s.pitch = last.pitch;
        }
        s.roll = last.roll;
        s.vx = last.vx;
        s.vy = last.vy;
        s.vz = last.vz;
        s.steer = last.steer;
        s.speed = last.speed;
        s.flags = last.flags;
        s.progress = last.progress;
        return s;
    }

    /** Copies the state of a local physics body. */
    fromBody(body, flags) {
        const s = this.state;
        s.x = body.x;
        s.y = body.y;
        s.z = body.z;
        s.yaw = body.yaw;
        s.pitch = body.pitch;
        s.roll = body.roll;
        s.vx = body.vx;
        s.vy = body.vy;
        s.vz = body.vz;
        s.steer = body.steer;
        s.speed = body.forwardSpeed;
        s.flags = flags;
        s.progress = body.progress;
        this.lastThrottle = body.throttle;
        this.spool = body.spool;
        return s;
    }

    get position() {
        return this.group.position;
    }

    // ---------------------------------------------------------------- drawing

    update(dt, time) {
        const s = this.state;
        const m = this.model;
        this.group.position.set(s.x, s.y, s.z);
        // the whole car pitches (slopes, loopings: yaw first, then the pitch around the car's own axis)
        this.group.rotation.order = 'YXZ';
        this.group.rotation.set(this.wrecked ? 0 : s.pitch, s.yaw, 0);
        const flags = s.flags | 0;
        const air = (flags & FLAG.air) !== 0;

        // suspension: a spring that the bumps and landings kick
        const target = air ? 0.12 : 0;
        this.suspensionVel += ((target - this.suspension) * 160 - this.suspensionVel * 12) * dt;
        this.suspension += this.suspensionVel * dt;
        m.body.position.y = this.suspension + (this.wrecked ? -0.15 : 0);
        m.body.rotation.x = this.wrecked ? m.body.rotation.x : 0;
        m.body.rotation.z = this.wrecked ? m.body.rotation.z : s.roll;

        // wheels
        const speed = s.speed ?? 0;
        this.wheelSpin += speed * dt;
        for (const w of m.wheels) {
            w.spin.rotation.x = this.wheelSpin / Math.max(0.3, w.radius);
            if (w.front) w.pivot.rotation.y = (s.steer ?? 0) * 0.42;
        }

        // the antenna whips back with acceleration and swings
        const accel = (speed - (this.lastSpeed ?? speed)) / Math.max(dt, 1e-3);
        this.lastSpeed = speed;
        this.antennaVel += (-this.antennaWobble * 70 - this.antennaVel * 4 - accel * 0.02) * dt;
        this.antennaWobble += this.antennaVel * dt;
        if (m.antenna) {
            m.antenna.rotation.x = -Math.min(0.9, Math.abs(speed) * 0.012) + this.antennaWobble;
            m.antenna.rotation.z = (s.steer ?? 0) * 0.15 + Math.sin(time * 9 + this.seat) * 0.02 * Math.min(1, Math.abs(speed) / 10);
        }

        // brake lights, turbo glow
        const braking = (flags & FLAG.brake) !== 0;
        for (const t of m.taillights ?? []) t.material.color.setHex(braking ? 0xff3a2a : 0x7a1410);
        const boosting = (flags & FLAG.boost) !== 0;
        if (m.turbo) m.turbo.material.color.setHex(boosting ? 0x8fe8ff : (this.car.drive === 'Turbo' && (this.spool ?? 0) > 0.6 ? 0xffb04a : 0x3a3a46));
        this.shield.visible = (flags & FLAG.shield) !== 0;
        if (this.shield.visible) this.shield.scale.setScalar(1 + Math.sin(time * 14) * 0.04);
        if (this.spot) this.spot.intensity = this.wrecked ? 0 : 900;

        // exhaust: smoke, flames when boosting, backfires (gas) when lifting off
        this.exhaustTimer -= dt;
        const exhausts = m.exhausts ?? [];
        if (!this.wrecked && exhausts.length && this.exhaustTimer <= 0) {
            this.exhaustTimer = boosting ? 0.03 : 0.09;
            const p = this.worldPoint(exhausts[Math.floor(Math.random() * exhausts.length)]);
            const back = this.forward(-1);
            if (boosting) this.effects.flame(p.x, p.y, p.z, back.x * 22 + s.vx, 1, back.z * 22 + s.vz, 1.2);
            else if (this.car.drive !== 'Electric' && Math.random() < 0.5) this.effects.smoke(p.x, p.y, p.z, { size: 0.9, vx: back.x * 3 + s.vx * 0.3, vy: 1.5, vz: back.z * 3 + s.vz * 0.3, life: 0.6, alpha: 0.55 });
        }
        if (this.car.drive === 'Gas' && this.local) {
            const lift = this.lastThrottleSeen > 0.6 && this.lastThrottle <= 0 && Math.abs(speed) > 20;
            this.lastThrottleSeen = this.lastThrottle;
            if (lift && exhausts.length) {
                const p = this.worldPoint(exhausts[0]);
                this.effects.flame(p.x, p.y, p.z, 0, 2, 0, 1.6);
                this.onBackfire?.();
            }
        }
        if (this.car.drive === 'Electric' && boosting) {
            const p = this.worldPoint(new THREE.Vector3(0, 0.9, -1.8));
            this.effects.glow(p.x, p.y, p.z, 2.5, 'blue', 0.06);
        }

        // tyre smoke and skid marks while drifting or braking hard
        const drifting = (flags & FLAG.drift) !== 0;
        if (!air && (drifting || (braking && Math.abs(speed) > 25))) {
            for (const w of m.wheels) {
                if (w.front && !braking) continue;
                const p = this.worldPoint(w.pivot.position, 0);
                this.effects.skid(`${this.seat}:${w.front ? 'f' : 'r'}${w.left ? 'l' : 'r'}`, p.x, s.y, p.z, s.yaw, 0.35);
                if (Math.random() < 0.3) this.effects.smoke(p.x, s.y + 0.3, p.z, { size: 1.6, vy: 1, life: 0.7, alpha: 0.6 });
            }
        } else if (air) {
            for (const w of m.wheels) this.effects.lift(`${this.seat}:${w.front ? 'f' : 'r'}${w.left ? 'l' : 'r'}`);
        }

        // a wreck smokes
        if (this.wrecked && Math.random() < 0.4) this.effects.smoke(s.x, s.y + 1.2, s.z, { color: 'darkSmoke', size: 2.4, vy: 4, life: 1.4 });
    }

    /** Lands, bumps: the suspension gets a kick. */
    bump(strength) {
        this.suspensionVel -= Math.min(8, strength * 0.25);
    }

    wreck() {
        if (this.wrecked) return;
        this.wrecked = true;
        this.originals = [];
        this.model.body.traverse(o => {
            if (o.isMesh && o.layers.mask === 1) {
                this.originals.push([o, o.material]);
                o.material = charred;
            }
        });
        this.model.body.rotation.z = (Math.random() - 0.5) * 0.5;
        this.model.body.rotation.x = (Math.random() - 0.5) * 0.3;
        if (this.tag) this.tag.visible = false;
    }

    repair() {
        if (!this.wrecked) return;
        this.wrecked = false;
        for (const [o, mat] of this.originals ?? []) o.material = mat;
        this.originals = null;
        this.model.body.rotation.set(0, 0, 0);
        if (this.tag) this.tag.visible = true;
    }

    /** The world position of a point of the car (local coordinates; y = null keeps the local y). */
    worldPoint(local, y = null) {
        const c = Math.cos(this.state.yaw);
        const sn = Math.sin(this.state.yaw);
        return { x: this.state.x + local.x * c + local.z * sn, y: this.state.y + (y ?? local.y), z: this.state.z - local.x * sn + local.z * c };
    }

    forward(sign = 1) {
        return { x: Math.sin(this.state.yaw) * sign, z: Math.cos(this.state.yaw) * sign };
    }

    gunPoint() {
        return this.worldPoint(this.model.gunMount ?? new THREE.Vector3(0, 1.2, 1.6));
    }

    dispose(scene) {
        scene.remove(this.group);
    }
}
