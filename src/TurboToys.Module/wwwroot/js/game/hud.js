// TurboToys · hud.js – the heads-up display of a race in the comic look: place and lap (top left), the field (left), the mini map (top right),
// hit points, crate weapon and machine-gun ammo (bottom left), speedometer and turbo tank (bottom right), the kill feed, hints.

const ICONS = {
    Rocket: '<path d="M4 20l3-1 10-10a4 4 0 0 0-6-6L1 13l-1 3z" transform="translate(3 0)" fill="#e2392f" stroke="#14100c" stroke-width="2"/><path d="M5 15l4 4M3 21l2-2" stroke="#ffd23a" stroke-width="2.5" stroke-linecap="round"/>',
    Mine: '<circle cx="12" cy="13" r="7" fill="#e2392f" stroke="#14100c" stroke-width="2"/><circle cx="12" cy="11" r="3" fill="#ff8a7a"/><path d="M12 20v3" stroke="#14100c" stroke-width="2"/>',
    Oil: '<path d="M12 2c3 5 7 9 7 13a7 7 0 0 1-14 0c0-4 4-8 7-13z" fill="#26232e" stroke="#14100c" stroke-width="2"/><circle cx="9.5" cy="15" r="1.8" fill="#8f86b8"/>',
    Shock: '<path d="M13 1L4 14h7l-2 9 10-13h-7z" fill="#58c8ff" stroke="#14100c" stroke-width="2" stroke-linejoin="round"/>',
    Shield: '<path d="M12 2l8 3v6c0 6-4 9-8 11-4-2-8-5-8-11V5z" fill="#7fd3ff" stroke="#14100c" stroke-width="2"/><path d="M8 11l3 3 5-6" stroke="#14100c" stroke-width="2" fill="none"/>',
};

export const WEAPON_NAMES = { Rocket: 'Rakete', Mine: 'Mine', Oil: 'Öl', Shock: 'Schock', Shield: 'Schild', MachineGun: 'MG' };

function ms(t) {
    if (t == null || t < 0) return '–:––.–';
    const m = Math.floor(t / 60000);
    const s = Math.floor((t / 1000) % 60);
    const d = Math.floor((t % 1000) / 100);
    return `${m}:${String(s).padStart(2, '0')}.${d}`;
}

export class Hud {
    constructor(root, track) {
        this.root = root;
        this.track = track;
        root.innerHTML = `
            <div class="hud-place comic-box"><span class="pos" id="hud-pos">–</span><span class="of" id="hud-of">/–</span></div>
            <div class="hud-lap comic-box"><small>RUNDE</small><b id="hud-lap">0/0</b><small class="time" id="hud-time">0:00.0</small><small class="best" id="hud-best"></small></div>
            <ol class="hud-field comic-box" id="hud-field"></ol>
            <canvas class="hud-map comic-box" id="hud-map" width="220" height="220"></canvas>
            <div class="hud-feed" id="hud-feed"></div>
            <div class="hud-bottom-left">
                <div class="hud-hp comic-box"><small>KAROSSERIE</small><div class="bar"><i id="hud-hp"></i></div></div>
                <div class="hud-weapon comic-box" id="hud-weapon"><svg viewBox="0 0 24 24" id="hud-weapon-icon"></svg><b id="hud-weapon-count"></b><small id="hud-weapon-name">KEINE WAFFE</small></div>
                <div class="hud-ammo comic-box"><small>MG</small><b id="hud-ammo">0</b></div>
            </div>
            <div class="hud-gauge comic-box">
                <svg viewBox="0 0 120 120" class="dial">
                    <path d="M18 92 A50 50 0 1 1 102 92" class="track"/>
                    <path d="M18 92 A50 50 0 1 1 102 92" class="speed" id="hud-speed-arc"/>
                    <path d="M28 86 A38 38 0 1 1 92 86" class="turbo-track"/>
                    <path d="M28 86 A38 38 0 1 1 92 86" class="turbo" id="hud-turbo-arc"/>
                </svg>
                <b id="hud-speed">0</b><small>KM/H</small>
                <span class="turbo-label" id="hud-turbo-label">TURBO</span>
            </div>
            <div class="hud-hint" id="hud-hint"></div>`;
        this.el = id => root.querySelector('#' + id);
        this.speedArc = this.el('hud-speed-arc');
        this.turboArc = this.el('hud-turbo-arc');
        this.speedLen = this.speedArc.getTotalLength?.() ?? 260;
        this.turboLen = this.turboArc.getTotalLength?.() ?? 190;
        this.speedArc.style.strokeDasharray = `${this.speedLen}`;
        this.turboArc.style.strokeDasharray = `${this.turboLen}`;
        this.map = this.el('hud-map');
        this.mapCtx = this.map.getContext('2d');
        this.mapBase = this.drawMapBase();
        this.last = {};
        root.hidden = false;
    }

    drawMapBase() {
        const t = this.track;
        const b = t.bounds;
        const size = 220;
        const pad = 18;
        const scale = (size - pad * 2) / Math.max(b.sizeX, b.sizeZ);
        this.mapTransform = (x, z) => [pad + (x - b.minX) * scale + (size - pad * 2 - b.sizeX * scale) / 2, pad + (z - b.minZ) * scale + (size - pad * 2 - b.sizeZ * scale) / 2];
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        // every path: the main road (closed) and the shortcuts (open); loopings are left out (they go round on the spot)
        const path = p => {
            ctx.beginPath();
            let first = true;
            const end = p.closed ? p.count : p.count - 1;
            for (let i = 0; i <= end; i += i + 3 > end && i < end ? end - i : 3) {
                const k = i % p.count;
                if (p.rail[k]) continue;
                const [x, y] = this.mapTransform(p.x[k], p.z[k]);
                if (first) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                first = false;
            }
            if (p.closed) ctx.closePath();
        };
        const paths = t.paths ?? [t];
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (const p of paths) {
            path(p);
            ctx.strokeStyle = '#14100c';
            ctx.lineWidth = 12;
            ctx.stroke();
        }
        for (const p of paths) {
            path(p);
            ctx.strokeStyle = p === t ? '#f4ead2' : '#f6c638';
            ctx.lineWidth = 6;
            ctx.stroke();
        }
        const [sx, sy] = this.mapTransform(t.x[0], t.z[0]);
        ctx.fillStyle = '#e2392f';
        ctx.fillRect(sx - 4, sy - 4, 8, 8);
        return canvas;
    }

    /**
     * @param {{ place:number, cars:number, lap:number, laps:number, time:number, best:number|null, hp:number, maxHp:number, speed:number, turbo:number, boosting:boolean,
     *           special:string|null, specialCount:number, ammo:number, field: Array<{ name:string, place:number, me:boolean, finished:boolean, wrecked:boolean, color:string }>,
     *           dots: Array<{ x:number, z:number, color:string, me:boolean }> }} s
     */
    update(s) {
        const set = (id, value) => {
            if (this.last[id] !== value) {
                this.last[id] = value;
                this.el(id).textContent = value;
            }
        };
        set('hud-pos', `${s.place}.`);
        set('hud-of', `/${s.cars}`);
        set('hud-lap', `${Math.min(s.laps, Math.max(1, s.lap + 1))}/${s.laps}`);
        set('hud-time', ms(s.time));
        set('hud-best', s.best ? `BESTE ${ms(s.best)}` : '');
        set('hud-speed', String(Math.round(Math.abs(s.speed) * 2.2)));
        set('hud-ammo', String(s.ammo));
        this.el('hud-hp').style.width = `${Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100))}%`;
        this.el('hud-hp').classList.toggle('low', s.hp / s.maxHp < 0.3);
        const speedK = Math.min(1, Math.abs(s.speed) / 75);
        this.speedArc.style.strokeDashoffset = `${this.speedLen * (1 - speedK)}`;
        this.turboArc.style.strokeDashoffset = `${this.turboLen * (1 - s.turbo)}`;
        this.el('hud-turbo-label').classList.toggle('on', s.boosting);
        this.el('hud-turbo-label').classList.toggle('full', s.turbo > 0.98);
        const weaponKey = `${s.special}:${s.specialCount}`;
        if (this.last.weapon !== weaponKey) {
            this.last.weapon = weaponKey;
            this.el('hud-weapon-icon').innerHTML = s.special ? ICONS[s.special] ?? '' : '';
            this.el('hud-weapon-count').textContent = s.special ? `×${s.specialCount}` : '';
            this.el('hud-weapon-name').textContent = s.special ? WEAPON_NAMES[s.special].toUpperCase() : 'KEINE WAFFE';
            this.el('hud-weapon').classList.toggle('armed', !!s.special);
            if (s.special) {
                this.el('hud-weapon').classList.remove('flash');
                void this.el('hud-weapon').offsetWidth;
                this.el('hud-weapon').classList.add('flash');
            }
        }
        const fieldKey = s.field.map(f => `${f.place}${f.name}${f.finished}${f.wrecked}`).join('|');
        if (this.last.field !== fieldKey) {
            this.last.field = fieldKey;
            this.el('hud-field').innerHTML = s.field.map(f =>
                `<li class="${f.me ? 'me' : ''} ${f.wrecked ? 'wrecked' : ''}"><span class="p">${f.place}</span><i style="background:${f.color}"></i><span class="n">${escapeHtml(f.name)}</span>${f.finished ? '<b>🏁</b>' : ''}</li>`).join('');
        }
        // the map
        const ctx = this.mapCtx;
        ctx.clearRect(0, 0, 220, 220);
        ctx.drawImage(this.mapBase, 0, 0);
        for (const d of s.dots) {
            const [x, y] = this.mapTransform(d.x, d.z);
            ctx.beginPath();
            ctx.arc(x, y, d.me ? 7 : 5, 0, Math.PI * 2);
            ctx.fillStyle = d.color;
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#14100c';
            ctx.stroke();
        }
    }

    feed(html) {
        const el = document.createElement('div');
        el.className = 'feed-item comic-box';
        el.innerHTML = html;
        this.el('hud-feed').prepend(el);
        setTimeout(() => el.remove(), 4500);
        const items = this.el('hud-feed').children;
        while (items.length > 5) items[items.length - 1].remove();
    }

    hint(text, life = 2500) {
        const el = this.el('hud-hint');
        el.textContent = text;
        el.classList.add('show');
        clearTimeout(this.hintTimer);
        this.hintTimer = setTimeout(() => el.classList.remove('show'), life);
    }

    hide() {
        this.root.hidden = true;
        this.root.innerHTML = '';
    }
}

export function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export { ms as formatTime };
