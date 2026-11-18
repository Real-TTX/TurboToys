// MatGame SDK 0.1 – copied from MatGame/sdk/js, do not edit here.
// MatGame SDK · host.js – where does the game run, and the bridge to the app shell.
//   web     : served by a MatGame master (the browser); the master is the page's own origin
//   desktop : inside MatGame.Shell on Windows (WebView2: window.chrome.webview)
//   mobile  : inside the MAUI shell (later: window.MatGameBridge with the same messages)
// Bridge messages (docs/PROTOCOL.md "Bridge"): page → shell { id, target, method, args }; shell → page { id, ok, result | error } or { event, name, args }.

const pending = new Map();
const listeners = new Map();
let nextId = 1;
let cachedInfo = null;

function nativeChannel() {
    if (window.chrome?.webview?.postMessage) {
        return {
            kind: 'desktop',
            post: message => window.chrome.webview.postMessage(message),
            listen: fn => window.chrome.webview.addEventListener('message', e => fn(e.data)),
        };
    }
    if (window.MatGameBridge?.postMessage) {
        return {
            kind: 'mobile',
            post: message => window.MatGameBridge.postMessage(JSON.stringify(message)),
            listen: fn => window.addEventListener('matgame-bridge', e => fn(typeof e.detail === 'string' ? JSON.parse(e.detail) : e.detail)),
        };
    }
    return null;
}

const channel = nativeChannel();

if (channel) {
    channel.listen(raw => {
        const message = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!message) return;
        if (message.event) {
            for (const fn of listeners.get(message.event) ?? []) fn(message.name, ...(message.args ?? []));
            return;
        }
        const waiting = pending.get(message.id);
        if (!waiting) return;
        pending.delete(message.id);
        if (message.ok) waiting.resolve(message.result ?? null);
        else waiting.reject(Object.assign(new Error(message.error ?? 'Fehler in der App.'), { status: message.status ?? 500, body: message.body }));
    });
}

function meta(name) {
    return document.querySelector(`meta[name="${name}"]`)?.content ?? null;
}

export const host = {
    /** 'web' | 'desktop' | 'mobile' */
    kind: channel?.kind ?? 'web',

    /** True inside an app shell (offline possible, servers can be chosen). */
    get isApp() {
        return this.kind !== 'web';
    },

    /** Calls the shell: target 'app' | 'storage' | 'secure' | 'local'. Rejects in the browser. */
    call(target, method, ...args) {
        if (!channel) return Promise.reject(new Error('Keine App-Hülle.'));
        const id = nextId++;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            channel.post({ id, target, method, args });
        });
    },

    /** Events of the shell ('local' = hub messages of the offline game). Returns a function that unsubscribes. */
    on(event, fn) {
        const list = listeners.get(event) ?? [];
        list.push(fn);
        listeners.set(event, list);
        return () => listeners.set(event, (listeners.get(event) ?? []).filter(f => f !== fn));
    },

    /**
     * Who am I: { kind, platform, game, version, defaultServer }.
     * In the browser from the page's meta tags (matgame-game, matgame-version); in an app from the shell.
     */
    async info() {
        if (cachedInfo) return cachedInfo;
        if (channel) {
            cachedInfo = { kind: this.kind, ...(await this.call('app', 'info')) };
        } else {
            cachedInfo = {
                kind: 'web',
                platform: 'web',
                game: meta('matgame-game'),
                version: meta('matgame-version') ?? 'web',
                defaultServer: location.origin,
            };
        }
        return cachedInfo;
    },

    /** Opens an address in the system browser (the device sign-in); in the browser a new tab. */
    openBrowser(url) {
        if (channel) return this.call('app', 'openBrowser', url);
        window.open(url, '_blank', 'noopener');
        return Promise.resolve();
    },
};

/** Small key/value storage: the shell's files in an app (survive a reinstall of the web files), localStorage in the browser. */
export const storage = {
    async get(key, fallback = null) {
        try {
            if (channel) {
                const value = await host.call('storage', 'get', key);
                return value == null ? fallback : JSON.parse(value);
            }
            const value = localStorage.getItem(`matgame.${key}`);
            return value == null ? fallback : JSON.parse(value);
        } catch {
            return fallback;
        }
    },
    async set(key, value) {
        const text = JSON.stringify(value);
        if (channel) return host.call('storage', 'set', key, text);
        localStorage.setItem(`matgame.${key}`, text);
    },
    async remove(key) {
        if (channel) return host.call('storage', 'remove', key);
        localStorage.removeItem(`matgame.${key}`);
    },
};

/** Secrets (device tokens): DPAPI / Keychain / Keystore in an app, localStorage in the browser (where tokens are not used: the cookie signs in). */
export const secure = {
    async get(key) {
        if (channel) return host.call('secure', 'get', key);
        return localStorage.getItem(`matgame.secure.${key}`);
    },
    async set(key, value) {
        if (channel) return host.call('secure', 'set', key, value);
        localStorage.setItem(`matgame.secure.${key}`, value);
    },
    async remove(key) {
        if (channel) return host.call('secure', 'remove', key);
        localStorage.removeItem(`matgame.secure.${key}`);
    },
};
