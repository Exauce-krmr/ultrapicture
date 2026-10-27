import { CONFIG } from '../config.js';

/** Table de 256 couleurs précalculée à partir des arrêts du dégradé. */
function buildLookupTable() {
    const stops = CONFIG.THERMAL_STOPS;
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
        const t = i / 255;
        let k = 1;
        while (k < stops.length - 1 && stops[k][0] < t) k++;
        const [t0, c0] = stops[k - 1];
        const [t1, c1] = stops[k];
        const f = (t - t0) / (t1 - t0);
        for (let c = 0; c < 3; c++) lut[i * 3 + c] = c0[c] + (c1[c] - c0[c]) * f;
    }
    return lut;
}
const LUT = buildLookupTable();

/** Effet « caméra thermique » : la luminosité est convertie en dégradé de chaleur. */
export function thermal({ data }) {
    for (let i = 0; i < data.length; i += 4) {
        const y = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) | 0;
        data[i] = LUT[y * 3];
        data[i + 1] = LUT[y * 3 + 1];
        data[i + 2] = LUT[y * 3 + 2];
    }
}
