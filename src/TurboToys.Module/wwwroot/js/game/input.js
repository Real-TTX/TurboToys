// TurboToys · input.js – keyboard, gamepad and touch into one control state:
//   throttle -1..1, steer -1..1 (positive = left), handbrake, boost, fire (machine gun), special (crate weapon), plus one-shot actions
//   (reset, camera, pause, look back). Keys: W/S or arrows, A/D or arrows, Space handbrake, Shift turbo, Ctrl/J machine gun, E/K/Enter special,
//   R back on the track, C camera, Esc pause. Gamepad: RT/LT, left stick, A turbo, B handbrake, X machine gun, Y special, Back reset, Start pause.

const keys = new Set();
const pressed = new Set();
const touch = { throttle: 0, steer: 0, boost: false, fire: false, special: false, handbrake: false };

const map = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    handbrake: ['Space'],
    boost: ['ShiftLeft', 'ShiftRight'],
    fire: ['ControlLeft', 'ControlRight', 'KeyJ'],
    special: ['KeyE', 'KeyK', 'Enter', 'NumpadEnter'],
    reset: ['KeyR'],
    camera: ['KeyC'],
    pause: ['Escape', 'KeyP'],
    back: ['KeyB'],
};

const gameKeys = new Set(Object.values(map).flat());

addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
    if (input.active && gameKeys.has(e.code)) e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const down = name => map[name].some(k => keys.has(k));

let padPressed = {};

function pad() {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
}

export const input = {
    /** True while a race runs (the game keys do not scroll the page). */
    active: false,

    /** The control state of this frame. */
    read() {
        let throttle = (down('up') ? 1 : 0) - (down('down') ? 1 : 0);
        let steer = (down('left') ? 1 : 0) - (down('right') ? 1 : 0);
        let handbrake = down('handbrake');
        let boost = down('boost');
        let fire = down('fire');
        let special = false;
        const g = pad();
        const actions = {};
        if (g) {
            const b = i => g.buttons[i]?.pressed ?? false;
            const v = i => g.buttons[i]?.value ?? 0;
            const stick = Math.abs(g.axes[0]) > 0.12 ? g.axes[0] : 0;
            const gasPad = v(7) - v(6);
            if (Math.abs(gasPad) > 0.05) throttle = gasPad;
            if (stick) steer = -stick;
            handbrake ||= b(1);
            boost ||= b(0);
            fire ||= b(2);
            const edge = (i, name) => {
                if (b(i) && !padPressed[i]) actions[name] = true;
                padPressed[i] = b(i);
            };
            edge(3, 'special');
            edge(8, 'reset');
            edge(9, 'pause');
            edge(5, 'camera');
            edge(4, 'back');
        }
        if (touch.throttle || touch.steer) {
            throttle = touch.throttle;
            steer = touch.steer;
        }
        handbrake ||= touch.handbrake;
        boost ||= touch.boost;
        fire ||= touch.fire;
        const was = name => map[name].some(k => pressed.has(k)) || actions[name];
        special = was('special') || touch.special;
        touch.special = false;
        const result = {
            throttle: Math.max(-1, Math.min(1, throttle)),
            steer: Math.max(-1, Math.min(1, steer)),
            handbrake,
            boost,
            fire,
            special,
            reset: was('reset'),
            camera: was('camera'),
            pause: was('pause'),
            lookBack: down('back') || !!actions.back,
        };
        pressed.clear();
        return result;
    },

    /** The touch controls of phones (later: the overlay sets these). */
    touch,
};
