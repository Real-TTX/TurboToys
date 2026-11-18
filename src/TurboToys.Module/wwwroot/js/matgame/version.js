// MatGame SDK 0.1 – copied from MatGame/sdk/js, do not edit here.
// MatGame SDK · version.js – the platform protocol and the headers every app request carries.

/** The platform protocol (must match MatGame.Sdk.MatGameProtocol.Version). */
export const PROTOCOL = 1;

export const PROTOCOL_HEADER = 'X-MatGame-Protocol';
export const CLIENT_HEADER = 'X-MatGame-Client';

/** "bunnywarfare/1.4.0 (windows)" */
export function clientId(info) {
    return `${info.game ?? 'unknown'}/${info.version ?? '0'} (${info.platform ?? info.kind ?? 'web'})`;
}

/** The headers of an app request (empty in the browser: the master serves its own version there). */
export function versionHeaders(info) {
    if (!info || info.kind === 'web') return {};
    return { [PROTOCOL_HEADER]: String(PROTOCOL), [CLIENT_HEADER]: clientId(info) };
}

/** The same as query values for a hub connection (WebSockets cannot carry headers from the browser). */
export function versionQuery(info) {
    if (!info || info.kind === 'web') return '';
    return `mgp=${PROTOCOL}&mgc=${encodeURIComponent(clientId(info))}`;
}

/** True for the answer "this app is too old / does not fit" (HTTP 426). */
export function isUpdateError(error) {
    return error?.status === 426 || error?.update === true;
}
