// TurboToys · menu.js – every screen outside the race, in the comic look over the 3D background:
//   auth (guest / sign-in / register / server / offline), main menu, quick race, cups, multiplayer (rooms, lobby), garage (tuning, paint, dealer),
//   profile (avatar, statistics, account), leaderboard, settings, the results page and the pause panel.
// Talks to the game only through api.js; the race itself is race/race.js (main.js starts it on "RaceStart").

import { api, session, host, status } from './api.js';
import { html, raw, esc, $, $$, toast, confirmBox, busy, icon, pips, bar } from './ui.js';
import { avatarSvg, AVATAR_LABELS } from './avatar.js';
import { audio } from './audio.js';
import { stage } from './render/stage.js';
import { showDemo, Garage } from './showcase.js';
import { DRIVE_NAMES, DRIVE_HINTS, BODY_NAMES, TIME_NAMES, DECAL_NAMES, money, lapTime } from './catalog.js';

const root = () => document.getElementById('tt-menu');
const top = () => document.getElementById('tt-top');

const state = {
    screen: 'main',
    home: null,
    garage: null,
    room: null,
    garageScene: null,
    quick: { trackId: 0, bots: 5, botSkill: 2, laps: 0, weapons: true },
    selectedGarageCar: null,
    garageTab: 'tuning',
    shopIndex: 0,
};

const SCREENS = {};

export const menu = {
    state,

    /** Shows a screen ('auth' | 'main' | 'quick' | 'cups' | 'multi' | 'lobby' | 'garage' | 'profile' | 'leaderboard' | 'settings'). */
    async show(screen, params = {}) {
        state.screen = screen;
        document.body.dataset.screen = screen;
        root().hidden = false;
        top().hidden = screen === 'auth';
        renderTop();
        const render = SCREENS[screen] ?? SCREENS.main;
        if (screen === 'garage') {
            state.garageScene ??= new Garage();
            state.garageScene.show();
        } else {
            showDemo().catch(error => console.warn('Hintergrund-Rennen', error));
        }
        root().innerHTML = '<div class="loading">Lädt …</div>';
        try {
            await render(params);
        } catch (error) {
            root().innerHTML = html`<div class="panel center-panel"><h2 class="title">Hoppla!</h2><p>${error.message}</p><div class="row"><button class="btn" data-go="main">Zum Menü</button></div></div>`;
            wireGo();
        }
        audio.music('menu');
    },

    hide() {
        root().hidden = true;
        top().hidden = true;
        root().innerHTML = '';
    },

    /** The room changed (hub "Room"). */
    room(view) {
        state.room = view;
        if (state.screen === 'lobby') SCREENS.lobby();
    },

    results: showResults,
    pause: showPause,
    refreshTop: renderTop,
};

// ------------------------------------------------------------------ top bar: who, level, money, server

function renderTop() {
    const p = session.player;
    const badge = session.mode === 'offline' ? 'Offline' : session.mode === 'unreachable' ? 'Keine Verbindung' : (session.serverName ?? status.label());
    top().innerHTML = html`
        <button class="logo-btn" data-go="main" aria-label="Hauptmenü"><img src="img/logo/turbotoys-logo-dark.svg" alt="TurboToys" /></button>
        <div class="top-right">
            ${p ? raw(html`
                <button class="who" data-go="profile" title="Profil">
                    <span class="avatar">${raw(avatarSvg(p.avatar, { size: 44 }))}</span>
                    <span class="who-text"><b>${p.displayName}</b><small>Level ${p.level}</small>
                        <span class="xp"><i style="width:${xpPercent(p)}%"></i></span></span>
                </button>
                <span class="money" title="Schrauben">${raw(icon('coin'))}<b>${money(p.money)}</b></span>`) : ''}
            <span class="server-badge server-badge--${session.mode}" title="Server">${badge}</span>
        </div>`;
    wireGo(top());
}

function xpPercent(p) {
    if (!p) return 0;
    const span = Math.max(1, p.xpNext - p.xpLevel);
    return Math.max(0, Math.min(100, ((p.xp - p.xpLevel) / span) * 100));
}

function wireGo(scope = root()) {
    $$('[data-go]', scope).forEach(el => el.addEventListener('click', () => menu.show(el.dataset.go)));
}

async function refreshPlayer() {
    await api.refreshSession().catch(() => {});
    renderTop();
}

// ------------------------------------------------------------------ auth

SCREENS.auth = async () => {
    const app = host.isApp;
    const online = session.mode === 'online';
    root().innerHTML = html`
        <div class="auth">
            <img class="hero" src="img/logo/turbotoys-logo-dark.svg" alt="TurboToys" />
            <p class="tagline">Ferngesteuert. Frisiert. Furchtlos.</p>
            ${online ? raw(html`
            <div class="panel auth-panel">
                ${session.guests ? raw(html`
                <form class="form" id="guest-form">
                    <h2 class="title">Einfach losfahren</h2>
                    <label>Dein Fahrername<input name="name" maxlength="24" required placeholder="z. B. Turbo-Tom" autocomplete="nickname" /></label>
                    <button class="btn btn--go btn--big">Als Gast fahren</button>
                </form><div class="or">oder</div>`) : ''}
                <div class="tabs" role="tablist"><button class="tab on" data-tab="login">Anmelden</button>${session.canRegister ? raw('<button class="tab" data-tab="register">Registrieren</button>') : ''}</div>
                <form class="form" id="login-form">
                    <label>Benutzername<input name="login" required autocomplete="username" /></label>
                    <label>Passwort<input name="password" type="password" required autocomplete="current-password" /></label>
                    <button class="btn">Anmelden</button>
                    ${app ? raw('<button type="button" class="btn btn--ghost" id="device-login">Im Browser anmelden</button>') : ''}
                </form>
                <form class="form" id="register-form" hidden>
                    <label>Anzeigename<input name="display" required maxlength="40" /></label>
                    <label>Benutzername<input name="login" required autocomplete="username" /></label>
                    <label>Passwort<input name="password" type="password" required autocomplete="new-password" /></label>
                    <button class="btn">Konto anlegen</button>
                </form>
            </div>`) : raw(html`<div class="panel auth-panel"><h2 class="title">${session.mode === 'offline' ? 'Offline' : 'Kein Server'}</h2><p>${session.problem ?? ''}</p></div>`)}
            ${app ? raw(html`<div class="row center"><button class="btn btn--ghost" id="servers">${raw(icon('flag'))}Server wählen</button><button class="btn btn--go" id="offline">Offline spielen</button></div>`) : ''}
        </div>`;
    const guest = $('#guest-form');
    guest?.addEventListener('submit', e => {
        e.preventDefault();
        busy(guest.querySelector('button'), async () => {
            await api.guest(new FormData(guest).get('name'));
            menu.show('main');
        });
    });
    $$('.tab').forEach(t => t.addEventListener('click', () => {
        $$('.tab').forEach(x => x.classList.toggle('on', x === t));
        $('#login-form').hidden = t.dataset.tab !== 'login';
        $('#register-form').hidden = t.dataset.tab !== 'register';
    }));
    $('#login-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const f = new FormData(e.target);
        busy(e.target.querySelector('button'), async () => {
            await api.login(f.get('login'), f.get('password'));
            menu.show('main');
        });
    });
    $('#register-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const f = new FormData(e.target);
        busy(e.target.querySelector('button'), async () => {
            await api.register(f.get('display'), f.get('login'), f.get('password'));
            menu.show('main');
        });
    });
    $('#device-login')?.addEventListener('click', e => busy(e.target, async () => {
        await api.deviceLogin(({ code }) => toast(`Code im Browser bestätigen: ${code}`, 'info', 15000));
        menu.show('main');
    }));
    $('#servers')?.addEventListener('click', () => showServers());
    $('#offline')?.addEventListener('click', e => busy(e.target, async () => {
        await api.playOffline();
        menu.show('main');
    }));
};

async function showServers() {
    const list = await api.servers();
    const current = await api.currentServer();
    root().innerHTML = html`
        <div class="panel center-panel">
            <h2 class="title">Server</h2>
            <ul class="list">${list.map(s => raw(html`<li class="${s.url === current ? 'on' : ''}"><b>${s.name ?? s.url}</b><small>${s.url}</small>
                <button class="btn btn--small" data-use="${s.url}">Verbinden</button>${s.builtIn ? '' : raw(html`<button class="btn btn--small btn--ghost" data-remove="${s.url}">✕</button>`)}</li>`))}</ul>
            <form class="form row" id="add-server"><input name="url" placeholder="games.example.com" required /><button class="btn">Prüfen &amp; verbinden</button></form>
            <div class="row"><button class="btn btn--go" id="offline">Offline spielen</button><button class="btn" data-go="${session.signedIn ? 'main' : 'auth'}">Zurück</button></div>
        </div>`;
    wireGo();
    const use = async url => {
        await api.useServer(url);
        menu.show(session.signedIn ? 'main' : 'auth');
    };
    $$('[data-use]').forEach(b => b.addEventListener('click', () => busy(b, () => use(b.dataset.use))));
    $$('[data-remove]').forEach(b => b.addEventListener('click', () => busy(b, async () => {
        await api.removeServer(b.dataset.remove);
        showServers();
    })));
    $('#add-server').addEventListener('submit', e => {
        e.preventDefault();
        const url = new FormData(e.target).get('url');
        busy(e.target.querySelector('button'), async () => {
            const doc = await api.testServer(url);
            toast(`${doc.name} gefunden.`, 'good');
            await use(url);
        });
    });
    $('#offline').addEventListener('click', e => busy(e.target, () => use(null)));
}

// ------------------------------------------------------------------ main menu

SCREENS.main = async () => {
    const home = await api.get('/home');
    state.home = home;
    session.player = home.player;
    renderTop();
    const car = home.car;
    root().innerHTML = html`
        <div class="main-menu">
            <nav class="big-menu" aria-label="Hauptmenü">
                <button class="mega mega--red" data-go="quick"><span class="kicker">Sofort</span>Schnelles Rennen</button>
                <button class="mega mega--yellow" data-go="cups"><span class="kicker">Turnier</span>Pokale</button>
                <button class="mega mega--blue" data-go="multi" ${session.mode !== 'online' ? 'disabled' : ''}><span class="kicker">${session.mode === 'online' ? 'Online' : 'nur online'}</span>Mehrspieler</button>
                <button class="mega mega--green" data-go="garage"><span class="kicker">Tuning &amp; Lack</span>Garage</button>
                <div class="small-row">
                    <button class="btn" data-go="profile">${raw(icon('helmet'))}Profil</button>
                    <button class="btn" data-go="leaderboard" ${session.mode !== 'online' ? 'disabled' : ''}>${raw(icon('trophy'))}Rangliste</button>
                    <button class="btn" data-go="settings">${raw(icon('gauge'))}Einstellungen</button>
                </div>
            </nav>
            <aside class="side">
                ${home.announcement ? raw(html`<div class="panel news"><span class="sticker">NEU!</span><p>${home.announcement}</p></div>`) : ''}
                ${car ? raw(html`
                <div class="panel car-card" data-go="garage">
                    <span class="sticker sticker--blue">${DRIVE_NAMES[car.car.drive]}</span>
                    <h3>${car.car.name}</h3>
                    <small>${BODY_NAMES[car.car.body] ?? car.car.body} · Nr. ${car.number}</small>
                    ${raw(bar('Tempo', car.spec.topSpeed - 38, 40))}${raw(bar('Schub', car.spec.acceleration - 20, 45))}${raw(bar('Grip', car.spec.grip * 10 - 6, 12))}
                </div>`) : ''}
                <div class="panel stats-card">
                    <h3>Deine Karriere</h3>
                    <dl><dt>Rennen</dt><dd>${home.stats.racesPlayed}</dd><dt>Siege</dt><dd>${home.stats.racesWon}</dd><dt>Podium</dt><dd>${home.stats.podiums}</dd>
                        <dt>Pokale</dt><dd>${home.stats.cupsWon}</dd><dt>Abschüsse</dt><dd>${home.stats.kills}</dd>${home.stats.rank ? raw(html`<dt>Rang</dt><dd>#${home.stats.rank}</dd>`) : ''}</dl>
                </div>
                ${home.history?.length ? raw(html`<div class="panel history"><h3>Letzte Rennen</h3><ol>${home.history.slice(0, 5).map(h => raw(html`
                    <li><span class="place place--${h.place}">${h.place}.</span><span>${h.trackName}</span><small>+${money(h.money)} · +${h.xp} XP</small></li>`))}</ol></div>`) : ''}
            </aside>
        </div>`;
    wireGo();
};

// ------------------------------------------------------------------ quick race

SCREENS.quick = async () => {
    const tracks = await api.get('/tracks');
    const q = state.quick;
    if (!tracks.some(t => t.track.id === q.trackId && !t.track.locked)) q.trackId = tracks.find(t => !t.track.locked)?.track.id ?? 0;
    const draw = () => {
        root().innerHTML = html`
            <div class="panel wide-panel">
                <header class="panel-head"><h2 class="title">Schnelles Rennen</h2><button class="btn btn--ghost" data-go="main">Zurück</button></header>
                <div class="track-grid">${tracks.map(({ track: t, bestLapMs }) => raw(html`
                    <button class="card track-card ${t.id === q.trackId ? 'on' : ''} ${t.locked ? 'locked' : ''}" data-track="${t.id}" ${t.locked ? 'disabled' : ''}>
                        <span class="thumb thumb--${t.layout} time--${t.timeOfDay.toLowerCase()}"></span>
                        <b>${t.name}</b><small>${TIME_NAMES[t.timeOfDay]} · ${t.laps} Runden${bestLapMs ? ` · Beste ${lapTime(bestLapMs)}` : ''}</small>
                        ${t.locked ? raw(html`<span class="lock">ab Level ${t.unlockLevel}</span>`) : ''}
                    </button>`))}</div>
                <div class="options">
                    <label>Gegner <b id="bots-v">${q.bots}</b><input type="range" min="0" max="7" value="${q.bots}" id="bots" /></label>
                    <label>Stärke <b id="skill-v">${['', 'Gemütlich', 'Normal', 'Flott', 'Hart', 'Profi'][q.botSkill]}</b><input type="range" min="1" max="5" value="${q.botSkill}" id="skill" /></label>
                    <label>Runden <b id="laps-v">${q.laps || 'Standard'}</b><input type="range" min="0" max="9" value="${q.laps}" id="laps" /></label>
                    <label class="switch"><input type="checkbox" id="weapons" ${q.weapons ? 'checked' : ''} /> Waffen &amp; Kisten</label>
                </div>
                <div class="row"><button class="btn btn--go btn--big" id="go">${raw(icon('flag'))}Los geht’s!</button></div>
            </div>`;
        wireGo();
        $$('[data-track]').forEach(b => b.addEventListener('click', () => {
            q.trackId = Number(b.dataset.track);
            draw();
        }));
        $('#bots').addEventListener('input', e => ($('#bots-v').textContent = q.bots = Number(e.target.value)));
        $('#skill').addEventListener('input', e => {
            q.botSkill = Number(e.target.value);
            $('#skill-v').textContent = ['', 'Gemütlich', 'Normal', 'Flott', 'Hart', 'Profi'][q.botSkill];
        });
        $('#laps').addEventListener('input', e => {
            q.laps = Number(e.target.value);
            $('#laps-v').textContent = q.laps || 'Standard';
        });
        $('#weapons').addEventListener('change', e => (q.weapons = e.target.checked));
        $('#go').addEventListener('click', e => busy(e.target, () => api.invoke('QuickRace', { trackId: q.trackId, bots: q.bots, botSkill: q.botSkill, laps: q.laps, weapons: q.weapons })));
    };
    draw();
};

// ------------------------------------------------------------------ cups

SCREENS.cups = async () => {
    const cups = await api.get('/cups');
    root().innerHTML = html`
        <div class="panel wide-panel">
            <header class="panel-head"><h2 class="title">Pokale</h2><button class="btn btn--ghost" data-go="main">Zurück</button></header>
            <p class="intro">Mehrere Rennen gegen dieselben Gegner. Punkte pro Platz: 10 · 8 · 6 · 5 · 4 · 3 · 2 · 1. Wer am Ende vorn liegt, kassiert das Preisgeld.</p>
            <div class="cup-grid">${cups.map(c => raw(cupCard(c)))}</div>
        </div>`;
    wireGo();
    $$('[data-enter]').forEach(b => b.addEventListener('click', () => busy(b, async () => {
        const cup = cups.find(c => c.id === Number(b.dataset.enter));
        if (cup.entryFee > 0 && !(await confirmBox(cup.name, `Startgeld: ${money(cup.entryFee)} Schrauben. Los?`, { yes: 'Antreten' }))) return;
        const run = await api.post(`/cups/${cup.id}/enter`);
        await refreshPlayer();
        await api.invoke('StartCup', run.token);
    })));
    $$('[data-next]').forEach(b => b.addEventListener('click', () => busy(b, () => api.invoke('StartCup', b.dataset.next))));
    $$('[data-abandon]').forEach(b => b.addEventListener('click', () => busy(b, async () => {
        if (!(await confirmBox('Aufgeben?', 'Das Startgeld ist dann weg.', { yes: 'Aufgeben', danger: true }))) return;
        await api.post(`/cups/runs/${b.dataset.abandon}/abandon`);
        SCREENS.cups();
    })));
};

function cupCard(c) {
    const run = c.run;
    const running = run?.status === 'Running';
    const finished = run?.status === 'Finished';
    return html`
        <article class="card cup-card ${c.locked ? 'locked' : ''}">
            <span class="cup-trophy cup-trophy--${c.sortOrder ?? ''}">${raw(icon('trophy'))}</span>
            <h3>${c.name}</h3>
            <p>${c.description}</p>
            <ol class="cup-tracks">${c.tracks.map((t, i) => raw(html`<li class="${running && i < run.raceIndex ? 'done' : running && i === run.raceIndex ? 'next' : ''}">${t.name}<small>${TIME_NAMES[t.timeOfDay]}</small></li>`))}</ol>
            <div class="cup-facts"><span>${c.opponents} Gegner</span><span>Startgeld ${money(c.entryFee)}</span><span class="prize">Preis ${money(c.prize)}</span>${c.wins ? raw(html`<span class="wins">🏆 ×${c.wins}</span>`) : ''}</div>
            ${run ? raw(html`<table class="standings"><tbody>${run.standings.map((s, i) => raw(html`<tr class="${s.isPlayer ? 'me' : ''}"><td>${i + 1}.</td><td><i class="dot" style="background:${s.paint}"></i>${s.name}</td><td>${s.points}</td></tr>`))}</tbody></table>`) : ''}
            ${finished ? raw(html`<p class="result">${run.place === 1 ? 'POKAL GEWONNEN!' : `Platz ${run.place}`}${run.prizeWon ? ` · +${money(run.prizeWon)} Schrauben` : ''}</p>`) : ''}
            <div class="row">
                ${c.locked ? raw(html`<span class="lock">ab Level ${c.unlockLevel}</span>`)
                    : running ? raw(html`<button class="btn btn--go" data-next="${run.token}">Rennen ${run.raceIndex + 1} von ${run.races}</button><button class="btn btn--ghost" data-abandon="${run.token}">Aufgeben</button>`)
                    : raw(html`<button class="btn btn--go" data-enter="${c.id}">${finished ? 'Nochmal' : 'Antreten'}</button>`)}
            </div>
        </article>`;
}

// ------------------------------------------------------------------ multiplayer

SCREENS.multi = async () => {
    const [rooms, tracks] = await Promise.all([api.invoke('ListRooms'), api.get('/tracks')]);
    const open = tracks.filter(t => !t.track.locked);
    const code = new URLSearchParams(location.search).get('raum');
    root().innerHTML = html`
        <div class="panel wide-panel">
            <header class="panel-head"><h2 class="title">Mehrspieler</h2><button class="btn btn--ghost" data-go="main">Zurück</button></header>
            <div class="multi">
                <section>
                    <h3>Offene Räume <button class="btn btn--small btn--ghost" id="refresh">Aktualisieren</button></h3>
                    ${rooms.length ? raw(html`<ul class="list rooms">${rooms.map(r => raw(html`<li><span class="thumb thumb--${r.layout}"></span><b>${r.name}</b><small>${r.trackName} · ${r.players}/${r.maxPlayers} Fahrer${r.bots ? ` · ${r.bots} Bots` : ''} · von ${r.hostName}</small><button class="btn btn--small btn--go" data-join="${r.code}">Mitfahren</button></li>`))}</ul>`)
                        : raw('<p class="empty">Gerade ist kein Raum offen – mach doch einen auf!</p>')}
                    <form class="form row" id="join"><input name="code" maxlength="4" placeholder="CODE" value="${code ?? ''}" required class="code" /><button class="btn">Beitreten</button></form>
                </section>
                <section>
                    <h3>Raum eröffnen</h3>
                    <form class="form" id="create">
                        <label>Name<input name="name" maxlength="40" placeholder="${session.player?.displayName ?? ''}s Rennen" /></label>
                        <label>Strecke<select name="trackId">${open.map(t => raw(html`<option value="${t.track.id}">${t.track.name} (${TIME_NAMES[t.track.timeOfDay]})</option>`))}</select></label>
                        <div class="grid2">
                            <label>Runden<input name="laps" type="number" min="0" max="9" value="0" /></label>
                            <label>Plätze<input name="maxPlayers" type="number" min="2" max="8" value="6" /></label>
                            <label>Bots<input name="bots" type="number" min="0" max="7" value="2" /></label>
                            <label>Stärke<input name="botSkill" type="number" min="1" max="5" value="2" /></label>
                        </div>
                        <label class="switch"><input type="checkbox" name="weapons" checked /> Waffen &amp; Kisten</label>
                        <label class="switch"><input type="checkbox" name="isPublic" checked /> In der Liste zeigen</label>
                        <button class="btn btn--go">Raum eröffnen</button>
                    </form>
                </section>
            </div>
        </div>`;
    wireGo();
    $('#refresh').addEventListener('click', () => SCREENS.multi());
    const join = async c => {
        state.room = await api.invoke('JoinRoom', c);
        menu.show('lobby');
    };
    $$('[data-join]').forEach(b => b.addEventListener('click', () => busy(b, () => join(b.dataset.join))));
    $('#join').addEventListener('submit', e => {
        e.preventDefault();
        busy(e.target.querySelector('button'), () => join(new FormData(e.target).get('code').toUpperCase()));
    });
    $('#create').addEventListener('submit', e => {
        e.preventDefault();
        const f = new FormData(e.target);
        busy(e.target.querySelector('button'), async () => {
            state.room = await api.invoke('CreateRoom', {
                name: f.get('name') || null, trackId: Number(f.get('trackId')), laps: Number(f.get('laps')), maxPlayers: Number(f.get('maxPlayers')), bots: Number(f.get('bots')),
                botSkill: Number(f.get('botSkill')), weapons: f.get('weapons') === 'on', isPublic: f.get('isPublic') === 'on',
            });
            menu.show('lobby');
        });
    });
};

SCREENS.lobby = async () => {
    const r = state.room;
    if (!r) return menu.show('multi');
    const me = session.player?.id;
    const mine = r.seats.find(s => s.playerId === me);
    const host = r.hostPlayerId === me;
    const link = `${location.origin}${location.pathname}?raum=${r.code}`;
    const scroll = $('#chat-log')?.scrollTop;
    root().innerHTML = html`
        <div class="panel wide-panel lobby">
            <header class="panel-head"><h2 class="title">${r.name}</h2><span class="code-badge" title="Raum-Code">${r.code}</span><button class="btn btn--ghost" id="leave">Verlassen</button></header>
            <p class="intro">${r.track.name} · ${r.laps} Runden · ${r.weapons ? 'mit Waffen' : 'ohne Waffen'} · ${r.bots} Bots (Stärke ${r.botSkill}) · <button class="link" id="copy">Einladungslink kopieren</button></p>
            <ul class="seats">${r.seats.map(s => raw(html`<li class="${s.ready ? 'ready' : ''} ${s.connected ? '' : 'gone'}">
                <span class="avatar">${raw(s.avatar ? avatarSvg(s.avatar, { size: 56 }) : '')}</span>
                <span><b>${s.name}</b>${s.isHost ? raw(' <span class="sticker sticker--small">Gastgeber</span>') : ''}<small>Level ${s.level} · ${s.car?.name ?? ''} (${DRIVE_NAMES[s.car?.drive] ?? ''})</small></span>
                <span class="ready-flag">${s.ready ? 'BEREIT' : 'wartet'}</span></li>`))}
                ${Array.from({ length: Math.max(0, r.maxPlayers - r.seats.length) }, () => raw('<li class="free"><span class="avatar"></span><span><b>frei</b></span></li>'))}
            </ul>
            <div class="row">
                ${host ? raw('<button class="btn btn--go btn--big" id="start">Rennen starten</button>')
                    : raw(html`<button class="btn ${mine?.ready ? '' : 'btn--go'} btn--big" id="ready">${mine?.ready ? 'Doch nicht bereit' : 'Bereit!'}</button>`)}
                <button class="btn" id="car">Auto aus der Garage übernehmen</button>
            </div>
            <div class="chat"><div class="chat-log" id="chat-log"></div><form id="chat" class="row"><input name="text" maxlength="200" placeholder="Nachricht …" autocomplete="off" /><button class="btn">Senden</button></form></div>
        </div>`;
    if (scroll) $('#chat-log').scrollTop = scroll;
    for (const line of state.chat ?? []) appendChat(line);
    $('#leave').addEventListener('click', async () => {
        await api.invoke('LeaveRoom').catch(() => {});
        state.room = null;
        menu.show('multi');
    });
    $('#copy').addEventListener('click', () => navigator.clipboard?.writeText(link).then(() => toast('Link kopiert.', 'good')));
    $('#start')?.addEventListener('click', e => busy(e.target, () => api.invoke('StartRace')));
    $('#ready')?.addEventListener('click', e => busy(e.target, () => api.invoke('SetReady', !mine?.ready)));
    $('#car').addEventListener('click', e => busy(e.target, async () => {
        await api.invoke('ChangeCar');
        toast('Auto übernommen.', 'good');
    }));
    $('#chat').addEventListener('submit', e => {
        e.preventDefault();
        const input = e.target.text;
        if (input.value.trim()) api.invoke('Chat', input.value.trim()).catch(() => {});
        input.value = '';
    });
};

export function chatLine(name, text) {
    state.chat = [...(state.chat ?? []).slice(-30), { name, text }];
    if (state.screen === 'lobby') appendChat({ name, text });
}

function appendChat({ name, text }) {
    const log = $('#chat-log');
    if (!log) return;
    const el = document.createElement('div');
    el.innerHTML = html`<b>${name}:</b> ${text}`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
}

// ------------------------------------------------------------------ garage

SCREENS.garage = async () => {
    const g = await api.get('/garage');
    state.garage = g;
    if (!g.cars.some(c => c.id === state.selectedGarageCar)) state.selectedGarageCar = g.selectedId ?? g.cars[0]?.id;
    drawGarage();
};

function drawGarage() {
    const g = state.garage;
    const tab = state.garageTab;
    const car = g.cars.find(c => c.id === state.selectedGarageCar) ?? g.cars[0];
    const scene = state.garageScene;
    if (tab === 'shop') {
        const item = g.shop[state.shopIndex % g.shop.length];
        scene.setCar(item.car.body, { paint: item.car.defaultPaint, decal: 'stripes', number: 0, drive: item.car.drive });
    } else if (car) {
        scene.setCar(car.car.body, { paint: car.paint, decal: car.decal, number: car.number, drive: car.car.drive });
    }
    root().innerHTML = html`
        <div class="garage">
            <div class="panel garage-panel">
                <header class="panel-head"><h2 class="title">Garage</h2><button class="btn btn--ghost" data-go="main">Zurück</button></header>
                <div class="tabs" role="tablist">
                    <button class="tab ${tab === 'tuning' ? 'on' : ''}" data-tab="tuning">${raw(icon('wrench'))}Tuning</button>
                    <button class="tab ${tab === 'paint' ? 'on' : ''}" data-tab="paint">Lack</button>
                    <button class="tab ${tab === 'shop' ? 'on' : ''}" data-tab="shop">${raw(icon('car'))}Autohaus</button>
                </div>
                ${tab !== 'shop' ? raw(html`<div class="owned">${g.cars.map(c => raw(html`<button class="chip ${c.id === car?.id ? 'on' : ''}" data-car="${c.id}"><i class="dot" style="background:${c.paint}"></i>${c.car.name}${c.id === g.selectedId ? ' ★' : ''}</button>`))}</div>`) : ''}
                <div class="garage-body">${raw(tab === 'tuning' ? tuningView(car) : tab === 'paint' ? paintView(car, g) : shopView(g))}</div>
            </div>
            ${tab !== 'shop' && car ? raw(html`<div class="car-title"><span class="sticker">${DRIVE_NAMES[car.car.drive]}</span><h2>${car.car.name}</h2><p>${DRIVE_HINTS[car.car.drive]}</p>
                ${car.id === g.selectedId ? raw('<span class="badge-drive">Fährst du</span>') : raw(html`<button class="btn btn--go" id="select">Damit fahren</button>`)}</div>`) : ''}
        </div>`;
    wireGo();
    $$('[data-tab]').forEach(b => b.addEventListener('click', () => {
        state.garageTab = b.dataset.tab;
        drawGarage();
    }));
    $$('[data-car]').forEach(b => b.addEventListener('click', () => {
        state.selectedGarageCar = Number(b.dataset.car);
        drawGarage();
    }));
    const update = async action => {
        state.garage = await action();
        await refreshPlayer();
        drawGarage();
    };
    $('#select')?.addEventListener('click', e => busy(e.target, () => update(() => api.put('/garage/select', { id: car.id }))));
    $$('[data-upgrade]').forEach(b => b.addEventListener('click', () => busy(b, async () => {
        await update(() => api.post(`/garage/${car.id}/upgrade`, { part: b.dataset.upgrade }));
        audio.play('upgrade');
        state.garageScene.pop = 0.3;
    })));
    $$('[data-paint]').forEach(b => b.addEventListener('click', () => busy(b, () => update(() => api.put(`/garage/${car.id}/look`, { paint: b.dataset.paint })))));
    $$('[data-decal]').forEach(b => b.addEventListener('click', () => busy(b, () => update(() => api.put(`/garage/${car.id}/look`, { decal: b.dataset.decal })))));
    $('#number')?.addEventListener('change', e => busy(e.target, () => update(() => api.put(`/garage/${car.id}/look`, { number: Number(e.target.value) }))));
    $('#prev')?.addEventListener('click', () => {
        state.shopIndex = (state.shopIndex - 1 + g.shop.length) % g.shop.length;
        drawGarage();
    });
    $('#next')?.addEventListener('click', () => {
        state.shopIndex = (state.shopIndex + 1) % g.shop.length;
        drawGarage();
    });
    $('#buy')?.addEventListener('click', e => busy(e.target, async () => {
        const item = g.shop[state.shopIndex % g.shop.length];
        if (!(await confirmBox(item.car.name, `Für ${money(item.car.price)} Schrauben kaufen?`, { yes: 'Kaufen' }))) return;
        await update(() => api.post('/garage/buy', { carId: item.car.id }));
        audio.play('buy');
        state.selectedGarageCar = state.garage.selectedId;
        state.garageTab = 'tuning';
        drawGarage();
        toast(`${item.car.name} gehört dir!`, 'good');
    }));
}

function tuningView(car) {
    if (!car) return '<p>Keine Autos.</p>';
    const s = car.spec;
    return html`
        <div class="stats">
            ${raw(bar('Spitze', s.topSpeed - 36, 40))}${raw(bar('Schub', s.acceleration - 20, 50))}${raw(bar('Grip', (s.grip - 0.55) * 10, 11))}
            ${raw(bar('Karosserie', s.health - 60, 160))}${raw(bar('Turbo', s.turboSeconds - 2, 6))}
            <small class="numbers">${Math.round(s.topSpeed * 2.2)} km/h · ${s.health} LP · Turbo ${s.turboSeconds.toFixed(1)} s · MG ${s.gunDamage.toFixed(1)} × ${s.gunAmmo}</small>
        </div>
        <ul class="upgrades">${car.upgrades.map(u => raw(html`
            <li><span class="part-icon">${raw(icon({ Engine: 'gauge', Tires: 'track', Armor: 'helmet', Turbo: 'turbo', Weapons: 'weapon' }[u.part] ?? 'wrench'))}</span>
                <span class="part"><b>${u.name}</b><small>${u.description}</small>${raw(pips(u.level, u.maxLevel))}</span>
                ${u.price == null ? raw('<span class="maxed">MAX</span>') : raw(html`<button class="btn btn--small btn--go" data-upgrade="${u.part}" ${session.player?.money < u.price ? 'disabled' : ''}>${raw(icon('coin'))}${money(u.price)}</button>`)}
            </li>`))}</ul>`;
}

function paintView(car, g) {
    if (!car) return '';
    return html`
        <h3>Farbe</h3>
        <div class="swatches">${g.paints.map(p => raw(html`<button class="swatch ${p === car.paint ? 'on' : ''}" style="background:${p}" data-paint="${p}" aria-label="Farbe ${p}"></button>`))}</div>
        <h3>Aufkleber</h3>
        <div class="chips">${g.decals.map(d => raw(html`<button class="chip ${d === car.decal ? 'on' : ''}" data-decal="${d}">${DECAL_NAMES[d] ?? d}</button>`))}</div>
        <h3>Startnummer</h3>
        <input id="number" type="number" min="0" max="99" value="${car.number}" class="number-input" />`;
}

function shopView(g) {
    const item = g.shop[state.shopIndex % g.shop.length];
    if (!item) return '<p>Der Händler hat zu.</p>';
    const c = item.car;
    const s = item.spec;
    return html`
        <div class="shop">
            <div class="row between"><button class="btn btn--round" id="prev" aria-label="Voriges Auto">‹</button><span class="count">${state.shopIndex % g.shop.length + 1} / ${g.shop.length}</span><button class="btn btn--round" id="next" aria-label="Nächstes Auto">›</button></div>
            <span class="sticker">${DRIVE_NAMES[c.drive]}</span><h3>${c.name}</h3><small>${BODY_NAMES[c.body]}</small>
            <p>${c.description}</p>
            ${raw(bar('Tempo', c.speed))}${raw(bar('Beschleunigung', c.acceleration))}${raw(bar('Grip', c.grip))}${raw(bar('Panzerung', c.armor))}${raw(bar('Gewicht', c.weight))}${raw(bar('Turbo-Tank', c.turboCapacity))}
            <small class="numbers">${Math.round(s.topSpeed * 2.2)} km/h · ${s.health} LP</small>
            <div class="row">${item.owned ? raw('<span class="badge-drive">In deiner Garage</span>')
                : item.locked ? raw(html`<span class="lock">ab Level ${c.unlockLevel}</span>`)
                : raw(html`<button class="btn btn--go btn--big" id="buy" ${session.player?.money < c.price ? 'disabled' : ''}>${raw(icon('coin'))}${c.price ? money(c.price) : 'Gratis'}</button>`)}</div>
        </div>`;
}

// ------------------------------------------------------------------ profile

SCREENS.profile = async () => {
    const profile = await api.get('/profile');
    const p = profile.player;
    const o = profile.options;
    const look = { ...p.avatar };
    const draw = () => {
        root().innerHTML = html`
            <div class="panel wide-panel profile">
                <header class="panel-head"><h2 class="title">Profil</h2><button class="btn btn--ghost" data-go="main">Zurück</button></header>
                <div class="profile-grid">
                    <div class="portrait">${raw(avatarSvg(look, { size: 220 }))}<h3>${p.displayName}</h3><small>Level ${p.level} · ${p.xp} XP${p.isGuest ? ' · Gast' : ''}</small>
                        <span class="xp big"><i style="width:${xpPercent(p)}%"></i></span><small>Noch ${Math.max(0, p.xpNext - p.xp)} XP bis Level ${p.level + 1}</small></div>
                    <div class="editor">
                        ${['face', 'hair', 'helmet'].map(part => raw(html`<h3>${{ face: 'Gesicht', hair: 'Frisur', helmet: 'Kopfbedeckung' }[part]}</h3>
                            <div class="chips">${o[part === 'face' ? 'faces' : part === 'hair' ? 'hairs' : 'helmets'].map(x => raw(html`
                                <button class="chip ${look[part] === x.key ? 'on' : ''} ${x.locked ? 'locked' : ''}" data-part="${part}" data-key="${x.key}" ${x.locked ? 'disabled' : ''} title="${x.locked ? `ab Level ${x.level}` : ''}">${AVATAR_LABELS[part]?.[x.key] ?? x.key}${x.locked ? raw(html` <small>Lv ${x.level}</small>`) : ''}</button>`))}</div>`))}
                        <h3>Farbe</h3><div class="swatches">${o.colors.map(c => raw(html`<button class="swatch ${look.color === c ? 'on' : ''}" style="background:${c}" data-color="${c}"></button>`))}</div>
                        <h3>Haut</h3><div class="swatches">${o.skins.map(c => raw(html`<button class="swatch ${look.skin === c ? 'on' : ''}" style="background:${c}" data-skin="${c}"></button>`))}</div>
                        <div class="row"><button class="btn btn--go" id="save">Speichern</button></div>
                    </div>
                    <div class="stats-card">
                        <h3>Statistik</h3>
                        <dl><dt>Rennen</dt><dd>${profile.stats.racesPlayed}</dd><dt>Siege</dt><dd>${profile.stats.racesWon}</dd><dt>Podium</dt><dd>${profile.stats.podiums}</dd>
                            <dt>Pokale</dt><dd>${profile.stats.cupsWon}</dd><dt>Abschüsse</dt><dd>${profile.stats.kills}</dd><dt>Schrott</dt><dd>${profile.stats.wrecks}</dd>
                            <dt>Verdient</dt><dd>${money(profile.stats.moneyEarned)}</dd>${profile.stats.rank ? raw(html`<dt>Rang</dt><dd>#${profile.stats.rank}</dd>`) : ''}</dl>
                        ${p.isGuest && session.mode === 'online' && session.canRegister ? raw(html`
                            <form class="form" id="upgrade"><h3>Konto anlegen</h3><p>Behalte Level, Autos und Schrauben – und komm in die Rangliste.</p>
                                <label>Anzeigename<input name="display" required value="${p.displayName}" /></label><label>Benutzername<input name="login" required /></label>
                                <label>Passwort<input name="password" type="password" required autocomplete="new-password" /></label><button class="btn">Konto anlegen</button></form>`) : ''}
                        ${session.mode === 'online' ? raw('<button class="btn btn--ghost" id="logout">Abmelden</button>') : ''}
                    </div>
                </div>
            </div>`;
        wireGo();
        $$('[data-part]').forEach(b => b.addEventListener('click', () => {
            look[b.dataset.part] = b.dataset.key;
            draw();
        }));
        $$('[data-color]').forEach(b => b.addEventListener('click', () => {
            look.color = b.dataset.color;
            draw();
        }));
        $$('[data-skin]').forEach(b => b.addEventListener('click', () => {
            look.skin = b.dataset.skin;
            draw();
        }));
        $('#save').addEventListener('click', e => busy(e.target, async () => {
            await api.put('/profile/avatar', look);
            await refreshPlayer();
            toast('Gespeichert.', 'good');
        }));
        $('#upgrade')?.addEventListener('submit', e => {
            e.preventDefault();
            const f = new FormData(e.target);
            busy(e.target.querySelector('button'), async () => {
                await api.upgrade(f.get('display'), f.get('login'), f.get('password'));
                toast('Willkommen! Dein Konto ist angelegt.', 'good');
                menu.show('profile');
            });
        });
        $('#logout')?.addEventListener('click', e => busy(e.target, async () => {
            await api.logout();
            menu.show('auth');
        }));
    };
    draw();
};

// ------------------------------------------------------------------ leaderboard

SCREENS.leaderboard = async () => {
    const rows = await api.get('/leaderboard');
    root().innerHTML = html`
        <div class="panel wide-panel">
            <header class="panel-head"><h2 class="title">Rangliste</h2><button class="btn btn--ghost" data-go="main">Zurück</button></header>
            ${rows.length ? raw(html`<table class="leaderboard"><thead><tr><th>#</th><th></th><th>Fahrer</th><th>Level</th><th>Siege</th><th>Podium</th><th>Abschüsse</th></tr></thead><tbody>
                ${rows.map(r => raw(html`<tr class="${r.id === session.player?.id ? 'me' : ''}"><td><span class="place place--${r.rank}">${r.rank}</span></td><td class="avatar">${raw(avatarSvg(r.avatar, { size: 40 }))}</td>
                    <td><b>${r.name}</b></td><td>${r.level}</td><td>${r.racesWon}</td><td>${r.podiums}</td><td>${r.kills}</td></tr>`))}</tbody></table>`)
                : raw('<p class="empty">Noch niemand in der Rangliste. Gäste zählen nicht – leg dir ein Konto an!</p>')}
        </div>`;
    wireGo();
};

// ------------------------------------------------------------------ settings

SCREENS.settings = async () => {
    const g = stage.settings;
    root().innerHTML = html`
        <div class="panel wide-panel settings">
            <header class="panel-head"><h2 class="title">Einstellungen</h2><button class="btn btn--ghost" data-go="main">Zurück</button></header>
            <div class="settings-grid">
                <section><h3>Grafik</h3>
                    <div class="chips">${['high', 'medium', 'low'].map(q => raw(html`<button class="chip ${g.quality === q ? 'on' : ''}" data-quality="${q}">${{ high: 'Hoch', medium: 'Mittel', low: 'Niedrig' }[q]}</button>`))}</div>
                    <label class="switch"><input type="checkbox" id="comic" ${g.comic ? 'checked' : ''} /> Comic-Filter (Tusche &amp; Raster)</label>
                </section>
                <section><h3>Ton</h3>
                    <label class="switch"><input type="checkbox" id="sound" ${audio.enabled ? 'checked' : ''} /> Ton an</label>
                    <label>Lautstärke<input type="range" min="0" max="1" step="0.05" value="${audio.volume}" id="volume" /></label>
                    <label>Musik<input type="range" min="0" max="1" step="0.05" value="${audio.musicVolume ?? 0.5}" id="music" /></label>
                </section>
                <section class="controls"><h3>Steuerung</h3>
                    <dl><dt>W/S · ↑/↓</dt><dd>Gas · Bremse/Rückwärts</dd><dt>A/D · ←/→</dt><dd>Lenken</dd><dt>Leertaste</dt><dd>Handbremse (Drift lädt den Turbo)</dd>
                        <dt>Shift</dt><dd>Turbo</dd><dt>Strg · J</dt><dd>Bord-MG</dd><dt>E · K · Enter</dt><dd>Waffe aus der Kiste</dd><dt>C</dt><dd>Kamera</dd><dt>B</dt><dd>Nach hinten schauen</dd>
                        <dt>R</dt><dd>Zurück auf die Strecke</dd><dt>Esc</dt><dd>Pause</dd><dt>Gamepad</dt><dd>RT/LT Gas/Bremse · A Turbo · B Handbremse · X MG · Y Waffe</dd></dl>
                </section>
                ${host.isApp ? raw('<section><h3>Server</h3><button class="btn" id="servers">Server wählen</button></section>') : ''}
                <section><h3>Über</h3><p>TurboToys ${session.version || ''}<br />Ein Spiel der MatGame-Familie.</p></section>
            </div>
        </div>`;
    wireGo();
    $$('[data-quality]').forEach(b => b.addEventListener('click', () => {
        stage.setQuality(b.dataset.quality);
        toast('Gilt ab dem nächsten Rennen voll.', 'info');
        SCREENS.settings();
    }));
    $('#comic').addEventListener('change', e => stage.setComic(e.target.checked));
    $('#sound').addEventListener('change', e => audio.setEnabled(e.target.checked));
    $('#volume').addEventListener('input', e => audio.setVolume(Number(e.target.value)));
    $('#music').addEventListener('input', e => audio.setMusicVolume(Number(e.target.value)));
    $('#servers')?.addEventListener('click', () => showServers());
};

// ------------------------------------------------------------------ results and pause

function showResults(results, { onClose, cup = null, levelBefore = null }) {
    const me = session.player?.id;
    const mine = results.results.find(r => r.playerId === me);
    const layer = document.getElementById('tt-results');
    const won = mine?.place === 1;
    layer.innerHTML = html`
        <div class="results-page">
            <div class="panel-row">
                <section class="comic-panel big ${won ? 'win' : ''}">
                    <span class="caption-box">${results.track.name} · ${results.laps} ${results.laps === 1 ? 'Runde' : 'Runden'}</span>
                    <h2 class="shout">${mine ? (won ? 'SIEG!' : `PLATZ ${mine.place}!`) : 'ZIEL!'}</h2>
                    ${mine ? raw(html`<div class="gains"><span class="gain money">+${money(mine.money)} ${raw(icon('coin'))}</span><span class="gain xp">+${mine.xp} XP</span>${mine.kills ? raw(html`<span class="gain kills">${mine.kills} × erwischt</span>`) : ''}</div>`) : ''}
                    <p class="level-up" id="level-up" hidden></p>
                </section>
                <section class="comic-panel">
                    <table class="results"><tbody>${results.results.map(r => raw(html`<tr class="${r.playerId === me ? 'me' : ''}"><td><span class="place place--${r.place}">${r.place}</span></td>
                        <td><b>${r.name}</b>${r.isBot ? raw(' <small>Bot</small>') : ''}</td><td>${r.finished ? lapTime(r.timeMs) : 'DNF'}</td><td>${r.bestLapMs ? lapTime(r.bestLapMs) : ''}</td>
                        <td>${r.kills ? `💥${r.kills}` : ''}</td><td class="num">+${money(r.money)}</td></tr>`))}</tbody></table>
                </section>
                <section class="comic-panel" id="cup-panel" hidden></section>
            </div>
            <div class="row center"><button class="btn btn--go btn--big" id="results-close">Weiter</button></div>
        </div>`;
    layer.hidden = false;
    $('#results-close', layer).addEventListener('click', () => {
        layer.hidden = true;
        layer.innerHTML = '';
        onClose();
    });
    return {
        saved(info) {
            if (info?.cupPlace) {
                const p = $('#cup-panel', layer);
                p.hidden = false;
                p.innerHTML = html`<h2 class="shout">${info.cupPlace === 1 ? 'POKAL GEWONNEN!' : `POKAL: PLATZ ${info.cupPlace}`}</h2>${info.cupPrize ? raw(html`<p class="gain money">+${money(info.cupPrize)} Preisgeld</p>`) : ''}`;
                audio.play(info.cupPlace === 1 ? 'win' : 'finish');
            }
            api.refreshSession().then(() => {
                renderTop();
                if (levelBefore != null && session.player && session.player.level > levelBefore) {
                    const el = $('#level-up', layer);
                    if (el) {
                        el.hidden = false;
                        el.textContent = `LEVEL ${session.player.level}! Neue Sachen freigeschaltet.`;
                        audio.play('upgrade');
                    }
                }
            });
        },
    };
}

function showPause({ onResume, onQuit, online }) {
    const layer = document.getElementById('tt-results');
    layer.innerHTML = html`<div class="modal"><div class="panel modal-box"><h2 class="title">Pause</h2>
        <p>${online ? 'Online läuft das Rennen weiter!' : 'Kurz durchatmen.'}</p>
        <div class="row"><button class="btn btn--go" id="resume">Weiter</button><button class="btn btn--danger" id="quit">Rennen verlassen</button></div></div></div>`;
    layer.hidden = false;
    const close = () => {
        layer.hidden = true;
        layer.innerHTML = '';
    };
    $('#resume', layer).addEventListener('click', () => {
        close();
        onResume();
    });
    $('#quit', layer).addEventListener('click', () => {
        close();
        onQuit();
    });
    return close;
}

export { renderTop, raw, esc };
