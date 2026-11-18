// MatGame SDK 0.1 – copied from MatGame/sdk/js, do not edit here.
// MatGame SDK · servers.js – which master the game plays against.
// In the browser it is always the page's own origin (the master that serves the game). In an app: the built-in default address
// (host.info().defaultServer), servers the player added, the last used one, or none (= offline).

import { host, storage } from './host.js';
import { PROTOCOL, versionHeaders } from './version.js';

const KEY = 'servers';

/** "games.matthix.de/" → "https://games.matthix.de"; null for an empty input. localhost and IPs may use http. */
export function normalizeServer(input) {
    let text = String(input ?? '').trim();
    if (!text) return null;
    if (!/^https?:\/\//i.test(text)) {
        const local = /^(localhost|127\.|10\.|192\.168\.|\[::1\])/i.test(text);
        text = `${local ? 'http' : 'https'}://${text}`;
    }
    const url = new URL(text);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
}

async function load() {
    const info = await host.info();
    const saved = await storage.get(KEY, null);
    if (saved && Array.isArray(saved.list)) return saved;
    const first = normalizeServer(info.defaultServer);
    return { list: first ? [{ url: first, name: null, lastUsed: null, builtIn: true }] : [], current: first };
}

async function save(state) {
    await storage.set(KEY, state);
}

export const servers = {
    /** All known masters: [{ url, name, lastUsed, builtIn }]. */
    async list() {
        if (!host.isApp) return [{ url: location.origin, name: null, lastUsed: null, builtIn: true }];
        return (await load()).list;
    },

    /** The chosen master, or null = offline. */
    async current() {
        if (!host.isApp) return location.origin;
        return (await load()).current ?? null;
    },

    /** Chooses a master (null = play offline). Adds it to the list. */
    async select(url) {
        if (!host.isApp) return;
        const state = await load();
        const normalized = url ? normalizeServer(url) : null;
        if (normalized && !state.list.some(s => s.url === normalized)) state.list.push({ url: normalized, name: null, lastUsed: null, builtIn: false });
        state.current = normalized;
        const entry = state.list.find(s => s.url === normalized);
        if (entry) entry.lastUsed = new Date().toISOString();
        await save(state);
    },

    async remove(url) {
        if (!host.isApp) return;
        const state = await load();
        state.list = state.list.filter(s => s.url !== url || s.builtIn);
        if (state.current === url) state.current = null;
        await save(state);
    },

    /**
     * Reads the discovery document of a master (throws a readable error when it is none or does not answer).
     * Follows "moved": the stored address is replaced and the new document returned.
     */
    async discover(url, { follow = true } = {}) {
        const base = normalizeServer(url);
        if (!base) throw new Error('Bitte eine Adresse eingeben.');
        let response;
        try {
            response = await fetch(`${base}/.well-known/matgame`, { headers: versionHeaders(await host.info()), cache: 'no-store' });
        } catch {
            throw new Error('Der Server antwortet nicht.');
        }
        if (!response.ok) throw new Error(`Das ist kein MatGame-Server (${response.status}).`);
        const doc = await response.json().catch(() => null);
        if (doc?.kind !== 'matgame') throw new Error('Das ist kein MatGame-Server.');
        if (doc.protocol !== PROTOCOL) throw new Error(doc.protocol > PROTOCOL ? 'Der Server ist neuer als diese App. Bitte die App aktualisieren.' : 'Der Server ist zu alt für diese App.');
        if (follow && doc.moved) {
            const target = normalizeServer(doc.moved);
            if (target && target !== base) {
                await this.replace(base, target);
                return this.discover(target, { follow: false });
            }
        }
        if (host.isApp) {
            const state = await load();
            const entry = state.list.find(s => s.url === base);
            if (entry && entry.name !== doc.name) {
                entry.name = doc.name;
                await save(state);
            }
        }
        return { ...doc, url: base };
    },

    /** The master moved (discovery "moved"): the entry and the choice follow it. */
    async replace(from, to) {
        if (!host.isApp) return;
        const state = await load();
        for (const s of state.list) if (s.url === from) s.url = to;
        state.list = state.list.filter((s, i, all) => all.findIndex(o => o.url === s.url) === i);
        if (state.current === from) state.current = to;
        await save(state);
    },

    /** The entry of the game in a discovery document, or null when the master does not have it (or it is switched off). */
    gameOf(doc, gameId) {
        return doc?.games?.find(g => g.id === gameId && g.status !== 'off') ?? null;
    },
};
