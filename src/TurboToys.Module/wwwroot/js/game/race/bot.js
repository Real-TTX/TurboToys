// TurboToys · race/bot.js – the drivers of the bots (in the browser that drives them: offline the player's, online the room's bot driver).
// A bot follows a point ahead on the track (with a lane it changes to overtake, to dodge oil and mines and to grab crates), brakes before bends,
// uses the turbo on straights and its weapons when it makes sense. Skill 1 … 5: speed in bends, reaction, aim, how often it uses the turbo.

export class BotDriver {
    /** @param {{ skill: number, seed: number }} options */
    constructor({ skill, seed }) {
        this.skill = Math.max(1, Math.min(5, skill));
        let s = seed >>> 0 || 1;
        this.random = () => {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
        this.lane = (this.random() - 0.5) * 0.6;
        this.laneTimer = 0;
        this.stuck = 0;
        this.reverse = 0;
        this.fireTimer = 0;
        this.specialTimer = 1 + this.random() * 2;
        this.mistake = 0;
    }

    /**
     * The controls of this frame.
     * @param {import('./physics.js').CarBody} car
     * @param {{ others: Array<{ x:number, z:number, progress:number, alive:boolean, seat:number }>, hazards: Array<{ x:number, z:number }>, crates: Array<{ x:number, z:number }>, special: string|null, hp: number, maxHp: number, ammo: number }} world
     * @returns {{ throttle:number, steer:number, handbrake:boolean, boost:boolean, fire:boolean, special:boolean, reset:boolean }}
     */
    drive(car, world, dt) {
        const track = car.track;
        const skill = this.skill;
        const speed = car.forwardSpeed;
        const top = car.spec.topSpeed;
        const i = car.index < 0 ? 0 : car.index;

        // ---- the lane: wander a little, overtake the car ahead, dodge hazards, go for crates
        this.laneTimer -= dt;
        if (this.laneTimer <= 0) {
            this.laneTimer = 1.5 + this.random() * 2.5;
            this.lane = (this.random() - 0.5) * 0.7;
        }
        const ahead = this.nearestAhead(car, world.others, 22);
        if (ahead) this.lane = ahead.lateral > 0 ? -0.55 : 0.55;
        for (const h of world.hazards) {
            const p = this.relative(car, h.x, h.z);
            if (p.forward > 0 && p.forward < 24 && Math.abs(p.side) < 5) {
                const hl = track.locate(h.x, h.z, i).lateral / Math.max(1, track.w[i] / 2);
                this.lane = hl > 0 ? -0.6 : 0.6;
            }
        }
        if (skill >= 2) {
            for (const crate of world.crates) {
                const p = this.relative(car, crate.x, crate.z);
                if (p.forward > 8 && p.forward < 35 && Math.abs(p.side) < 9) {
                    this.lane = track.locate(crate.x, crate.z, i).lateral / Math.max(1, track.w[i] / 2);
                    break;
                }
            }
        }

        // ---- steering towards a point ahead
        const look = Math.round(7 + Math.max(0, speed) * 0.42);
        const ti = (i + look) % track.count;
        const target = track.pointAt(ti, this.lane * track.w[ti] * 0.38);
        const dx = target.x - car.x;
        const dz = target.z - car.z;
        let angle = Math.atan2(dx, dz) - car.yaw;
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        let steer = Math.max(-1, Math.min(1, angle * 2.4));

        // ---- speed: slower before bends (better bots dare more)
        const bend = Math.abs(track.turnAhead(i, 18 + Math.max(0, speed) * 0.85));
        const dare = [0.78, 0.85, 0.91, 0.96, 1.0][skill - 1];
        const wanted = top * dare * (1 - Math.min(0.58, bend * 0.75));
        let throttle = speed < wanted ? 1 : speed > wanted + 6 ? -0.7 : 0.25;
        const handbrake = bend > 1.1 && speed > top * 0.5 && skill >= 3;

        // small mistakes of the weaker bots
        this.mistake -= dt;
        if (this.mistake <= 0) {
            this.mistake = 3 + this.random() * 6 * skill;
            if (this.random() < 0.35 / skill) steer += (this.random() - 0.5) * 0.8;
        }

        // ---- stuck: back up a little
        if (Math.abs(speed) < 2 && throttle > 0 && !car.frozen) this.stuck += dt;
        else this.stuck = Math.max(0, this.stuck - dt * 2);
        let reset = false;
        if (this.stuck > 1.2 && this.reverse <= 0) this.reverse = 0.9;
        if (this.stuck > 4.5) {
            reset = true;
            this.stuck = 0;
        }
        if (this.reverse > 0) {
            this.reverse -= dt;
            throttle = -1;
            steer = -steer;
        }

        // ---- turbo on straights
        const boost = skill >= 2 && bend < 0.25 && speed > top * 0.55 && car.turbo > car.spec.turboSeconds * (0.65 - skill * 0.08) && this.random() < 0.6;

        // ---- weapons
        let fire = false;
        let special = false;
        const target2 = this.targetAhead(car, world.others, 45, 0.22 - skill * 0.02);
        if (target2 && world.ammo > 0) fire = this.random() < 0.55 + skill * 0.08;
        this.specialTimer -= dt;
        if (world.special && this.specialTimer <= 0) {
            this.specialTimer = 1.2 + this.random() * (4 - skill * 0.5);
            const behind = this.nearestBehind(car, world.others, 30);
            switch (world.special) {
                case 'Rocket':
                    special = !!this.targetAhead(car, world.others, 70, 0.6);
                    break;
                case 'Mine':
                case 'Oil':
                    special = !!behind;
                    break;
                case 'Shock':
                    special = world.others.some(o => o.alive && Math.hypot(o.x - car.x, o.z - car.z) < 22);
                    break;
                case 'Shield':
                    special = world.hp < world.maxHp * 0.5 || this.random() < 0.15;
                    break;
            }
        }

        return { throttle, steer, handbrake, boost, fire, special, reset };
    }

    relative(car, x, z) {
        const dx = x - car.x;
        const dz = z - car.z;
        const fx = Math.sin(car.yaw);
        const fz = Math.cos(car.yaw);
        return { forward: dx * fx + dz * fz, side: dx * fz - dz * fx };
    }

    nearestAhead(car, others, range) {
        let best = null;
        for (const o of others) {
            if (!o.alive) continue;
            const p = this.relative(car, o.x, o.z);
            if (p.forward > 2 && p.forward < range && Math.abs(p.side) < 4.5 && (!best || p.forward < best.forward)) best = { ...p, lateral: p.side };
        }
        return best;
    }

    nearestBehind(car, others, range) {
        return others.find(o => {
            if (!o.alive) return false;
            const p = this.relative(car, o.x, o.z);
            return p.forward < -2 && p.forward > -range && Math.abs(p.side) < 7;
        });
    }

    targetAhead(car, others, range, cone) {
        return others.find(o => {
            if (!o.alive) return false;
            const p = this.relative(car, o.x, o.z);
            return p.forward > 3 && p.forward < range && Math.abs(Math.atan2(p.side, p.forward)) < cone;
        });
    }
}
