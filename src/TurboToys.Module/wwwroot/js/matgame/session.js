// MatGame SDK 0.1 – copied from MatGame/sdk/js, do not edit here.
// MatGame SDK · session.js – who plays: an account or a guest on a master, or the offline guest on the device.
// Browser: the master's cookie (+ antiforgery token for changes). App: a device token per master (kept in the shell's secure storage).
// The host API is docs/PROTOCOL.md "Host API" (/api/matgame/...).

import { host, secure, storage } from './host.js';
import { versionHeaders } from './version.js';

function deviceName(info) {
    const platform = { windows: 'Windows', android: 'Android', ios: 'iOS', macos: 'macOS' }[info.platform] ?? info.platform ?? 'Gerät';
    return `${info.game ?? 'MatGame'} · ${platform}`;
}

/** An error of the API with status, field and the update flag (426). */
export class ApiError extends Error {
    constructor(message, status, body) {
        super(message);
        this.status = status;
        this.field = body?.field ?? null;
        this.update = body?.update === true || status === 426;
        this.body = body;
    }
}

export class Session {
    /** @param {{ server: string|null }} options – the master ('' or its origin in the browser), null = offline */
    constructor({ server }) {
        this.server = server ?? null;
        this.account = null;
        this.antiforgery = null;
        this.canRegister = false;
        this.guests = false;
        this.token = null;
        this.listeners = [];
    }

    get offline() {
        return this.server == null;
    }

    get signedIn() {
        return this.account != null;
    }

    onChange(fn) {
        this.listeners.push(fn);
        return () => (this.listeners = this.listeners.filter(f => f !== fn));
    }

    changed() {
        for (const fn of this.listeners) fn(this);
    }

    url(path) {
        return `${host.isApp ? this.server : ''}${path}`;
    }

    tokenKey() {
        return `token:${this.server}`;
    }

    /** Headers of a request to the master (bearer + version in an app, antiforgery in the browser). */
    async headers(extra = {}) {
        const info = await host.info();
        const headers = { ...versionHeaders(info), ...extra };
        if (host.isApp && this.token) headers.Authorization = `Bearer ${this.token}`;
        if (!host.isApp && this.antiforgery) headers.RequestVerificationToken = this.antiforgery;
        return headers;
    }

    /** A JSON request to the master: fetch('/api/...', { method, body }) → the answer, or throws an ApiError. */
    async fetch(path, { method = 'GET', body } = {}) {
        if (this.offline) throw new ApiError('Offline.', 0, null);
        const headers = await this.headers(body === undefined ? {} : { 'Content-Type': 'application/json' });
        let response;
        try {
            response = await fetch(this.url(path), {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                credentials: host.isApp ? 'omit' : 'same-origin',
                cache: 'no-store',
            });
        } catch {
            throw new ApiError('Der Server antwortet nicht.', 0, null);
        }
        const data = response.status === 204 ? null : await response.json().catch(() => null);
        if (!response.ok && response.status !== 202) {
            if (response.status === 401 && host.isApp && this.token) await this.forget();
            throw new ApiError(data?.error ?? `Fehler ${response.status}`, response.status, data);
        }
        return data;
    }

    /** Reads who is signed in (and in the browser the antiforgery token). */
    async refresh() {
        if (this.offline) {
            this.account = null;
            this.changed();
            return this;
        }
        if (host.isApp) {
            this.token = await secure.get(this.tokenKey());
        }
        const state = await this.fetch('/api/matgame/session');
        this.apply(state);
        return this;
    }

    apply(state) {
        this.account = state?.account ?? null;
        this.antiforgery = state?.antiforgery ?? this.antiforgery;
        this.canRegister = state?.canRegister ?? false;
        this.guests = state?.guests ?? false;
        this.serverName = state?.server?.name ?? null;
        this.changed();
    }

    async device() {
        const info = await host.info();
        return { name: deviceName(info), platform: info.platform ?? info.kind, game: info.game };
    }

    async signedInWith(answer) {
        if (host.isApp && answer?.token) {
            this.token = answer.token;
            await secure.set(this.tokenKey(), answer.token);
        }
        return this.refresh();
    }

    async login(loginName, password) {
        if (host.isApp) return this.signedInWith(await this.fetch('/api/matgame/token', { method: 'POST', body: { loginName, password, device: await this.device() } }));
        this.apply(await this.fetch('/api/matgame/session/login', { method: 'POST', body: { loginName, password } }));
        return this;
    }

    async register(displayName, loginName, password) {
        const body = { displayName, loginName, password };
        if (host.isApp) return this.signedInWith(await this.fetch('/api/matgame/token/register', { method: 'POST', body: { ...body, device: await this.device() } }));
        this.apply(await this.fetch('/api/matgame/session/register', { method: 'POST', body }));
        return this;
    }

    /** Plays as a guest on the master (when it allows guests). */
    async guest(name) {
        if (host.isApp) return this.signedInWith(await this.fetch('/api/matgame/token/guest', { method: 'POST', body: { name, device: await this.device() } }));
        this.apply(await this.fetch('/api/matgame/session/guest', { method: 'POST', body: { name } }));
        return this;
    }

    /** Turns the guest into an account (keeps its progress). */
    async upgrade(displayName, loginName, password) {
        this.apply(await this.fetch('/api/matgame/account/upgrade', { method: 'POST', body: { displayName, loginName, password } }));
        return this;
    }

    async logout() {
        try {
            if (host.isApp) await this.fetch('/api/matgame/token/revoke', { method: 'POST', body: {} });
            else this.apply(await this.fetch('/api/matgame/session/logout', { method: 'POST', body: {} }));
        } finally {
            if (host.isApp) await this.forget();
        }
    }

    async forget() {
        this.token = null;
        this.account = null;
        await secure.remove(this.tokenKey());
        this.changed();
    }

    /**
     * Sign-in in the browser (apps): the master shows a code page, the player confirms there.
     * onCode({ code, verifyUrl }) is called once; resolves when the master answers with a token, rejects when the code expires or was denied.
     */
    async deviceLogin({ onCode, signal } = {}) {
        const start = await this.fetch('/api/matgame/device/start', { method: 'POST', body: { device: await this.device() } });
        onCode?.({ code: start.code, verifyUrl: start.verifyUrl });
        await host.openBrowser(start.verifyUrl);
        const until = Date.now() + start.expiresIn * 1000;
        while (Date.now() < until) {
            if (signal?.aborted) throw new ApiError('Abgebrochen.', 0, null);
            await new Promise(resolve => setTimeout(resolve, Math.max(1, start.interval) * 1000));
            const answer = await this.fetch('/api/matgame/device/poll', { method: 'POST', body: { deviceCode: start.deviceCode } });
            if (answer?.token) return this.signedInWith(answer);
        }
        throw new ApiError('Der Code ist abgelaufen.', 410, null);
    }

    /** The token for a hub connection (null in the browser: the cookie goes along). */
    accessToken() {
        return host.isApp ? this.token : null;
    }
}

/** The offline guest of a game on this device: { name }. */
export const offlineProfile = {
    async get(game) {
        return (await storage.get(`offline.${game}`, null)) ?? { name: 'Gast' };
    },
    async set(game, profile) {
        await storage.set(`offline.${game}`, profile);
    },
};
