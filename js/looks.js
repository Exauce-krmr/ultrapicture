// Définition des réglages manuels et des « looks » prédéfinis.
// Un look = un jeu de réglages + éventuellement un effet (voir filters/index.js).

/** @type {ReadonlyArray<{id: string, label: string, min: number, max: number, default: number}>} */
export const ADJUSTMENTS = Object.freeze([
    { id: 'exposure', label: 'Exposition', min: -100, max: 100, default: 0 },
    { id: 'contrast', label: 'Contraste', min: -100, max: 100, default: 0 },
    { id: 'saturation', label: 'Saturation', min: -100, max: 100, default: 0 },
    { id: 'warmth', label: 'Température', min: -100, max: 100, default: 0 },
    { id: 'fade', label: 'Voile', min: 0, max: 100, default: 0 },
    { id: 'sharpness', label: 'Netteté', min: 0, max: 100, default: 0 },
    { id: 'vignette', label: 'Vignettage', min: 0, max: 100, default: 0 },
    { id: 'grain', label: 'Grain', min: 0, max: 100, default: 0 },
]);

export const DEFAULT_ADJUSTMENTS = Object.freeze(
    Object.fromEntries(ADJUSTMENTS.map((a) => [a.id, a.default])),
);

/**
 * @typedef {{id: string, label: string, category: 'looks'|'effects'|'fun', effect?: string, intensity?: number, adjustments?: Record<string, number>}} Look
 * @type {ReadonlyArray<Look>}
 */
export const LOOKS = Object.freeze([
    { id: 'original', label: 'Original', category: 'looks' },
    { id: 'noir', label: 'Noir & blanc', category: 'looks', effect: 'grayscale', adjustments: { contrast: 15 } },
    { id: 'noir-intense', label: 'Noir intense', category: 'looks', effect: 'grayscale', adjustments: { contrast: 45, vignette: 35, sharpness: 20 } },
    { id: 'chaud', label: 'Chaud', category: 'looks', adjustments: { warmth: 35, saturation: 10 } },
    { id: 'froid', label: 'Froid', category: 'looks', adjustments: { warmth: -35, saturation: 5 } },
    { id: 'cinema', label: 'Cinéma', category: 'looks', adjustments: { contrast: 20, saturation: -15, fade: 25, warmth: -10, vignette: 40 } },
    { id: 'vintage', label: 'Vintage', category: 'looks', effect: 'sepia', intensity: 55, adjustments: { fade: 35, grain: 35, vignette: 35 } },
    { id: 'eclat', label: 'Éclat', category: 'looks', adjustments: { saturation: 40, contrast: 15, sharpness: 25 } },
    { id: 'doux', label: 'Doux', category: 'looks', adjustments: { exposure: 10, contrast: -10, fade: 20 } },

    { id: 'sepia', label: 'Sépia', category: 'effects', effect: 'sepia' },
    { id: 'negatif', label: 'Négatif', category: 'effects', effect: 'invert' },
    { id: 'duotone', label: 'Duotone', category: 'effects', effect: 'duotone' },
    { id: 'thermique', label: 'Thermique', category: 'effects', effect: 'thermal' },
    { id: 'glitch', label: 'Glitch', category: 'effects', effect: 'glitch' },
    { id: 'poster', label: 'Poster', category: 'effects', effect: 'posterize' },
    { id: 'pixels', label: 'Pixels', category: 'effects', effect: 'pixelate' },

    // Déformations temps réel : le doigt déplace le centre de l'effet.
    { id: 'miroir', label: 'Miroir', category: 'fun', effect: 'mirror' },
    { id: 'kaleido', label: 'Kaléidoscope', category: 'fun', effect: 'kaleidoscope', intensity: 30 },
    { id: 'loupe', label: 'Loupe', category: 'fun', effect: 'bulge', intensity: 70 },
    { id: 'pincement', label: 'Pincement', category: 'fun', effect: 'pinch', intensity: 70 },
    { id: 'tourbillon', label: 'Tourbillon', category: 'fun', effect: 'swirl', intensity: 60 },
    { id: 'vagues', label: 'Vagues', category: 'fun', effect: 'wave', intensity: 60 },
    { id: 'fisheye', label: 'Œil de poisson', category: 'fun', effect: 'fisheye', intensity: 80 },
]);

export function getLook(id) {
    return LOOKS.find((look) => look.id === id) ?? LOOKS[0];
}

/** Réglages complets (valeurs par défaut + ceux du look). */
export function adjustmentsForLook(look) {
    return { ...DEFAULT_ADJUSTMENTS, ...(look.adjustments ?? {}) };
}

/** Intensité de l'effet en pourcentage (100 par défaut). */
export function intensityForLook(look) {
    return look.intensity ?? 100;
}
