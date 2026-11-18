// TurboToys · race/race.js – one race in the browser: the world, the cars (own car and the bots this browser drives: physics; the others: their
// states from the hub), the countdown, the controls, collisions, crates, boost arrows, weapons, laps, the camera, the HUD, the comic words and
// insets, the sound – and the hub messages of the race (docs/PROTOCOL.md). The server (or offline TurboToys.Local) decides hits, crates and laps.

import * as THREE from 'three';
import { buildWorld } from '../world.js';
import { stage } from '../render/stage.js';
import { toon, canvasTexture, LAYER_FX, roundBoxGeometry } from '../render/toon.js';
import { CarBody, FLAG } from './physics.js';
import { loopPoint } from '../tracks/track.js';
import { BotDriver } from './bot.js';
import { Effects } from './fx.js';
import { Weapons } from './weapons.js';
import { Vehicle } from './vehicle.js';
import { Hud, WEAPON_NAMES, escapeHtml } from '../hud.js';
import { comic, word } from '../comic.js';
import { input } from '../input.js';
import { audio } from '../audio.js';
import { api } from '../api.js';

const SEND_INTERVAL = 1 / 15;
const CAR_RADIUS = 2.05;

function crateTexture() {
    return canvasTexture(128, 128, (ctx, w, h) => {
        ctx.fillStyle = '#f6c638';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#14100c';
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, w - 10, h - 10);
        ctx.fillStyle = '#e2392f';
        ctx.font = '96px Bangers, Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 8;
        ctx.strokeText('?', w / 2, h / 2 + 6);
        ctx.fillText('?', w / 2, h / 2 + 6);
    });
}

export class Race {
    /**
     * @param {{ start: any, me: number, onResults: (results:any, race:Race)=>void, onSaved: (info:any)=>void, onPause: ()=>void, onClosed: (why:string)=>void }} options
     */
    constructor({ start, me, onResults, onSaved, onPause, onClosed }) {
        this.start = start;
        this.me = me;
        this.onResults = onResults;
        this.onSaved = onSaved;
        this.onPause = onPause;
        this.onClosed = onClosed;
        this.cars = [];
        this.unsubscribe = [];
        this.time = 0;
        this.raceTime = -1;
        this.countdown = start.countdownMs / 1000;
        this.sendTimer = 0;
        this.cameraMode = 0;
        this.shake = 0;
        this.finished = false;
        this.disposed = false;
        this.insets = [];
        this.lastCount = 4;
        this.paused = false;
        this.bestLap = null;
        this.mySeat = start.seats.find(s => s.playerId === me && s.kind === 'Human')?.index ?? -1;
        this.botDriver = start.botDriver === me;
        this.quality = stage.settings.quality;
    }

    async build() {
        const start = this.start;
        const world = await buildWorld({ layout: start.track.design ?? start.track.layout, timeOfDay: start.track.timeOfDay.toLowerCase(), quality: this.quality });
        this.world = world;
        this.track = world.track;
        this.scene = world.scene;
        this.effects = new Effects(this.scene, { quality: this.quality });
        this.weapons = new Weapons(this.scene, this.track, this.effects, {
            onHit: (a, t, kind, amount, point) => this.reportHit(a, t, kind, amount, point),
            onBlast: (kind, p) => this.blast(kind, p),
            onOil: seat => this.oiled(seat),
        });
        this.weapons.setRules(start.weaponRules);
        this.gunRule = start.weaponRules.find(w => w.kind === 'MachineGun');

        // ---- the cars on the grid
        for (const seat of start.seats) {
            const local = seat.index === this.mySeat || (seat.kind === 'Bot' && this.botDriver);
            const vehicle = new Vehicle({
                seat: seat.index, name: seat.name, car: seat.car, local: seat.index === this.mySeat, effects: this.effects, night: world.night, quality: this.quality,
                showName: seat.index !== this.mySeat,
            });
            vehicle.onBackfire = () => audio.play('backfire', { x: vehicle.state.x, z: vehicle.state.z, volume: 0.6 });
            this.scene.add(vehicle.group);
            const slot = this.track.gridSlot(seat.grid);
            const car = {
                seat: seat.index, info: seat, vehicle, local, body: null, bot: null,
                hp: seat.car.spec.health, maxHp: seat.car.spec.health, special: null, specialCount: 0, ammo: seat.car.spec.gunAmmo,
                lapsDone: 0, finished: false, place: 0, wrecked: false, shieldUntil: 0, gunCooldown: 0, remoteGun: 0, pending: new Set(), color: seat.car.paint,
                money: 0, progress: 0,
            };
            vehicle.state.x = slot.x;
            vehicle.state.y = slot.y;
            vehicle.state.z = slot.z;
            vehicle.state.yaw = slot.yaw;
            if (local) this.makeLocal(car, slot);
            this.cars.push(car);
        }
        this.myCar = this.cars.find(c => c.seat === this.mySeat) ?? null;

        // ---- crates
        this.crateMaterial = toon(0xffffff, { map: crateTexture() });
        const crateGeometry = roundBoxGeometry(2.2, 2.2, 2.2, 0.25, 1);
        this.crates = this.track.pickups.map(p => {
            const mesh = new THREE.Mesh(crateGeometry, this.crateMaterial);
            mesh.position.set(p.x, p.y + 1.6, p.z);
            mesh.castShadow = true;
            this.scene.add(mesh);
            return { ...p, mesh, available: true };
        });

        // ---- camera
        this.camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.4, 1600);
        this.insetCamera = new THREE.PerspectiveCamera(50, 1.4, 0.4, 800);
        const focus = this.myCar?.vehicle.state ?? this.cars[0].vehicle.state;
        this.camera.position.set(focus.x - Math.sin(focus.yaw) * 10, focus.y + 5, focus.z - Math.cos(focus.yaw) * 10);
        this.cameraLook = new THREE.Vector3(focus.x, focus.y + 1, focus.z);

        // ---- HUD and sound
        this.hud = this.createHud();
        if (this.myCar) {
            this.engine = audio.engine(this.myCar.info.car.drive, { local: true });
        }
        this.remoteEngines = new Map();
        audio.music('race');

        this.listen();
        this.setLights(0);
        input.active = true;
        stage.show(this.scene, this.camera, (dt, t) => this.frame(dt, t));
        stage.overlays.push((renderer, pipeline) => this.drawInsets(renderer, pipeline));
        const where = start.track.name;
        comic.caption(`${where} · ${start.laps} ${start.laps === 1 ? 'Runde' : 'Runden'} · ${this.cars.length} Autos`, { life: 3800 });
        return this;
    }

    /** Sends to the hub (the demo of the menu sends nothing). */
    send(method, ...args) {
        api.send(method, ...args);
    }

    createHud() {
        return new Hud(document.getElementById('tt-hud'), this.track);
    }

    makeLocal(car, slot) {
        car.local = true;
        const body = new CarBody(car.info.car.spec, car.info.car.drive, this.track);
        body.place(slot.x, slot.y, slot.z, slot.yaw);
        const p = this.track.locate(slot.x, slot.z, -1);
        body.setDistance(p.index > this.track.count / 2 ? p.index - this.track.count : p.index);
        body.frozen = true;
        car.body = body;
        if (car.info.kind === 'Bot') car.bot = new BotDriver({ skill: car.info.skill || 2, seed: (this.start.seed + car.seat * 7919) >>> 0 });
        // developer autopilot (tests, demos): localStorage turbotoys.autopilot = 1 lets a bot drive the own car
        else if (localStorage.getItem('turbotoys.autopilot') === '1') car.bot = new BotDriver({ skill: 5, seed: 7 });
    }

    // ---------------------------------------------------------------- hub messages

    listen() {
        const on = (name, fn) => this.unsubscribe.push(api.on(name, (...args) => {
            if (!this.disposed) fn(...args);
        }));
        on('S', (seat, data) => this.cars[seat]?.local || this.cars[seat]?.vehicle.receive(data, performance.now()));
        on('Fired', (seat, kind, data) => this.fired(seat, kind, data, false));
        on('Damage', (target, hp, attacker, kind) => this.damaged(target, hp, attacker, kind));
        on('Wrecked', (target, attacker, kind, respawnMs) => this.wrecked(target, attacker, kind, respawnMs));
        on('Respawn', (target, hp) => this.respawned(target, hp));
        on('Picked', (seat, slot, content) => this.picked(seat, slot, content));
        on('SlotBack', slot => this.slotBack(slot));
        on('Lap', (seat, lap, lapMs) => this.lapped(seat, lap, lapMs));
        on('Finished', (seat, place, timeMs) => this.carFinished(seat, place, timeMs));
        on('Results', results => {
            this.results = results;
            setTimeout(() => !this.disposed && this.onResults(results, this), this.finished ? 2600 : 600);
        });
        on('Saved', info => this.onSaved(info));
        on('BotDriver', playerId => this.takeOverBots(playerId));
        on('Chat', (name, text) => this.hud.feed(`<b>${escapeHtml(name)}:</b> ${escapeHtml(text)}`));
        on('Closed', why => this.onClosed(why ?? 'Die Verbindung ist weg.'));
    }

    takeOverBots(playerId) {
        if (playerId !== this.me || this.botDriver) return;
        this.botDriver = true;
        for (const car of this.cars.filter(c => c.info.kind === 'Bot')) {
            const s = car.vehicle.state;
            this.makeLocal(car, { x: s.x, y: s.y, z: s.z, yaw: s.yaw });
            car.body.distance = Math.round((s.progress || 0) * this.track.count);
            car.lapsDone = Math.max(0, Math.floor(s.progress || 0));
            car.body.frozen = this.raceTime < 0 || car.finished;
        }
        this.hud.hint('Du steuerst jetzt die Bots.');
    }

    fired(seat, kind, data, local) {
        const car = this.cars[seat];
        if (!car) return;
        const p = { x: data[0], y: data[1], z: data[2] };
        switch (kind) {
            case 'Rocket':
                this.weapons.rocket(seat, data, local);
                audio.play('rocket', { x: p.x, z: p.z });
                comic.pop(word('rocket'), { at: new THREE.Vector3(p.x, p.y + 2, p.z), camera: this.camera, style: 'hit', size: 0.7, life: 700 });
                break;
            case 'Mine':
                this.weapons.mine(seat, data, local);
                audio.play('mine-drop', { x: p.x, z: p.z });
                break;
            case 'Oil':
                this.weapons.oil(seat, data);
                audio.play('oil', { x: p.x, z: p.z });
                break;
            case 'Shock':
                this.weapons.shock(seat, data, local, this.targets(), this.weapons.damageOf('Shock', 14));
                audio.play('shock', { x: p.x, z: p.z });
                comic.pop(word('shock'), { at: new THREE.Vector3(p.x, p.y + 3, p.z), camera: this.camera, style: 'turbo' });
                break;
            case 'Shield':
                car.shieldUntil = this.time + 4;
                audio.play('shield', { x: p.x, z: p.z });
                comic.pop(word('shield'), { at: new THREE.Vector3(p.x, p.y + 3, p.z), camera: this.camera, style: 'turbo', size: 0.8 });
                break;
        }
    }

    damaged(target, hp, attacker, kind) {
        const car = this.cars[target];
        if (!car) return;
        const before = car.hp;
        car.hp = hp;
        const s = car.vehicle.state;
        if (kind === 'Shock' && car.local && car.body) car.body.slowed = 1.6;
        if (kind === 'Mine' && !car.local) this.weapons.removeMineNear(s.x, s.z);
        if (kind === 'Rocket' && car.local && car.body) car.body.push((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 12);
        if (car === this.myCar && before - hp >= 1) {
            this.shake = Math.min(1, this.shake + (before - hp) / 30);
            document.getElementById('tt-hit')?.classList.remove('on');
            void document.getElementById('tt-hit')?.offsetWidth;
            document.getElementById('tt-hit')?.classList.add('on');
        }
        if (kind === 'MachineGun' && Math.random() < 0.08) comic.pop(word('hit'), { at: new THREE.Vector3(s.x, s.y + 2.5, s.z), camera: this.camera, style: 'hit', size: 0.6, life: 600 });
    }

    wrecked(target, attacker, kind, respawnMs) {
        const car = this.cars[target];
        if (!car) return;
        car.wrecked = true;
        car.hp = 0;
        car.special = null;
        car.specialCount = 0;
        car.vehicle.wreck();
        if (car.body) {
            car.body.frozen = true;
            car.body.push(0, 0, 18);
        }
        const s = car.vehicle.state;
        this.effects.explosion(s.x, s.y, s.z, { size: 1.3, paint: car.color });
        audio.play('wreck', { x: s.x, z: s.z });
        const at = new THREE.Vector3(s.x, s.y + 3, s.z);
        comic.pop(word('explosion'), { at, camera: this.camera, style: 'boom', size: 1.4, life: 1400 });
        const killer = attacker >= 0 ? this.cars[attacker] : null;
        this.hud.feed(killer
            ? `<b style="color:${killer.color}">${escapeHtml(killer.info.name)}</b> 💥 <b style="color:${car.color}">${escapeHtml(car.info.name)}</b>`
            : `<b style="color:${car.color}">${escapeHtml(car.info.name)}</b> ist Schrott`);
        if (killer === this.myCar && killer) {
            comic.shout(word('kill'), { style: 'boom', life: 1100, sub: `+${75} Schrauben` });
            killer.money += 75;
        }
        if (car === this.myCar) {
            comic.shout('SCHROTT!', { style: 'hit', life: 1500, sub: 'Gleich geht’s weiter …' });
            this.shake = 1;
        }
        // XIII: an inset panel shows the wreck when it happens near the camera or concerns the player
        const near = this.focusCar() && Math.hypot(s.x - this.focusCar().vehicle.state.x, s.z - this.focusCar().vehicle.state.z) < 140;
        if (near || car === this.myCar || killer === this.myCar) this.inset(car, killer === this.myCar ? 'VOLLTREFFER!' : car === this.myCar ? 'AUTSCH …' : 'UNTERDESSEN …');
    }

    respawned(target, hp) {
        const car = this.cars[target];
        if (!car) return;
        car.wrecked = false;
        car.hp = hp;
        car.vehicle.repair();
        if (car.body) {
            const p = this.backOnRoad(car.body, 6);
            const keep = car.body.distance;
            car.body.place(p.x, p.y, p.z, p.yaw);
            car.body.distance = keep - 6;
            car.body.frozen = !!car.finished && car !== this.myCar ? false : false;
            car.shieldUntil = this.time + 1.5;
        }
    }

    picked(seat, slot, content) {
        const crate = this.crates[slot];
        if (crate) {
            crate.available = false;
            crate.mesh.visible = false;
            this.effects.sparks(crate.x, crate.y + 1.6, crate.z, 10, { speed: 12 });
        }
        const car = this.cars[seat];
        if (!car) return;
        car.pending.delete(slot);
        const s = car.vehicle.state;
        const at = new THREE.Vector3(s.x, s.y + 3, s.z);
        let text = word('pickup');
        if (car.local) {
            switch (content.kind) {
                case 'weapon':
                    car.special = content.weapon;
                    car.specialCount = content.amount;
                    text = `${WEAPON_NAMES[content.weapon].toUpperCase()}!`;
                    break;
                case 'repair':
                    car.hp = content.hp;
                    text = 'REPARIERT!';
                    audio.play('repair');
                    break;
                case 'turbo':
                    car.body?.refillTurbo();
                    text = 'TURBO VOLL!';
                    break;
                case 'ammo':
                    car.ammo += content.amount;
                    text = `+${content.amount} MUNI`;
                    break;
                case 'money':
                    car.money += content.amount;
                    text = `+${content.amount} 🔩`;
                    audio.play('buy');
                    break;
            }
        } else if (content.kind === 'repair') {
            car.hp = content.hp;
        }
        if (car === this.myCar) {
            audio.play('pickup');
            comic.pop(text, { at, camera: this.camera, style: content.kind === 'money' ? 'money' : 'good', size: 0.9, life: 1000 });
        }
    }

    slotBack(slot) {
        const crate = this.crates[slot];
        if (!crate) return;
        crate.available = true;
        crate.mesh.visible = true;
        crate.mesh.scale.setScalar(0.1);
    }

    lapped(seat, lap, lapMs) {
        const car = this.cars[seat];
        if (!car) return;
        car.lapsDone = Math.max(car.lapsDone, lap);
        if (car !== this.myCar) return;
        if (!this.bestLap || lapMs < this.bestLap) this.bestLap = lapMs;
        if (lap === this.start.laps - 1) {
            comic.shout('LETZTE RUNDE!', { style: 'hit', life: 1400 });
            audio.play('final-lap');
        } else if (lap < this.start.laps) {
            comic.caption(`Runde ${lap + 1} von ${this.start.laps} · Rundenzeit ${(lapMs / 1000).toFixed(2)} s`);
            audio.play('lap');
        }
    }

    carFinished(seat, place, timeMs) {
        const car = this.cars[seat];
        if (!car) return;
        car.finished = true;
        car.place = place;
        if (car === this.myCar) {
            this.finished = true;
            comic.shout('ZIEL!', { style: place === 1 ? 'good' : 'boom', life: 2400, sub: `Platz ${place} · ${(timeMs / 1000).toFixed(2)} s` });
            audio.play(place === 1 ? 'win' : 'finish');
            // the car drives on by itself
            car.bot = new BotDriver({ skill: 3, seed: 99 });
        }
    }

    // ---------------------------------------------------------------- reporting (to the server or the local game)

    reportHit(attacker, target, kind, amount, point) {
        this.send('Hit', attacker, target, kind, amount);
        if (kind !== 'MachineGun') return;
        const a = this.cars[attacker];
        if (a === this.myCar && Math.random() < 0.05) comic.pop(word('gun'), { at: new THREE.Vector3(point.x, point.y + 2.5, point.z), camera: this.camera, style: 'hit', size: 0.6, life: 500 });
    }

    blast(kind, p) {
        audio.play(kind === 'Shock' ? 'shock' : 'explosion', { x: p.x, z: p.z, volume: 0.8 });
        if (kind === 'Shock') return;
        comic.pop(word('explosion'), { at: new THREE.Vector3(p.x, p.y + 2, p.z), camera: this.camera, style: 'boom', size: 0.9 });
        const focus = this.focusCar()?.vehicle.state;
        if (focus && Math.hypot(focus.x - p.x, focus.z - p.z) < 25) this.shake = Math.min(1, this.shake + 0.4);
    }

    oiled(seat) {
        const car = this.cars[seat];
        if (!car?.body) return;
        car.body.spin = 1.4;
        car.body.yawRate += (Math.random() < 0.5 ? -1 : 1) * 3;
        if (car === this.myCar) {
            comic.pop(word('oil'), { at: new THREE.Vector3(car.body.x, car.body.y + 3, car.body.z), camera: this.camera, style: 'plain' });
            audio.play('oil');
        }
    }

    // ---------------------------------------------------------------- the frame

    frame(dt, t) {
        if (this.disposed) return;
        this.time += dt;
        const controls = input.read();
        if (controls.pause) this.onPause();
        if (controls.camera) this.cameraMode = (this.cameraMode + 1) % 3;

        // ---- countdown
        if (this.raceTime < 0) {
            this.countdown -= dt;
            const n = Math.ceil(this.countdown);
            if (n !== this.lastCount && n <= 3 && n >= 1) {
                this.lastCount = n;
                comic.shout(String(n), { style: 'hit', life: 800 });
                audio.play('countdown');
                this.setLights(4 - n);
            }
            if (this.countdown <= 0) {
                this.raceTime = 0;
                comic.shout('LOS!', { style: 'good', life: 900 });
                audio.play('go');
                this.setLights(4);
                for (const c of this.cars) if (c.body) c.body.frozen = false;
            }
        } else {
            this.raceTime += dt;
        }

        // ---- local cars: controls → physics
        const targets = this.targets();
        for (const car of this.cars) {
            if (!car.body) continue;
            let c;
            if (car.bot) {
                c = car.bot.drive(car.body, {
                    others: targets.filter(o => o.seat !== car.seat).map(o => ({ ...o, alive: o.alive && !this.cars[o.seat].finished })),
                    hazards: this.weapons.hazards(),
                    crates: this.crates.filter(x => x.available),
                    special: car.special, hp: car.hp, maxHp: car.maxHp, ammo: car.ammo,
                }, dt);
            } else {
                c = controls;
            }
            if (car.wrecked) c = { throttle: 0, steer: 0, handbrake: false, boost: false, fire: false, special: false };
            if (c.reset && !car.wrecked && this.raceTime > 0) this.resetCar(car);
            const events = car.body.update(dt, c);
            for (const e of events) this.carEvent(car, e);
            // spray in the water
            if (car.body.surface === 'water' && car.body.speed > 6 && Math.random() < dt * 24) {
                const b = car.body;
                this.effects.smoke(b.x - Math.sin(b.yaw) * 2, b.y + 0.4, b.z - Math.cos(b.yaw) * 2, { color: 'water', size: 1.6, vy: 4, life: 0.5, alpha: 0.8 });
            }
            car.controls = c;
            this.useWeapons(car, c, dt);
        }

        // ---- collisions between cars (each browser moves only its own)
        this.collide();

        // ---- crates, boost arrows, laps, send states
        this.sendTimer -= dt;
        const send = this.sendTimer <= 0;
        if (send) this.sendTimer = SEND_INTERVAL;
        for (const car of this.cars) {
            if (!car.body) continue;
            const b = car.body;
            if (!car.wrecked) {
                for (const crate of this.crates) {
                    if (crate.available && !car.pending.has(crate.slot) && Math.hypot(crate.x - b.x, crate.z - b.z) < 3.2 && Math.abs(crate.y - b.y) < 4) {
                        car.pending.add(crate.slot);
                        this.send('Pickup', car.seat, crate.slot);
                        setTimeout(() => car.pending.delete(crate.slot), 1500);
                    }
                }
                for (const boost of this.track.boosts) {
                    if (Math.hypot(boost.x - b.x, boost.z - b.z) < 4.5 && b.padBoost <= 0) {
                        b.padBoost = 1.1;
                        b.turbo = Math.min(b.spec.turboSeconds, b.turbo + 0.6);
                        if (car === this.myCar) {
                            comic.pop(word('turbo'), { at: new THREE.Vector3(b.x, b.y + 3, b.z), camera: this.camera, style: 'turbo', size: 0.8, life: 700 });
                            audio.play('turbo');
                        }
                    }
                }
            }
            const laps = Math.floor(b.distance / this.track.count);
            if (this.raceTime > 0 && laps > car.lapsDone && laps <= this.start.laps && !car.finished && car.reportedLap !== laps) {
                car.reportedLap = laps;
                this.send('Lap', car.seat, laps);
            }
            car.flags = this.flagsOf(car);
            const state = car.vehicle.fromBody(b, car.flags);
            if (send) this.send('State', car.seat, b.pack(car.flags));
            car.progress = state.progress;
        }

        // ---- remote cars
        const now = performance.now();
        for (const car of this.cars) {
            if (car.body) continue;
            const s = car.vehicle.interpolate(now);
            car.progress = s.progress;
            if ((s.flags & FLAG.gun) && !car.wrecked) {
                car.remoteGun -= dt;
                if (car.remoteGun <= 0) {
                    car.remoteGun = (this.gunRule?.cooldownMs ?? 90) / 1000;
                    const g = car.vehicle.gunPoint();
                    this.weapons.gun(car.seat, g.x, g.y, g.z, s.yaw, false, 0);
                    audio.play('mg', { x: g.x, z: g.z, volume: 0.5 });
                }
            }
        }

        // ---- world, weapons, effects, cars
        this.weapons.update(dt, this.targets(), t);
        for (const car of this.cars) car.vehicle.update(dt, t);
        this.effects.update(dt, innerHeight);
        for (const crate of this.crates) {
            if (!crate.available) continue;
            crate.mesh.rotation.y += dt * 1.6;
            crate.mesh.position.y = crate.y + 1.6 + Math.sin(t * 3 + crate.slot) * 0.35;
            const s = crate.mesh.scale.x;
            if (s < 1) crate.mesh.scale.setScalar(Math.min(1, s + dt * 3));
        }
        this.updateCamera(dt, controls);
        this.world.update(dt, t, this.cameraLook);
        this.updateSound();
        this.updateHud();
    }

    flagsOf(car) {
        const b = car.body;
        let f = 0;
        const c = car.controls ?? {};
        if (c.throttle < 0 && b.forwardSpeed > 1) f |= FLAG.brake;
        if (b.boosting) f |= FLAG.boost;
        if (car.firing) f |= FLAG.gun;
        if (b.drifting > 0.45 && b.onGround) f |= FLAG.drift;
        if (!b.onGround) f |= FLAG.air;
        if (car.wrecked) f |= FLAG.wrecked;
        if (this.world.night) f |= FLAG.lights;
        if (car.shieldUntil > this.time) f |= FLAG.shield;
        return f;
    }

    carEvent(car, e) {
        const b = car.body;
        if (e.type === 'wall') {
            this.effects.sparks(b.x, b.y + 0.6, b.z, Math.min(12, Math.round(e.strength / 2)), { speed: 9 });
            if (car === this.myCar) {
                audio.play(e.strength > 18 ? 'crash' : 'scrape', { volume: Math.min(1, e.strength / 30) });
                if (e.strength > 22) comic.pop(word('crash'), { at: new THREE.Vector3(b.x, b.y + 2.5, b.z), camera: this.camera, style: 'hit', size: 0.7, life: 700 });
            }
            if (e.strength > 20 && this.raceTime > 0) this.send('Hit', car.seat, car.seat, 'Crash', Math.min(15, (e.strength - 20) * 0.6));
            car.vehicle.bump(e.strength * 0.3);
        } else if (e.type === 'loop') {
            if (car === this.myCar) {
                audio.play('whoosh', { volume: 0.9 });
                comic.pop(word('loop'), { at: new THREE.Vector3(b.x, b.y + 3, b.z), camera: this.camera, style: 'turbo', size: 0.9, life: 900 });
            } else {
                audio.play('whoosh', { x: b.x, z: b.z, volume: 0.5 });
            }
        } else if (e.type === 'fall') {
            if (car === this.myCar) comic.pop(word('fall'), { at: new THREE.Vector3(b.x, b.y + 2, b.z), camera: this.camera, style: 'hit', size: 0.8, life: 900 });
        } else if (e.type === 'surface') {
            if (e.surface === 'water') {
                this.effects.ring(b.x, b.y + 0.2, b.z, 5, 0x9fdcff, 0.5);
                if (car === this.myCar) {
                    audio.play('splash', { volume: 0.9 });
                    comic.pop(word('splash'), { at: new THREE.Vector3(b.x, b.y + 2.5, b.z), camera: this.camera, style: 'turbo', size: 0.8, life: 800 });
                } else {
                    audio.play('splash', { x: b.x, z: b.z, volume: 0.5 });
                }
            }
        } else if (e.type === 'land') {
            car.vehicle.bump(e.strength);
            this.effects.smoke(b.x, b.y + 0.3, b.z, { color: 'dust', size: 3, vy: 2, life: 0.8 });
            if (car === this.myCar) {
                audio.play(e.air > 0.8 || e.strength > 25 ? 'thud' : 'land', { volume: Math.min(1, e.strength / 25) });
                if (e.air > 0.55) comic.pop(word('land'), { at: new THREE.Vector3(b.x, b.y + 2, b.z), camera: this.camera, style: 'plain', size: 0.8, life: 700 });
                this.shake = Math.min(1, this.shake + e.strength / 60);
            }
        }
    }

    useWeapons(car, c, dt) {
        car.gunCooldown -= dt;
        car.firing = false;
        if (car.wrecked || this.raceTime <= 0 || !this.start.weapons) return;
        if (c.fire && car.ammo > 0 && car.gunCooldown <= 0) {
            car.gunCooldown = (this.gunRule?.cooldownMs ?? 90) / 1000;
            car.ammo--;
            car.firing = true;
            const g = car.vehicle.gunPoint();
            this.weapons.gun(car.seat, g.x, g.y, g.z, car.body.yaw, true, car.info.car.spec.gunDamage);
            audio.play('mg', { x: g.x, z: g.z, volume: car === this.myCar ? 0.7 : 0.4 });
        } else if (c.fire) {
            car.firing = car.gunCooldown > 0 && car.ammo > 0;
        }
        if (c.special && car.special && car.specialCount > 0) {
            const b = car.body;
            const back = 3.4;
            let data;
            switch (car.special) {
                case 'Rocket': {
                    const target = this.targetAhead(car);
                    data = [b.x + Math.sin(b.yaw) * 2.5, b.y + 1.2, b.z + Math.cos(b.yaw) * 2.5, b.yaw, target?.seat ?? -1];
                    break;
                }
                case 'Mine':
                case 'Oil':
                    data = [b.x - Math.sin(b.yaw) * back, b.y, b.z - Math.cos(b.yaw) * back];
                    break;
                default:
                    data = [b.x, b.y, b.z];
            }
            const kind = car.special;
            car.specialCount--;
            if (car.specialCount <= 0) car.special = null;
            this.send('Fire', car.seat, kind, data);
            this.fired(car.seat, kind, data, true);
        }
    }

    targetAhead(car) {
        const b = car.body;
        let best = null;
        let bestD = 120;
        for (const o of this.cars) {
            if (o === car || o.wrecked) continue;
            const s = o.vehicle.state;
            const dx = s.x - b.x;
            const dz = s.z - b.z;
            const forward = dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw);
            const d = Math.hypot(dx, dz);
            if (forward > 0 && d < bestD && Math.abs(Math.atan2(dx * Math.cos(b.yaw) - dz * Math.sin(b.yaw), forward)) < 0.9) {
                bestD = d;
                best = o;
            }
        }
        return best;
    }

    targets() {
        return this.cars.map(c => ({
            seat: c.seat, x: c.vehicle.state.x, y: c.vehicle.state.y, z: c.vehicle.state.z, alive: !c.wrecked, local: c.local, shield: c.shieldUntil > this.time,
            progress: c.progress,
        }));
    }

    collide() {
        const cars = this.cars;
        for (let i = 0; i < cars.length; i++) {
            for (let j = i + 1; j < cars.length; j++) {
                const a = cars[i];
                const b = cars[j];
                if ((!a.body && !b.body) || a.wrecked || b.wrecked) continue;
                const sa = a.body ?? a.vehicle.state;
                const sb = b.body ?? b.vehicle.state;
                const dx = sb.x - sa.x;
                const dz = sb.z - sa.z;
                const d = Math.hypot(dx, dz);
                if (d >= CAR_RADIUS * 2 || d < 1e-4 || Math.abs(sa.y - sb.y) > 2.5) continue;
                const nx = dx / d;
                const nz = dz / d;
                const overlap = CAR_RADIUS * 2 - d;
                const wa = a.info.car.spec.weight;
                const wb = b.info.car.spec.weight;
                const shareA = wb / (wa + wb);
                const shareB = wa / (wa + wb);
                const rel = (sa.vx - sb.vx) * nx + (sa.vz - sb.vz) * nz;
                if (a.body) {
                    a.body.x -= nx * overlap * (b.body ? shareA : 1);
                    a.body.z -= nz * overlap * (b.body ? shareA : 1);
                    if (rel > 0) a.body.push(-nx * rel * shareA * 1.3, -nz * rel * shareA * 1.3);
                }
                if (b.body) {
                    b.body.x += nx * overlap * (a.body ? shareB : 1);
                    b.body.z += nz * overlap * (a.body ? shareB : 1);
                    if (rel > 0) b.body.push(nx * rel * shareB * 1.3, nz * rel * shareB * 1.3);
                }
                if (rel > 8) {
                    const mx = (sa.x + sb.x) / 2;
                    const mz = (sa.z + sb.z) / 2;
                    this.effects.sparks(mx, Math.max(sa.y, sb.y) + 0.8, mz, 8, { speed: 10 });
                    if (a === this.myCar || b === this.myCar) {
                        audio.play('crash', { volume: Math.min(1, rel / 25) });
                        if (rel > 18) comic.pop(word('crash'), { at: new THREE.Vector3(mx, sa.y + 3, mz), camera: this.camera, style: 'hit', size: 0.8, life: 700 });
                        this.shake = Math.min(1, this.shake + rel / 50);
                    }
                    if (rel > 22 && this.raceTime > 0) {
                        if (a.body) this.send('Hit', a.seat, a.seat, 'Crash', Math.min(15, (rel - 22) * 0.5 * shareA * 2));
                        if (b.body) this.send('Hit', b.seat, b.seat, 'Crash', Math.min(15, (rel - 22) * 0.5 * shareB * 2));
                    }
                }
            }
        }
    }

    /** A place on the road a few samples behind the car (on its own path; never in a looping). */
    backOnRoad(b, back) {
        let path = b.path ?? this.track;
        let i = (b.pathIndex >= 0 ? b.pathIndex : b.index) - back;
        if (path === this.track) {
            const loop = this.track.loopAt(path.wrap(i)) ?? (b.rail ? b.rail.loop : null);
            if (loop) i = loop.entry - back;
        }
        return path.pointAt(path.wrap(i));
    }

    resetCar(car) {
        const b = car.body;
        if (b.rail) return;
        const p = this.backOnRoad(b, 0);
        const keep = b.distance;
        b.place(p.x, p.y + 0.5, p.z, p.yaw);
        b.distance = keep;
        car.shieldUntil = this.time + 1;
        if (car === this.myCar) this.hud.hint('Zurück auf die Strecke!', 1200);
    }

    focusCar() {
        if (this.myCar) return this.myCar;
        return [...this.cars].sort((a, b) => b.progress - a.progress)[0];
    }

    updateCamera(dt, controls) {
        const car = this.focusCar();
        if (!car) return;
        const s = car.vehicle.state;
        const speed = Math.hypot(s.vx, s.vz);
        const boosting = (car.flags ?? s.flags) & FLAG.boost;
        const back = controls.lookBack ? -1 : 1;
        const fx = Math.sin(s.yaw) * back;
        const fz = Math.cos(s.yaw) * back;
        let dist;
        let height;
        let ahead;
        if (this.cameraMode === 1) {
            dist = 17 + speed * 0.06;
            height = 8;
            ahead = 8;
        } else if (this.cameraMode === 2) {
            dist = -0.6;
            height = 1.5;
            ahead = 20;
        } else {
            dist = 8.6 + speed * 0.045;
            height = 3.3 + speed * 0.012;
            ahead = 7;
        }
        // the car's frame: in a looping forward and up turn with the pitch
        const pitch = s.pitch ?? 0;
        const looping = Math.abs(pitch) > 0.35 || !!car.body?.rail;
        const cp = looping ? Math.cos(pitch) : 1;
        const sp = looping ? -Math.sin(pitch) : 0;
        const f3 = new THREE.Vector3(fx * cp, sp * back, fz * cp);
        const u3 = new THREE.Vector3(-Math.sin(s.yaw) * sp * back, cp, -Math.cos(s.yaw) * sp * back);
        const target = new THREE.Vector3(s.x, s.y, s.z).addScaledVector(f3, -dist).addScaledVector(u3, height);
        const rail = car.body?.rail;
        if (rail && back > 0) {
            // in a looping the camera rides on the circle behind the car (a straight line behind it would leave the band)
            const q = loopPoint(rail.loop, Math.max(0, rail.theta - dist / rail.loop.radius), rail.lateral);
            target.set(q.x + q.ux * height, q.y + q.uy * height, q.z + q.uz * height);
        }
        const tunnel = car.body ? this.track.tunnelAt(car.body.path, car.body.pathIndex) : null;
        if (!looping) {
            // keep the camera above the road at its own place (and below the roof in a tunnel)
            const p = car.body
                ? this.track.locateCar(target.x, target.z, s.y, false, car.body.path, car.body.pathIndex, this.cameraLocation ??= {})
                : this.track.locateAny(target.x, target.z, s.y, this.cameraLocation ??= {});
            const limit = p.half + 1.4;
            if (Math.abs(p.lateral) > limit) {
                const n = p.path.normalAt(p.index);
                const over = Math.abs(p.lateral) - limit;
                target.x -= n.nx * Math.sign(p.lateral) * over;
                target.z -= n.nz * Math.sign(p.lateral) * over;
            }
            target.y = Math.max(target.y, p.height + 1.4);
            if (tunnel) target.y = Math.min(target.y, p.height + 7.5);
        }
        const k = this.cameraMode === 2 ? 1 : 1 - Math.exp(-dt * (looping ? 16 : 7));
        this.camera.position.lerp(target, k);
        const look = new THREE.Vector3(s.x, s.y, s.z).addScaledVector(f3, ahead).addScaledVector(u3, 1.1);
        this.cameraLook.lerp(look, 1 - Math.exp(-dt * (looping ? 20 : 10)));
        this.camera.up.lerp(looping ? u3 : new THREE.Vector3(0, 1, 0), 1 - Math.exp(-dt * (looping ? 14 : 5))).normalize();
        if (this.myCar === car) {
            const space = tunnel ? 'tunnel' : this.world.theme?.key ?? 'room';
            if (space !== this.space) {
                this.space = space;
                audio.setSpace?.(space);
            }
        }
        if (this.shake > 0) {
            this.shake = Math.max(0, this.shake - dt * 2.2);
            const a = this.shake * 0.5;
            this.camera.position.x += (Math.random() - 0.5) * a;
            this.camera.position.y += (Math.random() - 0.5) * a;
        }
        this.camera.lookAt(this.cameraLook);
        const fov = 64 + Math.min(14, speed * 0.1) + (boosting ? 8 : 0);
        this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
        this.camera.updateProjectionMatrix();
        audio.setListener(this.camera.position.x, this.camera.position.z, s.yaw + Math.PI);
    }

    updateSound() {
        const car = this.myCar;
        if (car && this.engine) {
            const b = car.body;
            this.engine.update({
                rpm: Math.min(1, b.rpm), throttle: Math.max(0, car.controls?.throttle ?? 0), speed: Math.min(1, b.speed / b.spec.topSpeed), turbo: b.boosting, boostSpool: b.spool,
                skid: b.onGround ? b.drifting : 0, airborne: !b.onGround, distance: 0,
            });
            if (b.boosting && !this.wasBoosting) {
                audio.play('turbo');
                comic.pop(word('turbo'), { at: new THREE.Vector3(b.x, b.y + 2.5, b.z), camera: this.camera, style: 'turbo', size: 0.8, life: 650 });
            }
            this.wasBoosting = b.boosting;
        }
        // the three nearest other cars get an engine voice
        const cam = this.camera.position;
        const others = this.cars.filter(c => c !== this.myCar && !c.wrecked)
            .map(c => ({ c, d: Math.hypot(c.vehicle.state.x - cam.x, c.vehicle.state.z - cam.z) }))
            .sort((a, b) => a.d - b.d).slice(0, 3);
        const keep = new Set(others.map(o => o.c.seat));
        for (const [seat, voice] of this.remoteEngines) {
            if (!keep.has(seat)) {
                voice.stop();
                this.remoteEngines.delete(seat);
            }
        }
        for (const { c, d } of others) {
            let voice = this.remoteEngines.get(c.seat);
            if (!voice) {
                voice = audio.engine(c.info.car.drive);
                this.remoteEngines.set(c.seat, voice);
            }
            const s = c.vehicle.state;
            const top = c.info.car.spec.topSpeed;
            const local = c.body;
            voice.update({ rpm: Math.min(1.2, Math.abs(s.speed) / top), throttle: local ? Math.max(0, c.controls?.throttle ?? 0) : 0.7, speed: Math.min(1, Math.abs(s.speed) / top),
                turbo: !!(s.flags & FLAG.boost), boostSpool: local ? local.spool : 0.5, skid: s.flags & FLAG.drift ? 0.6 : 0, airborne: !!(s.flags & FLAG.air), distance: d,
                x: s.x, z: s.z, vx: s.vx, vz: s.vz });
        }
    }

    standings() {
        return [...this.cars].sort((a, b) => {
            if (a.finished && b.finished) return a.place - b.place;
            if (a.finished) return -1;
            if (b.finished) return 1;
            return b.progress - a.progress;
        });
    }

    updateHud() {
        const order = this.standings();
        const me = this.myCar ?? order[0];
        const place = order.indexOf(me) + 1;
        const b = me.body;
        this.hud.update({
            place, cars: this.cars.length, lap: me.lapsDone, laps: this.start.laps, time: Math.max(0, this.raceTime * 1000), best: this.bestLap,
            hp: me.hp, maxHp: me.maxHp, speed: b ? b.forwardSpeed : me.vehicle.state.speed, turbo: b ? b.turbo / b.spec.turboSeconds : 0, boosting: b?.boosting ?? false,
            special: me.special, specialCount: me.specialCount, ammo: me.ammo,
            field: order.map((c, i) => ({ name: c.info.name, place: i + 1, me: c === this.myCar, finished: c.finished, wrecked: c.wrecked, color: c.color })),
            dots: this.cars.map(c => ({ x: c.vehicle.state.x, z: c.vehicle.state.z, color: c.color, me: c === this.myCar })),
        });
    }

    setLights(step) {
        const lights = this.world.startLights;
        lights.forEach((bulb, k) => bulb.material.color.setHex(step >= 4 ? 0x5dff6a : k < step ? 0xff2a1a : 0x3a0a08));
    }

    // ---------------------------------------------------------------- XIII insets

    inset(car, title) {
        if (this.insets.length >= 2) return;
        const frame = comic.insetFrame(title, { life: 2300 });
        const s = car.vehicle.state;
        const entry = { frame, x: s.x, y: s.y, z: s.z, angle: Math.random() * Math.PI * 2, until: this.time + 2.3 };
        this.insets.push(entry);
    }

    drawInsets(renderer, pipeline) {
        if (!this.insets.length) return;
        this.insets = this.insets.filter(i => i.until > this.time);
        for (const inset of this.insets) {
            const r = inset.frame.rect();
            if (r.w < 10) continue;
            inset.angle += 0.012;
            const cam = this.insetCamera;
            cam.aspect = r.w / r.h;
            cam.position.set(inset.x + Math.cos(inset.angle) * 11, inset.y + 4.5, inset.z + Math.sin(inset.angle) * 11);
            cam.lookAt(inset.x, inset.y + 1, inset.z);
            cam.updateProjectionMatrix();
            const pad = 6;
            pipeline.render(this.scene, cam, { time: this.time, viewport: { x: r.x + pad, y: innerHeight - (r.y + r.h) + pad, w: r.w - pad * 2, h: r.h - pad * 2 } });
        }
        renderer.setViewport(0, 0, innerWidth, innerHeight);
    }

    // ---------------------------------------------------------------- the end

    async leave() {
        await api.invoke('LeaveRoom').catch(() => {});
        this.dispose();
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        input.active = false;
        for (const off of this.unsubscribe) off();
        this.engine?.stop();
        for (const voice of this.remoteEngines?.values() ?? []) voice.stop();
        this.hud?.hide();
        comic.clear();
        this.weapons?.dispose();
        this.effects?.dispose();
        this.world?.dispose?.();
        stage.overlays = [];
    }
}
