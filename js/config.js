// Toutes les valeurs ajustables de l'application sont ici.

export const APP = Object.freeze({ NAME: 'UltraPicture', VERSION: '3.0.0' });

/** Progressive Web App : chemin relatif pour fonctionner aussi sous un sous-dossier (GitHub Pages). */
export const PWA = Object.freeze({ SW_PATH: 'sw.js' });

export const CONFIG = Object.freeze({
    DEFAULT_FACING_MODE: 'environment',
    VIDEO_IDEAL_WIDTH: 1920,
    VIDEO_IDEAL_HEIGHT: 1080,

    /** Largeur de travail de l'aperçu selon le réglage « qualité d'aperçu ». */
    PREVIEW_WIDTHS: Object.freeze({ eco: 360, standard: 480, high: 720 }),

    /** Largeur de rendu pendant un enregistrement vidéo. */
    VIDEO_RECORD_WIDTH: 720,
    VIDEO_FPS: 30,
    VIDEO_BITS_PER_SECOND: 4_000_000,
    VIDEO_MAX_SECONDS: 120,
    VIDEO_THUMB_WIDTH: 320,

    ZOOM_STEPS: Object.freeze([1, 2, 4]),
    ZOOM_MAX_DIGITAL: 8,

    TIMER_OPTIONS: Object.freeze([0, 3, 10]),
    RATIOS: Object.freeze([
        { id: 'full', label: 'Plein', value: null },
        { id: '1:1', label: '1:1', value: 1 },
        { id: '3:4', label: '3:4', value: 3 / 4 },
        { id: '9:16', label: '9:16', value: 9 / 16 },
    ]),

    // Réalité augmentée (MediaPipe, fichiers locaux dans vendor/mediapipe)
    FACE_WASM_PATH: 'vendor/mediapipe/wasm',
    FACE_MODEL_PATH: 'vendor/mediapipe/face_landmarker.task',
    AR_MAX_FACES: 2,
    AR_DETECT_INTERVAL_MS: 66,
    /** Durée pendant laquelle un visage perdu reste affiché (évite le clignotement). */
    AR_HOLD_MS: 250,
    AR_SMOOTHING: 0.55,

    HISTOGRAM_BINS: 64,
    HISTOGRAM_EVERY_N_FRAMES: 3,

    HAPTIC_MS: 18,
    TOAST_MS: 2600,
    DELETE_CONFIRM_MS: 3000,
    LOCALE: 'fr-CH',

    PIXELATE_BLOCK_RATIO: 0.025,
    GLITCH_SHIFT_RATIO: 0.012,
    POSTERIZE_LEVELS: 4,
    KALEIDOSCOPE_SEGMENTS: 6,
    WAVE_FREQUENCY: 4,
    WAVE_STEP_MS: 70,
    WAVE_STEP_PHASE: 0.35,
    /** Nombre de tables de déformation gardées en mémoire (aperçu + photo + déplacement du doigt). */
    DISTORT_CACHE_SIZE: 6,
    DISTORT_HINT: 'Touchez l\u2019image pour d\u00e9placer l\u2019effet.',
    DUOTONE_DARK: Object.freeze([20, 30, 70]),
    DUOTONE_LIGHT: Object.freeze([255, 190, 120]),
    /** Dégradé thermique : [position 0-1, [r, g, b]]. */
    THERMAL_STOPS: Object.freeze([
        [0, [0, 0, 40]], [0.3, [120, 0, 160]], [0.55, [230, 40, 40]], [0.8, [255, 200, 0]], [1, [255, 255, 255]],
    ]),
});

export const PHOTO_FORMATS = Object.freeze({
    jpeg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPEG' },
    webp: { mime: 'image/webp', ext: 'webp', label: 'WebP' },
    png: { mime: 'image/png', ext: 'png', label: 'PNG' },
});

export const MESSAGES = Object.freeze({
    PHOTO_SAVED: 'Photo enregistrée dans la galerie.',
    PHOTO_FAILED: "Impossible d'enregistrer la photo.",
    VIDEO_SAVED: 'Vidéo enregistrée dans la galerie.',
    VIDEO_FAILED: "Impossible d'enregistrer la vidéo.",
    VIDEO_UNSUPPORTED: "L'enregistrement vidéo n'est pas pris en charge ici.",
    AUDIO_UNAVAILABLE: 'Micro indisponible : vidéo enregistrée sans son.',
    FLIP_FAILED: 'Cette caméra n\u2019est pas disponible.',
    CAMERA_REQUIRED: 'Activez d\u2019abord la cam\u00e9ra.',
    AR_LOADING: 'Chargement de la détection de visage\u2026',
    AR_FAILED: 'Impossible de charger la détection de visage.',
    TORCH_UNAVAILABLE: 'Flash indisponible sur cette caméra.',
    STORE_FAILED: "Stockage local indisponible : le média n'a pas pu être conservé.",
    EXPORT_FAILED: "Impossible d'exporter ce fichier.",
});

/**
 * Écrans affichés à la place de l'aperçu quand la caméra n'est pas utilisable.
 * `primary` : libellé du bouton principal ; `steps` : chemin à suivre dans les réglages du téléphone.
 */
export const CAMERA_GATES = Object.freeze({
    loading: { title: 'Démarrage de la caméra\u2026' },
    denied: { title: 'Autorisez la caméra', text: 'UltraPicture en a besoin pour afficher l\u2019aperçu et prendre des photos.', primary: 'Autoriser la caméra' },
    blocked: {
        title: 'Caméra bloquée',
        text: 'L\u2019accès a été refusé. Autorisez la caméra pour ce site, puis réessayez.',
        steps: 'Android / ordinateur : cadenas à côté de l\u2019adresse \u203a Autorisations \u203a Caméra\niPhone : Réglages \u203a Apps \u203a Safari \u203a Caméra',
        primary: 'Réessayer',
    },
    'no-device': { title: 'Aucune caméra trouvée', text: 'Cet appareil n\u2019a pas de caméra disponible.', primary: 'Réessayer' },
    busy: { title: 'Caméra occupée', text: 'Une autre application l\u2019utilise. Fermez-la, puis réessayez.', primary: 'Réessayer' },
    lost: { title: 'Caméra interrompue', text: 'La connexion à la caméra a été perdue.', primary: 'Relancer la caméra' },
    unsupported: { title: 'Caméra indisponible', text: 'Cet appareil ne permet pas d\u2019utiliser la caméra ici.', primary: 'Réessayer' },
    unknown: { title: 'La caméra ne démarre pas', text: 'Un problème est survenu. Réessayez dans un instant.', primary: 'Réessayer' },
});
