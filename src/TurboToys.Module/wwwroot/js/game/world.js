// TurboToys · world.js – one race world: the track of a layout (tracks/track.js), its road (tracks/builder.js) and the theme around it (themes/<key>.js),
// with the sky, the fog and the lights of the time of day ('day' | 'dusk' | 'night').

import * as THREE from 'three';
import { Track, layoutOf } from './tracks/track.js';
import { buildRoad } from './tracks/builder.js';
import { mergeByMaterial, seeded, LAYER_FX, canvasTexture } from './render/toon.js';

const themeCache = new Map();

/** The theme module of a key (themes/<key>.js); a missing one falls back to the plain theme. */
export async function loadTheme(key) {
    if (!themeCache.has(key)) {
        themeCache.set(key, import(`./themes/${key}.js`).then(m => m.default).catch(error => {
            console.warn(`Thema ${key} fehlt`, error);
            return import('./themes/plain.js').then(m => m.default);
        }));
    }
    return themeCache.get(key);
}

const TIME = {
    day: { light: 1, ambient: 1, tint: null, sky: 1 },
    dusk: { light: 0.75, ambient: 0.8, tint: new THREE.Color(0xff9a5a), sky: 0.85 },
    night: { light: 0.22, ambient: 0.42, tint: new THREE.Color(0x4a66c8), sky: 0.32 },
};

function skyTexture(top, bottom) {
    return canvasTexture(4, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, top);
        g.addColorStop(1, bottom);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
    });
}

function shade(hex, factor, tint) {
    const c = new THREE.Color(hex);
    if (tint) c.lerp(tint, 0.35);
    return c.multiplyScalar(factor);
}

/**
 * Builds a world.
 * @param {{ layout: string, timeOfDay?: 'day'|'dusk'|'night', quality?: 'high'|'medium'|'low' }} options
 * @returns {Promise<{ track: Track, theme: any, scene: THREE.Scene, sun: THREE.DirectionalLight, update: (dt:number, t:number, focus?:THREE.Vector3)=>void, startLights: THREE.Mesh[], night: boolean }>}
 */
export async function buildWorld({ layout, timeOfDay = 'day', quality = 'high' }) {
    const data = await layoutOf(layout);
    const track = new Track(data);
    const theme = await loadTheme(data.theme);
    const time = TIME[theme.forceTime ?? timeOfDay] ?? TIME.day;
    const night = (theme.forceTime ?? timeOfDay) === 'night';

    const scene = new THREE.Scene();
    const sky = theme.sky ?? {};
    scene.background = skyTexture(
        '#' + shade(sky.top ?? '#7cc6f2', time.sky, time.tint).getHexString(),
        '#' + shade(sky.bottom ?? '#e8f4fb', time.sky, time.tint).getHexString());
    scene.fog = new THREE.Fog(shade(sky.fog ?? sky.bottom ?? '#e8f4fb', time.sky, time.tint), sky.fogNear ?? 220, sky.fogFar ?? 900);

    // ---- lights
    const light = theme.light ?? {};
    const hemi = new THREE.HemisphereLight(shade(light.hemiSky ?? '#cfe8ff', 1, time.tint), shade(light.hemiGround ?? '#8a6a4a', 1, time.tint), (light.hemiIntensity ?? 1.1) * time.ambient);
    scene.add(hemi);
    const ambient = new THREE.AmbientLight(shade(light.ambient ?? '#ffffff', 1, time.tint), (light.ambientIntensity ?? 0.6) * time.ambient);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(shade(light.sun ?? '#fff3dc', 1, time.tint), (light.sunIntensity ?? 2.6) * time.light);
    const dir = new THREE.Vector3(...(light.sunDirection ?? [0.5, 1, 0.35])).normalize();
    sun.userData.direction = dir;
    sun.castShadow = quality !== 'low';
    const shadowSize = quality === 'high' ? 4096 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    const span = 150;
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 900 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.6;
    scene.add(sun);
    scene.add(sun.target);

    // ---- the road
    const road = buildRoad(track, theme.road ?? {}, { quality });
    scene.add(road.group);

    // ---- the theme's world
    const raw = new THREE.Group();
    raw.name = 'theme';
    const result = (await theme.build({ root: raw, track, rng: seeded('world:' + track.key), quality, timeOfDay: theme.forceTime ?? timeOfDay, night })) ?? {};
    const merged = mergeByMaterial(raw);
    scene.add(merged);
    for (const l of result.lights ?? []) scene.add(l);

    const gantry = road.group.getObjectByName('gantry');
    const startLights = gantry?.userData.startLights ?? [];

    const focus = new THREE.Vector3(track.bounds.cx, 0, track.bounds.cz);
    return {
        track,
        theme,
        scene,
        sun,
        night,
        startLights,
        update(dt, t, target) {
            if (target) focus.copy(target);
            // the shadow box follows the camera's focus (sharp shadows near the cars)
            sun.target.position.copy(focus);
            sun.position.copy(focus).addScaledVector(dir, 300);
            road.update(dt, t);
            result.update?.(dt, t);
        },
        dispose() {
            scene.traverse(o => {
                o.geometry?.dispose?.();
            });
        },
    };
}

export { LAYER_FX };
