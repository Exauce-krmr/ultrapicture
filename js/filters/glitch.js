import { CONFIG } from '../config.js';

/** Décale horizontalement les canaux rouge et bleu en sens opposés. */
export function glitch({ data, width, height }) {
    const shift = Math.max(1, Math.round(width * CONFIG.GLITCH_SHIFT_RATIO));
    const source = new Uint8ClampedArray(data);
    for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
            const i = (row + x) * 4;
            data[i] = source[(row + Math.max(0, x - shift)) * 4];
            data[i + 2] = source[(row + Math.min(width - 1, x + shift)) * 4 + 2];
        }
    }
}
