import { DEFAULT_ADJUSTMENTS } from './looks.js';

// Pipeline de traitement d'image en pixels (aucune dépendance au DOM, donc testable).
// Ordre : netteté -> tons (exposition, contraste, voile, température, saturation)
//         -> effet (avec intensité) -> vignettage -> grain.

const NOISE_SIZE = 1 << 16;
const NOISE = Int8Array.from({ length: NOISE_SIZE }, () => Math.round((Math.random() * 2 - 1) * 127));

const toneCache = { key: '', r: null, g: null, b: null };
const vignetteCache = { key: '', mask: null };

const clampByte = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Vrai si aucun réglage n'altère l'image. */
export function isNeutral(adjustments) {
    return Object.keys(DEFAULT_ADJUSTMENTS).every((k) => (adjustments[k] ?? 0) === DEFAULT_ADJUSTMENTS[k]);
}

function buildToneTables({ exposure, contrast, fade, warmth }) {
    const key = `${exposure}|${contrast}|${fade}|${warmth}`;
    if (toneCache.key === key) return toneCache;

    const gain = 2 ** (exposure / 100);
    const slope = Math.max(0, 1 + contrast / 100);
    const lift = (fade / 100) * 0.3;
    const warm = (warmth / 100) * 0.2;
    const channelGains = [1 + warm, 1, 1 - warm];
    const tables = channelGains.map((channelGain) => {
        const table = new Uint8ClampedArray(256);
        for (let v = 0; v < 256; v++) {
            let x = (v / 255) * gain;
            x = (x - 0.5) * slope + 0.5;
            x = lift + x * (1 - lift);
            table[v] = clampByte(x * channelGain * 255);
        }
        return table;
    });
    Object.assign(toneCache, { key, r: tables[0], g: tables[1], b: tables[2] });
    return toneCache;
}

function applyTone({ data }, a) {
    const needsLut = a.exposure || a.contrast || a.fade || a.warmth;
    const sat = 1 + a.saturation / 100;
    const { r: lr, g: lg, b: lb } = needsLut ? buildToneTables(a) : toneCache;
    for (let i = 0; i < data.length; i += 4) {
        let r = data[i], g = data[i + 1], b = data[i + 2];
        if (needsLut) { r = lr[r]; g = lg[g]; b = lb[b]; }
        if (a.saturation) {
            const y = 0.299 * r + 0.587 * g + 0.114 * b;
            r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat;
        }
        data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
}

/** Netteté par masque flou 4-voisins. */
function applySharpness({ data, width, height }, amount) {
    const k = (amount / 100) * 0.8;
    const src = new Uint8ClampedArray(data);
    const stride = width * 4;
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = (y * width + x) * 4;
            for (let c = 0; c < 3; c++) {
                const v = src[i + c];
                data[i + c] = v + k * (4 * v - src[i + c - 4] - src[i + c + 4] - src[i + c - stride] - src[i + c + stride]);
            }
        }
    }
}

function getVignetteMask(width, height, strength) {
    const key = `${width}x${height}|${strength}`;
    if (vignetteCache.key === key) return vignetteCache.mask;
    const mask = new Float32Array(width * height);
    const cx = (width - 1) / 2, cy = (height - 1) / 2;
    const maxDist = Math.hypot(cx, cy);
    const s = (strength / 100) * 0.85;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const d = Math.hypot(x - cx, y - cy) / maxDist;
            const t = Math.max(0, (d - 0.35) / 0.65);
            mask[y * width + x] = 1 - s * t * t;
        }
    }
    Object.assign(vignetteCache, { key, mask });
    return mask;
}

function applyVignette({ data, width, height }, strength) {
    const mask = getVignetteMask(width, height, strength);
    for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
        const m = mask[p];
        data[i] *= m; data[i + 1] *= m; data[i + 2] *= m;
    }
}

function applyGrain({ data }, amount) {
    const strength = (amount / 100) * 45 / 127;
    const offset = (Math.random() * NOISE_SIZE) | 0;
    for (let p = 0, i = 0; i < data.length; p++, i += 4) {
        const n = NOISE[(offset + p) & (NOISE_SIZE - 1)] * strength;
        data[i] += n; data[i + 1] += n; data[i + 2] += n;
    }
}

/** Mélange `data` (effet appliqué) avec `base` (avant effet) selon `t` entre 0 et 1. */
function blend(data, base, t) {
    for (let i = 0; i < data.length; i++) data[i] = base[i] + (data[i] - base[i]) * t;
}

/**
 * Applique la chaîne complète sur l'image, en place.
 * @param {ImageData} image
 * @param {{adjustments: Record<string, number>, effect: ((i: ImageData) => void) | null, intensity: number}} params
 */
export function processImage(image, { adjustments: a, effect, intensity }) {
    if (a.sharpness) applySharpness(image, a.sharpness);
    if (a.exposure || a.contrast || a.fade || a.warmth || a.saturation) applyTone(image, a);

    if (effect) {
        if (effect.usesStrength) {
            // Déformations : l'intensité règle la force de l'effet (un mélange créerait des images fantômes).
            if (intensity > 0) effect(image, intensity);
        } else if (intensity >= 1) {
            effect(image);
        } else if (intensity > 0) {
            const base = new Uint8ClampedArray(image.data);
            effect(image);
            blend(image.data, base, intensity);
        }
    }
    if (a.vignette) applyVignette(image, a.vignette);
    if (a.grain) applyGrain(image, a.grain);
}
