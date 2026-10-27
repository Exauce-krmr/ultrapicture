import { CONFIG } from '../config.js';

/** Remplace chaque bloc par sa couleur moyenne. La taille des blocs suit la largeur de l'image. */
export function pixelate({ data, width, height }) {
    const size = Math.max(2, Math.round(width * CONFIG.PIXELATE_BLOCK_RATIO));
    for (let y = 0; y < height; y += size) {
        for (let x = 0; x < width; x += size) {
            const maxY = Math.min(y + size, height);
            const maxX = Math.min(x + size, width);
            let r = 0, g = 0, b = 0, count = 0;
            for (let py = y; py < maxY; py++) {
                for (let px = x; px < maxX; px++) {
                    const i = (py * width + px) * 4;
                    r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
                }
            }
            r /= count; g /= count; b /= count;
            for (let py = y; py < maxY; py++) {
                for (let px = x; px < maxX; px++) {
                    const i = (py * width + px) * 4;
                    data[i] = r; data[i + 1] = g; data[i + 2] = b;
                }
            }
        }
    }
}
