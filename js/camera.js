import { CONFIG } from './config.js';

/** Erreur de caméra ; `code` sert à choisir le message affiché (voir CAMERA_GATES). */
export class CameraError extends Error {
    constructor(code, cause) {
        super(`Caméra : ${code}`, { cause });
        this.code = code;
    }
}

const ERROR_CODES = {
    NotAllowedError: 'denied',
    SecurityError: 'denied',
    NotFoundError: 'no-device',
    OverconstrainedError: 'no-device',
    NotReadableError: 'busy',
    AbortError: 'busy',
    NotSupportedError: 'unsupported',
};

export class Camera {
    #stream = null;
    #facingMode = CONFIG.DEFAULT_FACING_MODE;

    /** Appelé si la caméra disparaît en cours d'utilisation (déconnexion, autre application…). */
    onEnded = null;

    get isFront() { return this.#facingMode === 'user'; }
    get #track() { return this.#stream?.getVideoTracks()[0] ?? null; }
    get #capabilities() { return this.#track?.getCapabilities?.() ?? {}; }

    get hasTorch() { return Boolean(this.#capabilities.torch); }

    /** Plage de zoom matériel, ou null si non supporté (le zoom numérique prend alors le relais). */
    get zoomRange() {
        const z = this.#capabilities.zoom;
        return z && z.max > z.min ? { min: z.min, max: z.max } : null;
    }

    /** Démarre (ou redémarre) le flux dans l'élément <video> fourni. */
    async start(video) {
        if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');
        this.stop();
        try {
            this.#stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    facingMode: this.#facingMode,
                    width: { ideal: CONFIG.VIDEO_IDEAL_WIDTH },
                    height: { ideal: CONFIG.VIDEO_IDEAL_HEIGHT },
                },
            });
        } catch (err) {
            console.error('[camera] getUserMedia a échoué', err);
            throw new CameraError(ERROR_CODES[err.name] ?? 'unknown', err);
        }
        const stream = this.#stream;
        stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (this.#stream === stream) this.onEnded?.(); });
        video.srcObject = stream;
        await video.play();
    }

    /** Bascule avant/arrière ; en cas d'échec, la caméra précédente reste celle mémorisée. */
    async flip(video) {
        const previous = this.#facingMode;
        this.#facingMode = this.isFront ? 'environment' : 'user';
        try {
            await this.start(video);
        } catch (err) {
            this.#facingMode = previous;
            throw err;
        }
    }

    async setTorch(on) {
        await this.#track?.applyConstraints({ advanced: [{ torch: on }] });
    }

    async setZoom(value) {
        await this.#track?.applyConstraints({ advanced: [{ zoom: value }] });
    }

    stop() {
        this.#stream?.getTracks().forEach((t) => t.stop());
        this.#stream = null;
    }
}

/** État de la permission caméra ('granted' | 'denied' | 'prompt'), ou null si l'API n'existe pas. */
export async function queryCameraPermission() {
    try {
        const status = await navigator.permissions.query({ name: 'camera' });
        return status;
    } catch {
        return null;
    }
}
