// MatGame SDK 0.1 – copied from MatGame/sdk/js, do not edit here.
// MatGame SDK · transport.js – one way for a game to talk to "its server", online or offline.
//   request(method, path, body) : the game API (online: <game>/api<path> on the master; offline: the game's local side in the shell)
//   start() / stop()            : the hub connection (online: SignalR at <game>/hub; offline: the local game)
//   invoke(method, ...args)     : a hub method with an answer;  send(method, ...args): without one
//   on(name, fn)                : a hub message; returns a function that unsubscribes;  onClose(fn): the connection ended
// The messages and their shapes are the same in both modes (the game's docs/PROTOCOL.md).

import { host } from './host.js';
import { ApiError } from './session.js';
import { versionQuery } from './version.js';

export class OnlineTransport {
    /**
     * @param {{ signalR: any, session: import('./session.js').Session, base: string, hubPath?: string, configure?: (builder:any)=>any }} options
     *   signalR : the SignalR client module (window.signalR or `import * as signalR from '@microsoft/signalr'`)
     *   base    : the game's address below the master: '/bunnywarfare' in the browser, the same path in an app (the master's origin comes from the session)
     */
    constructor({ signalR, session, base, hubPath = '/hub', configure }) {
        this.mode = 'online';
        this.signalR = signalR;
        this.session = session;
        this.base = base.replace(/\/+$/, '');
        this.hubPath = hubPath;
        this.configure = configure;
        this.connection = null;
        this.handlers = new Map();
        this.closeHandlers = [];
    }

    request(method, path, body) {
        return this.session.fetch(`${this.base}/api${path}`, { method, body });
    }

    async start() {
        if (this.connection && this.connection.state !== this.signalR.HubConnectionState.Disconnected) return;
        const info = await host.info();
        const query = versionQuery(info);
        const url = this.session.url(`${this.base}${this.hubPath}${query ? `?${query}` : ''}`);
        let builder = new this.signalR.HubConnectionBuilder()
            .withUrl(url, { accessTokenFactory: () => this.session.accessToken() ?? '', withCredentials: !host.isApp })
            .configureLogging(this.signalR.LogLevel.Warning);
        if (this.configure) builder = this.configure(builder);
        this.connection = builder.build();
        for (const [name, list] of this.handlers) for (const fn of list) this.connection.on(name, fn);
        this.connection.onclose(error => {
            for (const fn of this.closeHandlers) fn(error);
        });
        await this.connection.start();
    }

    async stop() {
        const connection = this.connection;
        this.connection = null;
        if (connection) await connection.stop().catch(() => {});
    }

    get connected() {
        return this.connection?.state === this.signalR.HubConnectionState.Connected;
    }

    get connectionId() {
        return this.connection?.connectionId ?? null;
    }

    invoke(method, ...args) {
        if (!this.connection) return Promise.reject(new Error('Keine Verbindung.'));
        return this.connection.invoke(method, ...args);
    }

    send(method, ...args) {
        if (!this.connection) return Promise.resolve();
        return this.connection.send(method, ...args).catch(() => {});
    }

    on(name, fn) {
        const list = this.handlers.get(name) ?? [];
        list.push(fn);
        this.handlers.set(name, list);
        this.connection?.on(name, fn);
        return () => {
            this.handlers.set(name, (this.handlers.get(name) ?? []).filter(f => f !== fn));
            this.connection?.off(name, fn);
        };
    }

    onClose(fn) {
        this.closeHandlers.push(fn);
        return () => (this.closeHandlers = this.closeHandlers.filter(f => f !== fn));
    }
}

/** The offline game inside the app shell (MatGame.Local.ILocalGame on the C# side). */
export class LocalTransport {
    constructor({ game }) {
        this.mode = 'offline';
        this.game = game;
        this.started = false;
        this.handlers = new Map();
        this.closeHandlers = [];
        this.unsubscribe = host.on('local', (name, ...args) => {
            for (const fn of this.handlers.get(name) ?? []) fn(...args);
        });
    }

    async request(method, path, body) {
        await this.ensure();
        const answer = await host.call('local', 'request', method, path, body ?? null);
        if (answer.status >= 400) throw new ApiError(answer.body?.error ?? `Fehler ${answer.status}`, answer.status, answer.body);
        return answer.body;
    }

    async ensure() {
        if (this.started) return;
        await host.call('local', 'start', this.game);
        this.started = true;
    }

    async start() {
        await this.ensure();
    }

    async stop() {
        // the local game keeps running while the app runs (its rooms end with their matches)
    }

    get connected() {
        return this.started;
    }

    get connectionId() {
        return 'local';
    }

    async invoke(method, ...args) {
        await this.ensure();
        return host.call('local', 'invoke', method, args);
    }

    send(method, ...args) {
        return this.invoke(method, ...args).catch(() => {});
    }

    on(name, fn) {
        const list = this.handlers.get(name) ?? [];
        list.push(fn);
        this.handlers.set(name, list);
        return () => this.handlers.set(name, (this.handlers.get(name) ?? []).filter(f => f !== fn));
    }

    onClose(fn) {
        this.closeHandlers.push(fn);
        return () => (this.closeHandlers = this.closeHandlers.filter(f => f !== fn));
    }
}
