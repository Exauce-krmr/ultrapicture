import { CONFIG } from '../config.js';

/** Interpole entre deux couleurs selon la luminosité. */
export function duotone({ data }) {
    const [dr, dg, db] = CONFIG.DUOTONE_DARK;
    const [lr, lg, lb] = CONFIG.DUOTONE_LIGHT;
    for (let i = 0; i < data.length; i += 4) {
        const t = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        data[i] = dr + (lr - dr) * t;
        data[i + 1] = dg + (lg - dg) * t;
        data[i + 2] = db + (lb - db) * t;
    }
}
