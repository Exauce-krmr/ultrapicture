import { CONFIG } from '../config.js';

export function posterize({ data }) {
    const step = 255 / (CONFIG.POSTERIZE_LEVELS - 1);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.round(data[i] / step) * step;
        data[i + 1] = Math.round(data[i + 1] / step) * step;
        data[i + 2] = Math.round(data[i + 2] / step) * step;
    }
}
