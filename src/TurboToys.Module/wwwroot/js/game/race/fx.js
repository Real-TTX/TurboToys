// TurboToys · race/fx.js – the effects of a race in the comic style: flat puffs with an ink rim (smoke, dust, fire), additive sparks and glows,
// toon debris that bounces (outlined like everything else), expanding shock rings and skid marks on the road. All pooled, no allocation per frame.

import * as THREE from 'three';
import { LAYER_FX, toon } from '../render/toon.js';

const puffVertex = /* glsl */`
attribute float size;
attribute float alpha;
attribute vec3 color;
varying float vAlpha;
varying vec3 vColor;
uniform float scale;
void main() {
    vAlpha = alpha;
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // puffs right in front of the camera fade away (no screen-filling smoke)
    vAlpha *= smoothstep(2.5, 10.0, -mv.z);
    gl_PointSize = min(size * scale / max(1.0, -mv.z), scale * 0.35);
    gl_Position = projectionMatrix * mv;
}`;

const puffFragment = /* glsl */`
varying float vAlpha;
varying vec3 vColor;
uniform float rim;
void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0 || vAlpha <= 0.0) discard;
    // flat comic shading: a lit cap top-left, ink rim
    float lit = step(0.0, -p.x * 0.5 + p.y * 0.8 - 0.1) * 0.12;
    vec3 c = vColor * (0.9 + lit);
    if (rim > 0.5) c = mix(c, vec3(0.08, 0.06, 0.05), smoothstep(0.78, 0.86, r));
    gl_FragColor = vec4(c, vAlpha);
}`;

const glowFragment = /* glsl */`
varying float vAlpha;
varying vec3 vColor;
void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = (1.0 - r) * (1.0 - r);
    gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}`;

class PointPool {
    constructor(scene, max, { additive = false, rim = true } = {}) {
        this.max = max;
        this.count = 0;
        this.items = [];
        const g = new THREE.BufferGeometry();
        this.position = new Float32Array(max * 3);
        this.color = new Float32Array(max * 3);
        this.size = new Float32Array(max);
        this.alpha = new Float32Array(max);
        g.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('color', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
        g.setDrawRange(0, 0);
        this.geometry = g;
        this.material = new THREE.ShaderMaterial({
            vertexShader: puffVertex,
            fragmentShader: additive ? glowFragment : puffFragment,
            uniforms: { scale: { value: 600 }, rim: { value: rim ? 1 : 0 } },
            transparent: true,
            depthWrite: false,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        this.points = new THREE.Points(g, this.material);
        this.points.frustumCulled = false;
        this.points.layers.set(LAYER_FX);
        this.points.renderOrder = additive ? 3 : 2;
        scene.add(this.points);
    }

    /** p: { x, y, z, vx, vy, vz, life, size, grow, color: THREE.Color, alpha, drag, gravity, fade } */
    spawn(p) {
        if (this.items.length >= this.max) this.items.shift();
        p.age = 0;
        this.items.push(p);
    }

    update(dt, height) {
        this.material.uniforms.scale.value = height * 0.9;
        const items = this.items;
        let w = 0;
        for (let k = 0; k < items.length; k++) {
            const p = items[k];
            p.age += dt;
            if (p.age >= p.life) continue;
            const drag = Math.exp(-(p.drag ?? 1.5) * dt);
            p.vx *= drag;
            p.vy = p.vy * drag - (p.gravity ?? 0) * dt;
            p.vz *= drag;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            items[w++] = p;
        }
        items.length = w;
        for (let k = 0; k < items.length; k++) {
            const p = items[k];
            const t = p.age / p.life;
            this.position[k * 3] = p.x;
            this.position[k * 3 + 1] = p.y;
            this.position[k * 3 + 2] = p.z;
            this.color[k * 3] = p.color.r;
            this.color[k * 3 + 1] = p.color.g;
            this.color[k * 3 + 2] = p.color.b;
            this.size[k] = p.size * (1 + (p.grow ?? 1) * t);
            this.alpha[k] = (p.alpha ?? 1) * (p.fade === false ? (t < 0.85 ? 1 : (1 - t) / 0.15) : 1 - t * t);
        }
        const g = this.geometry;
        g.setDrawRange(0, items.length);
        for (const name of ['position', 'color', 'size', 'alpha']) g.attributes[name].needsUpdate = true;
    }
}

const SKIDS = 900;

export class Effects {
    constructor(scene, { quality = 'high' } = {}) {
        this.scene = scene;
        this.quality = quality;
        const scale = quality === 'low' ? 0.5 : 1;
        this.puffs = new PointPool(scene, Math.round(1600 * scale), { rim: true });
        this.glows = new PointPool(scene, Math.round(900 * scale), { additive: true });
        this.rings = [];
        this.debris = [];
        this.colors = {
            smoke: new THREE.Color(0x8d8a86),
            darkSmoke: new THREE.Color(0x3c3936),
            dust: new THREE.Color(0xc9ae84),
            fire: new THREE.Color(0xff8c1a),
            yellow: new THREE.Color(0xffd23a),
            white: new THREE.Color(0xfff4d6),
            spark: new THREE.Color(0xffc94a),
            blue: new THREE.Color(0x58c8ff),
            green: new THREE.Color(0x8bd94a),
            oil: new THREE.Color(0x1b1a22),
            water: new THREE.Color(0x9fdcff),
        };
        // debris: small toon boxes (outlined)
        const debrisGeometry = new THREE.BoxGeometry(0.45, 0.3, 0.6);
        this.debrisMesh = new THREE.InstancedMesh(debrisGeometry, toon(0xffffff), 160);
        this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.debrisMesh.count = 0;
        this.debrisMesh.castShadow = true;
        this.debrisMesh.frustumCulled = false;
        scene.add(this.debrisMesh);
        // skid marks: one ring buffer of quads on the road
        const g = new THREE.BufferGeometry();
        this.skidPos = new Float32Array(SKIDS * 6 * 3);
        this.skidAlpha = new Float32Array(SKIDS * 6);
        g.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('alpha', new THREE.BufferAttribute(this.skidAlpha, 1).setUsage(THREE.DynamicDrawUsage));
        const skidMaterial = new THREE.ShaderMaterial({
            vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.08,0.07,0.06, vA * 0.55); }',
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
        });
        this.skids = new THREE.Mesh(g, skidMaterial);
        this.skids.frustumCulled = false;
        this.skids.layers.set(LAYER_FX);
        scene.add(this.skids);
        this.skidNext = 0;
        this.lastSkid = new Map();
        this.tmp = new THREE.Object3D();
    }

    rand(a, b) {
        return a + Math.random() * (b - a);
    }

    /** Exhaust smoke / tyre smoke / dust behind a car. */
    smoke(x, y, z, { color = 'smoke', size = 2.2, vx = 0, vy = 2, vz = 0, life = 0.9, alpha = 0.85 } = {}) {
        this.puffs.spawn({ x, y, z, vx: vx + this.rand(-1, 1), vy: vy + this.rand(0, 1.5), vz: vz + this.rand(-1, 1), life: life * this.rand(0.8, 1.2), size: size * this.rand(0.8, 1.2), grow: 1.6, color: this.colors[color] ?? color, alpha, drag: 2.2 });
    }

    /** A flame puff (backfire, turbo). */
    flame(x, y, z, vx, vy, vz, size = 1.4) {
        this.glows.spawn({ x, y, z, vx, vy, vz, life: 0.18, size: size * 2.2, grow: -0.4, color: this.colors.fire, alpha: 1, drag: 4 });
        this.puffs.spawn({ x, y, z, vx: vx * 0.6, vy: vy * 0.6, vz: vz * 0.6, life: 0.16, size, grow: -0.3, color: this.colors.yellow, alpha: 1, drag: 4, fade: false });
    }

    /** Sparks (wall scrape, bullet hits). */
    sparks(x, y, z, count = 8, { speed = 14, color = 'spark' } = {}) {
        for (let k = 0; k < count; k++) {
            const a = Math.random() * Math.PI * 2;
            const v = speed * this.rand(0.4, 1);
            this.glows.spawn({ x, y, z, vx: Math.cos(a) * v, vy: this.rand(2, 12), vz: Math.sin(a) * v, life: this.rand(0.2, 0.45), size: this.rand(0.5, 1.0), grow: -0.6, color: this.colors[color], alpha: 1, drag: 1.2, gravity: 30 });
        }
    }

    /** A glowing ball (rocket exhaust, MG muzzle, crate shine). */
    glow(x, y, z, size = 2, color = 'yellow', life = 0.08) {
        this.glows.spawn({ x, y, z, vx: 0, vy: 0, vz: 0, life, size, grow: 0, color: this.colors[color] ?? color, alpha: 1, drag: 0 });
    }

    /** The big one: fireball, smoke column, sparks, debris in the car's colour, a shock ring. */
    explosion(x, y, z, { size = 1, paint = 0xe2392f } = {}) {
        const s = size;
        for (let k = 0; k < 14 * s; k++) {
            const a = Math.random() * Math.PI * 2;
            const v = this.rand(4, 13) * s;
            this.puffs.spawn({ x, y: y + 1, z, vx: Math.cos(a) * v, vy: this.rand(3, 12) * s, vz: Math.sin(a) * v, life: this.rand(0.35, 0.6), size: this.rand(3, 5) * s, grow: 1.2, color: k % 3 ? this.colors.fire : this.colors.yellow, alpha: 1, drag: 3.5, fade: false });
        }
        for (let k = 0; k < 10 * s; k++) {
            this.puffs.spawn({ x: x + this.rand(-2, 2), y: y + this.rand(1, 3), z: z + this.rand(-2, 2), vx: this.rand(-3, 3), vy: this.rand(4, 9), vz: this.rand(-3, 3), life: this.rand(1.4, 2.4), size: this.rand(3.5, 6) * s, grow: 1.4, color: k % 2 ? this.colors.darkSmoke : this.colors.smoke, alpha: 0.9, drag: 1.2 });
        }
        this.glows.spawn({ x, y: y + 1.5, z, vx: 0, vy: 0, vz: 0, life: 0.25, size: 18 * s, grow: 0.6, color: this.colors.white, alpha: 1, drag: 0 });
        this.sparks(x, y + 1, z, Math.round(18 * s), { speed: 22 });
        const paintColor = new THREE.Color(paint);
        for (let k = 0; k < 10 * s; k++) {
            const a = Math.random() * Math.PI * 2;
            const v = this.rand(6, 16);
            this.debris.push({ x, y: y + 1, z, vx: Math.cos(a) * v, vy: this.rand(8, 22), vz: Math.sin(a) * v, rx: Math.random() * 6, ry: Math.random() * 6, spin: this.rand(-12, 12), life: this.rand(1.6, 2.6), age: 0, color: k % 3 ? paintColor : new THREE.Color(0x34373d), scale: this.rand(0.7, 1.6) });
        }
        this.ring(x, y + 0.3, z, 14 * s, 0xfff4d6);
    }

    /** A flat ring that expands (explosion, shock, landing). */
    ring(x, y, z, radius, color = 0xfff4d6, life = 0.45) {
        const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x, y, z);
        mesh.layers.set(LAYER_FX);
        this.scene.add(mesh);
        this.rings.push({ mesh, radius, life, age: 0 });
    }

    /** A skid mark at a wheel (key = the wheel: consecutive calls connect). */
    skid(key, x, y, z, yaw, width = 0.55) {
        const last = this.lastSkid.get(key);
        this.lastSkid.set(key, { x, y, z, t: performance.now() });
        if (!last || performance.now() - last.t > 120 || Math.hypot(x - last.x, z - last.z) > 4) return;
        if (Math.hypot(x - last.x, z - last.z) < 0.25) {
            this.lastSkid.set(key, last);
            return;
        }
        const sx = Math.cos(yaw) * width;
        const sz = -Math.sin(yaw) * width;
        const k = this.skidNext;
        this.skidNext = (k + 1) % SKIDS;
        const p = this.skidPos;
        const o = k * 18;
        const y0 = last.y + 0.06;
        const y1 = y + 0.06;
        const quad = [last.x - sx, y0, last.z - sz, last.x + sx, y0, last.z + sz, x - sx, y1, z - sz, last.x + sx, y0, last.z + sz, x + sx, y1, z + sz, x - sx, y1, z - sz];
        p.set(quad, o);
        this.skidAlpha.fill(1, k * 6, k * 6 + 6);
    }

    /** Forgets the connection of a wheel's marks (the wheel left the ground). */
    lift(key) {
        this.lastSkid.delete(key);
    }

    update(dt, viewHeight = innerHeight) {
        this.puffs.update(dt, viewHeight);
        this.glows.update(dt, viewHeight);
        // skid marks fade slowly
        const a = this.skidAlpha;
        for (let k = 0; k < a.length; k++) if (a[k] > 0) a[k] = Math.max(0, a[k] - dt * 0.035);
        this.skids.geometry.attributes.position.needsUpdate = true;
        this.skids.geometry.attributes.alpha.needsUpdate = true;
        // rings
        for (let k = this.rings.length - 1; k >= 0; k--) {
            const r = this.rings[k];
            r.age += dt;
            const t = r.age / r.life;
            if (t >= 1) {
                this.scene.remove(r.mesh);
                r.mesh.geometry.dispose();
                r.mesh.material.dispose();
                this.rings.splice(k, 1);
                continue;
            }
            const s = r.radius * (0.2 + t);
            r.mesh.scale.set(s, s, s);
            r.mesh.material.opacity = 1 - t;
        }
        // debris
        const m = this.debrisMesh;
        let n = 0;
        for (let k = this.debris.length - 1; k >= 0; k--) {
            const d = this.debris[k];
            d.age += dt;
            if (d.age > d.life) {
                this.debris.splice(k, 1);
                continue;
            }
            d.vy -= 50 * dt;
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.z += d.vz * dt;
            if (d.y < 0.2 && d.vy < 0) {
                d.y = 0.2;
                d.vy *= -0.35;
                d.vx *= 0.6;
                d.vz *= 0.6;
                d.spin *= 0.5;
            }
            d.rx += d.spin * dt;
            d.ry += d.spin * dt * 0.7;
            if (n < m.instanceMatrix.count) {
                this.tmp.position.set(d.x, d.y, d.z);
                this.tmp.rotation.set(d.rx, d.ry, 0);
                const fade = d.age > d.life - 0.3 ? (d.life - d.age) / 0.3 : 1;
                this.tmp.scale.setScalar(d.scale * fade);
                this.tmp.updateMatrix();
                m.setMatrixAt(n, this.tmp.matrix);
                m.setColorAt(n, d.color);
                n++;
            }
        }
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    dispose() {
        for (const r of this.rings) this.scene.remove(r.mesh);
        this.scene.remove(this.puffs.points, this.glows.points, this.debrisMesh, this.skids);
    }
}
