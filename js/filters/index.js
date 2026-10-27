import { grayscale } from './grayscale.js';
import { sepia } from './sepia.js';
import { invert } from './invert.js';
import { pixelate } from './pixelate.js';
import { duotone } from './duotone.js';
import { posterize } from './posterize.js';
import { thermal } from './thermal.js';
import { glitch } from './glitch.js';
import { mirror, kaleidoscope, bulge, pinch, swirl, wave, fisheye } from './distort.js';

/**
 * Registre des effets pixel. Chaque effet modifie l'ImageData sur place.
 * Pour ajouter un effet : créer le fichier, l'ajouter ici, puis le référencer dans looks.js.
 */
export const EFFECTS = Object.freeze({ grayscale, sepia, invert, pixelate, duotone, posterize, thermal, glitch,
    mirror, kaleidoscope, bulge, pinch, swirl, wave, fisheye });

/** @returns {((image: ImageData) => void) | null} */
export function getEffect(id) {
    return (id && EFFECTS[id]) || null;
}
