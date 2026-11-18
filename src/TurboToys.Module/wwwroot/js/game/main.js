// TurboToys · main.js – the entry of the player app: the stage, the connection (master, app shell or offline), the menu, and the race when the hub
// says "RaceStart". The race ends with its results page; then the menu comes back.

import { api, session } from './api.js';
import { stage } from './render/stage.js';
import { menu, chatLine } from './menu.js';
import { Race } from './race/race.js';
import { stopDemo } from './showcase.js';
import { audio } from './audio.js';
import { toast, wireSounds } from './ui.js';

let race = null;
let results = null;
let unsubscribe = [];

async function start() {
    stage.mount(document.getElementById('tt-stage'));
    wireSounds(document.body);
    fetch('img/app-icons.svg').then(r => r.text()).then(svg => document.body.insertAdjacentHTML('afterbegin', svg)).catch(() => {});
    addEventListener('pointerdown', () => audio.unlock(), { once: true });
    addEventListener('keydown', () => audio.unlock(), { once: true });
    await document.fonts.load('40px Bangers').catch(() => {});
    try {
        await api.connect();
    } catch (error) {
        toast(error.message, 'bad', 6000);
    }
    listen();
    document.getElementById('tt-boot')?.remove();
    menu.show(session.signedIn ? (new URLSearchParams(location.search).get('raum') ? 'multi' : 'main') : 'auth');
    api.onSession(() => listen());
}

/** The hub messages outside a race (re-registered when the connection changes). */
function listen() {
    for (const off of unsubscribe) off();
    unsubscribe = [
        api.on('RaceStart', view => startRace(view)),
        api.on('Room', view => menu.room(view)),
        api.on('Chat', (name, text) => !race && chatLine(name, text)),
    ];
}

async function startRace(view) {
    if (race && race.start.token === view.token) return;
    race?.dispose();
    results = null;
    menu.hide();
    stopDemo();
    document.getElementById('tt-loading').hidden = false;
    const levelBefore = session.player?.level ?? null;
    const online = session.mode === 'online';
    let resultsPage = null;
    try {
        race = new Race({
            start: view,
            me: session.player?.id,
            onResults: data => {
                results = data;
                resultsPage = menu.results(data, { levelBefore, onClose: () => backToMenu() });
                if (race?.savedInfo) resultsPage.saved(race.savedInfo);
            },
            onSaved: info => {
                if (race) race.savedInfo = info;
                resultsPage?.saved(info);
            },
            onPause: () => {
                menu.pause({
                    online,
                    onResume: () => {},
                    onQuit: () => backToMenu(),
                });
            },
            onClosed: why => {
                toast(why, 'bad', 5000);
                backToMenu();
            },
        });
        await race.build();
    } catch (error) {
        console.error(error);
        toast(`Das Rennen ließ sich nicht laden: ${error.message}`, 'bad', 6000);
        backToMenu();
    } finally {
        document.getElementById('tt-loading').hidden = true;
    }
}

async function backToMenu() {
    const current = race;
    race = null;
    document.getElementById('tt-results').hidden = true;
    if (current) await current.leave();
    await api.refreshSession().catch(() => {});
    const room = menu.state.room;
    menu.show(room && room.kind === 'Custom' && results ? 'multi' : 'main');
}

start();
