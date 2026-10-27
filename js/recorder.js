import { CONFIG } from './config.js';

const MIME_CANDIDATES = [
    'video/mp4;codecs=avc1',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
];

export function pickVideoMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export const isRecordingSupported = () =>
    pickVideoMimeType() !== null && typeof HTMLCanvasElement.prototype.captureStream === 'function';

/** Enregistre le contenu (déjà filtré) d'un canvas, avec le micro en option. */
export class Recorder {
    #recorder = null;
    #chunks = [];
    #startedAt = 0;
    #streams = [];
    #mic = null;
    #micTried = false;

    get active() { return this.#recorder?.state === 'recording'; }
    get elapsedMs() { return this.active ? performance.now() - this.#startedAt : 0; }

    /** Ouvre le micro à l'avance (passage en mode vidéo) : l'ouverture prend parfois plusieurs centaines de ms. */
    async prepare() {
        if (this.#mic) return true;
        this.#micTried = true;
        try {
            this.#mic = await navigator.mediaDevices.getUserMedia({ audio: true });
            return true;
        } catch (err) {
            console.warn('[recorder] micro indisponible', err);
            return false;
        }
    }

    /** Ferme le micro (sortie du mode vidéo, mise en arrière-plan). */
    release() {
        this.#mic?.getTracks().forEach((t) => t.stop());
        this.#mic = null;
        this.#micTried = false;
    }

    /** @returns {Promise<{audioFailed: boolean}>} */
    async start(canvas, { withAudio }) {
        const stream = canvas.captureStream(CONFIG.VIDEO_FPS);
        this.#streams = [stream];
        let audioFailed = false;

        if (withAudio) {
            // Le micro est normalement déjà ouvert (prepare) : le démarrage est alors immédiat.
            if (!this.#mic && !this.#micTried) await this.prepare();
            if (this.#mic) this.#mic.getAudioTracks().forEach((t) => stream.addTrack(t));
            else audioFailed = true;
        }

        const mimeType = pickVideoMimeType();
        this.#chunks = [];
        this.#recorder = new MediaRecorder(stream, {
            ...(mimeType ? { mimeType } : {}),
            videoBitsPerSecond: CONFIG.VIDEO_BITS_PER_SECOND,
        });
        this.#recorder.ondataavailable = (e) => e.data.size && this.#chunks.push(e.data);
        this.#recorder.start(1000);
        this.#startedAt = performance.now();
        return { audioFailed };
    }

    /** @returns {Promise<{blob: Blob, durationMs: number}>} */
    stop() {
        const recorder = this.#recorder;
        const durationMs = this.elapsedMs;
        return new Promise((resolve, reject) => {
            recorder.onerror = (e) => reject(e.error ?? new Error('Erreur MediaRecorder'));
            recorder.onstop = () => {
                // Seul le flux vidéo du canvas est arrêté ; le micro reste ouvert pour l'enregistrement suivant.
                this.#streams.forEach((s) => s.getVideoTracks().forEach((t) => t.stop()));
                this.#streams = [];
                const type = recorder.mimeType || this.#chunks[0]?.type || 'video/webm';
                resolve({ blob: new Blob(this.#chunks, { type }), durationMs });
            };
            recorder.stop();
        });
    }
}
