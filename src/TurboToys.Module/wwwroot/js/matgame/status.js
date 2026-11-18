// MatGame SDK 0.1 – copied from MatGame/sdk/js, do not edit here.
// MatGame SDK · status.js – the connection badge of the menu: 'offline' | 'connecting' | 'online' | 'update' (the app is too old for the master).

let current = 'offline';
let detail = null;
const listeners = [];

export const status = {
    get value() {
        return current;
    },
    get detail() {
        return detail;
    },
    set(value, message = null) {
        if (value === current && message === detail) return;
        current = value;
        detail = message;
        for (const fn of listeners) fn(current, detail);
    },
    on(fn) {
        listeners.push(fn);
        fn(current, detail);
        return () => listeners.splice(listeners.indexOf(fn), 1);
    },
    /** German text for the badge. */
    label(value = current) {
        return { offline: 'Offline', connecting: 'Verbinde …', online: 'Online', update: 'Update nötig' }[value] ?? value;
    },
};
