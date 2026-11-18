// TurboToys · render/postfx.js – the comic look (XIII style) as one post-process over the whole picture:
//   1. the scene in colour (all layers) into a render target,
//   2. the scene's normals and depth (layer 0 only: no particles) into a second one,
//   3. one full-screen pass: thick black ink lines where depth or normals jump, halftone dots in the shadows,
//      a slight posterisation, paper grain and a vignette.
// Quality 'low' skips the normal pass (ink from depth only) and renders at a lower pixel ratio.

import * as THREE from 'three';
import { LAYER_FX } from './toon.js';

const vertex = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const fragment = /* glsl */`
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float inkWidth;
uniform float useNormals;
uniform float halftone;
uniform float time;
uniform float flash;
uniform vec3 inkColor;
uniform float saturation;
varying vec2 vUv;

float linearDepth(vec2 uv) {
    float z = texture2D(tDepth, uv).x;
    float ndc = z * 2.0 - 1.0;
    return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - ndc * (cameraFar - cameraNear));
}

vec3 normalAt(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
    vec2 texel = inkWidth / resolution;
    vec4 base = linearToOutputTexel(texture2D(tColor, vUv));
    vec3 color = base.rgb;

    // ---- ink: depth and normal discontinuities (Sobel-like cross)
    float d = linearDepth(vUv);
    float dl = linearDepth(vUv - vec2(texel.x, 0.0));
    float dr = linearDepth(vUv + vec2(texel.x, 0.0));
    float du = linearDepth(vUv + vec2(0.0, texel.y));
    float dd = linearDepth(vUv - vec2(0.0, texel.y));
    float depthEdge = abs(dl + dr - 2.0 * d) + abs(du + dd - 2.0 * d);
    // relative to the distance: far away needs a bigger jump (no grey mush on the horizon)
    depthEdge = smoothstep(0.035, 0.09, depthEdge / max(d, 0.5) * 6.0);
    float far = smoothstep(cameraFar * 0.55, cameraFar * 0.95, d);
    depthEdge *= 1.0 - far;

    float normalEdge = 0.0;
    if (useNormals > 0.5) {
        vec3 n = normalAt(vUv);
        vec3 nl = normalAt(vUv - vec2(texel.x, 0.0));
        vec3 nr = normalAt(vUv + vec2(texel.x, 0.0));
        vec3 nu = normalAt(vUv + vec2(0.0, texel.y));
        vec3 nd = normalAt(vUv - vec2(0.0, texel.y));
        float diff = distance(nl, nr) + distance(nu, nd);
        normalEdge = smoothstep(0.55, 0.95, diff) * (1.0 - far) * (1.0 - smoothstep(60.0, 220.0, d));
    }
    float ink = clamp(max(depthEdge, normalEdge), 0.0, 1.0);

    // ---- colour: a little more saturated, slightly posterised
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(lum), color, saturation);

    // ---- halftone dots in the shadows (screen space, rotated grid)
    if (halftone > 0.0) {
        vec2 p = gl_FragCoord.xy;
        float a = 0.785;
        vec2 r = vec2(cos(a) * p.x - sin(a) * p.y, sin(a) * p.x + cos(a) * p.y) / 5.0;
        vec2 cell = fract(r) - 0.5;
        float shade = 1.0 - smoothstep(0.08, 0.42, lum);
        float radius = 0.48 * shade;
        float dot = 1.0 - smoothstep(radius - 0.06, radius + 0.06, length(cell));
        color = mix(color, color * 0.45, dot * halftone * step(0.02, shade));
        // fine hatching on the darkest parts
        float hatch = step(0.5, fract((p.x + p.y) / 4.0)) * (1.0 - smoothstep(0.02, 0.12, lum));
        color = mix(color, color * 0.6, hatch * halftone * 0.6);
    }

    // ---- paper grain and vignette
    float grain = hash(floor(gl_FragCoord.xy * 0.5) + floor(time * 12.0)) - 0.5;
    color += grain * 0.035;
    vec2 v = vUv - 0.5;
    color *= 1.0 - dot(v, v) * 0.55;

    color = mix(color, inkColor, ink);
    color = mix(color, vec3(1.0, 0.97, 0.88), flash);
    gl_FragColor = vec4(color, 1.0);
}`;

export class ComicPipeline {
    /**
     * @param {THREE.WebGLRenderer} renderer
     * @param {{ quality?: 'high'|'medium'|'low' }} options
     */
    constructor(renderer, { quality = 'high' } = {}) {
        this.renderer = renderer;
        this.quality = quality;
        this.flash = 0;
        this.enabled = true;
        this.normalMaterial = new THREE.MeshNormalMaterial();
        this.size = new THREE.Vector2();
        this.colorTarget = null;
        this.normalTarget = null;
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
            vertexShader: vertex,
            fragmentShader: fragment,
            uniforms: {
                tColor: { value: null },
                tNormal: { value: null },
                tDepth: { value: null },
                resolution: { value: new THREE.Vector2(1, 1) },
                cameraNear: { value: 0.1 },
                cameraFar: { value: 1000 },
                inkWidth: { value: 1.25 },
                useNormals: { value: 1 },
                halftone: { value: 0.55 },
                time: { value: 0 },
                flash: { value: 0 },
                inkColor: { value: new THREE.Color(0x14100c) },
                saturation: { value: 1.18 },
            },
            depthTest: false,
            depthWrite: false,
        }));
        this.quad.frustumCulled = false;
        this.postScene = new THREE.Scene();
        this.postScene.add(this.quad);
        this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.setQuality(quality);
    }

    setQuality(quality) {
        this.quality = quality;
        const u = this.quad.material.uniforms;
        u.useNormals.value = quality === 'low' ? 0 : 1;
        u.halftone.value = quality === 'low' ? 0.35 : 0.55;
        this.resize(true);
    }

    resize(force = false) {
        const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        if (!force && size.equals(this.size)) return;
        this.size.copy(size);
        this.colorTarget?.dispose();
        this.normalTarget?.dispose();
        const options = { type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : 0 };
        this.colorTarget = new THREE.WebGLRenderTarget(size.x, size.y, options);
        this.colorTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
        const depthTexture = new THREE.DepthTexture(size.x, size.y);
        depthTexture.type = THREE.UnsignedIntType;
        this.normalTarget = new THREE.WebGLRenderTarget(size.x, size.y, { depthTexture, depthBuffer: true });
        const u = this.quad.material.uniforms;
        u.resolution.value.set(size.x, size.y);
        // the ink gets thicker on big screens (it is a drawing, not a hairline)
        u.inkWidth.value = Math.max(1, Math.min(2.2, size.y / 620));
    }

    /** Draws the scene through the comic pass (into the screen or a viewport set by the caller with setScissor). */
    render(scene, camera, { time = 0, viewport = null } = {}) {
        const renderer = this.renderer;
        if (!this.enabled) {
            renderer.render(scene, camera);
            return;
        }
        this.resize();
        const u = this.quad.material.uniforms;

        // normals + depth (layer 0 only: particles and glass draw no ink)
        const mask = camera.layers.mask;
        camera.layers.set(0);
        const background = scene.background;
        const fog = scene.fog;
        scene.background = null;
        scene.fog = null;
        scene.overrideMaterial = this.normalMaterial;
        renderer.setRenderTarget(this.normalTarget);
        renderer.setClearColor(0x8080ff, 1);
        renderer.clear();
        renderer.render(scene, camera);
        scene.overrideMaterial = null;
        scene.background = background;
        scene.fog = fog;

        // colour (all layers)
        camera.layers.mask = mask;
        camera.layers.enable(LAYER_FX);
        renderer.setRenderTarget(this.colorTarget);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);

        u.tColor.value = this.colorTarget.texture;
        u.tNormal.value = this.normalTarget.texture;
        u.tDepth.value = this.normalTarget.depthTexture;
        u.cameraNear.value = camera.near;
        u.cameraFar.value = camera.far;
        u.time.value = time;
        u.flash.value = this.flash;
        if (viewport) {
            renderer.setViewport(viewport.x, viewport.y, viewport.w, viewport.h);
            renderer.setScissor(viewport.x, viewport.y, viewport.w, viewport.h);
            renderer.setScissorTest(true);
        }
        renderer.render(this.postScene, this.postCamera);
        if (viewport) renderer.setScissorTest(false);
    }

    dispose() {
        this.colorTarget?.dispose();
        this.normalTarget?.dispose();
        this.quad.material.dispose();
    }
}
