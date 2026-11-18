// TurboToys sound: everything is synthesized with WebAudio (no sample files, every buffer is generated in code).
//  - procedural buffers: white/pink/brown noise, a smooth random "jitter" signal, impulse responses (rooms, garden, tunnel),
//    wavetables (PeriodicWave) for the motors, all built once per sample rate;
//  - one-shot effects are rendered once (some in a few random variants) into AudioBuffers with an OfflineAudioContext,
//    normalized to a per-sound peak and played through gain (+ lowpass for far sounds) + stereo panner;
//  - engines are persistent node graphs per car (motor wavetables, jitter, road rumble, skid, wind, turbo whistle);
//    update() only moves AudioParams (no node creation per frame), events (crackle, blow-off, landing) play cached buffers;
//  - a shared reverb (convolver with a generated impulse response) for the world sounds and engines: setSpace() crossfades;
//  - the music is a small look-ahead step sequencer (pre-rendered drum kit, bass, stabs, arpeggio, pad, lead) with two moods.
// Graph: [ui | sfx | engines | music | reverb] -> master (volume, on/off) -> compressor -> soft safety clipper -> destination.

const STORE = 'turbotoys.sound';
const DRIVES = ['Electric', 'Gas', 'Turbo'];
/** Speed of sound for the Doppler effect in world units/s (exaggerated: the real one, 3430, would be inaudible at toy speeds). */
const DOPPLER_C = 700;

// ---------------------------------------------------------------- settings

function loadSettings() {
    const s = { on: true, volume: 0.8, music: 0.5 };
    try {
        const v = JSON.parse(localStorage.getItem(STORE) ?? 'null');
        if (v && typeof v === 'object') {
            if (typeof v.on === 'boolean') s.on = v.on;
            if (Number.isFinite(v.volume)) s.volume = clamp01(v.volume);
            if (Number.isFinite(v.music)) s.music = clamp01(v.music);
        }
    } catch { /* private mode or broken JSON: defaults */ }
    return s;
}

function saveSettings() {
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* ignore */ }
}

const settings = loadSettings();

// ---------------------------------------------------------------- small helpers

function clamp01(v) { return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0; }
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
/** Number from a number or boolean (physics flags may be booleans), NaN → 0. */
function num(v) { const n = typeof v === 'boolean' ? +v : Number(v); return Number.isFinite(n) ? n : 0; }
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

/** Distance (world units, 1 unit = 10 cm) → gain factor. Full volume up to 12 units, then a soft 1/d roll-off. */
function falloff(d) {
    if (!Number.isFinite(d) || d <= 12) return 1;
    const g = 1 / (1 + (d - 12) / 30);
    return g < 0.02 ? 0 : g;
}

/** Air absorption: lowpass cutoff for a source at distance d (0 = no filter needed). */
function airCutoff(d) {
    if (!Number.isFinite(d) || d <= 20) return 0;
    return clamp(18000 / (1 + (d - 20) / 22), 1400, 18000);
}

/** Stereo pan for a source at (dx, dz) from the listener (three.js yaw: right vector = (cos yaw, -sin yaw)). */
function panFor(dx, dz, d) {
    if (d <= 0.5) return 0;
    return clamp(((dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / d) * 0.8, -0.8, 0.8) * Math.min(1, d / 10);
}

// ---------------------------------------------------------------- procedural buffers (shared per sample rate)

const bufferCache = new Map();
/**
 * Looping mono buffers: 'white' | 'pink' | 'brown' noise (2 s) and 'jitter' (4 s of smooth random, ±1, ~20 Hz with a faster layer).
 * Pink/brown are cross-faded at the loop point (no click), jitter is periodic by construction.
 */
function procBuffer(kind, sampleRate) {
    const key = `${kind}@${sampleRate}`;
    let b = bufferCache.get(key);
    if (b) return b;
    const len = Math.floor(sampleRate * (kind === 'jitter' ? 4 : 2));
    b = new AudioBuffer({ length: len, sampleRate, numberOfChannels: 1 });
    const d = b.getChannelData(0);
    if (kind === 'jitter') {
        const layer = (K, amp) => {
            const knots = Array.from({ length: K }, () => Math.random() * 2 - 1);
            for (let i = 0; i < len; i++) {
                const p = (i / len) * K, k = Math.floor(p), fr = p - k;
                const a = knots[k % K], c = knots[(k + 1) % K];
                d[i] += amp * (a + (c - a) * (1 - Math.cos(fr * Math.PI)) / 2);
            }
        };
        layer(80, 1);
        layer(420, 0.35);
    } else if (kind === 'white') {
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else {
        const fade = Math.floor(sampleRate * 0.05);
        const x = new Float32Array(len + fade);
        let b0 = 0, b1 = 0, b2 = 0, last = 0;
        for (let i = 0; i < x.length; i++) {
            const w = Math.random() * 2 - 1;
            if (kind === 'pink') {
                // Paul Kellet's economy pink filter
                b0 = 0.99765 * b0 + w * 0.0990460;
                b1 = 0.96300 * b1 + w * 0.2965164;
                b2 = 0.57000 * b2 + w * 1.0526913;
                x[i] = b0 + b1 + b2 + w * 0.1848;
            } else {
                last = (last + 0.02 * w) / 1.02;
                x[i] = last;
            }
        }
        let mean = 0;
        for (let i = 0; i < x.length; i++) mean += x[i];
        mean /= x.length;
        for (let i = 0; i < len; i++) d[i] = x[i] - mean;
        // loop cross-fade: the start blends from the overhang, so d[len-1] → d[0] is continuous
        for (let i = 0; i < fade; i++) d[i] = (x[i] - mean) * (i / fade) + (x[len + i] - mean) * (1 - i / fade);
    }
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;
    bufferCache.set(key, b);
    return b;
}

// ---------------------------------------------------------------- wavetables

/** Fourier coefficients of one period of fn(t), t in [0, 1). */
function waveFromShape(fn, harmonics = 64, n = 1024) {
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = fn(i / n);
    const re = new Float32Array(harmonics + 1), im = new Float32Array(harmonics + 1);
    for (let k = 1; k <= harmonics; k++) {
        let a = 0, b = 0;
        for (let i = 0; i < n; i++) {
            const ph = (2 * Math.PI * k * i) / n;
            a += x[i] * Math.cos(ph);
            b += x[i] * Math.sin(ph);
        }
        re[k] = (2 * a) / n;
        im[k] = (2 * b) / n;
    }
    return [re, im];
}

const WAVE_DEFS = {
    // the chiptune lead: a 25 % pulse
    pulse25() {
        const n = 40, re = new Float32Array(n), im = new Float32Array(n);
        for (let i = 1; i < n; i++) re[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * 0.25);
        return [re, im];
    },
    // brushless motor: strong fundamental, falling harmonics with a few phase-shifted ones (a bit nasal)
    motor() {
        const h = [0, 1, 0.5, 0.34, 0.2, 0.09, 0.13, 0.04, 0.06, 0.02, 0.03, 0.01, 0.015];
        const re = new Float32Array(h.length), im = new Float32Array(h);
        re[3] = 0.16; re[5] = 0.08; re[6] = -0.05;
        return [re, im];
    },
    // nitro 2-stroke: a sharp exhaust pulse that rings and decays within the firing period (buzzy, raspy)
    nitro: () => waveFromShape(t => Math.exp(-9 * t) * Math.sin(2 * Math.PI * 2.2 * t) + 0.5 * Math.exp(-35 * t), 64),
    // turbo engine: two uneven firings per period (a lumpy, loping V-twin-ish rhythm)
    lumpy: () => {
        const p = u => Math.exp(-12 * u) * Math.sin(2 * Math.PI * 1.6 * u) + 0.4 * Math.exp(-30 * u);
        return waveFromShape(t => p(t) + 0.72 * p((t + 1 - 0.43) % 1), 48);
    },
};
const waveCoeffs = new Map();
const waveCache = new WeakMap();
/** A PeriodicWave per context and name (normalized by WebAudio to a peak of 1, band-limited). */
function wave(c, name) {
    let m = waveCache.get(c);
    if (!m) waveCache.set(c, (m = new Map()));
    let w = m.get(name);
    if (!w) {
        let co = waveCoeffs.get(name);
        if (!co) waveCoeffs.set(name, (co = WAVE_DEFS[name]()));
        w = c.createPeriodicWave(co[0], co[1]);
        m.set(name, w);
    }
    return w;
}

let softClipCurve = null;
/** A soft-clipping waveshaper curve (shared). */
function softClip() {
    if (!softClipCurve) {
        softClipCurve = new Float32Array(1024);
        const k = 3;
        for (let i = 0; i < 1024; i++) {
            const x = (i / 1023) * 2 - 1;
            softClipCurve[i] = Math.tanh(k * x) / Math.tanh(k);
        }
    }
    return softClipCurve;
}

/** Safety clipper after the compressor: linear up to 0.85, then a smooth knee that never exceeds 0.99 (input pre-scaled by 0.5). */
function limiterCurve() {
    const n = 4096, curve = new Float32Array(n), knee = 0.85, top = 0.99;
    for (let i = 0; i < n; i++) {
        const x = ((i / (n - 1)) * 2 - 1) * 2;
        const a = Math.abs(x);
        const y = a <= knee ? a : knee + (top - knee) * Math.tanh((a - knee) / (top - knee));
        curve[i] = Math.sign(x) * y;
    }
    return curve;
}

// ---------------------------------------------------------------- impulse responses (generated)

// len/decay (RT60) in s, pre-delay, attack of the diffuse tail, bright = initial tail cutoff (Hz), damp = how fast the tail darkens,
// early = discrete reflections [time s, amplitude relative to a unit-energy tail], slap = repeating echo (tunnel flutter).
const IRS = {
    room: { len: 0.9, decay: 0.55, pre: 0.004, attack: 0.012, bright: 7000, damp: 6, early: [[0.007, 0.28], [0.011, 0.22], [0.017, 0.2], [0.023, 0.16], [0.031, 0.12], [0.04, 0.09]] },
    kidsroom: { len: 0.75, decay: 0.42, pre: 0.003, attack: 0.01, bright: 5200, damp: 7, early: [[0.006, 0.24], [0.01, 0.2], [0.015, 0.16], [0.022, 0.12], [0.03, 0.08]] },
    kitchen: { len: 1.0, decay: 0.72, pre: 0.003, attack: 0.008, bright: 9500, damp: 4, early: [[0.005, 0.34], [0.009, 0.28], [0.014, 0.25], [0.021, 0.2], [0.028, 0.16], [0.036, 0.12]] },
    workshop: { len: 1.05, decay: 0.78, pre: 0.004, attack: 0.012, bright: 8000, damp: 4.5, early: [[0.008, 0.3], [0.013, 0.24], [0.02, 0.22], [0.029, 0.18], [0.04, 0.14]] },
    supermarket: { len: 1.9, decay: 1.45, pre: 0.01, attack: 0.03, bright: 6500, damp: 2.8, early: [[0.014, 0.26], [0.023, 0.22], [0.038, 0.2], [0.055, 0.16], [0.08, 0.12]] },
    attic: { len: 0.9, decay: 0.6, pre: 0.004, attack: 0.012, bright: 4800, damp: 6, early: [[0.006, 0.28], [0.01, 0.24], [0.016, 0.2], [0.025, 0.15]] },
    open: { len: 1.3, decay: 1.0, pre: 0.002, attack: 0.06, bright: 3800, damp: 5, early: [[0.004, 0.32], [0.085, 0.3], [0.14, 0.2], [0.23, 0.12]] },
    tunnel: { len: 0.9, decay: 0.6, pre: 0.001, attack: 0.004, bright: 3200, damp: 3, early: [[0.003, 0.6], [0.006, 0.5], [0.009, 0.42]], slap: { t: 0.026, g: 0.72, fb: 0.6, n: 12 } },
    // the music's plate and the jingles' small hall
    plate: { len: 1.4, decay: 1.1, pre: 0.008, attack: 0.004, bright: 9000, damp: 2.5, early: [] },
    hall: { len: 1.6, decay: 1.3, pre: 0.012, attack: 0.02, bright: 7000, damp: 2.5, early: [[0.017, 0.2], [0.029, 0.16]] },
};

const irCache = new Map();
/** A stereo impulse response (decorrelated channels), normalized to unit energy per channel. */
function impulse(sampleRate, key) {
    const ck = `${key}@${sampleRate}`;
    let b = irCache.get(ck);
    if (b) return b;
    const p = IRS[key] ?? IRS.room;
    const n = Math.max(2, Math.floor(p.len * sampleRate));
    b = new AudioBuffer({ length: n, sampleRate, numberOfChannels: 2 });
    const chans = [b.getChannelData(0), b.getChannelData(1)];
    const pre = Math.floor(p.pre * sampleRate);
    const energy = () => chans.reduce((s, d) => s + d.reduce((a, v) => a + v * v, 0), 0) / 2;
    const scale = k => { for (const d of chans) for (let i = 0; i < n; i++) d[i] *= k; };
    // diffuse tail: noise through a lowpass that closes over time (high frequencies die first)
    for (const d of chans) {
        let lp = 0;
        for (let i = pre; i < n; i++) {
            const t = (i - pre) / sampleRate;
            const fc = 250 + p.bright * Math.exp(-t * p.damp);
            const a = 1 - Math.exp((-2 * Math.PI * fc) / sampleRate);
            lp += a * (Math.random() * 2 - 1 - lp);
            d[i] = lp * Math.exp((-6.91 * t) / p.decay) * Math.min(1, t / p.attack);
        }
    }
    scale(1 / Math.sqrt(energy() || 1));
    // discrete reflections (slightly different per channel), smeared over 3 samples; amplitude g ≈ energy share g²
    const tap = (t, g) => chans.forEach((d, ch) => {
        const i = Math.floor((t + (ch ? 1 : -1) * rand(0.0002, 0.0012)) * sampleRate);
        if (i < 1 || i >= n - 1) return;
        d[i - 1] += g * 0.41;
        d[i] += g * 0.82;
        d[i + 1] += g * 0.41;
    });
    for (const [t, g] of p.early) tap(t, g);
    if (p.slap) for (let k = 0; k < p.slap.n; k++) tap(p.slap.t * (k + 1), p.slap.g * Math.pow(p.slap.fb, k));
    // fade out the last 5 %
    const f = Math.floor(n * 0.05);
    for (const d of chans) for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f;
    scale(1 / Math.sqrt(energy() || 1));
    irCache.set(ck, b);
    return b;
}

// world spaces: impulse response, reverb sends (sfx, engines), engine low boost (dB) and engine loudness
const SPACES = {
    none: { ir: null, sfx: 0, eng: 0, bass: 0, loud: 1 },
    room: { ir: 'room', sfx: 0.22, eng: 0.07, bass: 0, loud: 1 },
    kidsroom: { ir: 'kidsroom', sfx: 0.2, eng: 0.06, bass: 0, loud: 1 },
    kitchen: { ir: 'kitchen', sfx: 0.26, eng: 0.09, bass: 0, loud: 1 },
    workshop: { ir: 'workshop', sfx: 0.25, eng: 0.08, bass: 0, loud: 1 },
    supermarket: { ir: 'supermarket', sfx: 0.26, eng: 0.08, bass: 0, loud: 1 },
    attic: { ir: 'attic', sfx: 0.22, eng: 0.08, bass: 0, loud: 1 },
    open: { ir: 'open', sfx: 0.16, eng: 0.03, bass: 0, loud: 1 },
    garden: { ir: 'open', sfx: 0.16, eng: 0.03, bass: 0, loud: 1 },
    tunnel: { ir: 'tunnel', sfx: 0.42, eng: 0.42, bass: 6, loud: 1.3 },
};

// ---------------------------------------------------------------- synthesis building blocks (work on any BaseAudioContext)

/** A gain envelope: 0 → peak (attack a) → hold h → exponential decay d. */
function envGain(c, out, t, a, peak, d, h = 0) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (h > 0) g.gain.setValueAtTime(peak, t + a + h);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + h + d);
    g.connect(out);
    return g;
}

/** An oscillator note with optional pitch glide f → f1 and optional filter. */
function tone(c, out, { type = 'sine', wave: w = null, f = 440, f1 = 0, glide = 0, t = 0, a = 0.004, h = 0, d = 0.2, v = 0.5, detune = 0, filter = null, fq = 1, ff = 0, ff1 = 0 }) {
    const o = c.createOscillator();
    if (w) o.setPeriodicWave(w); else o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || a + h + d));
    if (detune) o.detune.value = detune;
    const g = envGain(c, out, t, a, v, d, h);
    if (filter) {
        const fl = c.createBiquadFilter();
        fl.type = filter;
        fl.Q.value = fq;
        fl.frequency.setValueAtTime(ff, t);
        if (ff1) fl.frequency.exponentialRampToValueAtTime(ff1, t + a + h + d);
        o.connect(fl).connect(g);
    } else {
        o.connect(g);
    }
    o.start(t);
    o.stop(t + a + h + d + 0.05);
    return o;
}

/**
 * Filtered noise burst with optional filter sweep f → f1 (type null = unfiltered).
 * Band-/lowpassed white noise is roughly compensated for its bandwidth, so v means about the same loudness as a broadband burst.
 */
function noise(c, out, { type = 'bandpass', color = 'white', f = 1000, f1 = 0, glide = 0, q = 1, t = 0, a = 0.002, h = 0, d = 0.2, v = 0.5 }) {
    const s = c.createBufferSource();
    s.buffer = procBuffer(color, c.sampleRate);
    s.loop = true;
    let gain = v;
    if (color === 'white' && (type === 'bandpass' || type === 'lowpass')) {
        const bw = type === 'bandpass' ? f / Math.max(0.3, q) : f;
        gain *= clamp(Math.sqrt(c.sampleRate / 2 / bw) * 0.35, 1, 6);
    }
    const env = envGain(c, out, t, a, gain, d, h);
    if (type) {
        const fl = c.createBiquadFilter();
        fl.type = type;
        fl.Q.value = q;
        fl.frequency.setValueAtTime(f, t);
        if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + (glide || a + h + d));
        s.connect(fl).connect(env);
    } else {
        s.connect(env);
    }
    s.start(t, Math.random() * 1.5);
    s.stop(t + a + h + d + 0.05);
    return s;
}

/** A soft-clipping stage into out; returns its input (with a drive gain when drive ≠ 1). */
function shaperTo(c, out, drive = 1) {
    const sh = c.createWaveShaper();
    sh.curve = softClip();
    sh.oversample = '2x';
    sh.connect(out);
    if (drive === 1) return sh;
    const g = c.createGain();
    g.gain.value = drive;
    g.connect(sh);
    return g;
}

/** An LFO (oscillator → gain) connected to an AudioParam. */
function lfo(c, param, { type = 'sine', f = 5, depth = 10, t = 0, dur = 1 }) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = c.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start(t);
    o.stop(t + dur);
    return o;
}

/** A smooth random modulation (the jitter buffer, sped up by rate) connected to an AudioParam. */
function wobble(c, param, { rate = 1, depth = 10, t = 0, dur = 1 }) {
    const s = c.createBufferSource();
    s.buffer = procBuffer('jitter', c.sampleRate);
    s.loop = true;
    s.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = depth;
    s.connect(g).connect(param);
    s.start(t, Math.random() * 3.5);
    s.stop(t + dur);
}

/** Debris crackle: short bright ticks, dense at first and thinning out. */
function crackle(c, out, { count = 12, from = 0.1, to = 1, v = 0.5 }) {
    for (let i = 0; i < count; i++) {
        const t = from + (to - from) * Math.pow(Math.random(), 1.7);
        const fade = 1 - ((t - from) / (to - from)) * 0.75;
        noise(c, out, { type: 'bandpass', f: rand(1500, 6000), q: rand(0.8, 2), t, a: 0.0005, d: rand(0.006, 0.03), v: v * fade * rand(0.4, 1) });
    }
}

/** A struck object: a few inharmonic sine partials (plastic, metal); higher partials decay faster. */
function modal(c, out, { f, t = 0, ratios = [1, 2.32, 4.25], gains = [1, 0.5, 0.3], d = 0.12, v = 0.4 }) {
    ratios.forEach((r, i) => { if (f * r < c.sampleRate * 0.45) tone(c, out, { f: f * r, t, a: 0.0008, d: d / (1 + i * 0.6), v: v * (gains[i] ?? 0.25) }); });
}

/** Bell partials (cash register, chimes). */
function bell(c, out, { f, t = 0, d = 0.6, v = 0.3 }) {
    for (const [r, g] of [[1, 1], [2, 0.4], [2.76, 0.25], [5.4, 0.12]]) if (f * r < c.sampleRate * 0.45) tone(c, out, { f: f * r, t, a: 0.001, d: d / Math.sqrt(r), v: v * g });
}

/** A small coin "ting". */
function coin(c, out, { t = 0, v = 0.15 }) {
    modal(c, out, { f: rand(3800, 5200), t, ratios: [1, 1.34, 2.15, 2.9], gains: [1, 0.7, 0.5, 0.3], d: rand(0.08, 0.2), v });
}

/** A hard hit: a transient click, a short mid crack and a body thump with falling pitch. */
function impact(c, out, { t = 0, f = 160, body = 1, click = 0.5, d = 0.12 }) {
    noise(c, out, { type: 'highpass', f: 2500, t, a: 0.0004, d: 0.006, v: click });
    noise(c, out, { type: 'bandpass', f: f * 6, q: 1.2, t, a: 0.0006, d: d * 0.4, v: click * 0.8 });
    tone(c, out, { f, f1: f * 0.45, glide: d, t, a: 0.001, d, v: body });
}

/** Loose plastic bits: a burst of short, irregular ticks with hollow resonances. */
function rattle(c, out, { t = 0, n = 6, spread = 0.12, v = 0.3, lo = 1400, hi = 4200 }) {
    let tt = t;
    for (let i = 0; i < n; i++) {
        tt += (rand(0.25, 1.75) * spread) / n;
        const g = v * Math.pow(1 - i / n, 0.7) * rand(0.5, 1);
        const f = rand(lo, hi);
        noise(c, out, { type: 'bandpass', f, q: rand(3, 8), t: tt, a: 0.0005, d: rand(0.008, 0.025), v: g });
        if (Math.random() < 0.4) tone(c, out, { f: f * rand(0.4, 0.6), t: tt, a: 0.0008, d: rand(0.01, 0.03), v: g * 0.5 });
    }
}

/** A water bubble: a sine with a quickly rising pitch. */
function bubble(c, out, { t = 0, f = 400, d = 0.05, v = 0.3 }) {
    tone(c, out, { f, f1: f * rand(2, 2.8), glide: d, t, a: 0.002, d, v });
}

/** Brass-ish fanfare note: three detuned saws with a pitch scoop through a lowpass that "blats" open. */
function brass(c, out, { m, t, d, v = 0.35, vib = 0 }) {
    const f = mtof(m);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(f * 2, t);
    lp.frequency.linearRampToValueAtTime(Math.min(9000, f * 9), t + 0.04);
    lp.frequency.exponentialRampToValueAtTime(Math.min(6000, f * 5), t + 0.18);
    lp.connect(envGain(c, out, t, 0.025, v, d * 0.4 + 0.1, d * 0.6));
    for (const det of [-9, 0, 9]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.985, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
        o.detune.value = det;
        const g = c.createGain();
        g.gain.value = 0.4;
        o.connect(g).connect(lp);
        if (vib) lfo(c, o.frequency, { f: 5.5, depth: f * 0.012 * vib, t: t + 0.15, dur: d + 0.3 });
        o.start(t);
        o.stop(t + d + 0.6);
    }
}

function chip(c, out, { m, t, d, v = 0.3 }) {
    tone(c, out, { wave: wave(c, 'pulse25'), f: mtof(m), t, a: 0.003, h: d * 0.5, d: d * 0.5 + 0.04, v });
}

// drums (used by the music kit and the jingles)
function kick(c, out, t, v = 1) {
    const sh = shaperTo(c, out, 1.15);
    tone(c, sh, { f: 160, f1: 48, glide: 0.08, t, a: 0.001, d: 0.24, v });
    noise(c, out, { type: 'highpass', f: 3500, t, a: 0.0005, d: 0.006, v: v * 0.3 });
    tone(c, out, { type: 'triangle', f: 900, f1: 250, glide: 0.012, t, a: 0.0005, d: 0.014, v: v * 0.25 });
}
function snare(c, out, t, v = 1) {
    tone(c, out, { type: 'triangle', f: 190, f1: 160, t, a: 0.001, d: 0.09, v: v * 0.45 });
    tone(c, out, { f: 330, f1: 290, t, a: 0.001, d: 0.06, v: v * 0.25 });
    noise(c, out, { type: 'bandpass', f: 2200, q: 0.7, t, a: 0.001, d: 0.14, v: v * 0.5 });
    noise(c, out, { type: 'highpass', f: 5000, t, a: 0.001, d: 0.1, v: v * 0.3 });
}
function clap(c, out, t, v = 1) {
    for (let i = 0; i < 3; i++) noise(c, out, { type: 'bandpass', f: 1300, q: 1.4, t: t + i * 0.011, a: 0.0008, d: 0.012, v: v * 0.6 });
    noise(c, out, { type: 'bandpass', f: 1200, q: 1.2, t: t + 0.033, a: 0.001, d: 0.13, v: v * 0.6 });
}
/** Metallic noise: six square oscillators at inharmonic ratios (the classic drum machine hat) through a highpass. */
function metal(c, out, t, d, v, hp = 7000) {
    const fl = c.createBiquadFilter();
    fl.type = 'highpass';
    fl.frequency.value = hp;
    fl.Q.value = 0.7;
    fl.connect(envGain(c, out, t, 0.001, v, d));
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
        const o = c.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        const g = c.createGain();
        g.gain.value = 0.18;
        o.connect(g).connect(fl);
        o.start(t);
        o.stop(t + d + 0.05);
    }
}
function hat(c, out, t, v = 1, open = false) {
    metal(c, out, t, open ? 0.3 : 0.045, v * 0.5);
    noise(c, out, { type: 'highpass', f: 8000, t, a: 0.001, d: open ? 0.22 : 0.03, v: v * 0.2 });
}
function tom(c, out, t, v = 1, f = 180) {
    tone(c, out, { f, f1: f * 0.6, t, a: 0.002, d: 0.2, v: v * 0.7 });
    noise(c, out, { type: 'lowpass', f: 1500, t, a: 0.001, d: 0.05, v: v * 0.2 });
}
function cymbal(c, out, t, v = 1, d = 1.2) {
    metal(c, out, t, d, v * 0.5, 5000);
    noise(c, out, { type: 'highpass', f: 6000, q: 0.5, t, a: 0.002, d, v: v * 0.3 });
    noise(c, out, { type: 'bandpass', f: 9000, q: 1.2, t, a: 0.002, d: d * 0.6, v: v * 0.15 });
}

// ---------------------------------------------------------------- one-shot sound definitions
// fn(c, out, variant) builds the sound at t ≈ 0 in context c; dur = render length; peak = normalized peak of the buffer;
// ui = dry (no world reverb, no distance); variants = number of random renders (picked at random, never twice in a row);
// verb = amount of a built-in small hall (jingles).

function explosionCore(c, out, big = true) {
    const sh = shaperTo(c, out);
    // crack
    noise(c, out, { type: 'highpass', f: 1200, t: 0.002, a: 0.0005, d: 0.02, v: 0.9 });
    // sub boom
    tone(c, sh, { f: big ? 90 : 140, f1: big ? 28 : 45, glide: big ? 0.6 : 0.3, t: 0.002, a: 0.003, d: big ? 1.1 : 0.45, v: 1 });
    // body: pink rumble sweeping darker
    noise(c, sh, { type: 'lowpass', color: 'pink', f: big ? 5000 : 4000, f1: big ? 160 : 300, glide: big ? 1.0 : 0.45, q: 0.7, t: 0.002, a: 0.002, d: big ? 1.7 : 0.6, v: 0.9 });
    // mid "whomp"
    noise(c, sh, { type: 'bandpass', f: 380, q: 0.9, t: 0.002, a: 0.004, d: big ? 0.35 : 0.18, v: 0.7 });
    // rolling rumble tail
    if (big) noise(c, out, { type: 'lowpass', color: 'brown', f: 220, t: 0.05, a: 0.08, h: 0.2, d: 1.6, v: 0.5 });
    // debris: crackle that thins out + plastic shards landing
    crackle(c, out, { count: big ? 34 : 10, from: 0.05, to: big ? 1.7 : 0.6, v: big ? 0.5 : 0.4 });
    for (let i = 0; i < (big ? 9 : 3); i++) modal(c, out, { f: rand(1500, 3800), t: rand(0.3, big ? 1.8 : 0.7), ratios: [1, 2.4, 3.9], d: rand(0.03, 0.08), v: rand(0.06, 0.14) });
}

const SOUNDS = {
    // ---- menu
    click: { dur: 0.09, peak: 0.42, ui: true, fn(c, o) {
        // a toy plastic "tock": woodblock-ish partials + a tiny click
        tone(c, o, { f: 1350, f1: 1150, t: 0.001, a: 0.0008, d: 0.045, v: 0.6 });
        tone(c, o, { f: 1350 * 2.71, t: 0.001, a: 0.0005, d: 0.015, v: 0.18 });
        tone(c, o, { type: 'triangle', f: 420, f1: 300, t: 0.001, a: 0.001, d: 0.03, v: 0.25 });
        noise(c, o, { type: 'highpass', f: 5000, t: 0.001, a: 0.0005, d: 0.006, v: 0.35 });
    } },
    hover: { dur: 0.05, peak: 0.12, ui: true, fn(c, o) {
        tone(c, o, { f: 2400, f1: 2700, t: 0.001, a: 0.002, d: 0.025, v: 0.5 });
        tone(c, o, { f: 4800, t: 0.001, a: 0.001, d: 0.01, v: 0.12 });
    } },
    error: { dur: 0.45, peak: 0.28, ui: true, fn(c, o) {
        // "uh-oh": two falling buzzy notes
        for (const [t, h, f, f1] of [[0.002, 0.12, 311, 294], [0.16, 0.2, 233, 220]]) {
            for (const det of [-8, 8]) tone(c, o, { type: 'square', f, f1, glide: h, t, a: 0.006, h, d: 0.06, v: 0.32, detune: det, filter: 'lowpass', ff: 1800, ff1: 900 });
        }
    } },
    buy: { dur: 1.3, peak: 0.65, ui: true, fn(c, o) {
        // cash register: a mechanical clack, the drawer, a bright "ka-ching" and a few coins
        noise(c, o, { type: 'bandpass', f: 2600, q: 1.2, t: 0.002, a: 0.001, d: 0.03, v: 0.7 });
        tone(c, o, { f: 180, f1: 90, t: 0.002, a: 0.001, d: 0.05, v: 0.4 });
        noise(c, o, { type: 'bandpass', f: 900, q: 0.8, t: 0.03, a: 0.01, d: 0.08, v: 0.35 });
        bell(c, o, { f: 2093, t: 0.1, d: 0.9, v: 0.35 });
        bell(c, o, { f: 2637, t: 0.17, d: 1.0, v: 0.35 });
        for (let i = 0; i < 5; i++) coin(c, o, { t: 0.2 + i * 0.06 + rand(0, 0.03), v: 0.12 });
    } },
    money: { dur: 1.2, peak: 0.55, ui: true, verb: 0.15, fn(c, o) {
        // a shower of coins (prize money)
        for (let i = 0; i < 12; i++) coin(c, o, { t: 0.002 + i * 0.055 + rand(0, 0.03), v: rand(0.1, 0.2) * (1 - i / 16) });
        bell(c, o, { f: 2637, t: 0.002, d: 0.8, v: 0.25 });
    } },
    upgrade: { dur: 1.1, peak: 0.5, ui: true, verb: 0.2, fn(c, o) {
        tone(c, o, { type: 'square', f: 300, f1: 1200, glide: 0.5, t: 0.002, a: 0.02, d: 0.5, v: 0.22, filter: 'lowpass', ff: 2200 });
        noise(c, o, { type: 'bandpass', f: 600, f1: 4000, glide: 0.5, q: 2, t: 0.002, a: 0.05, d: 0.45, v: 0.12 });
        [72, 76, 79, 84, 88].forEach((m, i) => chip(c, o, { m, t: 0.08 + i * 0.08, d: i === 4 ? 0.35 : 0.07, v: 0.3 }));
        for (let i = 0; i < 6; i++) bell(c, o, { f: rand(2800, 4500), t: 0.45 + i * 0.07, d: 0.15, v: 0.08 });
    } },

    // ---- race events
    countdown: { dur: 0.36, peak: 0.36, ui: true, fn(c, o) {
        tone(c, o, { type: 'square', f: 660, t: 0.002, a: 0.003, h: 0.13, d: 0.12, v: 0.22, filter: 'lowpass', ff: 3500 });
        tone(c, o, { f: 660, t: 0.002, a: 0.003, h: 0.13, d: 0.18, v: 0.45 });
        tone(c, o, { f: 1320, t: 0.002, a: 0.003, h: 0.05, d: 0.1, v: 0.1 });
        tone(c, o, { f: 330, t: 0.002, a: 0.003, h: 0.1, d: 0.1, v: 0.12 });
    } },
    go: { dur: 1.0, peak: 0.5, ui: true, verb: 0.2, fn(c, o) {
        tone(c, o, { type: 'square', f: 1320, t: 0.002, a: 0.003, h: 0.32, d: 0.25, v: 0.2, filter: 'lowpass', ff: 5000 });
        tone(c, o, { f: 1320, t: 0.002, a: 0.003, h: 0.32, d: 0.3, v: 0.4 });
        tone(c, o, { f: 2640, t: 0.002, a: 0.003, h: 0.2, d: 0.2, v: 0.08 });
        // a short brass hit and a splash
        for (const m of [72, 76, 79]) brass(c, o, { m, t: 0.002, d: 0.22, v: 0.06 });
        cymbal(c, o, 0.002, 0.25, 0.7);
    } },
    lap: { dur: 0.9, peak: 0.55, ui: true, verb: 0.25, fn(c, o) {
        [79, 84, 88].forEach((m, i) => {
            const t = 0.002 + i * 0.09, d = i === 2 ? 0.35 : 0.08;
            chip(c, o, { m, t, d, v: 0.26 });
            bell(c, o, { f: mtof(m), t, d: i === 2 ? 0.6 : 0.2, v: 0.16 });
            tone(c, o, { type: 'triangle', f: mtof(m - 12), t, a: 0.003, d: d + 0.05, v: 0.3 });
        });
    } },
    'final-lap': { dur: 1.2, peak: 0.62, ui: true, verb: 0.25, fn(c, o) {
        [88, 91, 88, 91, 96].forEach((m, i) => {
            const d = i === 4 ? 0.45 : 0.055, t = 0.002 + i * 0.08 + (i === 4 ? 0.03 : 0);
            chip(c, o, { m, t, d, v: 0.3 });
            tone(c, o, { type: 'square', f: mtof(m - 24), t, a: 0.003, d: 0.06, v: 0.18, filter: 'lowpass', ff: 1200 });
            snare(c, o, t, 0.25 + i * 0.08);
        });
        const v = tone(c, o, { f: mtof(96), t: 0.37, a: 0.01, h: 0.25, d: 0.2, v: 0.15 });
        lfo(c, v.frequency, { f: 9, depth: 30, t: 0.37, dur: 0.6 });
        bell(c, o, { f: mtof(96), t: 0.37, d: 0.7, v: 0.14 });
    } },
    finish: { dur: 2.2, peak: 0.9, ui: true, verb: 0.3, fn(c, o) {
        [[72, 0, 0.11], [76, 0.13, 0.11], [79, 0.26, 0.11], [84, 0.4, 1.0]].forEach(([m, t, d]) => brass(c, o, { m, t: t + 0.002, d, v: 0.3, vib: d > 0.5 ? 1 : 0 }));
        brass(c, o, { m: 76, t: 0.4, d: 1.0, v: 0.18 });
        brass(c, o, { m: 79, t: 0.4, d: 1.0, v: 0.18 });
        brass(c, o, { m: 60, t: 0.4, d: 1.0, v: 0.16 });
        for (let i = 0; i < 3; i++) snare(c, o, 0.13 + i * 0.13, 0.35);
        kick(c, o, 0.4, 0.8);
        cymbal(c, o, 0.4, 0.8, 1.3);
    } },
    win: { dur: 3.4, peak: 0.9, ui: true, verb: 0.3, fn(c, o) {
        [67, 72, 76, 79].forEach((m, i) => brass(c, o, { m, t: 0.002 + i * 0.1, d: 0.08, v: 0.28 }));
        brass(c, o, { m: 84, t: 0.42, d: 0.22, v: 0.3 });
        snare(c, o, 0.42, 0.6);
        for (const [t, chord, d] of [[0.72, [77, 81, 84], 0.26], [1.02, [79, 83, 86], 0.26], [1.35, [84, 88, 91], 1.4]]) {
            for (const m of chord) brass(c, o, { m, t, d, v: 0.17, vib: d > 1 ? 1 : 0 });
            brass(c, o, { m: chord[0] - 24, t, d, v: 0.2 });
            kick(c, o, t, 0.9);
        }
        for (let i = 0; i < 6; i++) snare(c, o, 1.05 + i * 0.05, 0.25 + i * 0.08);
        cymbal(c, o, 1.35, 1, 1.8);
        for (let i = 0; i < 10; i++) bell(c, o, { f: rand(2500, 4200), t: 1.4 + i * 0.11, d: 0.2, v: 0.08 });
    } },
    lose: { dur: 2.6, peak: 0.5, ui: true, verb: 0.2, fn(c, o) {
        // "wah wah wah waaah": a trombone-ish saw with a wah filter per note
        [[67, 0, 0.36], [66, 0.45, 0.36], [65, 0.9, 0.36], [64, 1.35, 0.95]].forEach(([m, t, d]) => {
            t += 0.002;
            const f = mtof(m - 12);
            const lp = c.createBiquadFilter();
            lp.type = 'lowpass';
            lp.Q.value = 6;
            lp.frequency.setValueAtTime(280, t);
            lp.frequency.exponentialRampToValueAtTime(1500, t + 0.12);
            lp.frequency.exponentialRampToValueAtTime(380, t + d);
            lp.connect(envGain(c, o, t, 0.03, 0.7, 0.12, d - 0.1));
            for (const det of [-6, 6]) {
                const osc = c.createOscillator();
                osc.type = 'sawtooth';
                osc.detune.value = det;
                osc.frequency.setValueAtTime(f * 1.02, t);
                osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);
                if (d > 0.5) lfo(c, osc.frequency, { f: 6, depth: f * 0.03, t: t + 0.2, dur: d });
                osc.connect(lp);
                osc.start(t);
                osc.stop(t + d + 0.2);
            }
        });
    } },
    pickup: { dur: 0.65, peak: 0.6, ui: true, fn(c, o) {
        // the crate pops open and a bright two-note chime
        noise(c, o, { type: 'bandpass', f: 900, q: 1.2, t: 0.002, a: 0.001, d: 0.05, v: 0.5 });
        tone(c, o, { f: 260, f1: 140, t: 0.002, a: 0.001, d: 0.06, v: 0.4 });
        tone(c, o, { type: 'square', f: 988, t: 0.05, a: 0.002, d: 0.07, v: 0.16, filter: 'lowpass', ff: 4000 });
        tone(c, o, { type: 'square', f: 1319, t: 0.11, a: 0.002, d: 0.25, v: 0.16, filter: 'lowpass', ff: 4000 });
        bell(c, o, { f: 1319, t: 0.05, d: 0.35, v: 0.3 });
        bell(c, o, { f: 1976, t: 0.11, d: 0.45, v: 0.3 });
    } },
    repair: { dur: 1.0, peak: 0.55, ui: true, fn(c, o) {
        // a ratchet, a wrench clink and a rising arpeggio
        for (let i = 0; i < 5; i++) {
            const t = 0.002 + i * 0.055;
            noise(c, o, { type: 'bandpass', f: 3200, q: 5, t, a: 0.0005, d: 0.012, v: 0.6 });
            tone(c, o, { type: 'triangle', f: 1700, t, a: 0.0005, d: 0.01, v: 0.18 });
        }
        modal(c, o, { f: 2300, t: 0.3, ratios: [1, 2.76, 5.4], d: 0.25, v: 0.2 });
        [72, 76, 79, 84].forEach((m, i) => {
            tone(c, o, { type: 'triangle', f: mtof(m), t: 0.32 + i * 0.07, a: 0.003, d: 0.22, v: 0.35 });
            chip(c, o, { m: m + 12, t: 0.32 + i * 0.07, d: 0.08, v: 0.1 });
        });
    } },

    // ---- weapons
    mg: { dur: 0.13, peak: 0.36, variants: 3, fn(c, o) {
        // snappy toy gun: crack + plastic pop + thump + a tiny "zip", then the bolt clicks
        const sh = shaperTo(c, o);
        noise(c, sh, { type: 'highpass', f: 2500, t: 0.001, a: 0.0004, d: 0.012, v: 1 });
        noise(c, sh, { type: 'bandpass', f: rand(700, 900), q: 1.4, t: 0.001, a: 0.0008, d: 0.045, v: 0.8 });
        tone(c, sh, { f: rand(190, 230), f1: 90, t: 0.001, a: 0.001, d: 0.04, v: 0.7 });
        tone(c, o, { type: 'square', f: rand(1500, 1800), f1: 400, glide: 0.03, t: 0.001, a: 0.0005, d: 0.025, v: 0.18, filter: 'lowpass', ff: 4000 });
        noise(c, o, { type: 'bandpass', f: rand(3200, 4200), q: 4, t: 0.045, a: 0.0005, d: 0.01, v: 0.25 });
        tone(c, o, { f: rand(2600, 3000), t: 0.045, a: 0.0005, d: 0.012, v: 0.1 });
    } },
    rocket: { dur: 1.3, peak: 0.7, fn(c, o) {
        // ignition pop, then a rough roaring motor sweeping up and away
        noise(c, o, { type: 'highpass', f: 1500, t: 0.002, a: 0.001, d: 0.03, v: 0.8 });
        tone(c, o, { f: 140, f1: 60, t: 0.002, a: 0.002, d: 0.12, v: 0.8 });
        const am = c.createGain();
        am.gain.value = 0.65;
        am.connect(o);
        wobble(c, am.gain, { rate: 9, depth: 0.35, t: 0, dur: 1.3 });
        noise(c, am, { type: 'bandpass', color: 'pink', f: 500, f1: 2600, glide: 0.35, q: 0.9, t: 0.01, a: 0.06, h: 0.15, d: 0.95, v: 1 });
        noise(c, am, { type: 'highpass', f: 3500, t: 0.01, a: 0.05, h: 0.1, d: 0.7, v: 0.35 });
        tone(c, am, { type: 'sawtooth', f: 110, f1: 70, t: 0.01, a: 0.03, h: 0.1, d: 0.8, v: 0.3, filter: 'lowpass', ff: 600 });
        tone(c, o, { f: 2200, f1: 1300, t: 0.05, a: 0.05, h: 0.2, d: 0.7, v: 0.07 });
    } },
    explosion: { dur: 2.4, peak: 0.95, variants: 2, fn(c, o) { explosionCore(c, o, true); } },
    'small-explosion': { dur: 0.85, peak: 0.75, variants: 2, fn(c, o) { explosionCore(c, o, false); } },
    'mine-drop': { dur: 0.7, peak: 0.75, fn(c, o) {
        // a heavy plastic puck hits the floor, rattles, clicks and arms itself (beep-beep)
        impact(c, o, { t: 0.002, f: 170, body: 0.9, click: 0.5 });
        modal(c, o, { f: 520, t: 0.002, ratios: [1, 1.71, 2.62], d: 0.09, v: 0.35 });
        rattle(c, o, { t: 0.02, n: 4, spread: 0.1, v: 0.25 });
        noise(c, o, { type: 'bandpass', f: 4500, q: 3, t: 0.2, a: 0.0005, d: 0.008, v: 0.25 });
        tone(c, o, { type: 'square', f: 1480, t: 0.26, a: 0.002, h: 0.04, d: 0.03, v: 0.22, filter: 'lowpass', ff: 5000 });
        tone(c, o, { type: 'square', f: 1975, t: 0.42, a: 0.002, h: 0.06, d: 0.05, v: 0.22, filter: 'lowpass', ff: 5000 });
    } },
    oil: { dur: 0.85, peak: 0.6, fn(c, o) {
        // splat: a wet low burst + the blorp of the slick spreading + bubbles
        noise(c, o, { type: 'lowpass', f: 1800, f1: 400, glide: 0.1, t: 0.002, a: 0.002, d: 0.12, v: 0.8 });
        noise(c, o, { type: 'bandpass', f: 2500, q: 0.8, t: 0.002, a: 0.001, d: 0.05, v: 0.4 });
        const osc = c.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, 0.002);
        osc.frequency.exponentialRampToValueAtTime(85, 0.16);
        osc.frequency.exponentialRampToValueAtTime(170, 0.32);
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 6;
        bp.frequency.setValueAtTime(300, 0.002);
        bp.frequency.exponentialRampToValueAtTime(1500, 0.12);
        bp.frequency.exponentialRampToValueAtTime(380, 0.34);
        osc.connect(bp).connect(envGain(c, o, 0.002, 0.01, 0.9, 0.3, 0.05));
        osc.start(0.002);
        osc.stop(0.45);
        for (let i = 0; i < 6; i++) bubble(c, o, { t: 0.12 + i * 0.07 + rand(0, 0.04), f: rand(250, 600), v: rand(0.2, 0.35) });
    } },
    shock: { dur: 0.75, peak: 0.85, fn(c, o) {
        // a charging whine, then a crackling arc over a buzzing hum, a falling "zzap"
        tone(c, o, { type: 'sawtooth', f: 600, f1: 3200, glide: 0.07, t: 0.002, a: 0.005, d: 0.07, v: 0.18, filter: 'lowpass', ff: 6000 });
        const buzz = tone(c, o, { type: 'sawtooth', f: 95, t: 0.06, a: 0.005, h: 0.25, d: 0.35, v: 0.45, filter: 'bandpass', fq: 0.8, ff: 1800, ff1: 500 });
        lfo(c, buzz.frequency, { type: 'square', f: 19, depth: 35, t: 0.06, dur: 0.7 });
        let t = 0.06;
        while (t < 0.6) {
            const d = rand(0.004, 0.02);
            noise(c, o, { type: 'highpass', f: rand(2500, 6000), t, a: 0.0005, d, v: rand(0.3, 0.8) * (1 - (t - 0.06) / 0.7) });
            t += d + rand(0.002, 0.03);
        }
        tone(c, o, { type: 'square', f: 2600, f1: 220, glide: 0.18, t: 0.06, a: 0.001, d: 0.18, v: 0.16, filter: 'lowpass', ff: 5000 });
    } },
    shield: { dur: 1.2, peak: 0.45, fn(c, o) {
        // a power-up bubble: a chorus of sines sweeping up, a "bloop" and sparkles
        for (const det of [-12, 0, 12]) {
            const h = tone(c, o, { f: 220, f1: 440, glide: 0.5, t: 0.002, a: 0.06, h: 0.3, d: 0.75, v: 0.28, detune: det });
            lfo(c, h.frequency, { f: 6 + det * 0.1, depth: 6, t: 0.002, dur: 1.15 });
        }
        tone(c, o, { type: 'triangle', f: 660, f1: 1320, glide: 0.5, t: 0.002, a: 0.1, h: 0.2, d: 0.8, v: 0.12 });
        tone(c, o, { f: 300, f1: 900, glide: 0.08, t: 0.002, a: 0.003, d: 0.1, v: 0.35 });
        for (let i = 0; i < 9; i++) {
            const f = rand(1800, 4200);
            tone(c, o, { f, f1: f * 1.5, glide: 0.04, t: 0.08 + i * 0.1 + rand(0, 0.04), a: 0.002, d: 0.08, v: 0.14 });
        }
    } },
    wreck: { dur: 2.6, peak: 0.95, fn(c, o) {
        explosionCore(c, o, true);
        // parts falling: a bouncing wheel and plastic bits
        let t = 0.35, g = 0.5;
        for (let i = 0; i < 6; i++) {
            impact(c, o, { t, f: rand(220, 300), body: g, click: g * 0.6, d: 0.06 });
            t += 0.22 * Math.pow(0.72, i);
            g *= 0.75;
        }
        for (let i = 0; i < 3; i++) rattle(c, o, { t: rand(0.3, 1.4), n: 5, spread: 0.15, v: 0.25 });
    } },

    // ---- car / track
    turbo: { dur: 1.1, peak: 0.75, fn(c, o) {
        // boost ignition "fwoom": a thump, a jet roar sweeping up and a zing
        tone(c, o, { f: 120, f1: 55, t: 0.002, a: 0.004, d: 0.25, v: 0.6 });
        noise(c, o, { type: 'highpass', f: 4000, t: 0.002, a: 0.001, d: 0.06, v: 0.4 });
        noise(c, o, { type: 'bandpass', color: 'pink', f: 250, f1: 3000, glide: 0.4, q: 1.3, t: 0.002, a: 0.04, h: 0.1, d: 0.8, v: 1 });
        tone(c, o, { type: 'sawtooth', f: 160, f1: 820, glide: 0.45, t: 0.002, a: 0.03, h: 0.1, d: 0.55, v: 0.22, filter: 'lowpass', ff: 2200 });
        tone(c, o, { f: 1800, f1: 4200, glide: 0.35, t: 0.02, a: 0.02, d: 0.4, v: 0.06 });
    } },
    pssh: { dur: 0.6, peak: 0.5, fn(c, o) {
        // turbo blow-off valve: a falling hiss + the compressor fluttering ("chu-chu-chu")
        noise(c, o, { type: 'bandpass', f: 4200, f1: 1500, q: 1.3, t: 0.002, a: 0.006, d: 0.32, v: 1 });
        noise(c, o, { type: 'highpass', f: 6500, t: 0.002, a: 0.003, d: 0.14, v: 0.35 });
        for (let i = 0; i < 4; i++) noise(c, o, { type: 'bandpass', f: 1100 - i * 90, q: 2, t: 0.2 + i * 0.05, a: 0.004, d: 0.035, v: 0.35 * (1 - i * 0.2) });
    } },
    backfire: { dur: 0.4, peak: 0.8, variants: 3, fn(c, o) {
        const sh = shaperTo(c, o, 1.5);
        noise(c, sh, { type: 'lowpass', color: 'pink', f: rand(1400, 2200), t: 0.001, a: 0.0008, d: 0.07, v: 1 });
        tone(c, sh, { f: rand(110, 140), f1: 45, t: 0.001, a: 0.001, d: 0.13, v: 1 });
        noise(c, o, { type: 'highpass', f: 2500, t: 0.001, a: 0.0005, d: 0.012, v: 0.6 });
        if (Math.random() < 0.7) noise(c, sh, { type: 'lowpass', f: 1600, t: rand(0.06, 0.12), a: 0.0008, d: 0.04, v: 0.5 });
    } },
    pop: { dur: 0.08, peak: 0.45, variants: 4, fn(c, o) {
        // a small overrun pop (2-stroke crackle when lifting off)
        noise(c, o, { type: 'bandpass', f: rand(900, 1800), q: 0.9, t: 0.001, a: 0.0005, d: rand(0.012, 0.025), v: 1 });
        tone(c, o, { f: rand(160, 240), f1: 70, t: 0.001, a: 0.001, d: 0.035, v: 0.6 });
        noise(c, o, { type: 'highpass', f: 3000, t: 0.001, a: 0.0005, d: 0.005, v: 0.4 });
    } },
    crash: { dur: 0.55, peak: 0.85, variants: 3, fn(c, o) {
        // plastic car against a wall: click + body thump + hollow "clonk" + loose bits rattling
        impact(c, o, { t: 0.002, f: rand(150, 190), body: 0.9, click: 0.7, d: 0.14 });
        modal(c, o, { f: rand(380, 480), t: 0.002, ratios: [1, 1.58, 2.37, 3.6], d: 0.11, v: 0.45 });
        noise(c, o, { type: 'bandpass', f: 1300, q: 1, t: 0.002, a: 0.001, d: 0.08, v: 0.5 });
        rattle(c, o, { t: 0.03, n: 7, spread: 0.22, v: 0.3 });
    } },
    scrape: { dur: 0.5, peak: 0.65, variants: 2, fn(c, o) {
        // plastic along a wall: friction noise chopped by stick-slip + a squeaky partial
        const am = c.createGain();
        am.gain.value = 0.55;
        am.connect(o);
        wobble(c, am.gain, { rate: rand(10, 16), depth: 0.45, t: 0, dur: 0.5 });
        noise(c, am, { type: 'bandpass', f: rand(2200, 3000), f1: rand(1600, 2200), q: 2.5, t: 0.002, a: 0.015, h: 0.08, d: 0.3, v: 1 });
        noise(c, am, { type: 'bandpass', f: 700, q: 1, t: 0.002, a: 0.01, h: 0.05, d: 0.2, v: 0.4 });
        const sq = tone(c, am, { type: 'triangle', f: rand(1100, 1500), t: 0.002, a: 0.02, h: 0.1, d: 0.25, v: 0.12 });
        lfo(c, sq.frequency, { f: 23, depth: 60, t: 0.002, dur: 0.5 });
        noise(c, o, { type: 'highpass', f: 3000, t: 0.002, a: 0.0005, d: 0.01, v: 0.35 });
    } },
    land: { dur: 0.45, peak: 0.75, variants: 2, fn(c, o) {
        // wheels hit the floor: thump + a little suspension spring + rattle
        tone(c, o, { f: rand(100, 120), f1: 42, t: 0.002, a: 0.002, d: 0.2, v: 1 });
        noise(c, o, { type: 'lowpass', color: 'pink', f: 700, t: 0.002, a: 0.001, d: 0.09, v: 0.6 });
        noise(c, o, { type: 'highpass', f: 2500, t: 0.002, a: 0.0005, d: 0.008, v: 0.4 });
        const sp = tone(c, o, { type: 'triangle', f: rand(280, 340), t: 0.01, a: 0.004, d: 0.18, v: 0.12 });
        lfo(c, sp.frequency, { f: 28, depth: 25, t: 0.01, dur: 0.2 });
        rattle(c, o, { t: 0.02, n: 4, spread: 0.12, v: 0.18 });
    } },
    thud: { dur: 0.6, peak: 0.85, variants: 2, fn(c, o) {
        // heavy landing: a deep sub thump, a dull body crunch and a longer rattle
        const sh = shaperTo(c, o, 1.3);
        tone(c, sh, { f: rand(75, 90), f1: 30, glide: 0.25, t: 0.002, a: 0.002, d: 0.32, v: 1 });
        noise(c, sh, { type: 'lowpass', color: 'pink', f: 900, f1: 200, t: 0.002, a: 0.001, d: 0.16, v: 0.8 });
        noise(c, o, { type: 'highpass', f: 2000, t: 0.002, a: 0.0005, d: 0.012, v: 0.5 });
        modal(c, o, { f: rand(300, 360), t: 0.004, ratios: [1, 1.62, 2.4], d: 0.12, v: 0.3 });
        rattle(c, o, { t: 0.03, n: 8, spread: 0.3, v: 0.25 });
    } },
    clack: { dur: 0.2, peak: 0.5, variants: 3, fn(c, o) {
        // wheels over a track joint: two quick plastic ticks (front and rear axle)
        const gap = rand(0.045, 0.07);
        for (const [t, v] of [[0.002, 1], [0.002 + gap, 0.7]]) {
            noise(c, o, { type: 'bandpass', f: rand(2200, 3000), q: 2, t, a: 0.0004, d: 0.012, v: 0.6 * v });
            modal(c, o, { f: rand(900, 1200), t, ratios: [1, 2.3], d: 0.03, v: 0.3 * v });
            tone(c, o, { f: 130, f1: 70, t, a: 0.001, d: 0.04, v: 0.45 * v });
        }
    } },
    whoosh: { dur: 1.1, peak: 0.55, fn(c, o) {
        // air rushing past (a looping): two band-passed pink noises sweeping up and down, slightly apart (flanging)
        for (const [k, v] of [[1, 1], [1.12, 0.6]]) {
            const s = c.createBufferSource();
            s.buffer = procBuffer('pink', c.sampleRate);
            s.loop = true;
            const bp = c.createBiquadFilter();
            bp.type = 'bandpass';
            bp.Q.value = 1.6;
            bp.frequency.setValueAtTime(350 * k, 0);
            bp.frequency.exponentialRampToValueAtTime(2600 * k, 0.45);
            bp.frequency.exponentialRampToValueAtTime(500 * k, 1.05);
            s.connect(bp).connect(envGain(c, o, 0.002, 0.42, v, 0.6, 0.02));
            s.start(0, Math.random());
            s.stop(1.1);
        }
        noise(c, o, { type: 'highpass', f: 5000, t: 0.3, a: 0.15, d: 0.3, v: 0.15 });
    } },
    splash: { dur: 1.1, peak: 0.6, fn(c, o) {
        // through water: spray, a low plunge, lots of bubbles and late drops
        noise(c, o, { type: 'highpass', f: 1800, t: 0.002, a: 0.01, h: 0.05, d: 0.4, v: 0.7 });
        noise(c, o, { type: 'bandpass', f: 3500, f1: 1800, q: 0.8, t: 0.002, a: 0.005, d: 0.25, v: 0.5 });
        noise(c, o, { type: 'lowpass', color: 'pink', f: 600, t: 0.002, a: 0.004, d: 0.15, v: 0.7 });
        tone(c, o, { f: 140, f1: 70, t: 0.002, a: 0.003, d: 0.1, v: 0.4 });
        for (let i = 0; i < 16; i++) bubble(c, o, { t: rand(0.02, 0.7), f: rand(300, 1200), d: rand(0.02, 0.06), v: rand(0.08, 0.22) });
        for (let i = 0; i < 8; i++) bubble(c, o, { t: rand(0.3, 1.0), f: rand(1500, 3000), d: rand(0.01, 0.03), v: rand(0.05, 0.12) });
    } },
};

// small random pitch variation for the frequently repeated sounds (on top of the rendered variants)
const JITTER = { mg: 0.05, backfire: 0.1, pop: 0.12, crash: 0.06, scrape: 0.06, land: 0.05, thud: 0.05, clack: 0.08, 'small-explosion': 0.06, explosion: 0.04, pickup: 0.02, hover: 0.03, splash: 0.05, whoosh: 0.05 };
// render order: UI first (needed right after unlock), then the race sounds
const RENDER_ORDER = Object.keys(SOUNDS).sort((a, b) => (SOUNDS[b].ui ? 1 : 0) - (SOUNDS[a].ui ? 1 : 0));

// the music's drum kit (pre-rendered: cheap to trigger every 16th)
const KIT = {
    kick: { dur: 0.35, peak: 0.85, fn: (c, o) => kick(c, o, 0) },
    snare: { dur: 0.3, peak: 0.6, fn: (c, o) => snare(c, o, 0) },
    clap: { dur: 0.25, peak: 0.5, fn: (c, o) => clap(c, o, 0) },
    hat: { dur: 0.08, peak: 0.3, fn: (c, o) => hat(c, o, 0) },
    ohat: { dur: 0.4, peak: 0.26, fn: (c, o) => hat(c, o, 0, 1, true) },
    rim: { dur: 0.07, peak: 0.35, fn(c, o) {
        tone(c, o, { f: 1700, t: 0, a: 0.0005, d: 0.02, v: 0.5 });
        tone(c, o, { type: 'triangle', f: 480, t: 0, a: 0.0005, d: 0.03, v: 0.4 });
        noise(c, o, { type: 'bandpass', f: 3000, q: 2, t: 0, a: 0.0005, d: 0.01, v: 0.5 });
    } },
    shaker: { dur: 0.09, peak: 0.18, fn: (c, o) => noise(c, o, { type: 'highpass', f: 6000, t: 0, a: 0.012, d: 0.04, v: 0.5 }) },
    tomH: { dur: 0.3, peak: 0.6, fn: (c, o) => tom(c, o, 0, 1, 220) },
    tomL: { dur: 0.35, peak: 0.6, fn: (c, o) => tom(c, o, 0, 1, 150) },
    crash: { dur: 1.6, peak: 0.4, fn: (c, o) => cymbal(c, o, 0, 1, 1.4) },
};

/** Render a definition offline (mono); returns { buffer (normalized), rawPeak, rms (after normalization) }. */
async function renderDef(def, sampleRate, variant = 0) {
    const len = Math.ceil(def.dur * sampleRate);
    const c = new OfflineAudioContext(1, len, sampleRate);
    let out = c.destination;
    if (def.verb) {
        out = c.createGain();
        out.connect(c.destination);
        const conv = c.createConvolver();
        conv.normalize = false;
        conv.buffer = impulse(sampleRate, 'hall');
        const wet = c.createGain();
        wet.gain.value = def.verb;
        out.connect(conv).connect(wet).connect(c.destination);
    }
    def.fn(c, out, variant);
    const buffer = await c.startRendering();
    const d = buffer.getChannelData(0);
    let peak = 0, sum = 0;
    for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
        sum += d[i] * d[i];
    }
    let k = 1;
    if (peak > 1e-4) {
        k = def.peak / peak;
        for (let i = 0; i < d.length; i++) d[i] *= k;
        // short fade-out against a click at the buffer end (longer with a reverb tail)
        const n = Math.min(d.length, Math.floor(sampleRate * (def.verb ? 0.06 : 0.005)));
        for (let i = 0; i < n; i++) d[d.length - 1 - i] *= i / n;
    }
    return { buffer, rawPeak: peak, rms: Math.sqrt(sum / d.length) * k };
}

const kitCache = new Map();
const kitReady = new Map();
/** The drum kit for a sample rate (rendered once). */
function kitFor(sampleRate) {
    let p = kitCache.get(sampleRate);
    if (!p) {
        p = (async () => {
            const m = new Map();
            for (const [name, def] of Object.entries(KIT)) m.set(name, (await renderDef(def, sampleRate)).buffer);
            kitReady.set(sampleRate, m);
            return m;
        })();
        kitCache.set(sampleRate, p);
    }
    return p;
}

// ---------------------------------------------------------------- core state

let ctx = null, master = null, uiBus = null, sfxBus = null, engBus = null, musBus = null;
let verbIn = null, sfxSend = null, engSend = null, engShelf = null, engLoud = null;
let spaceSlot = null, spaceNow = null, spaceWanted = 'room';
const buffers = new Map();
const lastVariant = new Map();
const stats = new Map();
let rendering = null;
let active = 0;
let musicNow = null, musicWanted = null;
const listener = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, t: 0, set: false };
let suspendTimer = 0;

const masterLevel = () => (settings.on ? Math.pow(settings.volume, 1.5) : 0);
const musicLevel = () => Math.pow(settings.music, 1.5) * 0.55;

function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    const G = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    // master → compressor → soft safety clipper (input halved, curve covers ±2, never above 0.99)
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const clip = ctx.createWaveShaper();
    clip.curve = limiterCurve();
    master = G(masterLevel());
    master.connect(comp).connect(G(0.5)).connect(clip).connect(ctx.destination);
    // buses
    uiBus = G(0.9, master);
    sfxBus = G(0.9, master);
    musBus = G(musicLevel(), master);
    engBus = G(0.75);
    engShelf = ctx.createBiquadFilter();
    engShelf.type = 'lowshelf';
    engShelf.frequency.value = 220;
    engShelf.gain.value = 0;
    engLoud = G(1, master);
    engBus.connect(engShelf).connect(engLoud);
    // reverb sends
    verbIn = G(1);
    sfxSend = G(0);
    engSend = G(0);
    sfxBus.connect(sfxSend).connect(verbIn);
    engLoud.connect(engSend).connect(verbIn);
    applySpace(spaceWanted, true);
    rendering = (async () => {
        await kitFor(ctx.sampleRate);
        for (const name of RENDER_ORDER) {
            const def = SOUNDS[name], n = def.variants ?? 1, list = [];
            for (let i = 0; i < n; i++) {
                const r = await renderDef(def, ctx.sampleRate, i);
                list.push(r.buffer);
                if (i === 0) stats.set(name, { rawPeak: r.rawPeak, rms: r.rms, duration: r.buffer.duration, variants: n });
            }
            buffers.set(name, n > 1 ? list : list[0]);
        }
    })().catch(e => console.warn('TurboToys audio: rendering failed', e));
    if (musicWanted) startMusic(musicWanted);
    return ctx;
}

/** Crossfade the world reverb to another space (a new convolver slot fades in, the old one out and is dropped). */
function applySpace(kind, instant = false) {
    const key = SPACES[kind] ? kind : 'room';
    spaceWanted = key;
    if (!ctx || spaceNow === key) return;
    const prev = spaceNow;
    spaceNow = key;
    const sp = SPACES[key];
    const now = ctx.currentTime;
    const fast = key === 'tunnel' || prev === 'tunnel';
    const tc = instant ? 0.001 : fast ? 0.05 : 0.2;
    const old = spaceSlot;
    spaceSlot = null;
    if (sp.ir) {
        const conv = ctx.createConvolver();
        conv.normalize = false;
        conv.buffer = impulse(ctx.sampleRate, sp.ir);
        const wet = ctx.createGain();
        wet.gain.value = 0;
        verbIn.connect(conv).connect(wet).connect(master);
        wet.gain.setTargetAtTime(1, now, tc);
        spaceSlot = { conv, wet };
    }
    if (old) {
        old.wet.gain.cancelScheduledValues(now);
        old.wet.gain.setTargetAtTime(0, now, tc);
        setTimeout(() => {
            try { verbIn.disconnect(old.conv); } catch { /* already */ }
            old.conv.disconnect();
            old.wet.disconnect();
        }, tc * 1000 * 8 + 2500);
    }
    sfxSend.gain.setTargetAtTime(sp.sfx, now, tc);
    engSend.gain.setTargetAtTime(sp.eng, now, tc);
    engShelf.gain.setTargetAtTime(sp.bass, now, tc);
    engLoud.gain.setTargetAtTime(sp.loud, now, tc);
}

/** Play a rendered buffer (a random variant): [lowpass] → gain → [pan] → bus. when = context time (0 = now). */
function playBuffer(name, { gain = 1, pan = 0, rate = 1, when = 0, bus = sfxBus, lowpass = 0 } = {}) {
    if (!ctx || !settings.on || ctx.state !== 'running') return;
    const entry = buffers.get(name);
    if (!entry || gain < 0.003) return;
    if (active > 48 && gain < 0.25) return; // voice cap: drop quiet sounds under heavy load
    let buffer = entry;
    if (Array.isArray(entry)) {
        let i = Math.floor(Math.random() * entry.length);
        if (entry.length > 1 && i === lastVariant.get(name)) i = (i + 1) % entry.length;
        lastVariant.set(name, i);
        buffer = entry[i];
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = clamp(rate, 0.25, 4);
    const nodes = [src];
    let head = src;
    if (lowpass > 0) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = lowpass;
        lp.Q.value = 0.5;
        head = head.connect(lp);
        nodes.push(lp);
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    head = head.connect(g);
    nodes.push(g);
    if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = clamp(pan, -1, 1);
        head = head.connect(p);
        nodes.push(p);
    }
    head.connect(bus);
    active++;
    src.onended = () => { active--; for (const n of nodes) n.disconnect(); };
    src.start(when > 0 ? Math.max(when, ctx.currentTime) : 0);
}

// ---------------------------------------------------------------- engines

class EngineVoice {
    constructor(drive, local, c = null, dest = null) {
        this.drive = DRIVES.includes(drive) ? drive : 'Gas';
        this.local = !!local;
        this.c = null;
        this.stopped = false;
        this.cache = new Map();
        this.first = true;
        this.rpmS = 0;
        this.dop = 1;
        this.prevThrottle = 0;
        this.lastT = 0;
        this.lastPop = 0;
        this.lastBlow = 0;
        this.airTime = 0;
        this.wasAir = false;
        if (c) this.build(c, dest);
    }

    build(c, dest) {
        this.c = c;
        const t = c.currentTime, sr = c.sampleRate;
        const srcs = (this.srcs = []);
        const G = v => { const g = c.createGain(); g.gain.value = v; return g; };
        const F = (type, f, q = 1) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
        const O = (type, f, w = null) => { const o = c.createOscillator(); if (w) o.setPeriodicWave(w); else o.type = type; o.frequency.value = f; srcs.push(o); return o; };
        const loop = kind => { const s = c.createBufferSource(); s.buffer = procBuffer(kind, sr); s.loop = true; srcs.push(s); return s; };

        // out (distance gain) → air absorption lowpass → [panner] → engine bus
        this.out = G(0);
        this.airF = F('lowpass', 18000, 0.5);
        this.out.connect(this.airF);
        this.tail = this.airF;
        if (!this.local && c.createStereoPanner) {
            this.pan = c.createStereoPanner();
            this.airF.connect(this.pan);
            this.tail = this.pan;
        }
        this.tail.connect(dest);

        const white = loop('white'), brown = loop('brown'), jit = loop('jitter');

        // road rumble (brown noise, opens with speed) and rolling grit
        this.rumbleF = F('lowpass', 150, 0.8);
        this.rumbleG = G(0);
        brown.connect(this.rumbleF).connect(this.rumbleG).connect(this.out);
        this.gritF = F('bandpass', 1800, 0.8);
        this.gritG = G(0);
        white.connect(this.gritF).connect(this.gritG).connect(this.out);
        // tyre squeal: two resonant noise bands + a wobbling triangle
        this.skidG = G(0);
        this.skidG.connect(this.out);
        this.skidF1 = F('bandpass', 1150, 7);
        this.skidF2 = F('bandpass', 1750, 9);
        white.connect(this.skidF1).connect(this.skidG);
        white.connect(this.skidF2).connect(this.skidG);
        const skidJ = G(90);
        jit.connect(skidJ).connect(this.skidF1.frequency);
        this.squeal = O('triangle', 1000);
        this.squealG = G(0);
        this.squeal.connect(this.squealG).connect(this.out);
        const sqJ = G(45);
        jit.connect(sqJ).connect(this.squeal.frequency);
        // wind (airborne, high speed)
        this.windF = F('bandpass', 700, 0.7);
        this.windG = G(0);
        white.connect(this.windF).connect(this.windG).connect(this.out);
        // turbo boost roar (every drive)
        this.boostF = F('bandpass', 900, 1.1);
        this.boostG = G(0);
        white.connect(this.boostF).connect(this.boostG).connect(this.out);

        this.body = G(0);
        this.body.connect(this.out);
        // smooth random pitch jitter (depth in Hz, set in update)
        this.jitG = G(0);
        jit.connect(this.jitG);

        if (this.drive === 'Electric') {
            // brushless motor: two slightly detuned motor wavetables (beating) through a load-dependent lowpass,
            // gear whine at a non-integer ratio, cogging buzz at low revs, PWM hiss under load
            this.m1 = O(null, 200, wave(c, 'motor'));
            this.m2 = O(null, 200, wave(c, 'motor'));
            this.m2.detune.value = 7;
            this.toneF = F('lowpass', 3000, 0.9);
            this.m1.connect(this.toneF);
            this.m2.connect(G(0.6)).connect(this.toneF);
            this.toneF.connect(this.body);
            this.gear = O('sine', 600);
            this.gearG = G(0);
            this.gear.connect(this.gearG).connect(this.body);
            this.cog = O('square', 100);
            this.cogG = G(0);
            this.cog.connect(F('lowpass', 1400, 1.5)).connect(this.cogG).connect(this.body);
            this.pwmF = F('bandpass', 7000, 2);
            this.pwmG = G(0);
            white.connect(this.pwmF).connect(this.pwmG).connect(this.body);
            this.jitG.connect(this.m1.frequency);
            this.jitG.connect(this.m2.frequency);
            this.jitG.connect(this.gear.frequency);
        } else {
            // combustion: firing-pulse wavetable (+ sub at half the rate) → drive → soft clip → load-dependent lowpass;
            // exhaust rasp = noise amplitude-modulated by the firing pulses; intake roar = brown noise
            const gas = this.drive === 'Gas';
            this.p1 = O(null, 100, wave(c, gas ? 'nitro' : 'lumpy'));
            this.sub = O('sine', 50);
            this.subG = G(0.5);
            this.driveG = G(1);
            const sh = c.createWaveShaper();
            sh.curve = softClip();
            this.lp = F('lowpass', 1500, gas ? 1.2 : 1.5);
            this.p1.connect(this.driveG).connect(sh).connect(this.lp);
            if (gas) {
                // the tuned pipe: a resonance that screams at high revs
                this.pipe = F('peaking', 1200, 1.4);
                this.pipe.gain.value = 3;
                this.lp.connect(this.pipe).connect(this.body);
                this.sub.connect(this.subG).connect(this.driveG);
            } else {
                this.lp.connect(this.body);
                this.sub.connect(this.subG).connect(this.body);
            }
            this.raspF = F('bandpass', 2500, 0.9);
            const raspAM = G(0);
            this.p1.connect(G(0.8)).connect(raspAM.gain);
            this.raspG = G(0);
            white.connect(this.raspF).connect(raspAM).connect(this.raspG).connect(this.body);
            this.intakeG = G(0);
            brown.connect(F('lowpass', gas ? 380 : 260, 0.8)).connect(this.intakeG).connect(this.body);
            this.jitG.connect(this.p1.frequency);
            this.jitG.connect(G(0.5)).connect(this.sub.frequency);
            if (!gas) {
                // turbo whistle (sine + 2nd harmonic + a narrow noise band) and intake hiss, outside the body (no clipping)
                this.wh = O('sine', 1500);
                this.whG = G(0);
                this.wh.connect(this.whG).connect(this.out);
                this.wh2 = O('sine', 3000);
                this.wh2G = G(0);
                this.wh2.connect(this.wh2G).connect(this.out);
                this.whF = F('bandpass', 1500, 14);
                this.whNG = G(0);
                white.connect(this.whF).connect(this.whNG).connect(this.out);
                this.hissF = F('highpass', 4000, 0.7);
                this.hissG = G(0);
                white.connect(this.hissF).connect(this.hissG).connect(this.out);
            }
        }
        for (const s of srcs) {
            if (s instanceof AudioBufferSourceNode) s.start(t, Math.random() * 1.9);
            else s.start(t);
        }
    }

    /** Move a param smoothly; skip tiny changes to keep the automation lists short. */
    set(key, param, v, now, tc = 0.04) {
        const last = this.cache.get(key);
        if (last !== undefined && Math.abs(last - v) <= Math.max(1e-4, Math.abs(v) * 0.004)) return;
        this.cache.set(key, v);
        if (this.first) param.setValueAtTime(v, now);
        else param.setTargetAtTime(v, now, tc);
    }

    /**
     * s: { rpm 0..1(.2), throttle 0..1, speed 0..1, turbo (boost on), boostSpool 0..1, skid 0..1, airborne, distance }
     * optional: x, z (world position: pan and distance for other cars), vx, vz (world velocity, units/s: Doppler), pan (-1..1).
     */
    update(s = {}) {
        if (this.stopped) return;
        if (!this.c) {
            if (!ctx) return;
            this.build(ctx, engBus);
        }
        const c = this.c, now = c.currentTime, live = c === ctx;
        const dt = this.first ? 0 : clamp(now - this.lastT, 0, 0.1);
        this.lastT = now;
        const rpm = clamp(num(s.rpm), 0, 1.2), thr = clamp01(num(s.throttle)), spd = clamp01(Math.abs(num(s.speed))), spool = clamp01(num(s.boostSpool));
        const air = !!s.airborne, boost = !!s.turbo;
        const skid = air ? 0 : clamp01(num(s.skid));

        // effective revs: a little free-revving with throttle at low speed (clutch slip), more in the air (wheels spin free)
        let target = Math.max(rpm, thr * 0.32 * (1 - spd)) + thr * 0.05;
        if (air) target = Math.min(1.2, target + thr * 0.18);
        if (this.first) this.rpmS = target;
        else this.rpmS += (target - this.rpmS) * (1 - Math.exp(-dt * (target > this.rpmS ? 7 : 4)));
        const r = this.rpmS;

        // distance, pan, Doppler (other cars only)
        let dist = Number.isFinite(s.distance) ? s.distance : null, pan = 0, dop = 1;
        if (!this.local && listener.set && Number.isFinite(s.x) && Number.isFinite(s.z)) {
            const dx = s.x - listener.x, dz = s.z - listener.z, d = Math.hypot(dx, dz);
            if (dist === null) dist = d;
            pan = panFor(dx, dz, d);
            if (d > 0.5 && Number.isFinite(s.vx) && Number.isFinite(s.vz)) {
                const towards = -((s.vx - listener.vx) * dx + (s.vz - listener.vz) * dz) / d;
                dop = clamp(1 + towards / DOPPLER_C, 0.85, 1.18);
            }
        }
        if (!this.local && Number.isFinite(s.pan)) pan = clamp(s.pan, -1, 1);
        this.dop = this.first ? dop : this.dop + (dop - this.dop) * (1 - Math.exp(-dt * 6));
        const att = this.local ? 1 : falloff(dist ?? 0) * 0.6;
        const pm = (boost ? 1.06 : 1) * this.dop;

        this.set('out', this.out.gain, att, now, 0.05);
        this.set('airF', this.airF.frequency, this.local ? 18000 : airCutoff(dist ?? 0) || 18000, now, 0.1);
        if (this.pan) this.set('pan', this.pan.pan, pan, now, 0.05);

        // common layers
        const ground = air ? 0 : 1;
        this.set('rumbleG', this.rumbleG.gain, ground * spd * 0.2, now, 0.06);
        this.set('rumbleF', this.rumbleF.frequency, 90 + spd * 380, now);
        this.set('gritG', this.gritG.gain, ground * spd * spd * 0.022, now, 0.06);
        this.set('gritF', this.gritF.frequency, 1200 + spd * 1500, now);
        const sk = Math.pow(skid, 1.4);
        this.set('skidG', this.skidG.gain, sk * 0.75, now, 0.03);
        this.set('skidF1', this.skidF1.frequency, 1050 + spd * 300, now);
        this.set('skidF2', this.skidF2.frequency, 1600 + spd * 420, now);
        this.set('squealG', this.squealG.gain, sk * 0.04, now, 0.03);
        this.set('squeal', this.squeal.frequency, 900 + spd * 260, now, 0.05);
        this.set('windG', this.windG.gain, air ? 0.05 + spd * 0.1 : spd * spd * 0.015, now, 0.08);
        this.set('windF', this.windF.frequency, 500 + spd * 900 + (air ? 300 : 0), now, 0.1);
        this.set('boostG', this.boostG.gain, boost ? 0.1 : 0, now, boost ? 0.05 : 0.2);
        this.set('boostF', this.boostF.frequency, 700 + spd * 1500, now);

        if (this.drive === 'Electric') {
            const f = (150 + Math.pow(r, 0.85) * 1150) * pm;
            const low = Math.pow(1 - Math.min(1, r), 2);
            this.set('f1', this.m1.frequency, f, now, 0.025);
            this.set('f2', this.m2.frequency, f, now, 0.025);
            this.set('gear', this.gear.frequency, f * 3.17, now, 0.025);
            this.set('cog', this.cog.frequency, f * 0.5, now, 0.025);
            this.set('jit', this.jitG.gain, f * 0.004, now, 0.1);
            this.set('toneF', this.toneF.frequency, 1400 + thr * 4500 + r * 2000, now, 0.05);
            this.set('gearG', this.gearG.gain, 0.03 + spd * 0.15, now, 0.06);
            this.set('cogG', this.cogG.gain, thr * low * 0.5, now, 0.05);
            this.set('pwmG', this.pwmG.gain, thr * (0.2 + 0.8 * low) * 0.45, now, 0.05);
            this.set('body', this.body.gain, (0.02 + 0.15 * Math.max(thr, r * 0.55)) * (air ? 0.85 : 1), now, 0.06);
        } else if (this.drive === 'Gas') {
            const f = (48 + r * 300) * pm;
            this.set('f1', this.p1.frequency, f, now, 0.025);
            this.set('fs', this.sub.frequency, f * 0.5, now, 0.025);
            this.set('jit', this.jitG.gain, f * (0.03 - Math.min(1, r) * 0.015), now, 0.1);
            // rich "four-stroking" burble at idle, gone under load and at high revs
            this.set('subG', this.subG.gain, (1 - Math.min(1, r)) * (1 - thr * 0.6) * 0.5, now, 0.06);
            this.set('drive', this.driveG.gain, 0.7 + thr * 1.6, now, 0.05);
            this.set('lp', this.lp.frequency, 600 + thr * 2600 + r * 2600, now, 0.05);
            this.set('pipeF', this.pipe.frequency, 1000 + r * 1600, now, 0.05);
            this.set('pipeG', this.pipe.gain, 2 + r * 7 * (0.4 + 0.6 * thr), now, 0.08);
            this.set('raspF', this.raspF.frequency, 1800 + r * 3500, now);
            this.set('raspG', this.raspG.gain, 0.3 + thr * 1.5, now);
            this.set('intakeG', this.intakeG.gain, thr * 0.8, now, 0.06);
            this.set('body', this.body.gain, 0.065 + 0.045 * thr + 0.03 * r, now, 0.05);
            // overrun crackle when lifting off at revs, now and then while coasting fast
            if (live && att > 0.01 && now - this.lastPop > 0.25) {
                const lifted = this.prevThrottle - thr > 0.4 && r > 0.45;
                const coasting = thr < 0.15 && r > 0.55 && Math.random() < dt * 1.2;
                if (lifted || coasting) {
                    this.lastPop = now;
                    const n = lifted ? 3 + Math.floor(Math.random() * (1 + r * 3)) : 1 + Math.floor(Math.random() * 2);
                    let when = now + rand(0.02, 0.06);
                    for (let i = 0; i < n; i++) {
                        playBuffer('pop', { gain: att * rand(0.3, 0.6) * (1 - i / (n + 2)), pan, rate: rand(0.85, 1.2), when });
                        when += rand(0.04, 0.13);
                    }
                    this.lastPop = when;
                }
            }
        } else {
            const f = (36 + r * 170) * pm;
            this.set('f1', this.p1.frequency, f, now, 0.03);
            this.set('fs', this.sub.frequency, f * 0.5, now, 0.03);
            this.set('jit', this.jitG.gain, f * 0.012, now, 0.1);
            this.set('drive', this.driveG.gain, 0.8 + thr * 1.2, now, 0.05);
            this.set('lp', this.lp.frequency, 350 + thr * 1500 + r * 1200 + spool * 600, now, 0.05);
            this.set('raspF', this.raspF.frequency, 1200 + r * 1800, now);
            this.set('raspG', this.raspG.gain, 0.2 + thr * 0.6, now);
            this.set('intakeG', this.intakeG.gain, thr * (0.5 + spool * 0.5), now, 0.06);
            this.set('body', this.body.gain, 0.085 + 0.036 * thr + 0.022 * r, now, 0.05);
            const wf = (1400 + spool * 5200) * this.dop;
            this.set('wh', this.wh.frequency, wf, now, 0.05);
            this.set('wh2', this.wh2.frequency, wf * 2.01, now, 0.05);
            this.set('whF', this.whF.frequency, wf * 1.01, now, 0.05);
            this.set('whG', this.whG.gain, spool * spool * 0.035, now, 0.05);
            this.set('wh2G', this.wh2G.gain, spool * spool * spool * 0.01, now, 0.05);
            this.set('whNG', this.whNG.gain, spool * 0.5, now, 0.05);
            this.set('hissG', this.hissG.gain, spool * thr * 0.025, now, 0.05);
            // blow-off "pssh" when lifting at high boost
            if (live && att > 0.01 && this.prevThrottle > 0.5 && thr < 0.25 && spool > 0.5 && now - this.lastBlow > 0.6) {
                this.lastBlow = now;
                playBuffer('pssh', { gain: spool * 0.8 * att, pan, rate: rand(0.92, 1.08) });
            }
        }

        // landing thump for other cars (the own car's landing is played by the race with its strength)
        if (air) this.airTime += dt;
        else {
            if (live && !this.local && this.wasAir && this.airTime > 0.25 && att > 0.01) {
                playBuffer(this.airTime > 0.8 ? 'thud' : 'land', { gain: att * Math.min(1, this.airTime) * 0.8, pan, lowpass: airCutoff(dist ?? 0) });
            }
            this.airTime = 0;
        }
        this.wasAir = air;
        this.prevThrottle = thr;
        this.first = false;
    }

    stop() {
        if (this.stopped) return;
        this.stopped = true;
        if (!this.c) return;
        const now = this.c.currentTime;
        this.out.gain.cancelScheduledValues(now);
        this.out.gain.setTargetAtTime(0, now, 0.03);
        const srcs = this.srcs, tail = this.tail;
        setTimeout(() => {
            for (const s of srcs) { try { s.stop(); } catch { /* already stopped */ } }
            tail.disconnect();
        }, 300);
    }
}

// ---------------------------------------------------------------- music

// bar chords: bass root (MIDI) + stab chord
const CH = {
    C: { root: 48, notes: [60, 64, 67] }, Am: { root: 45, notes: [57, 60, 64] }, F: { root: 41, notes: [57, 60, 65] },
    G: { root: 43, notes: [55, 59, 62] }, Dm: { root: 50, notes: [57, 62, 65] }, E: { root: 40, notes: [56, 59, 64] },
};

/** Five ascending chord tones from MIDI note lo up. */
function chordTones(chord, lo) {
    const pcs = chord.notes.map(n => n % 12);
    const out = [];
    for (let m = lo; out.length < 5 && m < lo + 36; m++) if (pcs.includes(m % 12)) out.push(m);
    return out;
}

// lead A: per bar [step, midi, length in 16ths]; lead B: per bar contour [step, chord tone index, length] (alternating bars)
const SONGS = {
    menu: {
        bpm: 108, swing: 0.12, gain: 0.62, verb: 0.32,
        chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'],
        groove: { kick: [0, 8, 11], snare: [4, 12], ghost: [7, 14], hat: [0, 2, 4, 6, 8, 10, 12, 14], ohat: [14] },
        bass: [0, null, 12, null, 7, null, 12, null, 0, null, 12, null, 7, null, 12, 7],
        lead: [
            [[0, 72, 2], [3, 76, 1], [4, 79, 2], [6, 76, 2], [8, 84, 3], [12, 79, 2], [14, 76, 2]],
            [[0, 81, 2], [2, 79, 2], [4, 76, 2], [6, 72, 2], [8, 74, 4], [12, 76, 4]],
            [[0, 77, 2], [3, 81, 1], [4, 84, 2], [6, 81, 2], [8, 77, 3], [12, 76, 2], [14, 74, 2]],
            [[0, 74, 6], [6, 71, 2], [8, 74, 2], [10, 77, 2], [12, 79, 4]],
            [[0, 84, 2], [2, 83, 2], [4, 84, 2], [6, 79, 2], [8, 76, 3], [12, 79, 2], [14, 84, 2]],
            [[0, 81, 4], [4, 76, 2], [6, 81, 2], [8, 79, 4], [12, 76, 4]],
            [[0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 77, 2], [8, 81, 4], [12, 77, 4]],
            [[0, 79, 2], [2, 77, 2], [4, 74, 2], [6, 71, 2], [8, 74, 2], [10, 71, 2], [12, 67, 4]],
        ],
        contour: [[[0, 2, 3], [3, 1, 1], [4, 0, 4], [8, 1, 2], [10, 2, 2], [12, 3, 4]], [[0, 4, 2], [2, 3, 2], [4, 2, 4], [10, 1, 2], [12, 2, 4]]],
        leadLo: 67, arpLo: 60, arp: [0, 1, 2, 3, 2, 1, 0, 2],
    },
    race: {
        bpm: 152, swing: 0, gain: 0.8, verb: 0.18, tremolo: true,
        chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E'],
        groove: { kick: [0, 3, 8, 11], snare: [4, 12], ghost: [7, 15], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], ohat: [] },
        bass: [0, null, 0, 0, 12, null, 0, 0, 7, null, 0, 0, 12, null, 7, null],
        lead: [
            [[0, 76, 4], [4, 77, 2], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 71, 2], [14, 72, 2]],
            [[0, 69, 6], [6, 72, 2], [8, 76, 8]],
            [[0, 77, 4], [4, 76, 2], [6, 74, 2], [8, 72, 4], [12, 74, 4]],
            [[0, 74, 4], [4, 72, 2], [6, 71, 2], [8, 71, 4], [12, 74, 4]],
            [[0, 81, 4], [4, 80, 2], [6, 81, 2], [8, 76, 4], [12, 72, 4]],
            [[0, 74, 2], [2, 76, 2], [4, 77, 2], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 71, 4]],
            [[0, 72, 4], [4, 77, 4], [8, 76, 4], [12, 74, 4]],
            [[0, 80, 4], [4, 76, 4], [8, 71, 2], [10, 74, 2], [12, 80, 4]],
        ],
        contour: [[[0, 2, 2], [2, 1, 1], [3, 2, 1], [4, 3, 2], [6, 2, 2], [8, 4, 3], [11, 3, 1], [12, 2, 2], [14, 1, 2]],
            [[0, 3, 1], [1, 2, 1], [2, 1, 2], [4, 0, 2], [6, 1, 2], [8, 2, 4], [12, 1, 2], [14, 0, 2]]],
        leadLo: 69, arpLo: 57, arp: [0, 1, 2, 1, 3, 1, 2, 1, 0, 1, 2, 1, 3, 2, 1, 2],
    },
};

/**
 * Which layers play in a bar. Menu: intro, then a cycle of full (lead A) / lead B with arpeggio and pad / breakdown.
 * Race: lead A / lead B / breakdown and build-up with a snare roll / lead A doubled.
 */
function arrangement(mood, loop, bar) {
    const fill = bar === 7;
    if (mood === 'menu') {
        const phase = loop === 0 ? 0 : 1 + ((loop - 1) % 3);
        if (phase === 0) return bar < 2 ? { pad: 1, arp: 1, shaker: 1 } : { kick: 1, snare: 1, hats: 1, bass: 1, stabs: 1, lead: 'A', pad: 1, shaker: 1, fill };
        if (phase === 1) return { kick: 1, snare: 1, hats: 1, bass: 1, stabs: 1, lead: 'A', shaker: 1, fill };
        if (phase === 2) return { kick: 1, snare: 1, hats: 1, ohat: 1, bass: 1, lead: 'B', arp: 1, pad: 1, fill };
        return bar < 4 ? { rim: 1, hats: 1, bass: 'half', pad: 1, arp: 1, shaker: 1 }
            : { kick: 1, snare: 1, hats: 1, bass: 1, stabs: 1, lead: 'A', pad: bar < 6, fill, crashIn: bar === 4 };
    }
    const phase = loop % 4;
    if (phase === 0) return { kick: 1, snare: 1, hats: 1, bass: 1, stabs: 1, lead: 'A', fill };
    if (phase === 1) return { kick: 1, snare: 1, clap: 1, hats: 1, bass: 1, stabs: 1, lead: 'B', arp: bar >= 4, fill };
    if (phase === 2) return bar < 4 ? { kick: 'one', hats: 1, bass: 1, arp: 1 }
        : { kick: 'four', snare: 1, clap: 1, hats: 1, bass: 1, arp: 1, lead: bar >= 6 ? 'A' : null, roll: bar === 7, crashIn: bar === 4 };
    return { kick: 1, snare: 1, clap: 1, hats: 1, bass: 1, stabs: 1, lead: 'A', double: 1, fill };
}

function leadMap(bars, tremolo) {
    const map = new Map();
    bars.forEach((bar, b) => {
        for (const [st, m, len] of bar) {
            if (tremolo) for (let k = 0; k < len; k++) map.set(b * 16 + st + k, { m, len: 1, accent: k % 2 === 0 });
            else map.set(b * 16 + st, { m, len, accent: true });
        }
    });
    return map;
}

class Music {
    /** manual = true: no timer (offline rendering calls scheduleUntil itself). */
    constructor(c, dest, mood, { manual = false } = {}) {
        this.c = c;
        this.mood = mood;
        this.song = SONGS[mood];
        this.race = mood === 'race';
        const s = this.song, t = c.currentTime;
        const nodes = (this.nodes = []);
        const G = (v, to) => { const g = c.createGain(); g.gain.value = v; if (to) g.connect(to); nodes.push(g); return g; };
        const P = (v, to) => { const p = c.createStereoPanner(); p.pan.value = v; p.connect(to); nodes.push(p); return p; };
        this.out = c.createGain();
        this.out.gain.setValueAtTime(0.0001, t);
        this.out.gain.linearRampToValueAtTime(s.gain, t + 0.3);
        this.out.connect(dest);
        // a plate reverb for snare, stabs, lead, arpeggio and pad
        const verbIn = G(1);
        const conv = c.createConvolver();
        conv.normalize = false;
        conv.buffer = impulse(c.sampleRate, 'plate');
        nodes.push(conv);
        verbIn.connect(conv).connect(G(s.verb, this.out));
        const send = (bus, v) => bus.connect(G(v, verbIn));
        this.drums = G(1, this.out);
        this.snareBus = G(1, this.out);
        send(this.snareBus, 0.35);
        this.hats = P(0.25, this.out);
        this.bassBus = G(1, this.out);
        this.stabBus = P(-0.3, this.out);
        send(this.stabBus, 0.3);
        this.leadBus = P(0.12, this.out);
        send(this.leadBus, 0.3);
        this.arpL = P(-0.4, this.out);
        this.arpR = P(0.4, this.out);
        send(this.arpL, 0.45);
        send(this.arpR, 0.45);
        this.padBus = G(1, this.out);
        send(this.padBus, 0.6);
        // a dotted-eighth echo with a darkened feedback (springy surf flavour) on the lead
        const stepDur = 60 / s.bpm / 4;
        const delay = c.createDelay(1);
        delay.delayTime.value = stepDur * 3;
        nodes.push(delay);
        const fb = G(0.3);
        const dl = c.createBiquadFilter();
        dl.type = 'lowpass';
        dl.frequency.value = 2200;
        nodes.push(dl);
        this.leadBus.connect(G(0.3)).connect(delay).connect(dl).connect(fb).connect(delay);
        dl.connect(this.out);
        // lead A (written) and lead B (chord-tone contours)
        this.leads = {
            A: leadMap(s.lead, !!s.tremolo),
            B: leadMap(s.chords.map((ch, b) => s.contour[b % s.contour.length].map(([st, i, len]) => [st, chordTones(CH[ch], s.leadLo)[i], len])), !!s.tremolo),
        };
        this.kit = kitReady.get(c.sampleRate) ?? null;
        this.step = 0;
        this.next = t + 0.08;
        this.timer = manual ? 0 : setInterval(() => this.scheduleUntil(this.c.currentTime + 0.2), 25);
    }

    stepLength(step) {
        const sp = 60 / this.song.bpm / 4;
        return this.song.swing ? sp * (step % 2 === 0 ? 1 + this.song.swing : 1 - this.song.swing) : sp;
    }

    scheduleUntil(until) {
        if (this.next < this.c.currentTime - 0.05) this.next = this.c.currentTime + 0.05; // after a throttled timer: skip, don't burst
        while (this.next < until) {
            this.playStep(this.step, this.next);
            this.next += this.stepLength(this.step);
            this.step++;
        }
    }

    /** A drum hit from the pre-rendered kit (slightly humanized velocity). */
    hit(name, t, v = 1, bus = this.drums) {
        if (!this.kit) this.kit = kitReady.get(this.c.sampleRate) ?? null;
        const b = this.kit?.get(name);
        if (!b) return;
        const src = this.c.createBufferSource();
        src.buffer = b;
        const g = this.c.createGain();
        g.gain.value = v * rand(0.93, 1.07);
        src.connect(g).connect(bus);
        src.onended = () => g.disconnect();
        src.start(t);
    }

    playStep(step, t) {
        const c = this.c, s = this.song, race = this.race;
        const st = step % 16, bar = Math.floor(step / 16) % 8, loop = Math.floor(step / 128);
        const sp = 60 / s.bpm / 4;
        const chord = CH[s.chords[bar]];
        const a = arrangement(this.mood, loop, bar);
        const g = s.groove;

        // ---- drums
        if (a.roll) {
            this.hit('snare', t, 0.15 + (st / 15) * 0.55, this.snareBus);
            if (st % 4 === 0) this.hit('kick', t, 0.62);
        } else if (a.fill && st >= 12) {
            if (race) {
                this.hit(st < 14 ? 'tomH' : 'tomL', t, 0.75);
                if (st === 12) this.hit('kick', t, 0.62);
                if (st === 15) this.hit('snare', t, 0.5, this.snareBus);
            } else {
                this.hit('snare', t, 0.22 + (st - 12) * 0.1, this.snareBus);
                if (st === 12) this.hit('kick', t, 0.6);
            }
        } else {
            const k = a.kick === 'one' ? st === 0 : a.kick === 'four' ? st % 4 === 0 : a.kick ? g.kick.includes(st) : false;
            if (k) this.hit('kick', t, 0.62);
            if (a.snare && g.snare.includes(st)) {
                this.hit('snare', t, 0.6, this.snareBus);
                if (a.clap) this.hit('clap', t, 0.35, this.snareBus);
            }
            if (a.snare && g.ghost.includes(st) && Math.random() < 0.5) this.hit('snare', t, 0.14, this.snareBus);
            if (a.rim && g.snare.includes(st)) this.hit('rim', t, 0.5, this.snareBus);
        }
        if (a.hats && g.hat.includes(st)) {
            const open = (a.ohat || !race) && g.ohat.includes(st);
            const v = race ? (st % 4 === 0 ? 0.75 : st % 2 === 0 ? 0.5 : 0.32) : (st % 4 === 2 ? 0.45 : 0.6);
            this.hit(open ? 'ohat' : 'hat', t, open ? 0.6 : v, this.hats);
        }
        if (a.shaker && st % 2 === 1) this.hit('shaker', t, 0.5, this.hats);
        if (st === 0 && ((bar === 0 && loop > 0) || a.crashIn)) this.hit('crash', t, 0.55);

        // ---- bass
        let bm = null, blen = 1;
        if (a.bass === 'half') {
            if (st === 0 || st === 8) { bm = chord.root + (st ? 7 : 0); blen = 7.5; }
        } else if (a.bass) {
            const off = s.bass[st];
            if (off !== null && off !== undefined) bm = chord.root + off;
        }
        if (bm !== null) {
            const f = mtof(bm), accent = st % 4 === 0;
            if (race) {
                tone(c, this.bassBus, { type: 'sawtooth', f, t, a: 0.004, d: sp * 1.2 * blen, v: accent ? 0.24 : 0.19, filter: 'lowpass', fq: 4, ff: accent ? 1600 : 1100, ff1: 240 });
                tone(c, this.bassBus, { f, t, a: 0.004, h: sp * 0.4, d: sp * 0.7 * blen, v: 0.12 });
            } else {
                tone(c, this.bassBus, { type: 'triangle', f, t, a: 0.004, h: sp * 0.8 * blen, d: sp * 0.8, v: 0.5 });
                tone(c, this.bassBus, { type: 'square', f, t, a: 0.004, d: sp * 1.2 * blen, v: 0.1, filter: 'lowpass', ff: 900 });
            }
        }

        // ---- chord stabs
        if (a.stabs && (race ? [2, 6, 10, 14] : [4, 12]).includes(st)) {
            for (const m of chord.notes) {
                if (race) tone(c, this.stabBus, { type: 'sawtooth', f: mtof(m), t, a: 0.003, d: 0.08, v: 0.065, filter: 'lowpass', fq: 1.5, ff: 2400, ff1: 700 });
                else tone(c, this.stabBus, { wave: wave(c, 'pulse25'), f: mtof(m + 12), t, a: 0.003, d: 0.14, v: 0.045 });
            }
        }

        // ---- arpeggio (chord tones, alternating left/right)
        const every = race ? 1 : 2;
        if (a.arp && st % every === 0) {
            const i = st / every;
            const m = chordTones(chord, s.arpLo)[s.arp[i % s.arp.length]];
            const bus = i % 2 ? this.arpR : this.arpL;
            if (race) tone(c, bus, { type: 'sawtooth', f: mtof(m), t, a: 0.002, d: 0.11, v: 0.05, filter: 'lowpass', fq: 3, ff: 3200, ff1: 500 });
            else {
                tone(c, bus, { wave: wave(c, 'pulse25'), f: mtof(m + 12), t, a: 0.002, d: 0.16, v: 0.04, filter: 'lowpass', ff: 3000, ff1: 900 });
                tone(c, bus, { type: 'triangle', f: mtof(m + 24), t, a: 0.002, d: 0.08, v: 0.015 });
            }
        }

        // ---- pad (menu): soft detuned saws through a dark lowpass, one chord per bar
        if (a.pad && st === 0) {
            const barDur = sp * 16;
            for (const m of chord.notes) {
                for (const det of [-10, 10]) {
                    tone(c, this.padBus, { type: 'sawtooth', f: mtof(m), t, a: 0.35, h: Math.max(0.1, barDur - 0.5), d: 0.6, v: 0.018, detune: det, filter: 'lowpass', fq: 0.7, ff: 1000 });
                }
            }
        }

        // ---- lead
        const ev = a.lead ? this.leads[a.lead].get(bar * 16 + st) : null;
        if (ev) {
            const f = mtof(ev.m);
            if (race) {
                tone(c, this.leadBus, { type: 'sawtooth', f, t, a: 0.003, d: sp * 0.95, v: ev.accent ? 0.15 : 0.11, filter: 'lowpass', fq: 2, ff: 3400, ff1: 1100 });
                tone(c, this.leadBus, { type: 'square', f, t, a: 0.003, d: sp * 0.9, v: ev.accent ? 0.05 : 0.035, detune: 8, filter: 'lowpass', ff: 2600 });
                if (a.double) tone(c, this.leadBus, { type: 'square', f: f / 2, t, a: 0.003, d: sp * 0.9, v: 0.04, filter: 'lowpass', ff: 1500 });
            } else {
                let d = 0;
                for (let k = 0; k < ev.len; k++) d += this.stepLength(step + k);
                const o = tone(c, this.leadBus, { wave: wave(c, 'pulse25'), f, t, a: 0.004, h: d * 0.55, d: d * 0.4 + 0.03, v: 0.13 });
                if (ev.len >= 3) lfo(c, o.frequency, { f: 6, depth: f * 0.01, t: t + 0.12, dur: d });
                tone(c, this.leadBus, { type: 'triangle', f: f * 2, t, a: 0.004, d: Math.min(0.1, d), v: 0.045 });
            }
        }
    }

    stop() {
        clearInterval(this.timer);
        const now = this.c.currentTime;
        this.out.gain.cancelScheduledValues(now);
        this.out.gain.setTargetAtTime(0, now, 0.12);
        const out = this.out, nodes = this.nodes;
        setTimeout(() => { out.disconnect(); for (const n of nodes) n.disconnect(); }, 1500);
    }
}

function startMusic(mood) {
    if (musicNow && musicNow.mood === mood) return;
    musicNow?.stop();
    musicNow = mood ? new Music(ctx, musBus, mood) : null;
}

// ---------------------------------------------------------------- public API

function rampMaster() {
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(masterLevel(), now, 0.03);
}

export const audio = {
    /** Must be called from a user gesture once (creates/resumes the AudioContext). Safe to call often. */
    unlock() {
        if (!ensure()) return;
        if (settings.on && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },

    get enabled() { return settings.on; },
    setEnabled(on) {
        settings.on = !!on;
        saveSettings();
        if (!ctx) return;
        clearTimeout(suspendTimer);
        rampMaster();
        if (settings.on) {
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        } else {
            // fade out, then suspend: no CPU while muted
            suspendTimer = setTimeout(() => { if (!settings.on && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 200);
        }
    },
    get volume() { return settings.volume; },
    setVolume(v) {
        settings.volume = clamp01(Number(v));
        saveSettings();
        rampMaster();
    },

    /**
     * One engine voice per car. drive: 'Electric' | 'Gas' | 'Turbo'. local = true: never distance-attenuated, no pan/Doppler.
     * update({ rpm, throttle, speed, turbo, boostSpool, skid, airborne, distance, [x, z, vx, vz, pan] }) once per frame.
     */
    engine(drive, { local = false } = {}) {
        const v = new EngineVoice(drive, local);
        return { update: s => v.update(s), stop: () => v.stop() };
    },

    /** One-shot effect. With x/z (and a listener set) the sound is attenuated by distance, darkened when far and panned. */
    play(name, { x, z, volume = 1, pitch = 1 } = {}) {
        const def = SOUNDS[name];
        if (!def) {
            console.warn(`TurboToys audio: unknown sound "${name}"`);
            return;
        }
        if (!ctx || !settings.on) return;
        let gain = clamp(Number(volume) || 0, 0, 2), pan = 0, lowpass = 0;
        if (!def.ui && listener.set && Number.isFinite(x) && Number.isFinite(z)) {
            const dx = x - listener.x, dz = z - listener.z, d = Math.hypot(dx, dz);
            gain *= falloff(d);
            pan = panFor(dx, dz, d);
            lowpass = airCutoff(d);
        }
        const j = JITTER[name] ?? 0;
        playBuffer(name, { gain, pan, lowpass, rate: (Number(pitch) || 1) * (1 + (Math.random() * 2 - 1) * j), bus: def.ui ? uiBus : sfxBus });
    },

    /** Listener position (usually the camera) and yaw (three.js camera rotation.y: the camera looks along -Z when yaw = 0). */
    setListener(x, z, yaw = 0) {
        x = Number(x) || 0;
        z = Number(z) || 0;
        // listener velocity (for the Doppler of other cars), smoothed; a jump (respawn, camera cut) resets it
        const t = performance.now() / 1000, dt = t - listener.t;
        if (listener.set && dt > 0.004 && dt < 0.5) {
            const vx = (x - listener.x) / dt, vz = (z - listener.z) / dt;
            if (Math.hypot(vx, vz) < 250) {
                listener.vx += (vx - listener.vx) * 0.3;
                listener.vz += (vz - listener.vz) * 0.3;
            } else listener.vx = listener.vz = 0;
        } else if (dt >= 0.5) listener.vx = listener.vz = 0;
        listener.t = t;
        listener.x = x;
        listener.z = z;
        listener.yaw = Number(yaw) || 0;
        listener.set = true;
    },

    /**
     * The acoustic space of the world sounds and engines (crossfades): 'room' | 'open' | 'tunnel' | 'none',
     * or a layout key for a tuned room: 'kidsroom' | 'kitchen' | 'workshop' | 'supermarket' | 'attic' | 'garden' (= open).
     * Can be called before unlock.
     */
    setSpace(kind) {
        applySpace(SPACES[kind] ? kind : 'room');
    },
    get space() { return spaceWanted; },

    /** Background music: 'menu' | 'race' | null (stop). Can be called before unlock (starts on unlock). */
    music(mood) {
        musicWanted = SONGS[mood] ? mood : null;
        if (ctx) startMusic(musicWanted);
    },
    get musicVolume() { return settings.music; },
    setMusicVolume(v) {
        settings.music = clamp01(Number(v));
        saveSettings();
        if (musBus) musBus.gain.setTargetAtTime(musicLevel(), ctx.currentTime, 0.05);
    },

    /** Developer checks (dev/sound-avatar.html): offline renders with levels, independent of the live context. */
    _debug: {
        sounds: Object.keys(SOUNDS),
        spaces: Object.keys(SPACES),
        /** rawPeak = before normalization, rms = after normalization (what is played at volume 1). */
        async renderSound(name, sampleRate = 44100) {
            const r = await renderDef(SOUNDS[name], sampleRate);
            return { rawPeak: r.rawPeak, rms: r.rms, duration: r.buffer.duration };
        },
        async renderEngine(drive, params, seconds = 1, sampleRate = 44100) {
            const c = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
            const v = new EngineVoice(drive, params.local ?? true, c, c.destination);
            v.update(params);
            return levels(await c.startRendering(), 0.2);
        },
        /** segment > 0: also the rms per segment (s), to see the arrangement; mute: bus names to silence (drums, snareBus, hats, bassBus, ...). */
        async renderMusic(mood, seconds = 6, sampleRate = 44100, segment = 0, mute = []) {
            await kitFor(sampleRate);
            const c = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
            const m = new Music(c, c.destination, mood, { manual: true });
            for (const k of mute) m[k]?.disconnect();
            m.scheduleUntil(seconds);
            const buffer = await c.startRendering();
            const r = levels(buffer, 0.5);
            if (segment > 0) {
                r.parts = [];
                for (let t = 0; t + segment <= seconds + 1e-6; t += segment) r.parts.push(+levels(buffer, t, t + segment).rms.toFixed(3));
            }
            return r;
        },
        stats: () => Object.fromEntries(stats),
    },
};

function levels(buffer, skip = 0, until = Infinity) {
    let peak = 0, sum = 0, n = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const d = buffer.getChannelData(ch);
        const end = Math.min(d.length, Math.floor(until * buffer.sampleRate));
        for (let i = Math.floor(skip * buffer.sampleRate); i < end; i++) {
            const a = Math.abs(d[i]);
            if (a > peak) peak = a;
            sum += d[i] * d[i];
            n++;
        }
    }
    return { peak, rms: Math.sqrt(sum / Math.max(1, n)) };
}
