// TurboToys · editor.js – the track editor ("Streckenbau"), built like a slot-car set: pieces are plugged one after the other on a grid
// (tile = 40 units = 4 m in the toy world), starting with the start straight. The track is ready when its end meets the start again.
//   - pieces: straight, tight and wide curves, ramps up/down (levels of 6 units), kicker, boost arrows, crates, a cardboard tunnel, a looping
//   - the track may cross itself: flat (two plain straights at right angles) or as a bridge (two levels or more apart)
//   - "Schließen" finds the missing pieces (A* over tile, heading and level)
// The design compiles into a layout (tracks/track.js format: dense centre line points, loops, tunnels, jumps, boosts, pickups) plus the
// pieces for editing again. The server checks it (TurboToys.Core Layouts.Validate) and stores it as a custom track.

export const TILE = 40;
export const LEVEL = 6;
export const MAX_LEVEL = 6;
export const WIDTH = 18;
const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // +x, +z, -x, -z (the map: x to the right, z down; turning right = next heading)

const smooth = t => t * t * (3 - 2 * t);

/** The pieces: footprint (tiles in forward/right steps), the exit, the centre line (f, r in tiles from the tile centre) and the level change. */
export const PIECES = {
    straight: { name: 'Gerade', tiles: [[0, 0]], exit: [1, 0], turn: 0, dl: 0, len: TILE, at: t => [-0.5 + t, 0] },
    left: { name: 'Kurve links', tiles: [[0, 0]], exit: [0, -1], turn: -1, dl: 0, len: (Math.PI / 2) * TILE * 0.5,
        at: t => [-0.5 + 0.5 * Math.sin(t * Math.PI / 2), -0.5 + 0.5 * Math.cos(t * Math.PI / 2)] },
    right: { name: 'Kurve rechts', tiles: [[0, 0]], exit: [0, 1], turn: 1, dl: 0, len: (Math.PI / 2) * TILE * 0.5,
        at: t => [-0.5 + 0.5 * Math.sin(t * Math.PI / 2), 0.5 - 0.5 * Math.cos(t * Math.PI / 2)] },
    wideLeft: { name: 'Weite Kurve links', tiles: [[0, 0], [1, 0], [0, -1], [1, -1]], exit: [1, -2], turn: -1, dl: 0, len: (Math.PI / 2) * TILE * 1.5,
        at: t => [-0.5 + 1.5 * Math.sin(t * Math.PI / 2), -1.5 + 1.5 * Math.cos(t * Math.PI / 2)] },
    wideRight: { name: 'Weite Kurve rechts', tiles: [[0, 0], [1, 0], [0, 1], [1, 1]], exit: [1, 2], turn: 1, dl: 0, len: (Math.PI / 2) * TILE * 1.5,
        at: t => [-0.5 + 1.5 * Math.sin(t * Math.PI / 2), 1.5 - 1.5 * Math.cos(t * Math.PI / 2)] },
    up: { name: 'Rampe hoch', tiles: [[0, 0]], exit: [1, 0], turn: 0, dl: 1, len: TILE, at: t => [-0.5 + t, 0] },
    down: { name: 'Rampe runter', tiles: [[0, 0]], exit: [1, 0], turn: 0, dl: -1, len: TILE, at: t => [-0.5 + t, 0] },
    jump: { name: 'Sprungschanze', tiles: [[0, 0]], exit: [1, 0], turn: 0, dl: 0, len: TILE, at: t => [-0.5 + t, 0], feature: 'jump' },
    boost: { name: 'Turbo-Pfeile', tiles: [[0, 0]], exit: [1, 0], turn: 0, dl: 0, len: TILE, at: t => [-0.5 + t, 0], feature: 'boost' },
    crates: { name: 'Kisten', tiles: [[0, 0]], exit: [1, 0], turn: 0, dl: 0, len: TILE, at: t => [-0.5 + t, 0], feature: 'crates' },
    tunnel: { name: 'Karton-Tunnel', tiles: [[0, 0]], exit: [1, 0], turn: 0, dl: 0, len: TILE, at: t => [-0.5 + t, 0], feature: 'tunnel' },
    loop: { name: 'Looping', tiles: [[0, 0], [1, 0]], exit: [2, 0], turn: 0, dl: 0, len: TILE * 2, at: t => [-0.5 + 2 * t, 0], feature: 'loop', height: 4 },
};

/** The order of the palette (and the keys 1 … 0, -, =). */
export const PALETTE_ORDER = ['straight', 'left', 'right', 'wideLeft', 'wideRight', 'up', 'down', 'jump', 'boost', 'crates', 'tunnel', 'loop'];

const START = { x: 0, z: 0, h: 0, l: 0 };

/** The tile of a piece's local (f, r) step from a state. */
function tileOf(s, f, r) {
    const F = DIR[s.h];
    const R = DIR[(s.h + 1) % 4];
    return [s.x + F[0] * f + R[0] * r, s.z + F[1] * f + R[1] * r];
}

/** The world point of a piece's local (f, r) in tiles. */
function worldOf(s, f, r) {
    const F = DIR[s.h];
    const R = DIR[(s.h + 1) % 4];
    return [(s.x + F[0] * f + R[0] * r) * TILE, (s.z + F[1] * f + R[1] * r) * TILE];
}

/** The state after a piece. */
export function after(s, kind) {
    const p = PIECES[kind];
    const [x, z] = tileOf(s, p.exit[0], p.exit[1]);
    return { x, z, h: (s.h + p.turn + 4) % 4, l: s.l + p.dl };
}

/** What a piece occupies: per tile the level range (and for flat crossings: the axis of a plain straight). */
function footprint(s, kind) {
    const p = PIECES[kind];
    const lo = Math.min(s.l, s.l + p.dl);
    const hi = Math.max(s.l, s.l + p.dl) + (p.height ?? 0);
    return p.tiles.map(([f, r]) => {
        const [x, z] = tileOf(s, f, r);
        return { key: `${x},${z}`, x, z, lo, hi, plain: kind === 'straight', axis: s.h % 2 };
    });
}

/** True when two uses of one tile can live together: a bridge (two levels apart) or a flat crossing of two plain straights. */
function compatible(a, b) {
    if (a.hi + 2 <= b.lo || b.hi + 2 <= a.lo) return true;
    return a.plain && b.plain && a.lo === b.lo && a.axis !== b.axis;
}

/**
 * A design: the pieces from the start, with the states between them and the tile occupancy.
 */
export class Design {
    constructor(pieces = ['straight']) {
        this.pieces = [];
        this.states = [START];
        this.tiles = new Map();
        for (const kind of pieces) if (!this.add(kind)) break;
        if (!this.pieces.length) this.add('straight');
    }

    get end() {
        return this.states[this.states.length - 1];
    }

    get closed() {
        const e = this.end;
        return this.pieces.length > 2 && e.x === START.x && e.z === START.z && e.h === START.h && e.l === START.l;
    }

    /** Why a piece cannot go at the end ('' = it fits). */
    check(kind, s = this.end, extra = null) {
        const p = PIECES[kind];
        if (!p) return 'Unbekanntes Teil';
        if (this.closed && s === this.end) return 'Die Strecke ist geschlossen';
        const l = s.l + p.dl;
        if (l < 0) return 'Tiefer geht es nicht';
        if (l > MAX_LEVEL) return 'Höher geht es nicht';
        if (p.feature === 'loop' && this.pieces.filter(k => k === 'loop').length >= 4) return 'Höchstens vier Loopings';
        for (const use of footprint(s, kind)) {
            for (const other of [...(this.tiles.get(use.key) ?? []), ...(extra?.get(use.key) ?? [])]) {
                if (!compatible(use, other)) return other.lo === use.lo ? 'Da liegt schon Strecke' : 'Zu wenig Platz für eine Brücke';
            }
        }
        return '';
    }

    add(kind) {
        if (this.check(kind)) return false;
        const s = this.end;
        for (const use of footprint(s, kind)) {
            if (!this.tiles.has(use.key)) this.tiles.set(use.key, []);
            this.tiles.get(use.key).push({ ...use, piece: this.pieces.length });
        }
        this.pieces.push(kind);
        this.states.push(after(s, kind));
        return true;
    }

    /** Removes the last piece (the start straight stays). */
    undo() {
        if (this.pieces.length <= 1) return false;
        const index = this.pieces.length - 1;
        for (const [key, list] of this.tiles) {
            const left = list.filter(u => u.piece !== index);
            if (left.length) this.tiles.set(key, left);
            else this.tiles.delete(key);
        }
        this.pieces.pop();
        this.states.pop();
        return true;
    }

    /**
     * The pieces that close the track from its end (A* over tile, heading and level with straights, curves and ramps), or null.
     * @returns {string[]|null}
     */
    closing(limit = 40000) {
        if (this.closed) return [];
        const kinds = ['straight', 'left', 'right', 'up', 'down', 'wideLeft', 'wideRight'];
        const goal = START;
        const key = s => `${s.x},${s.z},${s.h},${s.l}`;
        const guess = s => Math.abs(s.x - goal.x) + Math.abs(s.z - goal.z) + Math.abs(s.l - goal.l) + (s.h === goal.h ? 0 : 1);
        const startNode = { s: this.end, g: 0, f: guess(this.end), kinds: [], used: new Map() };
        const open = [startNode];
        const seen = new Map([[key(this.end), 0]]);
        let steps = 0;
        while (open.length && steps++ < limit) {
            let best = 0;
            for (let k = 1; k < open.length; k++) if (open[k].f < open[best].f) best = k;
            const node = open.splice(best, 1)[0];
            for (const kind of kinds) {
                if (this.check(kind, node.s, node.used)) continue;
                const s = after(node.s, kind);
                const g = node.g + (kind.startsWith('wide') ? 2.2 : kind === 'up' || kind === 'down' ? 1.3 : 1);
                if (s.x === goal.x && s.z === goal.z && s.h === goal.h && s.l === goal.l) return [...node.kinds, kind];
                const k = key(s);
                if (seen.has(k) && seen.get(k) <= g) continue;
                seen.set(k, g);
                if (node.kinds.length >= 28) continue;
                const used = new Map(node.used);
                for (const u of footprint(node.s, kind)) used.set(u.key, [...(used.get(u.key) ?? []), u]);
                open.push({ s, g, f: g + guess(s) * 1.1, kinds: [...node.kinds, kind], used });
            }
        }
        return null;
    }

    /** The centre line of piece k: points [x, z, y] from its start (inclusive) to its end (exclusive), every ~step units. */
    line(k, step = 8) {
        const p = PIECES[this.pieces[k]];
        const s = this.states[k];
        const count = Math.max(2, Math.round(p.len / step));
        const out = [];
        for (let j = 0; j < count; j++) {
            const t = j / count;
            const [f, r] = p.at(t);
            const [x, z] = worldOf(s, f, r);
            out.push([x, z, (s.l + p.dl * smooth(t)) * LEVEL]);
        }
        return out;
    }

    /** The length of the lap (units, with the loopings). */
    get length() {
        return this.pieces.reduce((sum, kind) => sum + PIECES[kind].len + (kind === 'loop' ? Math.PI * 2 * 12 : 0), 0);
    }

    /**
     * The layout of the design (tracks/track.js): the closed centre line and the features at their fractions of the lap.
     * @param {{ name?: string, theme?: string }} meta
     */
    compile({ name = 'Eigene Strecke', theme = 'kidsroom' } = {}) {
        const points = [];
        const starts = [];
        for (let k = 0; k < this.pieces.length; k++) {
            starts.push(points.length);
            const step = this.pieces[k].startsWith('wide') || this.pieces[k] === 'left' || this.pieces[k] === 'right' ? 5 : 10;
            points.push(...this.line(k, step));
        }
        // the distance of every point along the lap (3D polyline, as the track measures it)
        const along = [0];
        for (let i = 1; i <= points.length; i++) {
            const a = points[i - 1];
            const b = points[i % points.length];
            along.push(along[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
        }
        const total = along[points.length];
        const at = s => Math.round(((s % total) / total) * 10000) / 10000;
        const jumps = [];
        const boosts = [];
        const pickups = [];
        const loops = [];
        const tunnels = [];
        for (let k = 0; k < this.pieces.length; k++) {
            const s0 = along[starts[k]];
            switch (this.pieces[k]) {
                case 'jump':
                    jumps.push({ at: at(s0 + 16), height: 2.4, length: 10 });
                    break;
                case 'boost':
                    boosts.push({ at: at(s0 + 18), side: 0 });
                    break;
                case 'crates':
                    pickups.push({ at: at(s0 + 20) });
                    break;
                case 'loop':
                    loops.push({ at: at(s0 + TILE), radius: 12 });
                    break;
                case 'tunnel': {
                    const last = tunnels[tunnels.length - 1];
                    if (last && last.piece === k - 1) {
                        last.length += TILE;
                        last.piece = k;
                    } else {
                        tunnels.push({ at: at(s0), length: TILE, style: 'box', piece: k });
                    }
                    break;
                }
            }
        }
        const round = v => Math.round(v * 100) / 100;
        return {
            key: 'custom',
            name,
            theme,
            width: WIDTH,
            points: points.map(p => [round(p[0]), round(p[1]), round(p[2])]),
            jumps,
            boosts,
            pickups,
            loops,
            tunnels: tunnels.map(({ piece, ...t }) => t),
            pieces: [...this.pieces],
        };
    }
}

/** The design of a stored layout (its pieces), or a new one. */
export function designOf(layout) {
    return new Design(Array.isArray(layout?.pieces) && layout.pieces.length ? layout.pieces.filter(k => PIECES[k]) : ['straight']);
}

// ------------------------------------------------------------------ the plan (2D canvas)

const INK = '#14100c';
const PAPER = '#f4ead2';
const LEVEL_TINT = ['#8d8a86', '#9a958f', '#a8a299', '#b5aea3', '#c2baad', '#cfc6b7', '#dcd2c1'];

/**
 * The plan of a design on a canvas: grid, pieces (lower levels first, bridges on top), features, the start, the open end and a ghost
 * of the piece about to be plugged. Pan with the mouse (drag), zoom with the wheel.
 */
export class Plan {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.scale = 0.9; // pixels per unit
        this.cx = 0; // the world point in the middle of the canvas
        this.cz = 0;
        this.ghost = null;
        this.design = null;
        let drag = null;
        canvas.addEventListener('pointerdown', e => {
            drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz };
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener('pointermove', e => {
            if (!drag) return;
            this.cx = drag.cx - (e.clientX - drag.x) / this.scale;
            this.cz = drag.cz - (e.clientY - drag.y) / this.scale;
            this.draw();
        });
        canvas.addEventListener('pointerup', () => (drag = null));
        canvas.addEventListener('wheel', e => {
            e.preventDefault();
            this.scale = Math.max(0.25, Math.min(3, this.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
            this.draw();
        }, { passive: false });
        this.resize = () => {
            const r = canvas.getBoundingClientRect();
            const dpr = Math.min(2, devicePixelRatio || 1);
            canvas.width = Math.max(10, Math.round(r.width * dpr));
            canvas.height = Math.max(10, Math.round(r.height * dpr));
            this.dpr = dpr;
            this.draw();
        };
        addEventListener('resize', this.resize);
    }

    dispose() {
        removeEventListener('resize', this.resize);
    }

    /** Centres the view on the design. */
    fit() {
        const d = this.design;
        if (!d) return;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const s of d.states) {
            minX = Math.min(minX, s.x);
            maxX = Math.max(maxX, s.x);
            minZ = Math.min(minZ, s.z);
            maxZ = Math.max(maxZ, s.z);
        }
        this.cx = ((minX + maxX) / 2) * TILE;
        this.cz = ((minZ + maxZ) / 2) * TILE;
        const r = this.canvas.getBoundingClientRect();
        const span = Math.max((maxX - minX + 4) * TILE / Math.max(1, r.width), (maxZ - minZ + 4) * TILE / Math.max(1, r.height));
        this.scale = Math.max(0.3, Math.min(1.4, 1 / span));
        this.draw();
    }

    toScreen(x, z) {
        const c = this.canvas;
        return [c.width / 2 + (x - this.cx) * this.scale * this.dpr, c.height / 2 + (z - this.cz) * this.scale * this.dpr];
    }

    draw() {
        const ctx = this.ctx;
        const c = this.canvas;
        const d = this.design;
        if (!d || !this.dpr) return;
        const k = this.scale * this.dpr;
        ctx.fillStyle = PAPER;
        ctx.fillRect(0, 0, c.width, c.height);

        // the grid
        ctx.strokeStyle = 'rgba(20,16,12,0.12)';
        ctx.lineWidth = 1;
        const [ox, oz] = this.toScreen(-TILE / 2, -TILE / 2);
        const step = TILE * k;
        for (let x = ((ox % step) + step) % step; x < c.width; x += step) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, c.height);
            ctx.stroke();
        }
        for (let y = ((oz % step) + step) % step; y < c.height; y += step) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(c.width, y);
            ctx.stroke();
        }

        // the pieces, lower ones first
        const order = d.pieces.map((kind, i) => ({ i, l: Math.max(d.states[i].l, d.states[i + 1].l) })).sort((a, b) => a.l - b.l || a.i - b.i);
        for (const { i } of order) this.drawPiece(i, d.pieces[i], d.states[i], d.line(i, 4), false);

        // the start line
        const [sx, sz] = this.toScreen(-TILE / 2 + 2, 0);
        ctx.fillStyle = INK;
        ctx.fillRect(sx - 3 * k, sz - (WIDTH / 2) * k, 6 * k, WIDTH * k);
        for (let j = 0; j < 6; j++) {
            ctx.fillStyle = j % 2 ? INK : '#fff';
            ctx.fillRect(sx - 3 * k + (j % 2) * 3 * k, sz - (WIDTH / 2) * k + j * (WIDTH / 6) * k, 3 * k, (WIDTH / 6) * k);
        }

        // the ghost of the next piece and the open end
        if (this.ghost && !d.closed) {
            const s = d.end;
            const tmp = new Design([]);
            tmp.pieces = [this.ghost.kind];
            tmp.states = [s, after(s, this.ghost.kind)];
            ctx.globalAlpha = 0.55;
            this.drawPiece(0, this.ghost.kind, s, tmp.line(0, 4), true, this.ghost.problem ? '#e2392f' : '#3f9b4b');
            ctx.globalAlpha = 1;
        }
        if (!d.closed) this.drawArrow(d.end);
    }

    drawPiece(index, kind, s, line, ghost, tint = null) {
        const ctx = this.ctx;
        const k = this.scale * this.dpr;
        const p = PIECES[kind];
        const end = after(s, kind);
        const pts = line.map(q => this.toScreen(q[0], q[1]));
        const [ex, ez] = worldOf(s, ...p.at(1));
        pts.push(this.toScreen(ex, ez));
        const level = Math.max(s.l, end.l);
        const path = () => {
            ctx.beginPath();
            pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        };
        ctx.lineJoin = 'round';
        ctx.lineCap = 'butt';
        // the shadow of raised pieces
        if (level > 0 && !ghost) {
            ctx.save();
            ctx.translate(level * 2.2 * k, level * 2.2 * k);
            path();
            ctx.strokeStyle = 'rgba(20,16,12,0.22)';
            ctx.lineWidth = (WIDTH + 6) * k;
            ctx.stroke();
            ctx.restore();
        }
        path();
        ctx.strokeStyle = INK;
        ctx.lineWidth = (WIDTH + 5) * k;
        ctx.stroke();
        path();
        ctx.strokeStyle = tint ?? (p.feature === 'tunnel' ? '#c8955a' : LEVEL_TINT[Math.min(LEVEL_TINT.length - 1, level)]);
        ctx.lineWidth = WIDTH * k;
        ctx.stroke();
        if (!tint) {
            // the centre line
            path();
            ctx.setLineDash([4 * k, 5 * k]);
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1.2 * k;
            ctx.stroke();
            ctx.setLineDash([]);
        }
        // features and ramps
        const mid = pts[Math.floor(pts.length / 2)];
        const dirAt = j => {
            const a = pts[Math.max(0, j - 1)];
            const b = pts[Math.min(pts.length - 1, j + 1)];
            return Math.atan2(b[1] - a[1], b[0] - a[0]);
        };
        const angle = dirAt(Math.floor(pts.length / 2));
        ctx.save();
        ctx.translate(mid[0], mid[1]);
        ctx.rotate(angle);
        ctx.lineWidth = 2;
        ctx.strokeStyle = INK;
        const glyph = (fill, draw) => {
            ctx.fillStyle = fill;
            ctx.beginPath();
            draw();
            ctx.fill();
            ctx.stroke();
        };
        switch (p.feature ?? (p.dl ? 'ramp' : null)) {
            case 'boost':
                for (const off of [-6, 2]) glyph('#ffd23a', () => {
                    ctx.moveTo((off - 3) * k, -6 * k);
                    ctx.lineTo((off + 4) * k, 0);
                    ctx.lineTo((off - 3) * k, 6 * k);
                    ctx.lineTo((off - 1) * k, 0);
                    ctx.closePath();
                });
                break;
            case 'jump':
                glyph('#f6c638', () => ctx.rect(-6 * k, -7 * k, 12 * k, 14 * k));
                ctx.fillStyle = INK;
                for (let j = 0; j < 3; j++) ctx.fillRect((-5 + j * 4) * k, -7 * k, 2 * k, 14 * k);
                break;
            case 'crates':
                for (const off of [-5.5, 0, 5.5]) glyph('#f28c28', () => ctx.rect(-2.2 * k, (off - 2.2) * k, 4.4 * k, 4.4 * k));
                break;
            case 'loop':
                ctx.lineWidth = 3 * k;
                ctx.strokeStyle = INK;
                ctx.beginPath();
                ctx.ellipse(0, 0, 12 * k, 8 * k, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.lineWidth = 1.6 * k;
                ctx.strokeStyle = '#e2392f';
                ctx.stroke();
                break;
            case 'tunnel':
                ctx.fillStyle = 'rgba(20,16,12,0.25)';
                ctx.fillRect(-TILE / 2 * k, -(WIDTH / 2 + 3) * k, TILE * k, 3 * k);
                ctx.fillRect(-TILE / 2 * k, (WIDTH / 2) * k, TILE * k, 3 * k);
                break;
            case 'ramp':
                ctx.fillStyle = INK;
                ctx.font = `${Math.max(9, 11 * k)}px Bangers, Impact, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(p.dl > 0 ? '▲' : '▼', 0, 0);
                break;
        }
        ctx.restore();
        // the level of raised pieces
        if (level > 0 && !ghost) {
            ctx.fillStyle = PAPER;
            ctx.strokeStyle = INK;
            ctx.lineWidth = 2;
            const [lx, ly] = pts[pts.length - 1];
            ctx.beginPath();
            ctx.arc(lx, ly, 7 * Math.max(0.8, k), 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = INK;
            ctx.font = `${Math.round(10 * Math.max(0.8, k))}px Bangers, Impact, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(end.l), lx, ly + 0.5);
        }
    }

    drawArrow(s) {
        const ctx = this.ctx;
        const k = this.scale * this.dpr;
        const F = DIR[s.h];
        const [x, z] = this.toScreen((s.x - F[0] * 0.5) * TILE, (s.z - F[1] * 0.5) * TILE);
        ctx.save();
        ctx.translate(x, z);
        ctx.rotate(Math.atan2(F[1], F[0]));
        ctx.fillStyle = '#e2392f';
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(14 * k, 0);
        ctx.lineTo(0, -9 * k);
        ctx.lineTo(0, -4 * k);
        ctx.lineTo(-10 * k, -4 * k);
        ctx.lineTo(-10 * k, 4 * k);
        ctx.lineTo(0, 4 * k);
        ctx.lineTo(0, 9 * k);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

/** A small SVG of a piece for the palette buttons. */
export function pieceIcon(kind) {
    const p = PIECES[kind];
    const pts = [];
    for (let j = 0; j <= 12; j++) pts.push(p.at(j / 12));
    const xs = pts.map(q => q[0]);
    const ys = pts.map(q => q[1]);
    const minX = Math.min(...xs, -0.5), maxX = Math.max(...xs, 0.5), minY = Math.min(...ys, -0.5), maxY = Math.max(...ys, 0.5);
    const size = Math.max(maxX - minX, maxY - minY) + 0.5;
    const s = 40 / size;
    // the icon shows the piece going upwards (forward = up, right = right)
    const mapUp = ([f, r]) => `${((r - minY + 0.25) * s).toFixed(1)},${(40 - (f - minX + 0.25) * s).toFixed(1)}`;
    const d = 'M' + pts.map(mapUp).join(' L');
    const extra = {
        jump: '<rect x="14" y="14" width="12" height="12" fill="#f6c638" stroke="#14100c" stroke-width="2"/>',
        boost: '<path d="M14 24 20 16 26 24" fill="none" stroke="#ffd23a" stroke-width="4"/>',
        crates: '<rect x="12" y="17" width="6" height="6" fill="#f28c28" stroke="#14100c" stroke-width="1.5"/><rect x="22" y="17" width="6" height="6" fill="#f28c28" stroke="#14100c" stroke-width="1.5"/>',
        tunnel: '<rect x="10" y="10" width="20" height="20" fill="#c8955a" stroke="#14100c" stroke-width="2"/>',
        loop: '<circle cx="20" cy="20" r="8" fill="none" stroke="#e2392f" stroke-width="3"/>',
    }[p.feature] ?? (p.dl > 0 ? '<path d="M14 24 20 15 26 24z" fill="#14100c"/>' : p.dl < 0 ? '<path d="M14 16 20 25 26 16z" fill="#14100c"/>' : '');
    return `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true"><path d="${d}" fill="none" stroke="#14100c" stroke-width="13" stroke-linecap="butt"/>`
        + `<path d="${d}" fill="none" stroke="#8d8a86" stroke-width="9"/>${extra}</svg>`;
}
