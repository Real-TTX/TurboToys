// TurboToys · tracks/track.js – a layout of data/layouts.json as a drivable track. Pure maths, no three.js meshes (those are builder.js).
//
// A track is made of paths, every path a centre line sampled every unit (x, y, z, tangent, width, kicker lift):
//   - the main path (the Track itself, closed): the lap; its samples carry the progress of the race;
//   - branches (open paths): shortcuts and alternative routes that leave the main path at `from` and join it again at `to` (fractions of the lap);
//     they run along the main road for a few units at both ends (the fork), so cars change paths simply by steering from one road onto the other.
//   - loopings: spliced into the main path as "rail" samples (a vertical circle with a lane change so the exit passes beside the entry);
//     the physics carries a car through them (race/physics.js), the locator skips them.
// Queries of the physics, the race and the themes: locate (where am I on a path), locateCar (on which path am I: forks, bridges, crossings),
// advance (the path ahead with the bots' branch choices), the start grid, the places of pickups, boost arrows and tunnels.

import * as THREE from 'three';

const STEP = 1; // one sample per unit (10 cm)
export const CHECKPOINTS = 12;
const LOOP_SHIFT = 34; // samples over which the lane moves sideways before and after a looping
const FORK = 12; // units a branch runs along the main road before it turns away (and before it joins again)
const LOOP_GAP = 1.15; // the lane change of a looping in road widths (the exit passes beside the entry)

let layoutsPromise = null;

/** All layouts (cached): [{ key, name, theme, width, points, jumps, boosts, pickups, loops, tunnels, branches }]. */
export function loadLayouts() {
    if (!layoutsPromise) {
        layoutsPromise = fetch(new URL('data/layouts.json', document.baseURI), { cache: 'no-cache' })
            .then(r => r.json())
            .then(doc => doc.layouts);
    }
    return layoutsPromise;
}

export async function layoutOf(key) {
    const all = await loadLayouts();
    return all.find(l => l.key === key) ?? all[0];
}

const smoothstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Samples a Catmull-Rom curve through control points every unit: plain arrays { x, y, z, w } (width smoothed between the control points). */
function sampleCurve(points, widths, closed) {
    const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal', 0.5);
    const count = Math.max(closed ? 64 : 8, Math.round(curve.getLength() / STEP));
    const spaced = curve.getSpacedPoints(count);
    if (closed) spaced.pop();
    const n = spaced.length;
    const x = [], y = [], z = [], w = [];
    const controls = points.length;
    for (let i = 0; i < n; i++) {
        x.push(spaced[i].x);
        y.push(spaced[i].y);
        z.push(spaced[i].z);
        // width: smooth between the control points (cosine), by the parameter of the control points
        const u = closed ? (i / n) * controls : (i / (n - 1)) * (controls - 1);
        const k = Math.min(controls - 1, Math.floor(u));
        const t = u - k;
        const w0 = widths[k];
        const w1 = widths[closed ? (k + 1) % controls : Math.min(controls - 1, k + 1)];
        w.push(w0 + (w1 - w0) * (0.5 - 0.5 * Math.cos(Math.PI * t)));
    }
    // smooth the heights a little (no steps from the spline)
    const at = i => (closed ? y[((i % n) + n) % n] : y[Math.max(0, Math.min(n - 1, i))]);
    for (let pass = 0; pass < 3; pass++) {
        const smooth = y.map((_, i) => (at(i - 2) + at(i - 1) + at(i) * 2 + at(i + 1) + at(i + 2)) / 6);
        for (let i = 0; i < n; i++) y[i] = smooth[i];
    }
    // the spline must not dip below the floor next to ramps (the layouts never go below 0)
    for (let i = 0; i < n; i++) if (y[i] < 0.02) y[i] = 0;
    return { x, y, z, w };
}

/** Kicker ramps on a path: a wedge that rises over its length and ends in a drop (the car flies). Returns the jumps with sample indices. */
function addJumps(lift, jumps, n, closed) {
    return (jumps ?? []).map(j => {
        const start = Math.round(j.at * (closed ? n : n - 1));
        const len = Math.max(3, Math.round(j.length / STEP));
        for (let k = 0; k < len; k++) {
            const i = closed ? (start + k) % n : Math.min(n - 1, start + k);
            lift[i] = Math.max(lift[i], j.height * Math.pow((k + 1) / len, 1.15));
        }
        return { start, end: closed ? (start + len) % n : Math.min(n - 1, start + len), length: len, height: j.height };
    });
}

/**
 * One drivable centre line (the main path or a branch). Index i is a sample; a closed path wraps around, an open one is clamped.
 */
export class Path {
    /** @param {{ x:number[], y:number[], z:number[], w:number[], lift?:number[], rail?:number[], ux?:number[], uy?:number[], uz?:number[], tx?:number[], tz?:number[] }} a */
    setSamples(a, closed) {
        const n = a.x.length;
        this.closed = closed;
        this.count = n;
        this.x = Float32Array.from(a.x);
        this.y = Float32Array.from(a.y);
        this.z = Float32Array.from(a.z);
        this.w = Float32Array.from(a.w);
        this.jumpLift = a.lift ? Float32Array.from(a.lift) : new Float32Array(n);
        this.rail = a.rail ? Uint8Array.from(a.rail) : new Uint8Array(n);
        this.ux = a.ux ? Float32Array.from(a.ux) : new Float32Array(n);
        this.uy = a.uy ? Float32Array.from(a.uy) : new Float32Array(n).fill(1);
        this.uz = a.uz ? Float32Array.from(a.uz) : new Float32Array(n);
        this.tx = new Float32Array(n);
        this.tz = new Float32Array(n);
        this.s = new Float32Array(n);
        this.hasRail = this.rail.some(r => r);
        let length = 0;
        for (let i = 0; i < n; i++) {
            if (i > 0) length += Math.hypot(this.x[i] - this.x[i - 1], this.y[i] - this.y[i - 1], this.z[i] - this.z[i - 1]);
            this.s[i] = length;
        }
        if (closed) length += Math.hypot(this.x[0] - this.x[n - 1], this.y[0] - this.y[n - 1], this.z[0] - this.z[n - 1]);
        this.length = length;
        for (let i = 0; i < n; i++) {
            if (this.rail[i]) {
                // a looping keeps the heading of its plane (the side normal must not flip upside down)
                this.tx[i] = a.tx[i];
                this.tz[i] = a.tz[i];
                continue;
            }
            let p = this.wrap(i - 1);
            let q = this.wrap(i + 1);
            if (this.rail[p] || (!closed && i === 0)) p = i;
            if (this.rail[q] || (!closed && i === n - 1)) q = i;
            const dx = this.x[q] - this.x[p];
            const dz = this.z[q] - this.z[p];
            const l = Math.hypot(dx, dz) || 1;
            this.tx[i] = dx / l;
            this.tz[i] = dz / l;
        }
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < n; i++) {
            minX = Math.min(minX, this.x[i]);
            maxX = Math.max(maxX, this.x[i]);
            minZ = Math.min(minZ, this.z[i]);
            maxZ = Math.max(maxZ, this.z[i]);
        }
        this.box = { minX, maxX, minZ, maxZ };
    }

    /** A sample index on this path (closed: wrapped, open: clamped). */
    wrap(i) {
        const n = this.count;
        return this.closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
    }

    /** The road height at sample i (base + kicker ramp). */
    heightAt(i) {
        return this.y[i] + this.jumpLift[i];
    }

    /** Left normal of the road at sample i: (nx, nz). */
    normalAt(i) {
        return { nx: -this.tz[i], nz: this.tx[i] };
    }

    /** The road's up direction at sample i ((0, 1, 0) except in a looping). */
    upAt(i) {
        return { ux: this.ux[i], uy: this.uy[i], uz: this.uz[i] };
    }

    /** A point on the road at sample i, lateral offset (positive = left): { x, y, z, yaw } (yaw: heading of the road). */
    pointAt(i, lateral = 0) {
        i = this.wrap(Math.round(i));
        const { nx, nz } = this.normalAt(i);
        return {
            x: this.x[i] + nx * lateral,
            y: this.heightAt(i),
            z: this.z[i] + nz * lateral,
            yaw: Math.atan2(this.tx[i], this.tz[i]),
        };
    }

    /** The slope of the road along its direction at sample i (dy per unit). */
    slopeAt(i) {
        const a = this.wrap(i - 1);
        const b = this.wrap(i + 1);
        if (this.rail[a] || this.rail[b]) return 0;
        return (this.heightAt(b) - this.heightAt(a)) / Math.max(1, b - a);
    }

    /** True when (x, z) lies within this path's box (+ margin): a cheap test before locate. */
    near(x, z, margin = 30) {
        const b = this.box;
        return x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin;
    }

    /**
     * Where is (x, z) on this path: the nearest sample (searched around hint when given: the track may come close to itself; without a hint
     * the whole path, preferring samples near height y when y is given), the lateral offset (positive = left of the centre line), the road
     * height under the point, the half width, how far beyond the ends of an open path (over). Looping samples are never found.
     * @returns {{ index: number, lateral: number, height: number, half: number, along: number, t: number, over: number, path: Path }}
     */
    locate(x, z, hint = -1, out = {}, y = NaN) {
        const n = this.count;
        const rail = this.hasRail ? this.rail : null;
        let best = -1;
        let bestD = Infinity;
        if (hint >= 0) {
            for (let k = -40; k <= 40; k++) {
                const i = this.closed ? (hint + k + n) % n : hint + k;
                if (i < 0 || i >= n || (rail && rail[i])) continue;
                const dx = x - this.x[i];
                const dz = z - this.z[i];
                const d = dx * dx + dz * dz;
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
        }
        if (best < 0 || bestD > 40 * 40) {
            bestD = Infinity;
            const height = Number.isFinite(y);
            for (let i = 0; i < n; i += 2) {
                if (rail && rail[i]) continue;
                const dx = x - this.x[i];
                const dz = z - this.z[i];
                let d = dx * dx + dz * dz;
                if (height && Math.abs(this.heightAt(i) - y) > 4) d += 1e5;
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
            const center = best;
            for (let k = -2; k <= 2; k++) {
                const i = this.wrap(center + k);
                if (rail && rail[i]) continue;
                const dx = x - this.x[i];
                const dz = z - this.z[i];
                let d = dx * dx + dz * dz;
                if (height && Math.abs(this.heightAt(i) - y) > 4) d += 1e5;
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
        }
        const i = best;
        // project on the segment i → i+1 (or i-1 → i) for a smooth height and distance
        const dx = x - this.x[i];
        const dz = z - this.z[i];
        const along = dx * this.tx[i] + dz * this.tz[i];
        let a = i;
        let b = this.wrap(i + 1);
        let t = 0;
        let over = 0;
        if (along >= 0) {
            if (b === i || (rail && rail[b])) over = along;
            else t = Math.min(1, along / (Math.hypot(this.x[b] - this.x[i], this.z[b] - this.z[i]) || 1));
        } else {
            const p = this.wrap(i - 1);
            if (p === i || (rail && rail[p])) {
                over = -along;
            } else {
                a = p;
                b = i;
                t = Math.max(0, 1 + along / (Math.hypot(this.x[i] - this.x[p], this.z[i] - this.z[p]) || 1));
            }
        }
        const { nx, nz } = this.normalAt(i);
        out.index = i;
        out.lateral = dx * nx + dz * nz;
        out.height = this.heightAt(a) + (this.heightAt(b) - this.heightAt(a)) * t;
        out.half = this.w[i] * 0.5;
        out.along = this.s[i] + along;
        out.t = t;
        out.over = this.closed ? 0 : over;
        out.path = this;
        return out;
    }

    /** The curvature ahead on this path alone: the turn angle (radians, signed: positive = left) between sample i and i + distance. */
    turnAhead(i, distance) {
        const j = this.wrap(i + Math.round(distance / STEP));
        return angleBetween(this, i, this, j);
    }
}

function angleBetween(pa, i, pb, j) {
    const a = Math.atan2(pa.tx[i], pa.tz[i]);
    const b = Math.atan2(pb.tx[j], pb.tz[j]);
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}

/** A shortcut or alternative route: an open path from the main path's sample `from` to `to`. */
export class Branch extends Path {
    constructor(track, id, data, from, to, samples) {
        super();
        this.track = track;
        this.id = id;
        this.data = data;
        this.from = from;
        this.to = to;
        this.span = (to - from + track.count) % track.count;
        this.surface = data.surface ?? 'road';
        this.style = data.style ?? null;
        this.setSamples(samples, false);
    }

    /** The main path's (fractional) sample that matches sample i of this branch: the progress of a car on it. */
    mainIndex(i) {
        return (this.from + (i / Math.max(1, this.count - 1)) * this.span) % this.track.count;
    }
}

export class Track extends Path {
    /** @param {{ key: string, width: number, points: number[][], jumps?: any[], boosts?: any[], pickups?: any[], loops?: any[], tunnels?: any[], branches?: any[] }} layout */
    constructor(layout) {
        super();
        this.layout = layout;
        this.key = layout.key;
        this.id = 0;
        this.track = this;
        this.surface = 'road';
        this.baseWidth = layout.width;
        const points = layout.points.map(p => new THREE.Vector3(p[0], p[2] ?? 0, p[1]));
        const widths = layout.points.map(p => p[3] ?? layout.width);
        const base = sampleCurve(points, widths, true);
        const n0 = base.x.length;
        const lift = new Array(n0).fill(0);

        // features of the main path, as sample indices of the plain lap (shifted when loopings are spliced in)
        const jumps = addJumps(lift, layout.jumps, n0, true);
        const at = f => Math.round(f * n0) % n0;
        const boosts = (layout.boosts ?? []).map(b => ({ index: at(b.at), side: b.side ?? 0 }));
        const rows = (layout.pickups ?? []).map(r => ({ index: at(r.at) }));
        const tunnels = (layout.tunnels ?? []).map(t => ({ index: at(t.at), length: Math.round(t.length ?? 40), style: t.style ?? 'box' }));

        // ---- loopings: the lane moves aside before, the circle, the lane moves back after
        const loops = (layout.loops ?? []).map(l => ({ index: Math.max(LOOP_SHIFT + 2, at(l.at)), radius: l.radius ?? 12 })).sort((a, b) => a.index - b.index);
        const a = { x: base.x, y: base.y, z: base.z, w: base.w, lift, rail: new Array(n0).fill(0), ux: new Array(n0).fill(0), uy: new Array(n0).fill(1), uz: new Array(n0).fill(0),
            tx: new Array(n0).fill(0), tz: new Array(n0).fill(0) };
        const tangent = i => {
            const p = (i - 1 + n0) % n0;
            const q = (i + 1) % n0;
            const dx = base.x[q] - base.x[p];
            const dz = base.z[q] - base.z[p];
            const l = Math.hypot(dx, dz) || 1;
            return [dx / l, dz / l];
        };
        // shift the lanes first (on the plain lap), then splice from the back so earlier indices stay valid
        for (const loop of loops) {
            const i0 = loop.index;
            const [tx, tz] = tangent(i0);
            const D = (base.w[i0] ?? layout.width) * LOOP_GAP;
            loop.T = [tx, tz];
            loop.N = [-tz, tx];
            loop.D = D;
            const ip = (i0 - 1 + n0) % n0;
            loop.P = [base.x[ip], base.y[ip], base.z[ip]]; // the centre line where the circle starts (before the lanes move)
            for (let k = 1; k <= LOOP_SHIFT; k++) {
                const before = (i0 - k + n0) % n0;
                const after = (i0 - 1 + k) % n0;
                const off = D / 2 * smoothstep(1 - (k - 1) / LOOP_SHIFT);
                a.x[before] += loop.N[0] * -off;
                a.z[before] += loop.N[1] * -off;
                a.x[after] += loop.N[0] * off;
                a.z[after] += loop.N[1] * off;
            }
        }
        const inserted = [];
        for (const loop of [...loops].reverse()) {
            const i0 = loop.index;
            const R = loop.radius;
            const m = Math.max(24, Math.round((Math.PI * 2 * R) / STEP));
            loop.m = m;
            const add = { x: [], y: [], z: [], w: [], lift: [], rail: [], ux: [], uy: [], uz: [], tx: [], tz: [] };
            for (let j = 1; j < m; j++) {
                const q = loopPoint(loop, (Math.PI * 2 * j) / m, 0);
                add.x.push(q.x);
                add.y.push(q.y);
                add.z.push(q.z);
                add.w.push(base.w[i0]);
                add.lift.push(0);
                add.rail.push(1);
                add.ux.push(q.ux);
                add.uy.push(q.uy);
                add.uz.push(q.uz);
                add.tx.push(loop.T[0]);
                add.tz.push(loop.T[1]);
            }
            for (const key of Object.keys(add)) a[key].splice(i0, 0, ...add[key]);
            inserted.push({ at: i0, count: m - 1 });
        }
        const remap = i => {
            let shift = 0;
            for (const ins of inserted) if (i >= ins.at) shift += ins.count;
            return i + shift;
        };
        this.setSamples(a, true);
        const n = this.count;
        this.loops = loops.map(l => {
            const start = remap(l.index - 1) + 1;
            return { start, end: start + l.m - 2, entry: start - 1, exit: start + l.m - 1, radius: l.radius, m: l.m, P: l.P, T: l.T, N: l.N, D: l.D };
        });

        this.jumps = jumps.map(j => ({ ...j, start: remap(j.start), end: remap(j.end), path: this }));
        this.boosts = boosts.map(b => {
            const i = remap(b.index);
            return { index: i, side: b.side, path: this, ...this.pointAt(i, b.side * this.w[i] * 0.3) };
        });
        this.pickups = [];
        for (const row of rows) this.addPickupRow(this, remap(row.index));
        this.tunnels = tunnels.map(t => ({ path: this, start: remap(t.index), end: remap(t.index) + t.length, style: t.style }));

        // ---- branches: open paths that leave the main path and join it again
        this.branches = (layout.branches ?? []).map((b, k) => {
            const from = remap(at(b.from));
            const to = remap(at(b.to));
            const main = i => {
                i = this.wrap(i);
                return new THREE.Vector3(this.x[i], this.heightAt(i) - this.jumpLift[i], this.z[i]);
            };
            const control = [main(from), main(from + FORK), ...(b.points ?? []).map(p => new THREE.Vector3(p[0], p[2] ?? 0, p[1])), main(to - FORK), main(to)];
            const cw = [this.w[from], this.w[this.wrap(from + FORK)], ...(b.points ?? []).map(p => p[3] ?? b.width ?? layout.width), this.w[this.wrap(to - FORK)], this.w[to]];
            const samples = sampleCurve(control, cw, false);
            samples.lift = new Array(samples.x.length).fill(0);
            const branch = new Branch(this, k + 1, b, from, to, samples);
            branch.jumps = addJumps(branch.jumpLift, b.jumps, branch.count, false).map(j => ({ ...j, path: branch }));
            this.jumps.push(...branch.jumps);
            for (const boost of b.boosts ?? []) {
                const i = Math.round(boost.at * (branch.count - 1));
                this.boosts.push({ index: i, side: boost.side ?? 0, path: branch, ...branch.pointAt(i, (boost.side ?? 0) * branch.w[i] * 0.3) });
            }
            for (const row of b.pickups ?? []) this.addPickupRow(branch, Math.round(row.at * (branch.count - 1)));
            for (const t of b.tunnels ?? []) {
                const start = Math.round(t.at * (branch.count - 1));
                this.tunnels.push({ path: branch, start, end: Math.min(branch.count - 1, start + Math.round(t.length ?? 40)), style: t.style ?? 'box' });
            }
            return branch;
        });
        this.paths = [this, ...this.branches];

        this.checkpoints = Array.from({ length: CHECKPOINTS }, (_, k) => Math.round((k * n) / CHECKPOINTS));
        this.bounds = this.computeBounds();
        this.shortest = this.length - this.branches.reduce((sum, b) => sum + Math.max(0, (this.s[b.to] - this.s[b.from] + this.length) % this.length - b.length), 0);
    }

    addPickupRow(path, i) {
        for (const lane of [-0.45, 0, 0.45]) {
            this.pickups.push({ slot: this.pickups.length, index: i, path, ...path.pointAt(i, lane * path.w[i] * 0.5) });
        }
    }

    /** The main path's sample of sample i on the main path (the progress). */
    mainIndex(i) {
        return i;
    }

    /** The looping whose rail samples contain i (or null). */
    loopAt(i) {
        for (const l of this.loops) if (i >= l.start && i <= l.end) return l;
        return null;
    }

    /**
     * On which path is a car at (x, z) with height y: the path it was on (hint index) unless it left that road and stands on another
     * (a fork, the end of a branch, a crossing at the same height). Roads at another height (bridges) never count.
     * @returns the locate result of the chosen path (out.path)
     */
    locateCar(x, z, y, air, path, index, out = {}) {
        path ??= this;
        const cur = path.locate(x, z, index, out, index < 0 ? y : NaN);
        const fits = p => (air ? p.height <= y + 1.5 && y - p.height < 16 : Math.abs(p.height - y) < 3.4);
        const inside = p => Math.abs(p.lateral) <= p.half + 0.35 && p.over < 1.2;
        if (inside(cur) && fits(cur)) return cur;
        let best = null;
        let bestScore = Infinity;
        const probe = this._probe ??= {};
        for (const other of this.paths) {
            if (other === path || !other.near(x, z)) continue;
            const hint = other === this ? Math.round(path.mainIndex(Math.max(0, index))) : -1;
            const p = other.locate(x, z, hint, probe, y);
            if (!inside(p) || !fits(p)) continue;
            const score = Math.abs(p.lateral) - p.half;
            if (score < bestScore) {
                bestScore = score;
                best = { ...p };
            }
        }
        if (best) return Object.assign(out, best);
        return cur;
    }

    /** Like locateCar without knowing the path: the best road at (x, z) near height y (respawns, bullets, cameras). */
    locateAny(x, z, y, out = {}) {
        let best = null;
        let bestScore = Infinity;
        const probe = this._probeAny ??= {};
        for (const path of this.paths) {
            if (!path.near(x, z)) continue;
            const p = path.locate(x, z, -1, probe, y);
            let score = Math.max(0, Math.abs(p.lateral) - p.half) + p.over;
            if (Number.isFinite(y) && Math.abs(p.height - y) > 4) score += 1000;
            if (score < bestScore) {
                bestScore = score;
                best = { ...p };
            }
        }
        return Object.assign(out, best ?? this.locate(x, z, -1, {}, y));
    }

    /**
     * The point `steps` samples ahead of (path, i), following the branches the chooser takes (take(branch) → boolean; none by default).
     * @returns {{ path: Path, index: number }}
     */
    advance(path, i, steps, take = null) {
        for (let guard = 0; guard < 4; guard++) {
            if (path !== this) {
                const j = i + steps;
                if (j <= path.count - 1) return { path, index: Math.max(0, j) };
                steps = j - (path.count - 1);
                i = path.to;
                path = this;
                continue;
            }
            const n = this.count;
            if (take && steps > 0) {
                let next = null;
                let first = Infinity;
                let into = 0;
                for (const b of this.branches) {
                    if (!take(b)) continue;
                    const d = (b.from - i + n) % n;
                    const past = (i - b.from + n) % n;
                    if (d > 0 && d <= steps && d < first) {
                        first = d;
                        next = b;
                        into = 0;
                    } else if (past <= FORK + 40 && -past < first) {
                        // still on (or just past) the stretch the branch shares with the main road: keep aiming into the branch until the car is on it
                        first = -past;
                        next = b;
                        into = past;
                    }
                }
                if (next) {
                    steps -= Math.max(0, first);
                    i = into;
                    path = next;
                    continue;
                }
            }
            return { path: this, index: (((i + steps) % n) + n) % n };
        }
        return { path, index: path.wrap(i) };
    }

    /** The turn angle between (path, i) and the point `distance` ahead (with the branch choices). */
    turnAheadOn(path, i, distance, take = null) {
        const a = this.advance(path, i, Math.round(distance / STEP), take);
        return angleBetween(path, i, a.path, a.index);
    }

    /** The checkpoint a sample lies in (0 … CHECKPOINTS-1). */
    checkpointOf(index) {
        return Math.min(CHECKPOINTS - 1, Math.floor((index / this.count) * CHECKPOINTS));
    }

    /** The start grid: slot k (0 = pole) – two columns, 9 units apart in rows of 10, behind the line. */
    gridSlot(k) {
        const row = Math.floor(k / 2);
        const column = k % 2 === 0 ? 1 : -1;
        const back = 10 + row * 9 + (k % 2) * 4;
        const i = (this.count - Math.round(back / STEP)) % this.count;
        return this.pointAt(i, column * this.w[i] * 0.22);
    }

    /** The tunnel over (path, i), or null. */
    tunnelAt(path, i) {
        for (const t of this.tunnels) if (t.path === path && i >= t.start && i <= t.end) return t;
        return null;
    }

    computeBounds() {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
        for (const path of this.paths) {
            for (let i = 0; i < path.count; i++) {
                const h = path.w[i] / 2;
                minX = Math.min(minX, path.x[i] - h);
                maxX = Math.max(maxX, path.x[i] + h);
                minZ = Math.min(minZ, path.z[i] - h);
                maxZ = Math.max(maxZ, path.z[i] + h);
                maxY = Math.max(maxY, path.heightAt(i));
            }
        }
        return { minX, maxX, minZ, maxZ, maxY, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, sizeX: maxX - minX, sizeZ: maxZ - minZ };
    }

    /**
     * True when (x, z) is closer than margin to any road (props must stay off it). Coarse grid lookup: cheap enough for thousands of props.
     */
    isNearRoad(x, z, margin = 0) {
        return this.roadsNear(x, z, margin, null) !== null;
    }

    /**
     * The first road sample whose road covers (x, z) within margin, optionally only roads whose height accepts(height, path, i) → true; null when none.
     * @returns {{ path: Path, index: number } | null}
     */
    roadsNear(x, z, margin = 0, accepts = null) {
        if (!this.grid) this.buildGrid();
        const g = this.grid;
        const cx = Math.floor((x - g.minX) / g.cell);
        const cz = Math.floor((z - g.minZ) / g.cell);
        const reach = Math.ceil((margin + 16) / g.cell);
        for (let ix = cx - reach; ix <= cx + reach; ix++) {
            for (let iz = cz - reach; iz <= cz + reach; iz++) {
                const list = g.cells.get(ix * 100003 + iz);
                if (!list) continue;
                for (let k = 0; k < list.length; k += 2) {
                    const path = this.paths[list[k]];
                    const i = list[k + 1];
                    const d = Math.hypot(x - path.x[i], z - path.z[i]);
                    if (d < path.w[i] * 0.5 + margin && (!accepts || accepts(path.heightAt(i), path, i))) return { path, index: i };
                }
            }
        }
        return null;
    }

    /** The shortest distance from (x, z) to the road's edge (negative = on the road), over all paths. */
    distanceToRoad(x, z) {
        let best = Infinity;
        const probe = {};
        for (const path of this.paths) {
            if (path !== this && !path.near(x, z, best === Infinity ? 200 : best + 20)) continue;
            const p = path.locate(x, z, -1, probe);
            best = Math.min(best, Math.abs(p.lateral) - p.half + p.over);
        }
        return best;
    }

    buildGrid() {
        const cell = 8;
        const cells = new Map();
        const minX = this.bounds.minX - 50;
        const minZ = this.bounds.minZ - 50;
        this.paths.forEach((path, p) => {
            for (let i = 0; i < path.count; i++) {
                if (path.rail[i]) continue;
                const key = Math.floor((path.x[i] - minX) / cell) * 100003 + Math.floor((path.z[i] - minZ) / cell);
                if (!cells.has(key)) cells.set(key, []);
                cells.get(key).push(p, i);
            }
        });
        this.grid = { cell, cells, minX, minZ };
    }
}

/**
 * A point of a looping at angle theta (0 … 2π) with a lateral offset: the circle rises from the entry lane, turns over and comes down on the exit lane.
 * @returns {{ x, y, z, ux, uy, uz, fx, fy, fz }} position, the road's up direction (towards the centre) and the forward direction
 */
export function loopPoint(loop, theta, lateral) {
    const R = loop.radius;
    const [tx, tz] = loop.T;
    const [nx, nz] = loop.N;
    const lane = -loop.D / 2 + loop.D * smoothstep(theta / (Math.PI * 2)) + lateral;
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    return {
        x: loop.P[0] + tx * R * s + nx * lane,
        y: loop.P[1] + R * (1 - c),
        z: loop.P[2] + tz * R * s + nz * lane,
        ux: -s * tx, uy: c, uz: -s * tz,
        fx: c * tx, fy: s, fz: c * tz,
    };
}
