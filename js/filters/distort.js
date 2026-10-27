import { CONFIG } from '../config.js';

// Déformations temps réel par table de correspondance : pour chaque pixel de sortie, on précalcule
// l'index du pixel source. Tant que taille, centre et force ne changent pas, une image ne coûte
// qu'une copie indexée (très rapide). Le doigt déplace le centre via setDistortionCenter().

const center = { x: 0.5, y: 0.5 };
const cache = new Map();

/** @param {number} x @param {number} y coordonnées normalisées (0 à 1) */
export function setDistortionCenter(x, y) {
    center.x = Math.min(1, Math.max(0, x));
    center.y = Math.min(1, Math.max(0, y));
}

function remap(image, name, strength, build, extra = '') {
    const { width: w, height: h, data } = image;
    const key = `${name}|${w}x${h}|${center.x.toFixed(3)}|${center.y.toFixed(3)}|${strength.toFixed(2)}|${extra}`;
    let map = cache.get(key);
    if (!map) {
        map = build(w, h, center.x * w, center.y * h, strength);
        if (cache.size >= CONFIG.DISTORT_CACHE_SIZE) cache.delete(cache.keys().next().value);
        cache.set(key, map);
    }
    const source = new Uint32Array(data.slice().buffer);
    const target = new Uint32Array(data.buffer);
    for (let i = 0; i < map.length; i++) target[i] = source[map[i]];
}

/** Index du pixel le plus proche, borné à l'image. */
const pixelIndex = (w, h, x, y) =>
    Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)));

/** Déformation radiale : `scale(r, s)` donne le facteur appliqué à la distance au centre (r normalisé, < 1). */
function radial(name, radiusOf, scale) {
    return (image, strength) => remap(image, name, strength, (w, h, cx, cy, s) => {
        const map = new Int32Array(w * h);
        const radius = radiusOf(w, h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const dx = x - cx, dy = y - cy;
                const r = Math.hypot(dx, dy) / radius;
                const k = r < 1 ? scale(r, s) : 1;
                map[y * w + x] = pixelIndex(w, h, cx + dx * k, cy + dy * k);
            }
        }
        return map;
    });
}

const smallRadius = (w, h) => Math.min(w, h) / 2;
const fullRadius = (w, h) => Math.hypot(w, h) / 2;

export const bulge = radial('bulge', smallRadius, (r, s) => 1 - s * 0.85 * (1 - r));
export const pinch = radial('pinch', smallRadius, (r, s) => 1 + s * 1.2 * (1 - r));
export const fisheye = radial('fisheye', fullRadius, (r, s) => 1 - s * 0.6 * (1 - r * r));

export function swirl(image, strength) {
    remap(image, 'swirl', strength, (w, h, cx, cy, s) => {
        const map = new Int32Array(w * h);
        const radius = Math.min(w, h) / 2;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const dx = x - cx, dy = y - cy;
                const r = Math.hypot(dx, dy) / radius;
                const angle = r < 1 ? s * 5 * (1 - r) ** 2 : 0;
                const cos = Math.cos(angle), sin = Math.sin(angle);
                map[y * w + x] = pixelIndex(w, h, cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
            }
        }
        return map;
    });
}

/** Symétrie gauche -> droite autour de l'axe vertical choisi. */
export function mirror(image, strength) {
    remap(image, 'mirror', strength, (w, h, cx) => {
        const map = new Int32Array(w * h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) map[y * w + x] = pixelIndex(w, h, x < cx ? x : 2 * cx - x, y);
        }
        return map;
    });
}

/** Symétrie par secteurs autour du centre ; la force fait tourner l'image. */
export function kaleidoscope(image, strength) {
    remap(image, 'kaleido', strength, (w, h, cx, cy, s) => {
        const map = new Int32Array(w * h);
        const segment = (2 * Math.PI) / CONFIG.KALEIDOSCOPE_SEGMENTS;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const dx = x - cx, dy = y - cy;
                let a = (Math.atan2(dy, dx) + s * Math.PI) % segment;
                if (a < 0) a += segment;
                if (a > segment / 2) a = segment - a;
                const r = Math.hypot(dx, dy);
                map[y * w + x] = pixelIndex(w, h, cx + r * Math.cos(a), cy + r * Math.sin(a));
            }
        }
        return map;
    });
}

/** Ondulation animée (la phase avance par pas, ce qui limite le recalcul de la table). */
export function wave(image, strength) {
    const step = Math.floor(performance.now() / CONFIG.WAVE_STEP_MS);
    remap(image, 'wave', strength, (w, h, _cx, _cy, s) => {
        const phase = step * CONFIG.WAVE_STEP_PHASE;
        const amplitude = s * 0.05 * w;
        const offsetX = Float32Array.from({ length: h }, (_, y) => Math.sin((y / h) * 2 * Math.PI * CONFIG.WAVE_FREQUENCY + phase) * amplitude);
        const offsetY = Float32Array.from({ length: w }, (_, x) => Math.sin((x / w) * 2 * Math.PI * (CONFIG.WAVE_FREQUENCY - 1) + phase) * amplitude * 0.5);
        const map = new Int32Array(w * h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) map[y * w + x] = pixelIndex(w, h, x + offsetX[y], y + offsetY[x]);
        }
        return map;
    }, step);
}

// Ces effets reçoivent la force (curseur d'intensité) ; ceux marqués usesCenter suivent le doigt.
for (const fn of [mirror, kaleidoscope, bulge, pinch, swirl, wave, fisheye]) fn.usesStrength = true;
for (const fn of [mirror, kaleidoscope, bulge, pinch, swirl, fisheye]) fn.usesCenter = true;
