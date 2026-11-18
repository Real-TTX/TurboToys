// MatGame SDK 0.1 – copied from MatGame/sdk/js, do not edit here.
// MatGame SDK for the browser part of a game (no build step; works with Vite too). Copied into each game with tools/sdk-copy.js:
// never edit the copy, change it here and copy again (the copy's matgame.version names the version and the SHA-256 of every file).

import { host, storage, secure } from './host.js';
import { servers, normalizeServer } from './servers.js';
import { Session, ApiError, offlineProfile } from './session.js';
import { OnlineTransport, LocalTransport } from './transport.js';
import { status } from './status.js';
import { PROTOCOL, isUpdateError, versionHeaders, versionQuery, clientId } from './version.js';

export { host, storage, secure, servers, normalizeServer, Session, ApiError, offlineProfile, OnlineTransport, LocalTransport, status };
export { PROTOCOL, isUpdateError, versionHeaders, versionQuery, clientId };

/**
 * Where the game stands at start: { info, server, session, discovery, entry, problem }.
 *   server   : the chosen master (always the page's origin in the browser), null = offline
 *   discovery: the master's /.well-known/matgame (apps only), entry: the game in it (null = the master does not have the game)
 *   problem  : the error when the master could not be reached or the app is too old (status says which)
 * The game then builds its transport: online `new OnlineTransport({ signalR, session, base: entry.path })`, offline `new LocalTransport({ game })`.
 */
export async function connect({ game, base = `/${game}` }) {
    const info = await host.info();
    const server = await servers.current();
    const session = new Session({ server });
    if (!server) {
        status.set('offline');
        return { info, server: null, session, discovery: null, entry: null, problem: null };
    }
    status.set('connecting');
    try {
        let discovery = null;
        let entry = { id: game, path: base };
        if (host.isApp) {
            discovery = await servers.discover(server);
            entry = servers.gameOf(discovery, game);
            if (!entry) {
                status.set('offline', 'Dieser Server hat das Spiel nicht.');
                return { info, server, session, discovery, entry: null, problem: new Error('Dieser Server hat das Spiel nicht.') };
            }
        }
        await session.refresh();
        status.set('online', discovery?.name ?? null);
        return { info, server: session.server, session, discovery, entry, problem: null };
    } catch (error) {
        status.set(isUpdateError(error) ? 'update' : 'offline', error.message);
        return { info, server, session, discovery: null, entry: null, problem: error };
    }
}
