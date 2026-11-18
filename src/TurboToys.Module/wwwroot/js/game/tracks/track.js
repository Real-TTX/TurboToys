// TurboToys · tracks/track.js – a layout of data/layouts.json as a drivable track: the centre line sampled every unit, the road height
// (with the kicker ramps), the width, and the queries of the physics and the race: where am I (locate), how far along (progress), checkpoints,
// the start grid, the places of the pickups and boost arrows. Pure maths, no three.js meshes (those are builder.js).

import * as THREE from 'three';

const STEP = 1; // one sample per unit (10 cm)
export const CHECKPOINTS = 12;

let layoutsPromise = null;

/** All layouts (cached): [{ key, name, theme, width, points, jumps, boosts, pickups }]. */
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

export class Track {
    /** @param {{ key: string, width: number, points: number[][], jumps?: any[], boosts?: any[], pickups?: any[] }} layout */
    constructor(layout) {
        this.layout = layout;
        this.key = layout.key;
        this.baseWidth = layout.width;
        const points = layout.points.map(p => new THREE.Vector3(p[0], p[2] ?? 0, p[1]));
        const widths = layout.points.map(p => p[3] ?? layout.width);
        const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
        this.curve = curve;
        const approx = curve.getLength();
        const count = Math.max(64, Math.round(approx / STEP));
        const spaced = curve.getSpacedPoints(count); // count + 1 points, last = first
        spaced.pop();
        this.count = spaced.length;

        // per sample: x, y(base), z, tangent (tx, tz), side normal (nx, nz: points to the left), width, distance s
        const n = this.count;
        this.x = new Float32Array(n);
        this.y = new Float32Array(n);
        this.z = new Float32Array(n);
        this.tx = new Float32Array(n);
        this.tz = new Float32Array(n);
        this.w = new Float32Array(n);
        this.s = new Float32Array(n);
        this.jumpLift = new Float32Array(n); // the kicker ramps on top of the base height

        // widths: interpolate the control point widths by the nearest control point parameter
        const controlU = points.map((_, i) => i / points.length);
        let length = 0;
        for (let i = 0; i < n; i++) {
            const p = spaced[i];
            this.x[i] = p.x;
            this.y[i] = p.y;
            this.z[i] = p.z;
            if (i > 0) length += Math.hypot(p.x - spaced[i - 1].x, p.z - spaced[i - 1].z);
            this.s[i] = length;
        }
        length += Math.hypot(spaced[0].x - spaced[n - 1].x, spaced[0].z - spaced[n - 1].z);
        this.length = length;
        for (let i = 0; i < n; i++) {
            const a = (i - 1 + n) % n;
            const b = (i + 1) % n;
            let dx = this.x[b] - this.x[a];
            let dz = this.z[b] - this.z[a];
            const l = Math.hypot(dx, dz) || 1;
            this.tx[i] = dx / l;
            this.tz[i] = dz / l;
            // width: smooth between the control points (cosine)
            const u = i / n;
            let k = 0;
            while (k < controlU.length - 1 && controlU[k + 1] <= u) k++;
            const u0 = controlU[k];
            const u1 = k + 1 < controlU.length ? controlU[k + 1] : 1;
            const t = (u - u0) / Math.max(1e-6, u1 - u0);
            const w0 = widths[k];
            const w1 = widths[(k + 1) % widths.length];
            this.w[i] = w0 + (w1 - w0) * (0.5 - 0.5 * Math.cos(Math.PI * t));
        }
        // smooth the heights a little (no steps from the spline)
        const smooth = Float32Array.from(this.y);
        for (let pass = 0; pass < 3; pass++) {
            for (let i = 0; i < n; i++) smooth[i] = (this.y[(i - 2 + n) % n] + this.y[(i - 1 + n) % n] + this.y[i] * 2 + this.y[(i + 1) % n] + this.y[(i + 2) % n]) / 6;
            this.y.set(smooth);
        }
        // the spline must not dip below the floor next to ramps (the layouts never go below 0)
        for (let i = 0; i < n; i++) if (this.y[i] < 0.02) this.y[i] = 0;

        // kicker ramps: a wedge that rises over its length and ends in a drop (the car flies)
        this.jumps = (layout.jumps ?? []).map(j => {
            const start = Math.round(j.at * n);
            const len = Math.max(3, Math.round(j.length / STEP));
            for (let k = 0; k < len; k++) {
                const i = (start + k) % n;
                this.jumpLift[i] = Math.max(this.jumpLift[i], j.height * Math.pow((k + 1) / len, 1.15));
            }
            return { start, end: (start + len) % n, length: len, height: j.height };
        });

        this.boosts = (layout.boosts ?? []).map(b => {
            const i = Math.round(b.at * n) % n;
            return { index: i, side: b.side ?? 0, ...this.pointAt(i, (b.side ?? 0) * this.w[i] * 0.3) };
        });

        // pickup rows: three crates across the road
        this.pickups = [];
        for (const row of layout.pickups ?? []) {
            const i = Math.round(row.at * n) % n;
            for (const lane of [-0.45, 0, 0.45]) {
                this.pickups.push({ slot: this.pickups.length, index: i, ...this.pointAt(i, lane * this.w[i] * 0.5) });
            }
        }

        this.checkpoints = Array.from({ length: CHECKPOINTS }, (_, k) => Math.round((k * n) / CHECKPOINTS));
        this.bounds = this.computeBounds();
    }

    /** The road height at sample i (base + kicker ramp). */
    heightAt(i) {
        return this.y[i] + this.jumpLift[i];
    }

    /** Left normal of the road at sample i: (nx, nz). */
    normalAt(i) {
        return { nx: -this.tz[i], nz: this.tx[i] };
    }

    /** A point on the road at sample i, lateral offset (positive = left): { x, y, z, yaw } (yaw: heading of the road). */
    pointAt(i, lateral = 0) {
        i = ((i % this.count) + this.count) % this.count;
        const { nx, nz } = this.normalAt(i);
        return {
            x: this.x[i] + nx * lateral,
            y: this.heightAt(i),
            z: this.z[i] + nz * lateral,
            yaw: Math.atan2(this.tx[i], this.tz[i]),
        };
    }

    /**
     * Where is (x, z) on the track: the nearest sample (searched around hint when given: the track may come close to itself),
     * the lateral offset (positive = left of the centre line), the road height under the point, the half width.
     * @returns {{ index: number, lateral: number, height: number, half: number, along: number, t: number }}
     */
    locate(x, z, hint = -1, out = {}) {
        const n = this.count;
        let best = -1;
        let bestD = Infinity;
        if (hint >= 0) {
            for (let k = -40; k <= 40; k++) {
                const i = (hint + k + n) % n;
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
            for (let i = 0; i < n; i += 2) {
                const dx = x - this.x[i];
                const dz = z - this.z[i];
                const d = dx * dx + dz * dz;
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
            for (let k = -2; k <= 2; k++) {
                const i = (best + k + n) % n;
                const dx = x - this.x[i];
                const dz = z - this.z[i];
                const d = dx * dx + dz * dz;
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
        }
        const i = best;
        // project on the segment i → i+1 for a smooth height and distance
        const j = (i + 1) % n;
        const dx = x - this.x[i];
        const dz = z - this.z[i];
        const along = dx * this.tx[i] + dz * this.tz[i];
        const segX = this.x[j] - this.x[i];
        const segZ = this.z[j] - this.z[i];
        const segL = Math.hypot(segX, segZ) || 1;
        let t = along / segL;
        let a = i;
        let b = j;
        if (t < 0) {
            a = (i - 1 + n) % n;
            b = i;
            t = 1 + t;
        }
        t = Math.min(1, Math.max(0, t));
        const { nx, nz } = this.normalAt(i);
        out.index = i;
        out.lateral = dx * nx + dz * nz;
        out.height = this.heightAt(a) + (this.heightAt(b) - this.heightAt(a)) * t;
        out.half = this.w[i] * 0.5;
        out.along = this.s[i] + along;
        out.t = t;
        return out;
    }

    /** The slope of the road along its direction at sample i (dy per unit). */
    slopeAt(i) {
        const n = this.count;
        const a = (i - 1 + n) % n;
        const b = (i + 1) % n;
        return (this.heightAt(b) - this.heightAt(a)) / 2;
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

    /** The curvature ahead: the turn angle (radians, signed: positive = left) between sample i and i + distance. */
    turnAhead(i, distance) {
        const j = (i + Math.round(distance / STEP)) % this.count;
        const a = Math.atan2(this.tx[i], this.tz[i]);
        const b = Math.atan2(this.tx[j], this.tz[j]);
        let d = b - a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    computeBounds() {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
        for (let i = 0; i < this.count; i++) {
            const h = this.w[i] / 2;
            minX = Math.min(minX, this.x[i] - h);
            maxX = Math.max(maxX, this.x[i] + h);
            minZ = Math.min(minZ, this.z[i] - h);
            maxZ = Math.max(maxZ, this.z[i] + h);
            maxY = Math.max(maxY, this.heightAt(i));
        }
        return { minX, maxX, minZ, maxZ, maxY, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, sizeX: maxX - minX, sizeZ: maxZ - minZ };
    }

    /**
     * True when (x, z) is closer than margin to the road (props must stay off it). Coarse grid lookup: cheap enough for thousands of props.
     */
    isNearRoad(x, z, margin = 0) {
        if (!this.grid) this.buildGrid();
        const g = this.grid;
        const cx = Math.floor((x - g.minX) / g.cell);
        const cz = Math.floor((z - g.minZ) / g.cell);
        const reach = Math.ceil((margin + 16) / g.cell);
        for (let ix = cx - reach; ix <= cx + reach; ix++) {
            for (let iz = cz - reach; iz <= cz + reach; iz++) {
                const list = g.cells.get(ix * 100003 + iz);
                if (!list) continue;
                for (const i of list) {
                    const d = Math.hypot(x - this.x[i], z - this.z[i]);
                    if (d < this.w[i] * 0.5 + margin) return true;
                }
            }
        }
        return false;
    }

    /** The shortest distance from (x, z) to the road's edge (negative = on the road). */
    distanceToRoad(x, z) {
        const p = this.locate(x, z);
        return Math.abs(p.lateral) - p.half;
    }

    buildGrid() {
        const cell = 8;
        const cells = new Map();
        const minX = this.bounds.minX - 50;
        const minZ = this.bounds.minZ - 50;
        for (let i = 0; i < this.count; i++) {
            const key = Math.floor((this.x[i] - minX) / cell) * 100003 + Math.floor((this.z[i] - minZ) / cell);
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(i);
        }
        this.grid = { cell, cells, minX, minZ };
    }
}
