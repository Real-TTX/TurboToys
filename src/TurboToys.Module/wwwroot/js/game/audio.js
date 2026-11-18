// TurboToys sound: everything is synthesized with WebAudio (no sample files).
//  - one-shot effects are rendered once into AudioBuffers with an OfflineAudioContext (cheap to play ~10x/s per car),
//    normalized to a per-sound peak and played through gain + stereo panner (simple distance attenuation / panning);
//  - engines are persistent node graphs per car (one looping noise source + a few oscillators/filters), update() only
//    moves AudioParams (no node creation per frame);
//  - the music is a small look-ahead step sequencer (drums, bass, chord stabs, lead) with two moods.
// Graph: [sfx | engines | music] -> master (volume, on/off) -> compressor (safety limiter) -> destination.

const STORE = 'turbotoys.sound';
const DRIVES = ['Electric', 'Gas', 'Turbo'];

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
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);

/** Distance (world units, 1 unit = 10 cm) → gain factor. Full volume up to 12 units, then a soft 1/d roll-off. */
function falloff(d) {
    if (!Number.isFinite(d) || d <= 12) return 1;
    const g = 1 / (1 + (d - 12) / 30);
    return g < 0.02 ? 0 : g;
}

const noiseBuffers = new Map();
/** 2 s of white noise per sample rate (shared by every context with that rate). */
function noiseBuffer(sampleRate) {
    let b = noiseBuffers.get(sampleRate);
    if (!b) {
        b = new AudioBuffer({ length: Math.floor(sampleRate * 2), sampleRate, numberOfChannels: 1 });
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        noiseBuffers.set(sampleRate, b);
    }
    return b;
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

const pulseWaves = new WeakMap();
/** A 25 % pulse wave (the chiptune lead) per context. */
function pulseWave(c) {
    let w = pulseWaves.get(c);
    if (!w) {
        const n = 40, real = new Float32Array(n), imag = new Float32Array(n), duty = 0.25;
        for (let i = 1; i < n; i++) real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
        w = c.createPeriodicWave(real, imag);
        pulseWaves.set(c, w);
    }
    return w;
}

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
function tone(c, out, { type = 'sine', wave = null, f = 440, f1 = 0, glide = 0, t = 0, a = 0.004, h = 0, d = 0.2, v = 0.5, detune = 0, filter = null, fq = 1, ff = 0, ff1 = 0 }) {
    const o = c.createOscillator();
    if (wave) o.setPeriodicWave(wave); else o.type = type;
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

/** Filtered noise burst with optional filter sweep f → f1. */
function noise(c, out, { type = 'bandpass', f = 1000, f1 = 0, glide = 0, q = 1, t = 0, a = 0.002, h = 0, d = 0.2, v = 0.5 }) {
    const s = c.createBufferSource();
    s.buffer = noiseBuffer(c.sampleRate);
    s.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + (glide || a + h + d));
    s.connect(fl).connect(envGain(c, out, t, a, v, d, h));
    s.start(t, Math.random() * 1.5);
    s.stop(t + a + h + d + 0.05);
    return fl;
}

function shaperTo(c, out) {
    const sh = c.createWaveShaper();
    sh.curve = softClip();
    sh.oversample = '2x';
    sh.connect(out);
    return sh;
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

function crackle(c, out, { count = 12, from = 0.1, to = 1, v = 0.5 }) {
    for (let i = 0; i < count; i++) {
        const t = rand(from, to);
        const fade = 1 - (t - from) / (to - from) * 0.7;
        noise(c, out, { type: 'highpass', f: rand(1800, 5000), q: 0.7, t, a: 0.001, d: rand(0.012, 0.04), v: v * fade * rand(0.5, 1) });
    }
}

/** Brass-ish fanfare note: two detuned saws through a swelling lowpass. */
function brass(c, out, { m, t, d, v = 0.35, vib = 0 }) {
    const f = mtof(m);
    for (const det of [-7, 7]) {
        const o = tone(c, out, { type: 'sawtooth', f, t, a: 0.03, h: d * 0.6, d: d * 0.4 + 0.08, v, detune: det, filter: 'lowpass', fq: 2, ff: 900, ff1: 2600 });
        if (vib) lfo(c, o.frequency, { f: 5.5, depth: f * 0.012 * vib, t: t + 0.15, dur: d + 0.2 });
    }
}

function chip(c, out, { m, t, d, v = 0.3, wave = null }) {
    tone(c, out, { wave: wave ?? pulseWave(c), f: mtof(m), t, a: 0.003, h: d * 0.5, d: d * 0.5 + 0.04, v });
}

function kick(c, out, t, v = 1) {
    tone(c, out, { f: 150, f1: 42, glide: 0.11, t, a: 0.002, d: 0.26, v });
    noise(c, out, { type: 'highpass', f: 2500, t, a: 0.001, d: 0.012, v: v * 0.25 });
}
function snare(c, out, t, v = 1) {
    noise(c, out, { type: 'highpass', f: 1400, q: 0.6, t, a: 0.001, d: 0.15, v: v * 0.55 });
    tone(c, out, { type: 'triangle', f: 210, f1: 150, t, a: 0.001, d: 0.08, v: v * 0.4 });
}
function hat(c, out, t, v = 1, open = false) {
    noise(c, out, { type: 'highpass', f: 7500, q: 0.8, t, a: 0.001, d: open ? 0.16 : 0.03, v: v * 0.22 });
}
function tom(c, out, t, v = 1, f = 180) {
    tone(c, out, { f, f1: f * 0.6, t, a: 0.002, d: 0.16, v: v * 0.6 });
}
function cymbal(c, out, t, v = 1, d = 1.2) {
    noise(c, out, { type: 'highpass', f: 5500, q: 0.5, t, a: 0.002, d, v: v * 0.35 });
    noise(c, out, { type: 'bandpass', f: 9000, q: 1.2, t, a: 0.002, d: d * 0.7, v: v * 0.2 });
}

// ---------------------------------------------------------------- one-shot sound definitions
// fn(c, out) builds the sound at t ≈ 0 in context c; dur = render length; peak = normalized peak of the buffer.

function explosionCore(c, out, big = true) {
    const sh = shaperTo(c, out);
    tone(c, sh, { f: big ? 115 : 190, f1: big ? 30 : 48, glide: big ? 0.7 : 0.3, t: 0.002, a: 0.004, d: big ? 0.95 : 0.4, v: 1 });
    noise(c, sh, { type: 'lowpass', f: big ? 4200 : 3200, f1: big ? 140 : 260, glide: big ? 1.2 : 0.5, q: 0.8, t: 0.002, a: 0.003, d: big ? 1.6 : 0.6, v: big ? 1 : 0.9 });
    noise(c, sh, { type: 'bandpass', f: 1000, q: 0.8, t: 0.002, a: 0.001, d: big ? 0.25 : 0.12, v: 0.8 });
    crackle(c, out, { count: big ? 22 : 7, from: 0.08, to: big ? 1.2 : 0.5, v: big ? 0.55 : 0.45 });
}

const SOUNDS = {
    click: { dur: 0.08, peak: 0.42, fn(c, o) {
        tone(c, o, { f: 1800, f1: 1150, t: 0.001, a: 0.001, d: 0.04, v: 0.6 });
        noise(c, o, { type: 'highpass', f: 4000, t: 0.001, a: 0.001, d: 0.012, v: 0.3 });
    } },
    hover: { dur: 0.05, peak: 0.13, fn(c, o) {
        tone(c, o, { f: 2600, t: 0.001, a: 0.001, d: 0.025, v: 0.5 });
    } },
    error: { dur: 0.42, peak: 0.28, fn(c, o) {
        for (const [t, d] of [[0.002, 0.11], [0.16, 0.16]]) {
            for (const f of [118, 125]) tone(c, o, { type: 'square', f, t, a: 0.005, h: d, d: 0.04, v: 0.4, filter: 'lowpass', ff: 1400 });
        }
    } },
    mg: { dur: 0.09, peak: 0.42, fn(c, o) {
        noise(c, o, { type: 'highpass', f: 1800, t: 0.001, a: 0.001, d: 0.035, v: 0.8 });
        noise(c, o, { type: 'bandpass', f: 650, q: 1.5, t: 0.001, a: 0.001, d: 0.05, v: 0.7 });
        tone(c, o, { type: 'square', f: 1400, f1: 260, t: 0.001, a: 0.001, d: 0.03, v: 0.35 });
    } },
    rocket: { dur: 1.1, peak: 0.7, fn(c, o) {
        noise(c, o, { type: 'highpass', f: 4000, t: 0.002, a: 0.001, d: 0.12, v: 0.5 });
        noise(c, o, { type: 'bandpass', f: 450, f1: 3200, glide: 0.5, q: 1.4, t: 0.002, a: 0.07, d: 0.9, v: 1 });
        tone(c, o, { type: 'sawtooth', f: 95, f1: 55, t: 0.002, a: 0.02, d: 0.7, v: 0.35, filter: 'lowpass', ff: 700 });
    } },
    explosion: { dur: 2.0, peak: 0.95, fn(c, o) { explosionCore(c, o, true); } },
    'small-explosion': { dur: 0.8, peak: 0.75, fn(c, o) { explosionCore(c, o, false); } },
    'mine-drop': { dur: 0.6, peak: 0.6, fn(c, o) {
        tone(c, o, { type: 'triangle', f: 420, f1: 250, t: 0.002, a: 0.002, d: 0.12, v: 0.8 });
        noise(c, o, { type: 'bandpass', f: 1800, q: 3, t: 0.002, a: 0.001, d: 0.05, v: 0.5 });
        tone(c, o, { type: 'square', f: 1500, t: 0.22, a: 0.002, h: 0.04, d: 0.03, v: 0.3 });
        tone(c, o, { type: 'square', f: 1900, t: 0.36, a: 0.002, h: 0.04, d: 0.05, v: 0.3 });
    } },
    oil: { dur: 0.75, peak: 0.6, fn(c, o) {
        // a wet "blorp": a saw gliding down and up through a sweeping bandpass + bubbles
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
        noise(c, o, { type: 'lowpass', f: 900, t: 0.002, a: 0.01, d: 0.25, v: 0.35 });
        for (const t of [0.2, 0.33, 0.44]) tone(c, o, { f: rand(280, 380), f1: rand(650, 900), glide: 0.05, t, a: 0.003, d: 0.06, v: 0.35 });
    } },
    shock: { dur: 0.7, peak: 0.95, fn(c, o) {
        const buzz = tone(c, o, { type: 'square', f: 72, t: 0.002, a: 0.005, d: 0.6, v: 0.5, filter: 'bandpass', fq: 0.7, ff: 1500, ff1: 600 });
        lfo(c, buzz.frequency, { type: 'square', f: 23, depth: 40, t: 0.002, dur: 0.7 });
        // crackling noise chopped by a fast square LFO
        const am = c.createGain();
        am.gain.value = 0.5;
        am.connect(o);
        lfo(c, am.gain, { type: 'square', f: 37, depth: 0.5, t: 0.002, dur: 0.7 });
        noise(c, am, { type: 'highpass', f: 3000, t: 0.002, a: 0.003, d: 0.55, v: 0.7 });
        tone(c, o, { type: 'sawtooth', f: 2400, f1: 300, t: 0.002, a: 0.002, d: 0.15, v: 0.4 });
    } },
    shield: { dur: 1.15, peak: 0.55, fn(c, o) {
        const hum = tone(c, o, { f: 180, f1: 360, glide: 0.8, t: 0.002, a: 0.08, d: 0.95, v: 0.6 });
        lfo(c, hum.frequency, { f: 7, depth: 12, t: 0.002, dur: 1.1 });
        tone(c, o, { type: 'triangle', f: 360, f1: 720, glide: 0.8, t: 0.002, a: 0.1, d: 0.9, v: 0.25 });
        for (let i = 0; i < 7; i++) {
            const f = rand(400, 900);
            tone(c, o, { f, f1: f * 2.2, glide: 0.05, t: 0.05 + i * 0.11, a: 0.003, d: 0.07, v: 0.35 });
        }
    } },
    pickup: { dur: 0.55, peak: 0.6, fn(c, o) {
        tone(c, o, { type: 'square', f: 988, t: 0.002, a: 0.002, d: 0.08, v: 0.4 });
        tone(c, o, { type: 'square', f: 1319, t: 0.07, a: 0.002, d: 0.3, v: 0.4 });
        tone(c, o, { f: 2637, t: 0.07, a: 0.002, d: 0.38, v: 0.22 });
        tone(c, o, { type: 'triangle', f: 1976, t: 0.07, a: 0.002, d: 0.42, v: 0.25 });
    } },
    repair: { dur: 0.95, peak: 0.55, fn(c, o) {
        for (let i = 0; i < 4; i++) {
            noise(c, o, { type: 'bandpass', f: 3000, q: 4, t: 0.002 + i * 0.06, a: 0.001, d: 0.02, v: 0.7 });
            tone(c, o, { type: 'square', f: 2200, f1: 1800, t: 0.002 + i * 0.06, a: 0.001, d: 0.015, v: 0.2 });
        }
        [72, 76, 79, 84].forEach((m, i) => {
            tone(c, o, { type: 'triangle', f: mtof(m), t: 0.3 + i * 0.07, a: 0.003, d: 0.2, v: 0.4 });
            chip(c, o, { m: m + 12, t: 0.3 + i * 0.07, d: 0.1, v: 0.12 });
        });
    } },
    turbo: { dur: 1.0, peak: 0.75, fn(c, o) {
        noise(c, o, { type: 'highpass', f: 5000, t: 0.002, a: 0.001, d: 0.15, v: 0.4 });
        noise(c, o, { type: 'bandpass', f: 300, f1: 3500, glide: 0.45, q: 2, t: 0.002, a: 0.05, d: 0.8, v: 1 });
        tone(c, o, { type: 'sawtooth', f: 180, f1: 900, glide: 0.5, t: 0.002, a: 0.03, d: 0.6, v: 0.3, filter: 'lowpass', ff: 1800 });
    } },
    pssh: { dur: 0.5, peak: 0.5, fn(c, o) {
        // turbo blow-off valve (engine internal)
        noise(c, o, { type: 'bandpass', f: 3600, f1: 1300, q: 1.5, t: 0.002, a: 0.01, d: 0.36, v: 1 });
        noise(c, o, { type: 'highpass', f: 6000, t: 0.002, a: 0.003, d: 0.15, v: 0.4 });
    } },
    backfire: { dur: 0.35, peak: 0.8, fn(c, o) {
        const sh = shaperTo(c, o);
        noise(c, sh, { type: 'lowpass', f: 1500, t: 0.001, a: 0.001, d: 0.06, v: 1 });
        tone(c, sh, { f: 125, f1: 45, t: 0.001, a: 0.002, d: 0.12, v: 1 });
        noise(c, o, { type: 'bandpass', f: 3000, q: 1, t: 0.001, a: 0.001, d: 0.02, v: 0.5 });
    } },
    crash: { dur: 0.5, peak: 0.7, fn(c, o) {
        tone(c, o, { type: 'triangle', f: 320, f1: 140, t: 0.002, a: 0.002, d: 0.14, v: 0.8 });
        noise(c, o, { type: 'bandpass', f: 1400, q: 1.2, t: 0.002, a: 0.001, d: 0.12, v: 0.7 });
        for (let i = 0; i < 3; i++) tone(c, o, { type: 'square', f: rand(1200, 2700), t: 0.06 + i * 0.05, a: 0.001, d: 0.02, v: 0.2 });
    } },
    scrape: { dur: 0.45, peak: 0.6, fn(c, o) {
        const am = c.createGain();
        am.gain.value = 0.6;
        am.connect(o);
        lfo(c, am.gain, { type: 'sawtooth', f: 28, depth: 0.4, t: 0.002, dur: 0.45 });
        noise(c, am, { type: 'bandpass', f: 2600, q: 3, t: 0.002, a: 0.02, d: 0.35, v: 1 });
        tone(c, am, { type: 'sawtooth', f: 340, f1: 300, t: 0.002, a: 0.02, d: 0.3, v: 0.15, filter: 'bandpass', ff: 1700 });
    } },
    land: { dur: 0.45, peak: 0.75, fn(c, o) {
        tone(c, o, { f: 95, f1: 40, t: 0.002, a: 0.003, d: 0.22, v: 1 });
        noise(c, o, { type: 'lowpass', f: 600, t: 0.002, a: 0.002, d: 0.12, v: 0.7 });
        noise(c, o, { type: 'bandpass', f: 2000, q: 2, t: 0.002, a: 0.001, d: 0.03, v: 0.3 });
        tone(c, o, { type: 'square', f: 1700, t: 0.07, a: 0.001, d: 0.02, v: 0.12 });
    } },
    countdown: { dur: 0.32, peak: 0.3, fn(c, o) {
        tone(c, o, { type: 'square', f: 660, t: 0.002, a: 0.003, h: 0.12, d: 0.12, v: 0.3 });
        tone(c, o, { f: 660, t: 0.002, a: 0.003, h: 0.12, d: 0.15, v: 0.4 });
    } },
    go: { dur: 0.65, peak: 0.38, fn(c, o) {
        tone(c, o, { type: 'square', f: 1320, t: 0.002, a: 0.003, h: 0.3, d: 0.25, v: 0.3 });
        tone(c, o, { f: 1320, t: 0.002, a: 0.003, h: 0.3, d: 0.3, v: 0.4 });
        tone(c, o, { f: 2640, t: 0.002, a: 0.003, h: 0.2, d: 0.2, v: 0.12 });
    } },
    lap: { dur: 0.75, peak: 0.55, fn(c, o) {
        [79, 84, 88].forEach((m, i) => {
            const d = i === 2 ? 0.35 : 0.08;
            chip(c, o, { m, t: 0.002 + i * 0.09, d, v: 0.32 });
            tone(c, o, { type: 'triangle', f: mtof(m - 12), t: 0.002 + i * 0.09, a: 0.003, d: d + 0.05, v: 0.35 });
        });
    } },
    'final-lap': { dur: 1.05, peak: 0.62, fn(c, o) {
        [88, 91, 88, 91, 96].forEach((m, i) => {
            const d = i === 4 ? 0.45 : 0.055;
            chip(c, o, { m, t: 0.002 + i * 0.08 + (i === 4 ? 0.03 : 0), d, v: 0.32, wave: null });
            tone(c, o, { type: 'square', f: mtof(m - 24), t: 0.002 + i * 0.08, a: 0.003, d: 0.06, v: 0.18, filter: 'lowpass', ff: 1200 });
        });
        const v = tone(c, o, { f: mtof(96), t: 0.37, a: 0.01, h: 0.25, d: 0.2, v: 0.15 });
        lfo(c, v.frequency, { f: 9, depth: 30, t: 0.37, dur: 0.6 });
    } },
    finish: { dur: 1.9, peak: 0.7, fn(c, o) {
        [[72, 0, 0.11], [76, 0.13, 0.11], [79, 0.26, 0.11], [84, 0.4, 1.0]].forEach(([m, t, d]) => brass(c, o, { m, t: t + 0.002, d, v: 0.3, vib: d > 0.5 ? 1 : 0 }));
        brass(c, o, { m: 76, t: 0.4, d: 1.0, v: 0.18 });
        brass(c, o, { m: 79, t: 0.4, d: 1.0, v: 0.18 });
        kick(c, o, 0.4, 0.8);
        cymbal(c, o, 0.4, 0.8, 1.2);
    } },
    win: { dur: 3.1, peak: 0.9, fn(c, o) {
        [67, 72, 76, 79].forEach((m, i) => brass(c, o, { m, t: 0.002 + i * 0.1, d: 0.08, v: 0.28 }));
        brass(c, o, { m: 84, t: 0.42, d: 0.22, v: 0.3 });
        snare(c, o, 0.42, 0.6);
        for (const [t, chord, d] of [[0.72, [77, 81, 84], 0.26], [1.02, [79, 83, 86], 0.26], [1.35, [84, 88, 91], 1.4]]) {
            for (const m of chord) brass(c, o, { m, t, d, v: 0.17, vib: d > 1 ? 1 : 0 });
            brass(c, o, { m: chord[0] - 24, t, d, v: 0.2 });
            kick(c, o, t, 0.9);
        }
        for (let i = 0; i < 6; i++) snare(c, o, 1.05 + i * 0.05, 0.25 + i * 0.08);
        cymbal(c, o, 1.35, 1, 1.6);
        for (let i = 0; i < 8; i++) tone(c, o, { f: rand(2500, 4200), t: 1.4 + i * 0.12, a: 0.002, d: 0.08, v: 0.12 });
    } },
    lose: { dur: 2.4, peak: 0.45, fn(c, o) {
        // "wah wah wah waaah": a trombone-ish saw with a wah filter per note
        [[67, 0, 0.36], [66, 0.45, 0.36], [65, 0.9, 0.36], [64, 1.35, 0.95]].forEach(([m, t, d]) => {
            t += 0.002;
            const f = mtof(m - 12);
            const osc = c.createOscillator();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f * 1.02, t);
            osc.frequency.exponentialRampToValueAtTime(f, t + 0.06);
            if (d > 0.5) lfo(c, osc.frequency, { f: 6, depth: f * 0.03, t: t + 0.2, dur: d });
            const lp = c.createBiquadFilter();
            lp.type = 'lowpass';
            lp.Q.value = 6;
            lp.frequency.setValueAtTime(280, t);
            lp.frequency.exponentialRampToValueAtTime(1500, t + 0.12);
            lp.frequency.exponentialRampToValueAtTime(380, t + d);
            osc.connect(lp).connect(envGain(c, o, t, 0.03, 0.7, 0.12, d - 0.1));
            osc.start(t);
            osc.stop(t + d + 0.2);
        });
    } },
    buy: { dur: 1.2, peak: 0.65, fn(c, o) {
        noise(c, o, { type: 'bandpass', f: 2600, q: 0.8, t: 0.002, a: 0.002, d: 0.08, v: 0.8 });
        noise(c, o, { type: 'lowpass', f: 400, t: 0.02, a: 0.003, d: 0.15, v: 0.5 });
        for (const [t, f0] of [[0.1, 2093], [0.18, 2637]]) {
            for (const [r, v] of [[1, 0.4], [2.76, 0.14], [5.4, 0.07]]) tone(c, o, { f: f0 * r, t, a: 0.002, d: 0.9 / r, v });
        }
    } },
    upgrade: { dur: 1.05, peak: 0.5, fn(c, o) {
        tone(c, o, { type: 'square', f: 300, f1: 1200, glide: 0.5, t: 0.002, a: 0.02, d: 0.5, v: 0.22, filter: 'lowpass', ff: 2200 });
        [72, 76, 79, 84, 88].forEach((m, i) => chip(c, o, { m, t: 0.08 + i * 0.08, d: i === 4 ? 0.35 : 0.07, v: 0.3 }));
        for (let i = 0; i < 6; i++) tone(c, o, { f: rand(2800, 4500), t: 0.45 + i * 0.07, a: 0.002, d: 0.06, v: 0.14 });
    } },
    wreck: { dur: 2.3, peak: 0.95, fn(c, o) {
        explosionCore(c, o, true);
        for (let i = 0; i < 16; i++) {
            const t = rand(0.25, 1.6);
            tone(c, o, { type: 'triangle', f: rand(900, 3200), t, a: 0.001, d: rand(0.02, 0.05), v: rand(0.15, 0.3) });
            if (i % 3 === 0) noise(c, o, { type: 'bandpass', f: rand(1800, 3500), q: 3, t, a: 0.001, d: 0.02, v: 0.25 });
        }
    } },
};

// render order: UI first (they are needed right after unlock), then the race sounds
const RENDER_ORDER = ['click', 'hover', 'error', 'buy', 'upgrade', 'countdown', 'go', 'mg', 'rocket', 'explosion', 'small-explosion', 'crash', 'scrape',
    'land', 'backfire', 'turbo', 'pssh', 'pickup', 'shield', 'repair', 'mine-drop', 'oil', 'shock', 'wreck', 'lap', 'final-lap', 'finish', 'win', 'lose'];
// small random pitch variation for the frequently repeated sounds
const JITTER = { mg: 0.06, backfire: 0.12, crash: 0.08, scrape: 0.08, land: 0.06, 'small-explosion': 0.08, explosion: 0.05, pickup: 0.02, hover: 0.03 };

/** Render a one-shot offline; returns { buffer, rawPeak, rms }. */
async function renderSound(name, sampleRate) {
    const def = SOUNDS[name];
    const c = new OfflineAudioContext(1, Math.ceil(def.dur * sampleRate), sampleRate);
    def.fn(c, c.destination);
    const buffer = await c.startRendering();
    const d = buffer.getChannelData(0);
    let peak = 0, sum = 0;
    for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > peak) peak = a;
        sum += d[i] * d[i];
    }
    const rms = Math.sqrt(sum / d.length);
    if (peak > 1e-4) {
        const k = def.peak / peak;
        for (let i = 0; i < d.length; i++) d[i] *= k;
        // short fade-out against a click at the buffer end
        const n = Math.min(d.length, Math.floor(sampleRate * 0.005));
        for (let i = 0; i < n; i++) d[d.length - 1 - i] *= i / n;
    }
    return { buffer, rawPeak: peak, rms };
}

// ---------------------------------------------------------------- core state

let ctx = null, master = null, sfxBus = null, engBus = null, musBus = null;
const buffers = new Map();
const stats = new Map();
let rendering = null;
let musicNow = null, musicWanted = null;
const listener = { x: 0, z: 0, yaw: 0, set: false };
let suspendTimer = 0;

const masterLevel = () => (settings.on ? Math.pow(settings.volume, 1.5) : 0);
const musicLevel = () => Math.pow(settings.music, 1.5) * 0.55;

function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = masterLevel();
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    engBus = ctx.createGain();
    engBus.gain.value = 0.75;
    engBus.connect(master);
    musBus = ctx.createGain();
    musBus.gain.value = musicLevel();
    musBus.connect(master);
    rendering = (async () => {
        for (const name of RENDER_ORDER) {
            const r = await renderSound(name, ctx.sampleRate);
            buffers.set(name, r.buffer);
            stats.set(name, { rawPeak: r.rawPeak, rms: r.rms, duration: r.buffer.duration });
        }
    })().catch(e => console.warn('TurboToys audio: rendering failed', e));
    if (musicWanted) startMusic(musicWanted);
    return ctx;
}

/** Play a rendered buffer: gain + pan → sfx bus. */
function playBuffer(name, gain, pan = 0, rate = 1) {
    if (!ctx || !settings.on || ctx.state !== 'running') return;
    const buffer = buffers.get(name);
    if (!buffer || gain < 0.003) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = clamp(rate, 0.25, 4);
    const g = ctx.createGain();
    g.gain.value = gain;
    let tail = g;
    if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = clamp(pan, -1, 1);
        g.connect(p);
        tail = p;
    }
    tail.connect(sfxBus);
    src.connect(g);
    src.onended = () => { src.disconnect(); g.disconnect(); if (tail !== g) tail.disconnect(); };
    src.start();
}

// ---------------------------------------------------------------- engines

class EngineVoice {
    constructor(drive, local, c = null, dest = null) {
        this.drive = DRIVES.includes(drive) ? drive : 'Gas';
        this.local = !!local;
        this.c = null;
        this.stopped = false;
        this.cache = new Map();
        this.prevThrottle = 0;
        this.lastT = 0;
        this.lastPop = 0;
        this.lastBlow = 0;
        if (c) this.build(c, dest);
    }

    build(c, dest) {
        this.c = c;
        const t = c.currentTime;
        const srcs = (this.srcs = []);
        const G = v => { const g = c.createGain(); g.gain.value = v; return g; };
        const F = (type, f, q = 1) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
        const O = (type, f) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; srcs.push(o); return o; };

        this.out = G(0);
        this.out.connect(dest);
        const nz = c.createBufferSource();
        nz.buffer = noiseBuffer(c.sampleRate);
        nz.loop = true;
        srcs.push(nz);

        // tyre squeal: band-passed noise + a jittering triangle
        this.skidF = F('bandpass', 1700, 4);
        this.skidG = G(0);
        nz.connect(this.skidF).connect(this.skidG).connect(this.out);
        this.squeal = O('triangle', 1000);
        this.squealG = G(0);
        this.squeal.connect(this.squealG).connect(this.out);
        // turbo boost roar (every drive)
        this.boostF = F('bandpass', 900, 1.1);
        this.boostG = G(0);
        nz.connect(this.boostF).connect(this.boostG).connect(this.out);

        this.body = G(0);
        this.body.connect(this.out);
        if (this.drive === 'Electric') {
            // whiny motor: triangle + octave sine + a quiet low square buzz (PWM) + a 3rd harmonic whine
            this.o1 = O('triangle', 200);
            this.o2 = O('sine', 400);
            this.o3 = O('square', 100);
            this.o4 = O('sine', 600);
            const g2 = G(0.35);
            const buzzF = F('lowpass', 900, 2);
            const buzzG = G(0.1);
            this.whineG = G(0.05);
            this.o1.connect(this.body);
            this.o2.connect(g2).connect(this.body);
            this.o3.connect(buzzF).connect(buzzG).connect(this.body);
            this.o4.connect(this.whineG).connect(this.body);
        } else if (this.drive === 'Gas') {
            // buzzy 2-stroke: saw + sub square → soft clip → lowpass → putt-putt AM (square LFO at half the firing rate)
            this.o1 = O('sawtooth', 100);
            this.o2 = O('square', 50);
            const g2 = G(0.45);
            const sh = c.createWaveShaper();
            sh.curve = softClip();
            this.lp = F('lowpass', 1500, 2.5);
            this.am = G(0.6);
            this.lfo = O('square', 50);
            const lfoG = G(0.35);
            this.lfo.connect(lfoG).connect(this.am.gain);
            this.o1.connect(sh);
            this.o2.connect(g2).connect(sh);
            sh.connect(this.lp).connect(this.am).connect(this.body);
            this.raspF = F('bandpass', 2500, 0.9);
            this.raspG = G(0);
            nz.connect(this.raspF).connect(this.raspG).connect(this.am);
        } else {
            // deeper engine + turbo whistle (sine + narrow band-passed noise)
            this.o1 = O('sawtooth', 60);
            this.o2 = O('sine', 30);
            const g2 = G(0.8);
            this.lp = F('lowpass', 600, 1.5);
            this.am = G(0.75);
            this.lfo = O('sine', 30);
            const lfoG = G(0.25);
            this.lfo.connect(lfoG).connect(this.am.gain);
            this.o1.connect(this.lp);
            this.o2.connect(g2).connect(this.lp);
            this.lp.connect(this.am).connect(this.body);
            this.wh = O('sine', 1500);
            this.whG = G(0);
            this.wh.connect(this.whG).connect(this.out);
            this.whF = F('bandpass', 1500, 10);
            this.whNG = G(0);
            nz.connect(this.whF).connect(this.whNG).connect(this.out);
        }
        for (const s of srcs) {
            if (s === nz) s.start(t, Math.random() * 1.5);
            else s.start(t);
        }
    }

    /** Move a param smoothly; skip tiny changes to keep the automation lists short. */
    set(key, param, v, now, tc = 0.04) {
        const last = this.cache.get(key);
        if (last !== undefined && Math.abs(last - v) <= Math.max(1e-4, Math.abs(v) * 0.004)) return;
        this.cache.set(key, v);
        param.setTargetAtTime(v, now, tc);
    }

    update(s = {}) {
        if (this.stopped) return;
        if (!this.c) {
            if (!ctx) return;
            this.build(ctx, engBus);
        }
        const c = this.c, now = c.currentTime;
        const dt = clamp(now - this.lastT, 0, 0.1);
        this.lastT = now;
        const rpm = clamp01(s.rpm), thr = clamp01(s.throttle), spd = clamp01(s.speed), spool = clamp01(s.boostSpool);
        const air = !!s.airborne, boost = !!s.turbo;
        const skid = air ? 0 : clamp01(s.skid);
        const att = this.local ? 1 : falloff(s.distance) * 0.6;
        const pm = (air ? 1.12 : 1) * (boost ? 1.06 : 1);

        this.set('out', this.out.gain, att, now, 0.05);
        this.set('skidG', this.skidG.gain, Math.pow(skid, 1.5) * 0.22, now, 0.03);
        this.set('skidF', this.skidF.frequency, 1500 + spd * 600, now);
        this.set('squealG', this.squealG.gain, skid * 0.035, now, 0.03);
        if (skid > 0.01) this.squeal.frequency.setTargetAtTime(950 + spd * 220 + rand(-60, 60), now, 0.03);
        this.set('boostG', this.boostG.gain, boost ? 0.13 : 0, now, boost ? 0.05 : 0.15);
        this.set('boostF', this.boostF.frequency, 600 + spd * 1300, now);

        if (this.drive === 'Electric') {
            const f = (140 + Math.pow(rpm, 1.1) * 1100) * pm;
            this.set('f1', this.o1.frequency, f, now, 0.03);
            this.set('f2', this.o2.frequency, f * 2, now, 0.03);
            this.set('f3', this.o3.frequency, f * 0.5, now, 0.03);
            this.set('f4', this.o4.frequency, f * 3, now, 0.03);
            this.set('whine', this.whineG.gain, 0.02 + rpm * 0.08, now);
            this.set('body', this.body.gain, (0.03 + 0.17 * Math.max(thr, rpm * 0.6)) * (air ? 0.8 : 1), now, 0.06);
        } else if (this.drive === 'Gas') {
            const f = (55 + rpm * 230) * pm;
            this.set('f1', this.o1.frequency, f, now, 0.03);
            this.set('f2', this.o2.frequency, f * 0.502, now, 0.03);
            this.set('lfo', this.lfo.frequency, f * 0.5, now, 0.03);
            this.set('lp', this.lp.frequency, 700 + thr * 2800 + rpm * 1500, now, 0.05);
            this.set('raspF', this.raspF.frequency, 1500 + rpm * 3000, now);
            this.set('raspG', this.raspG.gain, 0.03 + thr * 0.08, now);
            this.set('body', this.body.gain, 0.1 + 0.12 * thr + 0.05 * rpm, now, 0.05);
            // pops on lifting the throttle at revs, and now and then while coasting
            if (c === ctx && att > 0.01 && now - this.lastPop > 0.18) {
                const lifted = this.prevThrottle - thr > 0.4 && rpm > 0.45;
                const coasting = thr < 0.15 && rpm > 0.5 && Math.random() < dt * 1.6;
                if ((lifted && Math.random() < 0.7) || coasting) {
                    this.lastPop = now;
                    playBuffer('backfire', 0.55 * att, 0, rand(0.85, 1.25));
                }
            }
        } else {
            const f = (45 + rpm * 170) * pm;
            this.set('f1', this.o1.frequency, f, now, 0.03);
            this.set('f2', this.o2.frequency, f * 0.5, now, 0.03);
            this.set('lfo', this.lfo.frequency, f * 0.5, now, 0.03);
            this.set('lp', this.lp.frequency, 400 + thr * 1600 + rpm * 900, now, 0.05);
            this.set('body', this.body.gain, 0.12 + 0.12 * thr + 0.04 * rpm, now, 0.05);
            const wf = 1200 + spool * 4200;
            this.set('wh', this.wh.frequency, wf, now, 0.05);
            this.set('whF', this.whF.frequency, wf * 1.01, now, 0.05);
            this.set('whG', this.whG.gain, spool * spool * 0.035, now, 0.05);
            this.set('whNG', this.whNG.gain, spool * 0.07, now, 0.05);
            // blow-off "pssh" when lifting at high boost
            if (c === ctx && att > 0.01 && this.prevThrottle > 0.5 && thr < 0.25 && spool > 0.5 && now - this.lastBlow > 0.6) {
                this.lastBlow = now;
                playBuffer('pssh', spool * 0.8 * att, 0, rand(0.92, 1.08));
            }
        }
        this.prevThrottle = thr;
    }

    stop() {
        if (this.stopped) return;
        this.stopped = true;
        if (!this.c) return;
        const now = this.c.currentTime;
        this.out.gain.cancelScheduledValues(now);
        this.out.gain.setTargetAtTime(0, now, 0.03);
        const srcs = this.srcs, out = this.out;
        setTimeout(() => {
            for (const s of srcs) { try { s.stop(); } catch { /* already stopped */ } }
            out.disconnect();
        }, 300);
    }
}

// ---------------------------------------------------------------- music

// bar chords: bass root (MIDI) + stab chord
const CH = {
    C: { root: 48, notes: [60, 64, 67] }, Am: { root: 45, notes: [57, 60, 64] }, F: { root: 41, notes: [57, 60, 65] },
    G: { root: 43, notes: [55, 59, 62] }, Dm: { root: 50, notes: [57, 62, 65] }, E: { root: 40, notes: [56, 59, 64] },
};
// lead: per bar [step, midi, length in 16ths]
const SONGS = {
    menu: {
        bpm: 112, swing: 0.14, gain: 0.6,
        chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'],
        bass: [0, null, 12, null, 7, null, 12, null, 0, null, 12, null, 7, null, 12, 7],
        stabs: [4, 12], hats: [0, 2, 4, 6, 8, 10, 12, 14], openHat: [14], kicks: [0, 8, 11], snares: [4, 12],
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
    },
    race: {
        bpm: 152, swing: 0, gain: 0.85, tremolo: true,
        chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E'],
        bass: [0, null, 0, 0, 12, null, 0, 0, 7, null, 0, 0, 12, null, 7, null],
        stabs: [2, 6, 10, 14], hats: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], openHat: [], kicks: [0, 3, 8, 11], snares: [4, 12],
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
    },
};

class Music {
    /** manual = true: no timer (offline rendering calls scheduleUntil itself). */
    constructor(c, dest, mood, { manual = false } = {}) {
        this.c = c;
        this.mood = mood;
        this.song = SONGS[mood];
        const t = c.currentTime;
        this.out = c.createGain();
        this.out.gain.setValueAtTime(0.0001, t);
        this.out.gain.linearRampToValueAtTime(this.song.gain, t + 0.3);
        this.out.connect(dest);
        const pan = v => {
            const p = c.createStereoPanner();
            p.pan.value = v;
            p.connect(this.out);
            return p;
        };
        this.drums = this.out;
        this.hats = pan(0.3);
        this.stabBus = pan(-0.3);
        this.leadBus = pan(0.12);
        // a short dotted-eighth echo with a darkened feedback (springy surf flavour) on the lead
        const stepDur = 60 / this.song.bpm / 4;
        this.delay = c.createDelay(1);
        this.delay.delayTime.value = stepDur * 3;
        const fb = c.createGain();
        fb.gain.value = 0.3;
        const dl = c.createBiquadFilter();
        dl.type = 'lowpass';
        dl.frequency.value = 2200;
        const send = c.createGain();
        send.gain.value = 0.3;
        this.leadBus.connect(send).connect(this.delay).connect(dl).connect(fb).connect(this.delay);
        dl.connect(this.out);
        // per-step lead events
        this.leadAt = new Map();
        this.song.lead.forEach((bar, b) => {
            for (const [st, m, len] of bar) {
                if (this.song.tremolo) for (let k = 0; k < len; k++) this.leadAt.set(b * 16 + st + k, { m, len: 1, accent: k % 2 === 0, first: k === 0 });
                else this.leadAt.set(b * 16 + st, { m, len, accent: true, first: true });
            }
        });
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

    playStep(step, t) {
        const c = this.c, s = this.song, race = !!s.tremolo;
        const st = step % 16, bar = Math.floor(step / 16) % 8, loop = Math.floor(step / 128);
        const sp = 60 / s.bpm / 4;
        const chord = CH[s.chords[bar]];
        const fill = bar === 7 && st >= 12;
        const intro = loop === 0 && bar < 2 && !race;
        // drums
        if (!fill) {
            if (s.kicks.includes(st) && !intro) kick(c, this.drums, t, 0.85);
            if (s.snares.includes(st) && !intro) snare(c, this.drums, t, 0.55);
        } else {
            snare(c, this.drums, t, 0.3 + (st - 12) * 0.1);
            if (race) tom(c, this.drums, t, 0.6, 220 - (st - 12) * 30);
            if (st === 12) kick(c, this.drums, t, 0.85);
        }
        if (s.hats.includes(st)) hat(c, this.hats, t, race ? (st % 2 === 0 ? 0.7 : 0.4) : 0.6, s.openHat.includes(st));
        if (step % 128 === 0 && step > 0) cymbal(c, this.drums, t, 0.6, 1.0);
        // bass
        const off = s.bass[st];
        if (off !== null && off !== undefined) {
            const m = chord.root + off;
            if (race) tone(c, this.drums, { type: 'sawtooth', f: mtof(m), t, a: 0.004, d: sp * 1.2, v: 0.32, filter: 'lowpass', fq: 4, ff: 1300, ff1: 260 });
            else {
                tone(c, this.drums, { type: 'triangle', f: mtof(m), t, a: 0.004, h: sp * 0.8, d: sp * 0.8, v: 0.5 });
                tone(c, this.drums, { type: 'square', f: mtof(m), t, a: 0.004, d: sp * 1.2, v: 0.12, filter: 'lowpass', ff: 900 });
            }
        }
        // chord stabs
        if (s.stabs.includes(st)) {
            for (const m of chord.notes) {
                if (race) tone(c, this.stabBus, { type: 'sawtooth', f: mtof(m), t, a: 0.003, d: 0.08, v: 0.07, filter: 'lowpass', fq: 1.5, ff: 2400, ff1: 700 });
                else tone(c, this.stabBus, { wave: pulseWave(c), f: mtof(m + 12), t, a: 0.003, d: 0.14, v: 0.05 });
            }
        }
        // lead (rests in a breakdown every third loop, first half)
        const breakdown = loop % 3 === 2 && bar < 4;
        const ev = this.leadAt.get(bar * 16 + st);
        if (ev && !breakdown && !intro) {
            const f = mtof(ev.m);
            if (race) {
                tone(c, this.leadBus, { type: 'sawtooth', f, t, a: 0.003, d: sp * 0.95, v: ev.accent ? 0.17 : 0.12, filter: 'lowpass', fq: 2, ff: 3400, ff1: 1100 });
                tone(c, this.leadBus, { type: 'square', f, t, a: 0.003, d: sp * 0.9, v: ev.accent ? 0.06 : 0.04, detune: 8, filter: 'lowpass', ff: 2600 });
            } else {
                let d = 0;
                for (let k = 0; k < ev.len; k++) d += this.stepLength(step + k);
                const o = tone(c, this.leadBus, { wave: pulseWave(c), f, t, a: 0.004, h: d * 0.55, d: d * 0.4 + 0.03, v: 0.15 });
                if (ev.len >= 3) lfo(c, o.frequency, { f: 6, depth: f * 0.01, t: t + 0.12, dur: d });
                tone(c, this.leadBus, { type: 'triangle', f: f * 2, t, a: 0.004, d: Math.min(0.1, d), v: 0.05 });
            }
        }
    }

    stop() {
        clearInterval(this.timer);
        const now = this.c.currentTime;
        this.out.gain.cancelScheduledValues(now);
        this.out.gain.setTargetAtTime(0, now, 0.12);
        const out = this.out, delay = this.delay;
        setTimeout(() => { out.disconnect(); delay.disconnect(); }, 900);
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

    /** One engine voice per car. drive: 'Electric' | 'Gas' | 'Turbo'. local = true: never distance-attenuated. */
    engine(drive, { local = false } = {}) {
        const v = new EngineVoice(drive, local);
        return { update: s => v.update(s), stop: () => v.stop() };
    },

    /** One-shot effect. With x/z (and a listener set) the sound is attenuated by distance and panned. */
    play(name, { x, z, volume = 1, pitch = 1 } = {}) {
        if (!SOUNDS[name]) {
            console.warn(`TurboToys audio: unknown sound "${name}"`);
            return;
        }
        if (!ctx || !settings.on) return;
        let gain = clamp(Number(volume) || 0, 0, 2), pan = 0;
        if (listener.set && Number.isFinite(x) && Number.isFinite(z)) {
            const dx = x - listener.x, dz = z - listener.z, d = Math.hypot(dx, dz);
            gain *= falloff(d);
            if (d > 0.5) {
                // listener right vector for a three.js camera with rotation.y = yaw: (cos yaw, -sin yaw)
                pan = clamp(((dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw)) / d) * 0.8, -0.8, 0.8) * Math.min(1, d / 10);
            }
        }
        const j = JITTER[name] ?? 0;
        playBuffer(name, gain, pan, (Number(pitch) || 1) * (1 + (Math.random() * 2 - 1) * j));
    },

    /** Listener position (usually the camera) and yaw (three.js camera rotation.y: the camera looks along -Z when yaw = 0). */
    setListener(x, z, yaw = 0) {
        listener.x = Number(x) || 0;
        listener.z = Number(z) || 0;
        listener.yaw = Number(yaw) || 0;
        listener.set = true;
    },

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

    /** Developer checks (dev/sound-avatar.html): offline renders with raw levels, independent of the live context. */
    _debug: {
        sounds: Object.keys(SOUNDS).filter(n => n !== 'pssh'),
        async renderSound(name, sampleRate = 44100) {
            const r = await renderSound(name, sampleRate);
            return { rawPeak: r.rawPeak, rms: r.rms, duration: r.buffer.duration };
        },
        async renderEngine(drive, params, seconds = 1, sampleRate = 44100) {
            const c = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
            const v = new EngineVoice(drive, params.local ?? true, c, c.destination);
            v.update(params);
            return levels(await c.startRendering(), 0.2);
        },
        async renderMusic(mood, seconds = 6, sampleRate = 44100) {
            const c = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
            const m = new Music(c, c.destination, mood, { manual: true });
            m.scheduleUntil(seconds);
            return levels(await c.startRendering(), 0.5);
        },
        stats: () => Object.fromEntries(stats),
    },
};

function levels(buffer, skip = 0) {
    let peak = 0, sum = 0, n = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const d = buffer.getChannelData(ch);
        for (let i = Math.floor(skip * buffer.sampleRate); i < d.length; i++) {
            const a = Math.abs(d[i]);
            if (a > peak) peak = a;
            sum += d[i] * d[i];
            n++;
        }
    }
    return { peak, rms: Math.sqrt(sum / Math.max(1, n)) };
}
