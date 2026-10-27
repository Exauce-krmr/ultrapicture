import { CONFIG, PHOTO_FORMATS } from './config.js';

/** Transforme un canvas en Blob ; le navigateur peut remplacer un format non supporté (ex. WebP) par du PNG. */
export function canvasToBlob(canvas, { format = 'jpeg', quality = 0.92 } = {}) {
    const { mime } = PHOTO_FORMATS[format] ?? PHOTO_FORMATS.jpeg;
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('toBlob a renvoyé null'))),
            mime,
            quality,
        );
    });
}

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' };

export function extensionFor(mime) {
    return EXTENSIONS[mime.split(';')[0]] ?? 'bin';
}

export function fileNameFor(createdAt, mime) {
    const stamp = new Date(createdAt).toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
    return `ultrapicture-${stamp}.${extensionFor(mime)}`;
}

export function formatDate(timestamp) {
    return new Date(timestamp).toLocaleString(CONFIG.LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Feuille de partage native si possible (permet « Enregistrer dans la galerie »). */
export async function shareFile(blob, name) {
    const file = new File([blob], name, { type: blob.type });
    if (!navigator.canShare?.({ files: [file] })) return false;
    await navigator.share({ files: [file], title: 'UltraPicture' });
    return true;
}

/** Téléchargement classique (navigateur). */
export function downloadFile(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Partage si disponible, sinon téléchargement. L'annulation par l'utilisateur n'est pas une erreur. */
export async function exportFile(blob, name) {
    try {
        if (!(await shareFile(blob, name))) downloadFile(blob, name);
    } catch (err) {
        if (err?.name !== 'AbortError') throw err;
    }
}
