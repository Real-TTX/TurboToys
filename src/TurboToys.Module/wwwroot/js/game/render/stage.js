// TurboToys · render/stage.js – the one WebGL canvas of the app: renderer, comic pipeline, the frame loop, the graphics settings.
// Whoever owns the screen (the menu's showcase, the garage, a race) sets stage.scene / stage.camera and stage.onFrame.

import * as THREE from 'three';
import { ComicPipeline } from './postfx.js';

const SETTINGS_KEY = 'turbotoys.graphics';

function loadSettings() {
    try {
        return { quality: 'high', comic: true, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')) };
    } catch {
        return { quality: 'high', comic: true };
    }
}

class Stage {
    constructor() {
        this.settings = loadSettings();
        this.renderer = null;
        this.pipeline = null;
        this.scene = null;
        this.camera = null;
        this.onFrame = null;
        this.overlays = [];
        this.time = 0;
        this.fps = 60;
        this.timer = new THREE.Timer();
    }

    /** Creates the canvas in the container (once). */
    mount(container) {
        if (this.renderer) return;
        const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.appendChild(renderer.domElement);
        this.renderer = renderer;
        this.pipeline = new ComicPipeline(renderer, { quality: this.settings.quality });
        this.pipeline.enabled = this.settings.comic;
        this.resize();
        addEventListener('resize', () => this.resize());
        this.timer.connect(document);
        const loop = timestamp => {
            requestAnimationFrame(loop);
            this.timer.update(timestamp);
            const dt = Math.min(0.05, this.timer.getDelta());
            this.time += dt;
            this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
            this.onFrame?.(dt, this.time);
            if (this.scene && this.camera) {
                this.pipeline.render(this.scene, this.camera, { time: this.time });
                for (const overlay of this.overlays) overlay(this.renderer, this.pipeline, this.time);
            }
        };
        requestAnimationFrame(loop);
    }

    resize() {
        if (!this.renderer) return;
        const ratio = this.settings.quality === 'low' ? Math.min(devicePixelRatio, 1) : this.settings.quality === 'medium' ? Math.min(devicePixelRatio, 1.5) : Math.min(devicePixelRatio, 2);
        this.renderer.setPixelRatio(ratio);
        this.renderer.setSize(innerWidth, innerHeight);
        this.renderer.shadowMap.enabled = this.settings.quality !== 'low';
        if (this.camera?.isPerspectiveCamera) {
            this.camera.aspect = innerWidth / innerHeight;
            this.camera.updateProjectionMatrix();
        }
    }

    /** Shows a scene with a camera (the camera's aspect follows the window). */
    show(scene, camera, onFrame = null) {
        this.scene = scene;
        this.camera = camera;
        this.onFrame = onFrame;
        this.overlays = [];
        this.resize();
    }

    setQuality(quality) {
        this.settings.quality = quality;
        this.save();
        this.pipeline?.setQuality(quality);
        this.resize();
    }

    setComic(on) {
        this.settings.comic = on;
        this.save();
        if (this.pipeline) this.pipeline.enabled = on;
    }

    save() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    }
}

export const stage = new Stage();
