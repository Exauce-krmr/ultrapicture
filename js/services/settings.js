import { DEFAULT_ADJUSTMENTS } from '../looks.js';

const STORAGE_KEY = 'ultrapicture.settings.v2';

/** Valeurs par défaut. Toute clé inconnue lue depuis le stockage est ignorée. */
export const DEFAULT_SETTINGS = Object.freeze({
    // Capture
    photoFormat: 'jpeg',
    photoWidth: 1080,
    jpegQuality: 0.92,
    timestamp: false,
    shareAfterCapture: false,
    audio: true,
    // Affichage
    previewQuality: 'standard',
    mirrorFront: true,
    grid: false,
    histogram: false,
    showFps: false,
    haptics: true,
    // Session (mémorisée entre deux lancements)
    ratio: 'full',
    timer: 0,
    lookId: 'original',
    effectIntensity: 100,
    adjustments: DEFAULT_ADJUSTMENTS,
});

/** Stockage clé/valeur persistant ; fonctionne même si localStorage est indisponible. */
export class SettingsStore {
    #values;
    #listeners = new Set();

    constructor() {
        this.#values = { ...DEFAULT_SETTINGS, ...this.#load() };
        this.#values.adjustments = { ...DEFAULT_ADJUSTMENTS, ...this.#values.adjustments };
    }

    get() { return this.#values; }

    /** Fusionne un patch, persiste et notifie les abonnés avec la liste des clés modifiées. */
    set(patch) {
        const changed = Object.keys(patch).filter((k) => patch[k] !== this.#values[k]);
        if (!changed.length) return;
        this.#values = { ...this.#values, ...patch };
        this.#save();
        this.#listeners.forEach((fn) => fn(this.#values, changed));
    }

    subscribe(listener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    reset() {
        this.set({ ...DEFAULT_SETTINGS, adjustments: { ...DEFAULT_ADJUSTMENTS } });
    }

    #load() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
            return Object.fromEntries(Object.entries(raw).filter(([k]) => k in DEFAULT_SETTINGS));
        } catch (err) {
            console.warn('[settings] lecture impossible', err);
            return {};
        }
    }

    #save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.#values));
        } catch (err) {
            console.warn('[settings] écriture impossible', err);
        }
    }
}
