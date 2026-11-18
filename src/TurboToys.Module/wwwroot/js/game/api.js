// Where and as whom the player app plays, and the game API – through the MatGame SDK (../matgame, a copy: never edit it here).
//   browser : the master that serves the page (games.matthix.de/turbotoys/), signed in with its cookie (account or guest)
//   app     : a master chosen in the "Server" panel (device token), or offline: the game runs in the app (TurboToys.Local) as the local guest
// The calls are the same in every mode: api.get('/garage') is GET <base>api/garage on the master, or the local game in the app.
import { connect, host, servers, OnlineTransport, LocalTransport, status, isUpdateError, normalizeServer } from '../matgame/index.js';

export const GAME = 'turbotoys';

/** The address of the app: "/turbotoys/" on the master and in the app shell (the <base href> of index.html). */
export const BASE = new URL(document.baseURI).pathname.replace(/\/?$/, '/');

/** An error of the server: the message to show and the field it belongs to (null = the whole form); update = the app is too old for the master. */
export class ApiError extends Error {
    constructor(message, field = null, status = 0, update = false) {
        super(message);
        this.field = field;
        this.status = status;
        this.update = update;
    }
}

/**
 * Who plays: signedIn, player (PlayerView: id, displayName, isGuest, isAdmin, level, xp, xpLevel, xpNext, money, avatar), version,
 * mode ('online' | 'offline' | 'unreachable'), server, serverName, account (MatGame's), canRegister, guests, problem.
 */
export const session = {
    signedIn: false,
    player: null,
    version: '',
    mode: 'online',
    server: null,
    serverName: null,
    account: null,
    canRegister: false,
    guests: false,
    problem: null,
};

const net = { session: null, transport: null };
const listeners = new Set();

function wrap(error) {
    if (error instanceof ApiError) return error;
    const status = error?.status ?? 0;
    if (status === 401) return new ApiError('Bitte zuerst anmelden.', null, 401);
    // SignalR: "An unexpected error occurred invoking 'X' on the server. HubException: <message>"
    let message = error?.message ?? 'Das hat nicht geklappt.';
    const hub = /HubException: (.*)$/s.exec(message);
    if (hub) message = hub[1];
    if (status === 0 && !error?.message) message = 'Keine Verbindung zum Server.';
    return new ApiError(message, error?.field ?? null, status, isUpdateError(error));
}

async function request(method, url, body) {
    if (!net.transport) throw new ApiError(session.problem ?? 'Keine Verbindung zum Server.');
    const path = url.replace(/^\/api(?=\/)/, '');
    try {
        return await net.transport.request(method, path, body);
    } catch (error) {
        const wrapped = wrap(error);
        if (wrapped.update) status.set('update', wrapped.message);
        throw wrapped;
    }
}

export const api = {
    get: url => request('GET', url),
    post: (url, body = {}) => request('POST', url, body),
    put: (url, body = {}) => request('PUT', url, body),
    del: url => request('DELETE', url),

    /** The transport of the race (hub methods and messages). */
    transport: () => net.transport,

    get isApp() {
        return host.isApp;
    },

    /** Calls a hub method (starts the connection first); errors become ApiError with the server's German message. */
    async invoke(method, ...args) {
        const t = net.transport;
        if (!t) throw new ApiError(session.problem ?? 'Keine Verbindung zum Server.');
        try {
            await t.start();
            return await t.invoke(method, ...args);
        } catch (error) {
            throw wrap(error);
        }
    },

    /** Sends to the hub without waiting (the race's state, many times a second). */
    send(method, ...args) {
        const t = net.transport;
        if (!t || !t.connected) return;
        t.send(method, ...args);
    },

    /** A hub message: returns a function that unsubscribes. */
    on(name, fn) {
        return net.transport ? net.transport.on(name, fn) : () => {};
    },

    /** Changes of the session (sign-in, money after a race …). */
    onSession(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    },

    changed() {
        for (const fn of listeners) fn(session);
    },

    async connect() {
        await net.transport?.stop?.();
        net.transport = null;
        const result = await connect({ game: GAME, base: BASE.replace(/\/$/, '') });
        net.session = result.session;
        session.server = result.server;
        session.problem = result.problem?.message ?? null;
        session.serverName = result.discovery?.name ?? null;
        if (result.server && !result.problem) {
            session.mode = 'online';
            net.transport = new OnlineTransport({
                signalR: window.signalR,
                session: result.session,
                base: result.entry?.path ?? BASE.replace(/\/$/, ''),
                configure: builder => builder.withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 10000, 30000]),
            });
        } else if (host.isApp && !result.server) {
            session.mode = 'offline';
            net.transport = new LocalTransport({ game: GAME });
        } else {
            session.mode = 'unreachable';
        }
        await this.refreshSession();
        return session;
    },

    async refreshSession() {
        session.signedIn = false;
        session.player = null;
        session.account = null;
        if (session.mode === 'unreachable') {
            this.changed();
            return session;
        }
        if (session.mode === 'online') {
            try {
                await net.session.refresh();
            } catch (error) {
                throw wrap(error);
            }
            session.account = net.session.account;
            session.canRegister = net.session.canRegister;
            session.guests = net.session.guests;
            session.serverName = net.session.serverName ?? session.serverName;
            if (!session.account) {
                session.version = document.querySelector('meta[name="matgame-version"]')?.content || session.version;
                this.changed();
                return session;
            }
        }
        const game = await request('GET', '/session');
        session.signedIn = !!game?.signedIn;
        session.player = game?.player ?? null;
        session.version = game?.version ?? session.version;
        this.changed();
        return session;
    },

    async login(loginName, password) {
        await this.onMaster(() => net.session.login(loginName, password));
        return this.refreshSession();
    },
    async register(displayName, loginName, password) {
        await this.onMaster(() => net.session.register(displayName, loginName, password));
        return this.refreshSession();
    },
    async guest(name) {
        await this.onMaster(() => net.session.guest(name));
        return this.refreshSession();
    },
    async upgrade(displayName, loginName, password) {
        await this.onMaster(() => net.session.upgrade(displayName, loginName, password));
        return this.refreshSession();
    },
    async deviceLogin(onCode, signal) {
        await this.onMaster(() => net.session.deviceLogin({ onCode, signal }));
        return this.refreshSession();
    },
    async logout() {
        await net.transport?.stop?.();
        if (session.mode === 'online') await this.onMaster(() => net.session.logout()).catch(() => {});
        return this.refreshSession();
    },
    async onMaster(work) {
        if (!net.session || session.mode !== 'online') throw new ApiError('Dafür braucht es eine Verbindung zu einem Server.');
        try {
            return await work();
        } catch (error) {
            throw wrap(error);
        }
    },

    // ---- the servers of the app
    servers: () => servers.list(),
    currentServer: () => servers.current(),
    async testServer(url) {
        const doc = await servers.discover(url);
        if (!servers.gameOf(doc, GAME)) throw new ApiError(`${doc.name ?? 'Dieser Server'} hat TurboToys nicht.`);
        return doc;
    },
    async useServer(url) {
        await servers.select(url ? normalizeServer(url) : null);
        return this.connect();
    },
    removeServer: url => servers.remove(url),
    playOffline() {
        return this.useServer(null);
    },
};

export { host, status };
