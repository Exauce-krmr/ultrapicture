import { CONFIG } from './config.js';
import { DEFAULT_ADJUSTMENTS } from './looks.js';
import { isNeutral, processImage } from './pipeline.js';

/**
 * Boucle de rendu : vidéo -> recadrage/zoom -> pipeline -> canvas d'affichage.
 * Sait aussi produire un instantané haute résolution et des statistiques (histogramme, FPS).
 */
export class Renderer {
    #video;
    #canvas;
    #ctx;
    #processing = { adjustments: DEFAULT_ADJUSTMENTS, effect: null, intensity: 1 };
    #hasProcessing = false;
    #ratio = null;
    #zoom = 1;
    #mirror = false;
    #compare = false;
    #width = CONFIG.PREVIEW_WIDTHS.standard;
    #frameId = 0;
    #lastVideoTime = -1;
    #frameCount = 0;
    #fpsFrames = 0;
    #fpsSince = performance.now();
    #onHistogram = null;
    #onFps = null;
    #overlay = null;

    constructor(video, canvas) {
        this.#video = video;
        this.#canvas = canvas;
        // willReadFrequently : lectures getImageData répétées, reste sur le CPU.
        this.#ctx = canvas.getContext('2d', { willReadFrequently: true });
    }

    get canvas() { return this.#canvas; }

    /** @param {{adjustments: Record<string, number>, effect: Function|null, intensity: number}} p */
    setProcessing(p) {
        this.#processing = p;
        this.#hasProcessing = Boolean(p.effect) || !isNeutral(p.adjustments);
        this.#invalidate();
    }
    /** @param {number|null} ratio largeur/hauteur, ou null pour le format natif */
    setRatio(ratio) { this.#ratio = ratio; this.#invalidate(); }
    setZoom(zoom) { this.#zoom = zoom; this.#invalidate(); }
    setMirror(mirror) { this.#mirror = mirror; this.#invalidate(); }
    setCompare(compare) { this.#compare = compare; this.#invalidate(); }
    setWidth(width) { this.#width = width; this.#invalidate(); }
    /** Incrustation dessinée après les traitements : (ctx, map) => void, ou null. */
    setOverlay(overlay) { this.#overlay = overlay; this.#invalidate(); }

    /** Abonnements aux statistiques ; passer null pour désactiver (coût nul). */
    setHistogramListener(callback) { this.#onHistogram = callback; }
    setFpsListener(callback) { this.#onFps = callback; }

    start() {
        if (this.#frameId) return;
        const loop = () => {
            // On ne retraite l'image que si la vidéo (ou un réglage) a changé : économise le CPU.
            if (this.#video.currentTime !== this.#lastVideoTime) {
                this.#lastVideoTime = this.#video.currentTime;
                this.#draw(this.#canvas, this.#ctx, this.#width, { stats: true });
            }
            this.#frameId = requestAnimationFrame(loop);
        };
        this.#frameId = requestAnimationFrame(loop);
    }

    stop() {
        cancelAnimationFrame(this.#frameId);
        this.#frameId = 0;
        this.#invalidate();
    }

    /** Rend l'image courante en haute résolution avec tous les traitements (jamais en mode comparaison). */
    snapshot({ width, timestamp = false }) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        this.#draw(canvas, ctx, width, { forceProcess: true });
        if (timestamp) this.#drawTimestamp(canvas, ctx);
        return canvas;
    }

    /** Force un nouveau rendu à la prochaine image (ex. un effet dont l'état externe a changé). */
    refresh() { this.#invalidate(); }

    #invalidate() { this.#lastVideoTime = -1; }

    #drawTimestamp(canvas, ctx) {
        const size = Math.max(12, Math.round(canvas.width * 0.028));
        const margin = Math.round(size * 0.9);
        ctx.font = `600 ${size}px system-ui, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.shadowColor = 'rgba(0,0,0,.65)';
        ctx.shadowBlur = size * 0.3;
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        const text = new Date().toLocaleString(CONFIG.LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
        ctx.fillText(text, canvas.width - margin, canvas.height - margin);
    }

    #draw(canvas, ctx, targetWidth, { stats = false, forceProcess = false } = {}) {
        const { videoWidth: vw, videoHeight: vh } = this.#video;
        if (!vw || !vh) return;

        // Zone source : recadrage au ratio voulu, puis zoom numérique centré.
        const videoAspect = vw / vh;
        const aspect = this.#ratio ?? videoAspect;
        let sw = videoAspect > aspect ? vh * aspect : vw;
        let sh = videoAspect > aspect ? vh : vw / aspect;
        sw /= this.#zoom;
        sh /= this.#zoom;
        const sx = (vw - sw) / 2;
        const sy = (vh - sh) / 2;

        // Dimensions paires : requis par certains encodeurs vidéo.
        const width = Math.max(2, Math.floor(Math.min(targetWidth, sw) / 2) * 2);
        const height = Math.max(2, Math.floor(width / aspect / 2) * 2);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        ctx.save();
        if (this.#mirror) {
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(this.#video, sx, sy, sw, sh, 0, 0, width, height);
        ctx.restore();

        const process = this.#hasProcessing && (forceProcess || !this.#compare);
        const wantHistogram = stats && this.#onHistogram && this.#frameCount % CONFIG.HISTOGRAM_EVERY_N_FRAMES === 0;
        if (process || wantHistogram) {
            const image = ctx.getImageData(0, 0, width, height);
            if (process) {
                processImage(image, this.#processing);
                ctx.putImageData(image, 0, 0);
            }
            if (wantHistogram) this.#onHistogram(this.#histogram(image));
        }
        if (this.#overlay && (forceProcess || !this.#compare)) {
            // Convertit un point normalisé de la caméra en pixels du canvas (recadrage, zoom et miroir inclus).
            const map = ({ x: u, y: v }) => {
                const x = ((u * vw - sx) / sw) * width;
                return { x: this.#mirror ? width - x : x, y: ((v * vh - sy) / sh) * height };
            };
            this.#overlay(ctx, map);
        }
        if (stats) this.#tick();
    }

    #histogram({ data }) {
        const bins = new Uint32Array(CONFIG.HISTOGRAM_BINS);
        const scale = CONFIG.HISTOGRAM_BINS / 256;
        for (let i = 0; i < data.length; i += 16) {
            bins[(((0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * scale) | 0)]++;
        }
        return bins;
    }

    #tick() {
        this.#frameCount++;
        this.#fpsFrames++;
        const now = performance.now();
        if (now - this.#fpsSince >= 1000) {
            this.#onFps?.(Math.round((this.#fpsFrames * 1000) / (now - this.#fpsSince)));
            this.#fpsFrames = 0;
            this.#fpsSince = now;
        }
    }
}
