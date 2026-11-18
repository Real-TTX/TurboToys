// TurboToys · themes/plain.js – the fallback world (a grey hall) when a theme module is missing.
import { floor } from './common.js';

export default {
    key: 'plain',
    name: 'Halle',
    sky: { top: '#9fb4c8', bottom: '#dde6ee', fog: '#dde6ee', fogNear: 250, fogFar: 900 },
    light: { sun: '#fff3dc', sunIntensity: 2.4, sunDirection: [0.4, 1, 0.3], ambient: '#ffffff', ambientIntensity: 0.6 },
    road: { surface: '#4a4d55', surfaceDark: '#2e3036', line: '#f7f3ea', edge: '#f7f3ea', curb: ['#e2392f', '#f7f3ea'], barrier: 'wall', barrierColors: ['#e2392f', '#f7f3ea'], skirt: '#6b6f78' },
    build({ root, track }) {
        root.add(floor({ track, color: '#9aa0a8' }));
        return {};
    },
};
