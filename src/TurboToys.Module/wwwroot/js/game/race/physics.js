// TurboToys · race/physics.js – the arcade physics of one RC car on a track (runs in the browser for the own car and the bots the browser drives).
// The numbers come from the server (CarSpec: topSpeed, acceleration, grip, health, turboSeconds, weight); the drive type shapes the engine:
//   Electric – full torque from standstill, falling off with speed
//   Gas      – torque grows with the revs, best in the middle, pops when lifting off
//   Turbo    – lazy until the turbo spools (throttle + revs), then a hard kick
// Turbo boost (Shift): uses the tank (turboSeconds), +35 % top speed and a big push. The tank refills slowly, faster while drifting, at boost arrows
// and from crates. Units: 1 = 10 cm, seconds. Fixed sub-steps of 1/120 s.

import { BARRIER_OFFSET } from '../tracks/builder.js';
import { loopPoint } from '../tracks/track.js';

export const GRAVITY = 72;
const STEP = 1 / 120;
const WALL = BARRIER_OFFSET - 1.15; // the car's centre stays this far beyond the half width
const LOOP_GRAVITY = GRAVITY * 0.42; // loopings are arcade: the toy cars stick well (a car at ~60 % of its top speed makes it)

export class CarBody {
    /**
     * @param {{ topSpeed:number, acceleration:number, grip:number, health:number, turboSeconds:number, weight:number }} spec
     * @param {'Electric'|'Gas'|'Turbo'} drive
     * @param {import('../tracks/track.js').Track} track
     */
    constructor(spec, drive, track) {
        this.spec = spec;
        this.drive = drive;
        this.track = track;
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.yaw = 0;
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.yawRate = 0;
        this.pitch = 0;
        this.roll = 0;
        this.onGround = true;
        this.airTime = 0;
        this.index = -1; // the main path's sample (the progress; on a branch: the matching sample of the main path)
        this.path = track; // the path the car is on (the main path or a branch)
        this.pathIndex = -1; // the sample on that path
        this.mainPos = 0;
        this.rail = null; // in a looping: { loop, theta, lateral, speed }
        this.loc = {};
        this.surface = 'road';
        this.lateral = 0;
        this.rpm = 0;
        this.spool = 0;
        this.turbo = spec.turboSeconds * 0.5;
        this.boosting = false;
        this.padBoost = 0;
        this.spin = 0;
        this.slowed = 0;
        this.steer = 0;
        this.throttle = 0;
        this.drifting = 0;
        this.speed = 0;
        this.forwardSpeed = 0;
        this.sideSpeed = 0;
        this.distance = 0;
        this.events = [];
        this.accumulator = 0;
        this.frozen = false;
        this.lastGround = 0;
    }

    /** Places the car (start grid, respawn). */
    place(x, y, z, yaw) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.yaw = yaw;
        this.vx = this.vy = this.vz = 0;
        this.yawRate = 0;
        this.spin = 0;
        this.rail = null;
        this.onGround = true;
        const p = this.track.locateAny(x, z, y, this.loc);
        this.path = p.path;
        this.pathIndex = p.index;
        this.mainPos = p.path.mainIndex(p.index);
        this.index = Math.round(this.mainPos) % this.track.count;
        this.lastGround = p.height;
    }

    /** Sets the distance along the track (laps × length in samples) for the start, behind the line. */
    setDistance(samples) {
        this.distance = samples;
    }

    get progress() {
        return this.distance / this.track.count;
    }

    /** Advances by dt with the controls { throttle, steer, handbrake, boost }. Returns the events of the step ([{ type: 'wall'|'land'|'boostpad', strength }]). */
    update(dt, controls) {
        this.events.length = 0;
        this.accumulator = Math.min(0.1, this.accumulator + dt);
        while (this.accumulator >= STEP) {
            this.accumulator -= STEP;
            this.step(STEP, controls);
        }
        return this.events;
    }

    /** The engine's push along the car (units/s²) at forward speed vf (throttle -1 … 1, not 0). */
    engineForce(vf, throttle, boostTop) {
        const spec = this.spec;
        const top = spec.topSpeed;
        if (throttle > 0) {
            let curve;
            if (this.drive === 'Electric') curve = 1.18 - 0.5 * this.rpm;
            else if (this.drive === 'Gas') curve = 0.72 + 0.75 * this.rpm - 0.62 * this.rpm * this.rpm;
            else curve = 0.62 + this.spool * 0.62 - 0.2 * this.rpm;
            let accel = spec.acceleration * curve * throttle;
            if (vf > top * boostTop) accel = 0;
            if (vf < 0) accel += 40 * throttle; // braking from reverse
            return accel;
        }
        if (vf > 1.5) return 78 * throttle;
        if (vf > -top * 0.38) return 30 * throttle;
        return 0;
    }

    /** Moves the progress to the main path's sample m (fractional) and keeps index in step. */
    progressTo(m) {
        const n = this.track.count;
        let d = m - this.mainPos;
        if (d > n / 2) d -= n;
        if (d < -n / 2) d += n;
        this.distance += d;
        this.mainPos = m;
        this.index = Math.round(m) % n;
    }

    step(dt, c) {
        if (this.rail) {
            this.stepRail(dt, c);
            return;
        }
        const spec = this.spec;
        const fx = Math.sin(this.yaw);
        const fz = Math.cos(this.yaw);
        const sx = Math.cos(this.yaw);
        const sz = -Math.sin(this.yaw);
        let vf = this.vx * fx + this.vz * fz;
        let vs = this.vx * sx + this.vz * sz;
        const frozen = this.frozen;
        const throttle = frozen ? 0 : (this.slowed > 0 ? Math.min(0.25, c.throttle) : c.throttle);
        const steer = frozen ? 0 : c.steer;
        this.steer += (steer - this.steer) * Math.min(1, dt * 12);
        this.throttle = throttle;
        const top = spec.topSpeed;
        this.rpm = Math.min(1.2, Math.abs(vf) / top);

        // ---- turbo spool (turbo drive) and the boost
        if (this.drive === 'Turbo') {
            if (throttle > 0.5 && this.rpm > 0.22) this.spool = Math.min(1, this.spool + dt * 1.3);
            else this.spool = Math.max(0, this.spool - dt * 2.2);
        }
        const wantsBoost = !frozen && (c.boost && this.turbo > 0.05);
        this.boosting = wantsBoost || this.padBoost > 0;
        if (wantsBoost && this.padBoost <= 0) this.turbo = Math.max(0, this.turbo - dt);
        if (this.padBoost > 0) this.padBoost -= dt;
        const boostTop = this.boosting ? 1.35 : 1;

        if (this.onGround) {
            // ---- engine
            if (throttle !== 0) vf += this.engineForce(vf, throttle, boostTop) * dt;
            else vf -= Math.sign(vf) * Math.min(Math.abs(vf), 6 * dt);
            // water (a sink, a puddle): heavy and slow
            if (this.surface === 'water') vf -= vf * 1.3 * dt;
            if (this.boosting) vf += 46 * dt * (vf < top * boostTop ? 1 : 0);
            // air drag (the top speed comes out of the engine curve and this)
            vf -= vf * Math.abs(vf) * 0.0035 * dt / boostTop;

            // ---- steering: needs speed, gets calmer at high speed
            const speedFactor = Math.min(1, Math.abs(vf) / 7) * (1 - 0.4 * Math.min(1, Math.abs(vf) / (top * 1.2)));
            const hand = c.handbrake && !frozen;
            const maxRate = (hand ? 3.6 : 2.7) * speedFactor;
            const target = this.steer * maxRate * Math.sign(vf || 1) + (this.spin > 0 ? 4.2 * Math.sign(this.yawRate || 1) : 0);
            this.yawRate += (target - this.yawRate) * Math.min(1, dt * (this.spin > 0 ? 3 : 9));

            // ---- grip: the side speed dies away (less with the handbrake, on oil almost not)
            let grip = spec.grip * 8.5;
            if (hand) grip *= 0.22;
            if (this.spin > 0) grip *= 0.12;
            vs *= Math.exp(-grip * dt);
            if (hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 14 * dt);
            this.drifting = Math.min(1, Math.abs(vs) / 9);
            if (this.drifting > 0.35 && Math.abs(vf) > 10) this.turbo = Math.min(spec.turboSeconds, this.turbo + dt * 0.4 * this.drifting);
        } else {
            // in the air: a little air control, no grip
            this.yawRate += (this.steer * 1.2 - this.yawRate) * Math.min(1, dt * 2);
            this.drifting = 0;
        }
        this.turbo = Math.min(spec.turboSeconds, this.turbo + dt * 0.05);
        if (this.spin > 0) this.spin -= dt;
        if (this.slowed > 0) this.slowed -= dt;

        this.yaw += this.yawRate * dt;
        const nfx = Math.sin(this.yaw);
        const nfz = Math.cos(this.yaw);
        const nsx = Math.cos(this.yaw);
        const nsz = -Math.sin(this.yaw);
        this.vx = nfx * vf + nsx * vs;
        this.vz = nfz * vf + nsz * vs;
        this.forwardSpeed = vf;
        this.sideSpeed = vs;

        // ---- move
        this.x += this.vx * dt;
        this.z += this.vz * dt;
        const p = this.track.locateCar(this.x, this.z, this.y, !this.onGround, this.path, this.pathIndex, this.loc);
        const path = p.path;
        const changed = path !== this.path;
        this.path = path;
        this.pathIndex = p.index;
        this.lateral = p.lateral;
        if (this.surface !== path.surface) this.events.push({ type: 'surface', surface: path.surface });
        this.surface = path.surface;
        this.progressTo(path.mainIndex(p.index));
        if (changed) this.events.push({ type: 'path', path });

        // ---- into a looping (from either end)
        if (path === this.track && this.onGround) {
            for (const loop of this.track.loops) {
                const forward = p.index === loop.entry && p.along - this.track.s[loop.entry] > 0.2 && vf > 0;
                const backward = p.index === loop.exit && p.along - this.track.s[loop.exit] < -0.2 && vf < 0;
                if (forward || backward) {
                    this.rail = { loop, theta: forward ? 0.001 : Math.PI * 2 - 0.001, lateral: Math.max(-p.half + 1.5, Math.min(p.half - 1.5, p.lateral)), speed: vf };
                    this.events.push({ type: 'loop', strength: Math.abs(vf) });
                    return;
                }
            }
        }

        // ---- the barriers: back inside, bounce off, scrape
        const limit = p.half + WALL;
        if (Math.abs(p.lateral) > limit) {
            const { nx, nz } = path.normalAt(p.index);
            const side = Math.sign(p.lateral);
            const over = Math.abs(p.lateral) - limit;
            this.x -= nx * side * over;
            this.z -= nz * side * over;
            // arcade: the car turns along the barrier instead of sticking to it
            const along = Math.atan2(path.tx[p.index], path.tz[p.index]);
            let diff = along - this.yaw;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) > Math.PI / 2) diff += diff > 0 ? -Math.PI : Math.PI;
            this.yaw += diff * Math.min(1, dt * 7);
            const vn = (this.vx * nx + this.vz * nz) * side;
            if (vn > 0) {
                this.vx -= nx * side * vn * 1.35;
                this.vz -= nz * side * vn * 1.35;
                this.vx *= 0.97;
                this.vz *= 0.97;
                this.yawRate *= 0.6;
                if (vn > 4) this.events.push({ type: 'wall', strength: vn, side });
            }
        }

        // ---- ground and air
        const ground = p.height;
        const groundRate = (ground - this.lastGround) / dt;
        this.lastGround = ground;
        if (this.onGround) {
            if (groundRate < this.vy - 2 && this.vy > 0.5) {
                // the road falls away under a fast car (kicker ramps, crests): it flies
                this.onGround = false;
            } else {
                this.vy = groundRate;
                this.y = ground;
            }
        }
        if (!this.onGround) {
            this.vy -= GRAVITY * dt;
            this.y += this.vy * dt;
            this.airTime += dt;
            if (this.y <= ground) {
                const impact = -this.vy;
                this.y = ground;
                this.vy = groundRate;
                this.onGround = true;
                if (this.airTime > 0.15) this.events.push({ type: 'land', strength: impact, air: this.airTime });
                this.airTime = 0;
            }
        } else {
            this.airTime = 0;
        }

        // ---- the body leans: pitch with the slope and the throttle, roll with the side force
        const slope = path.slopeAt(p.index) * Math.cos(this.yaw - Math.atan2(path.tx[p.index], path.tz[p.index]));
        const targetPitch = this.onGround ? -Math.atan(slope) - throttle * 0.035 + (c.throttle < 0 && vf > 2 ? 0.05 : 0) : this.pitch + dt * 0.25;
        this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * (this.onGround ? 10 : 2));
        const targetRoll = this.onGround ? Math.max(-0.16, Math.min(0.16, -this.yawRate * vf * 0.0035)) : this.roll * 0.98;
        this.roll += (targetRoll - this.roll) * Math.min(1, dt * 8);
        this.speed = Math.hypot(this.vx, this.vz);
    }

    /** A step in a looping: the car runs on the circle (engine, gravity along it), steering only moves it across the lane; too slow at the top and it falls. */
    stepRail(dt, c) {
        const rail = this.rail;
        const loop = rail.loop;
        const spec = this.spec;
        const frozen = this.frozen;
        const throttle = frozen ? 0 : c.throttle;
        this.throttle = throttle;
        this.steer += ((frozen ? 0 : c.steer) - this.steer) * Math.min(1, dt * 12);
        const wantsBoost = !frozen && c.boost && this.turbo > 0.05;
        this.boosting = wantsBoost || this.padBoost > 0;
        if (wantsBoost && this.padBoost <= 0) this.turbo = Math.max(0, this.turbo - dt);
        if (this.padBoost > 0) this.padBoost -= dt;
        const boostTop = this.boosting ? 1.35 : 1;
        let vf = rail.speed;
        this.rpm = Math.min(1.2, Math.abs(vf) / spec.topSpeed);
        if (throttle !== 0) vf += this.engineForce(vf, throttle, boostTop) * dt;
        if (this.boosting) vf += 46 * dt;
        vf -= vf * Math.abs(vf) * 0.0035 * dt / boostTop;
        vf -= LOOP_GRAVITY * Math.sin(rail.theta) * dt;
        rail.speed = vf;
        rail.lateral = Math.max(-loop.D / 2.3 + 1, Math.min(loop.D / 2.3 - 1, rail.lateral + this.steer * 7 * dt * Math.sign(vf || 1)));
        rail.theta += (vf * dt) / loop.radius;
        const theta = Math.max(0, Math.min(Math.PI * 2, rail.theta));
        const q = loopPoint(loop, theta, rail.lateral);
        this.drifting = 0;
        this.yawRate = 0;
        this.turbo = Math.min(spec.turboSeconds, this.turbo + dt * 0.05);

        // too slow upside down: it falls off
        const tooSlow = q.uy < -0.15 && (vf * vf) / loop.radius < LOOP_GRAVITY * -q.uy * 0.9;
        const out = rail.theta >= Math.PI * 2 || rail.theta <= 0 || tooSlow;
        this.x = q.x;
        this.y = q.y;
        this.z = q.z;
        this.vx = q.fx * vf;
        this.vy = q.fy * vf;
        this.vz = q.fz * vf;
        this.yaw = Math.atan2(loop.T[0], loop.T[1]);
        this.forwardSpeed = vf;
        this.sideSpeed = 0;
        this.speed = Math.abs(vf);
        this.pitch = -(theta > Math.PI ? theta - Math.PI * 2 : theta);
        this.roll = 0;
        const k = loop.entry + (theta / (Math.PI * 2)) * (loop.exit - loop.entry);
        this.pathIndex = Math.round(k);
        this.progressTo(k);
        if (!out) return;
        this.rail = null;
        if (tooSlow) {
            this.onGround = false;
            this.airTime = 0;
            this.events.push({ type: 'fall' });
            return;
        }
        // back on the road: flat again, heading along the lane
        const end = rail.theta >= Math.PI * 2 ? loop.exit : loop.entry;
        const p = this.track.pointAt(end, rail.lateral);
        this.pathIndex = end;
        this.progressTo(end);
        this.x = p.x;
        this.z = p.z;
        this.y = p.y;
        this.vy = 0;
        this.pitch = 0;
        this.lastGround = p.y;
        this.onGround = true;
        this.vx = loop.T[0] * vf;
        this.vz = loop.T[1] * vf;
    }

    /** A push from outside (crash with another car, explosion). */
    push(dx, dz, dy = 0) {
        this.vx += dx;
        this.vz += dz;
        if (dy > 0) {
            this.vy += dy;
            this.onGround = false;
        }
    }

    /** Fills the turbo tank (crate). */
    refillTurbo() {
        this.turbo = this.spec.turboSeconds;
    }

    /** The state for the others (the hub's "S" message): x, y, z, yaw, pitch, roll, vx, vy, vz, steer, speed, flags, progress. */
    pack(flags) {
        const r = v => Math.round(v * 100) / 100;
        return [r(this.x), r(this.y), r(this.z), r(this.yaw), r(this.pitch), r(this.roll), r(this.vx), r(this.vy), r(this.vz), r(this.steer), r(this.forwardSpeed), flags,
            Math.round(this.progress * 10000) / 10000];
    }
}

/** Flags of the state message. */
export const FLAG = { brake: 1, boost: 2, gun: 4, drift: 8, air: 16, wrecked: 32, lights: 64, shield: 128 };
