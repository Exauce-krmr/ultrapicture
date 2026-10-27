/** Luminance pondérée (Rec. 601). */
export function grayscale({ data }) {
    for (let i = 0; i < data.length; i += 4) {
        const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        data[i] = data[i + 1] = data[i + 2] = y;
    }
}
