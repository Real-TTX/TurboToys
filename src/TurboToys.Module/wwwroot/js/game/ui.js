// TurboToys · ui.js – small DOM helpers for the comic menus: html templating with escaping, panels, toasts, confirm, busy buttons.

import { audio } from './audio.js';

export function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Tagged template: html`<b>${name}</b>` escapes values; raw(...) passes html through. Returns a string. */
export function html(strings, ...values) {
    let out = '';
    strings.forEach((s, i) => {
        out += s;
        if (i < values.length) {
            const v = values[i];
            if (v && v.__raw) out += v.html;
            else if (Array.isArray(v)) out += v.map(x => (x && x.__raw ? x.html : esc(x))).join('');
            else out += esc(v);
        }
    });
    return out;
}

export function raw(markup) {
    return { __raw: true, html: markup };
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** A short message at the bottom (kind: info | good | bad). */
export function toast(text, kind = 'info', life = 3200) {
    const host = document.getElementById('tt-toasts');
    const el = document.createElement('div');
    el.className = `toast toast--${kind}`;
    el.textContent = text;
    host.appendChild(el);
    if (kind === 'bad') audio.play('error');
    setTimeout(() => el.classList.add('out'), life - 300);
    setTimeout(() => el.remove(), life);
}

/** A comic yes/no question. Resolves true/false. */
export function confirmBox(title, text, { yes = 'Ja', no = 'Abbrechen', danger = false } = {}) {
    return new Promise(resolve => {
        const layer = document.createElement('div');
        layer.className = 'modal';
        layer.innerHTML = html`<div class="panel modal-box" role="dialog" aria-modal="true">
            <h2 class="title">${title}</h2><p>${text}</p>
            <div class="row"><button class="btn ${danger ? 'btn--danger' : 'btn--go'}" data-yes>${yes}</button><button class="btn" data-no>${no}</button></div></div>`;
        document.body.appendChild(layer);
        const done = value => {
            layer.remove();
            resolve(value);
        };
        layer.querySelector('[data-yes]').addEventListener('click', () => done(true));
        layer.querySelector('[data-no]').addEventListener('click', () => done(false));
        layer.addEventListener('click', e => e.target === layer && done(false));
        layer.querySelector('[data-yes]').focus();
    });
}

/** Runs an action with the button busy; shows the error as a toast. */
export async function busy(button, action) {
    if (button?.disabled) return undefined;
    if (button) {
        button.disabled = true;
        button.classList.add('busy');
    }
    try {
        return await action();
    } catch (error) {
        toast(error.message ?? String(error), 'bad', 4200);
        return undefined;
    } finally {
        if (button) {
            button.disabled = false;
            button.classList.remove('busy');
        }
    }
}

/** Click sounds for every button of the app. */
export function wireSounds(root = document) {
    root.addEventListener('click', e => {
        if (e.target.closest('button, .chip, .card[data-action]')) {
            audio.unlock();
            audio.play('click');
        }
    });
    root.addEventListener('pointerover', e => {
        const t = e.target.closest('button:not(:disabled), .card[data-action]');
        if (t && t !== root.lastHover) {
            root.lastHover = t;
            audio.play('hover');
        }
    });
}

/** Little icons (24×24 line icons; the game's own are in img/app-icons.svg as #mat-i-…). */
export function icon(name, cls = '') {
    return `<svg class="ico ${cls}" aria-hidden="true"><use href="#mat-i-${name}"></use></svg>`;
}

/** A row of 5 pips (tuning level). */
export function pips(level, max = 5) {
    return `<span class="pips">${Array.from({ length: max }, (_, k) => `<i class="${k < level ? 'on' : ''}"></i>`).join('')}</span>`;
}

/** A stat bar 0..max. */
export function bar(label, value, max = 10, extra = 0) {
    const a = Math.max(0, Math.min(100, (value / max) * 100));
    const b = Math.max(0, Math.min(100 - a, (extra / max) * 100));
    return `<div class="stat"><span>${esc(label)}</span><div class="stat-bar"><i style="width:${a}%"></i><i class="plus" style="width:${b}%"></i></div></div>`;
}
