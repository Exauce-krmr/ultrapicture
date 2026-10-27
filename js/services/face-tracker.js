import { CONFIG } from '../config.js';

// Indices des points MediaPipe Face Mesh utilisés par les accessoires AR.
export const FACE_POINTS = Object.freeze({
    rightEyeOuter: 33, rightEyeInner: 133, leftEyeOuter: 263, leftEyeInner: 362,
    noseTip: 1, noseBase: 2, upperLip: 0, mouthTop: 13, mouthBottom: 14,
    forehead: 10, chin: 152, faceRight: 234, faceLeft: 454,
});
const INDICES = Object.values(FACE_POINTS);
const SLOT = Object.fromEntries(Object.keys(FACE_POINTS).map((name, i) => [name, i]));

/**
 * Détection de visages (MediaPipe Face Landmarker) chargée à la demande.
 * Les points sont lissés et conservés brièvement si le visage disparaît une image.
 */
export class FaceTracker {
    #landmarker = null;
    #loading = null;
    #faces = [];            // [{ pts: Float32Array(x,y par point nommé), seenAt }]
    #lastRun = 0;
    #lastVideoTime = -1;

    get ready() { return this.#landmarker !== null; }

    /** Charge MediaPipe (WASM + modèle locaux). Peut être appelé plusieurs fois. */
    load() {
        this.#loading ??= this.#init().catch((err) => { this.#loading = null; throw err; });
        return this.#loading;
    }

    async #init() {
        const { FilesetResolver, FaceLandmarker } = await import('../../vendor/mediapipe/vision_bundle_esm.js');
        const fileset = await FilesetResolver.forVisionTasks(CONFIG.FACE_WASM_PATH);
        this.#landmarker = await FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: CONFIG.FACE_MODEL_PATH, delegate: 'CPU' },
            runningMode: 'VIDEO',
            numFaces: CONFIG.AR_MAX_FACES,
        });
    }

    /**
     * Met à jour les visages (au plus un calcul par AR_DETECT_INTERVAL_MS et par image vidéo).
     * @returns {Array<{pts: Float32Array}>} points normalisés (0-1) dans l'image de la caméra
     */
    update(video) {
        const now = performance.now();
        if (this.#landmarker && video.currentTime !== this.#lastVideoTime && now - this.#lastRun >= CONFIG.AR_DETECT_INTERVAL_MS) {
            this.#lastVideoTime = video.currentTime;
            this.#lastRun = now;
            try {
                this.#merge(this.#landmarker.detectForVideo(video, now).faceLandmarks, now);
            } catch (err) {
                console.warn('[face] détection', err);
            }
        }
        if (this.#faces.length && now - this.#faces[0].seenAt > CONFIG.AR_HOLD_MS) this.#faces = [];
        return this.#faces;
    }

    reset() { this.#faces = []; this.#lastVideoTime = -1; }

    #merge(detected, now) {
        if (!detected.length) return;
        const k = CONFIG.AR_SMOOTHING;
        this.#faces = detected.map((landmarks, i) => {
            const pts = new Float32Array(INDICES.length * 2);
            const previous = this.#faces[i]?.pts;
            INDICES.forEach((index, slot) => {
                const { x, y } = landmarks[index];
                pts[slot * 2] = previous ? previous[slot * 2] + (x - previous[slot * 2]) * k : x;
                pts[slot * 2 + 1] = previous ? previous[slot * 2 + 1] + (y - previous[slot * 2 + 1]) * k : y;
            });
            return { pts, seenAt: now };
        });
    }
}

/** Point nommé d'un visage, en coordonnées normalisées. */
export function facePoint(face, name) {
    const slot = SLOT[name];
    return { x: face.pts[slot * 2], y: face.pts[slot * 2 + 1] };
}
