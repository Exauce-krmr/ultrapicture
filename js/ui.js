import { CONFIG } from './config.js';
import { $, el } from './ui/dom.js';
import { hydrateIcons, icon } from './ui/icons.js';
import { formatDuration } from './capture.js';

/**
 * Écran caméra : barre d'outils, zoom, incrustations (grille, histogramme, minuteur) et déclencheur.
 * Ne contient aucune logique métier : il émet des événements via les callbacks passés à `bind`.
 */
export class CameraScreen {
    #els = {
        stage: $('#stage'),
        frame: $('#frame'),
        topbar: $('.topbar'),
        dock: $('.dock'),
        pills: $('#pills'),
        torch: $('#btn-torch'),
        grid: $('#btn-grid'),
        histogramBtn: $('#btn-histogram'),
        timer: $('#btn-timer'),
        timerBadge: $('#timer-badge'),
        ratio: $('#btn-ratio'),
        ratioBadge: $('#ratio-badge'),
        settings: $('#btn-settings'),
        gridOverlay: $('#grid-overlay'),
        histogram: $('#histogram'),
        recChip: $('#rec-chip'),
        fpsChip: $('#fps-chip'),
        compareChip: $('#compare-chip'),
        compare: $('#btn-compare'),
        countdown: $('#countdown'),
        zoomBar: $('#zoom-bar'),
        flash: $('#flash'),
        shutter: $('#shutter'),
        flip: $('#flip'),
        gallery: $('#gallery'),
        modes: $('#modes'),
        gate: $('#gate'),
        gateTitle: $('#gate-title'),
        gateText: $('#gate-text'),
        gateSteps: $('#gate-steps'),
        gatePrimary: $('#gate-primary'),
        gateSecondary: $('#gate-secondary'),
        panel: $('#panel'),
        tabs: $('#tabs'),
    };
    #thumbUrl = null;
    #histogramCtx = this.#els.histogram.getContext('2d');

    constructor() {
        hydrateIcons();
        this.#els.gridOverlay.innerHTML = '<i></i><i></i><i></i><i></i>';
        // La taille du cadre dépend de l'écran, de la barre d'outils et du panneau (qui peut se replier).
        const observer = new ResizeObserver(() => this.#layout());
        for (const node of [this.#els.stage, this.#els.dock, this.#els.topbar]) observer.observe(node);
    }

    #ratio = null;

    /**
     * Place le cadre de l'image : plein écran pour le format natif, sinon au format choisi sous la barre du haut.
     * Les éléments flottants (zoom, histogramme…) se posent juste au-dessus du bas du cadre ou du panneau.
     */
    #layout() {
        const { stage, frame, topbar, dock } = this.#els;
        const W = stage.clientWidth;
        const H = stage.clientHeight;
        if (!W || !H) return;
        const topH = topbar.offsetHeight;
        const dockH = dock.offsetHeight;
        let width = W, height = H, top = 0;
        if (this.#ratio) {
            height = Math.min(W / this.#ratio, H - topH);
            width = height * this.#ratio;
            top = topH;
        }
        Object.assign(frame.style, { left: `${(W - width) / 2}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
        stage.style.setProperty('--top-h', `${topH}px`);
        stage.style.setProperty('--dock-h', `${dockH}px`);
        stage.style.setProperty('--overlay-bottom', `${Math.max(dockH, H - (top + height))}px`);
    }

    /** Pastilles « effet actif × » : [{ label, onClear }]. */
    setActiveEffects(items) {
        const { pills } = this.#els;
        pills.replaceChildren(...items.map(({ label, onClear }) => {
            const pill = el('button', { class: 'pill', type: 'button', 'aria-label': `Retirer : ${label}`, onClick: onClear }, label);
            pill.insertAdjacentHTML('beforeend', icon('x'));
            return pill;
        }));
        pills.hidden = items.length === 0;
    }

    /** @param {Record<string, Function>} h */
    bind(h) {
        const { torch, grid, histogramBtn, timer, ratio, settings, shutter, flip, gallery, modes, compare } = this.#els;
        torch.addEventListener('click', h.onTorch);
        grid.addEventListener('click', h.onGrid);
        histogramBtn.addEventListener('click', h.onHistogram);
        timer.addEventListener('click', h.onTimer);
        ratio.addEventListener('click', h.onRatio);
        settings.addEventListener('click', h.onSettings);
        shutter.addEventListener('click', h.onShutter);
        flip.addEventListener('click', h.onFlip);
        gallery.addEventListener('click', h.onGallery);
        modes.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-mode]');
            if (btn) h.onMode(btn.dataset.mode);
        });
        // « Maintenir pour comparer » : actif tant que le doigt reste appuyé.
        const setCompare = (on) => {
            compare.classList.toggle('is-held', on);
            this.#els.compareChip.hidden = !on;
            h.onCompare(on);
        };
        compare.addEventListener('pointerdown', (e) => { compare.setPointerCapture(e.pointerId); setCompare(true); });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => compare.addEventListener(t, () => setCompare(false)));
        this.#bindZoomGestures(h.onZoom, h.onPoint);
        this.#els.zoomBar.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-zoom]');
            if (btn) h.onZoom(Number(btn.dataset.zoom));
        });
    }

    // --- Zoom (boutons + pincement) ---
    #bindZoomGestures(onZoom, onPoint) {
        const pointers = new Map();
        let startDistance = 0;
        let startZoom = 1;
        const { stage } = this.#els;
        const distance = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
        // Position normalisée (0-1) dans l'image affichée : sert à déplacer le centre des effets fun.
        const emitPoint = (e) => {
            // Le canvas est affiché en « contain » : on exclut les bandes vides autour de l'image.
            const canvas = $('#preview');
            const box = canvas.getBoundingClientRect();
            const fit = Math.min(box.width / canvas.width, box.height / canvas.height);
            const w = canvas.width * fit, h = canvas.height * fit;
            const x = (e.clientX - (box.left + (box.width - w) / 2)) / w;
            const y = (e.clientY - (box.top + (box.height - h) / 2)) / h;
            onPoint(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)));
        };
        stage.addEventListener('pointerdown', (e) => {
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.size === 2) { startDistance = distance(); startZoom = this.currentZoom; }
            else if (!e.target.closest('.zoom-bar, .gate')) emitPoint(e);
        });
        stage.addEventListener('pointermove', (e) => {
            if (!pointers.has(e.pointerId)) return;
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.size === 2 && startDistance) onZoom(startZoom * (distance() / startDistance));
            else if (pointers.size === 1 && e.buttons && !e.target.closest('.zoom-bar, .gate')) emitPoint(e);
        });
        const release = (e) => { pointers.delete(e.pointerId); startDistance = 0; };
        ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => stage.addEventListener(t, release));
        stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            onZoom(this.currentZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        }, { passive: false });
    }

    currentZoom = 1;

    setZoom(zoom, maxZoom) {
        this.currentZoom = zoom;
        const steps = CONFIG.ZOOM_STEPS.filter((s) => s <= maxZoom);
        const nearest = steps.reduce((best, s) => (Math.abs(s - zoom) < Math.abs(best - zoom) ? s : best), steps[0]);
        const isStep = Math.abs(nearest - zoom) < 0.05;
        this.#els.zoomBar.replaceChildren(
            ...steps.map((s) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.dataset.zoom = s;
                const active = isStep && s === nearest;
                btn.className = `zoom-btn${active ? ' is-active' : ''}`;
                btn.textContent = active ? `${s}×` : `${s}`;
                return btn;
            }),
        );
        if (!isStep) {
            const live = document.createElement('span');
            live.className = 'zoom-btn is-active zoom-live';
            live.textContent = `${zoom.toFixed(1)}×`;
            this.#els.zoomBar.append(live);
        }
    }

    // --- Écran « caméra indisponible » ---
    /**
     * Affiche l'aide à la place de l'aperçu. `primary`/`secondary` : { label, onClick } ; `steps` : chemin dans les réglages.
     * Sans bouton, c'est un simple écran d'attente (démarrage de la caméra).
     */
    showGate({ title, text = '', steps = '', primary = null, secondary = null }) {
        const e = this.#els;
        e.gateTitle.textContent = title;
        e.gateText.textContent = text;
        e.gateText.hidden = !text;
        e.gateSteps.textContent = steps;
        e.gateSteps.hidden = !steps;
        for (const [btn, action] of [[e.gatePrimary, primary], [e.gateSecondary, secondary]]) {
            btn.hidden = !action;
            btn.onclick = action?.onClick ?? null; // onclick : un seul gestionnaire, remplacé à chaque affichage
            if (action) btn.textContent = action.label;
        }
        e.gate.classList.toggle('is-loading', !primary && !secondary);
        e.gate.hidden = false;
    }

    hideGate() { this.#els.gate.hidden = true; }

    /** Grise et désactive tout ce qui dépend de la caméra (outils, zoom, déclencheur, bascule). */
    setOffline(offline) {
        const { panel, tabs, modes, flip, zoomBar, shutter } = this.#els;
        for (const node of [panel, tabs, modes, flip, zoomBar, shutter]) node.inert = offline;
        this.#els.stage.classList.toggle('is-offline', offline);
        panel.closest('.dock').classList.toggle('is-offline', offline);
        if (offline) this.setTorchAvailable(false);
    }

    // --- États des boutons ---
    #press(btn, on) { btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('is-on', on); }

    setTorchAvailable(available) { this.#els.torch.hidden = !available; }
    setTorch(on) { this.#press(this.#els.torch, on); }
    setGrid(on) { this.#press(this.#els.grid, on); this.#els.gridOverlay.hidden = !on; }
    setHistogram(on) { this.#press(this.#els.histogramBtn, on); this.#els.histogram.hidden = !on; }
    setTimer(seconds) {
        this.#els.timerBadge.hidden = !seconds;
        this.#els.timerBadge.textContent = `${seconds}s`;
        this.#els.timer.classList.toggle('is-on', seconds > 0);
        this.#els.timer.setAttribute('aria-label', seconds ? `Minuteur : ${seconds} secondes` : 'Minuteur : désactivé');
    }
    setRatio(ratio) {
        this.#ratio = ratio.value;
        this.#layout();
        const custom = ratio.value !== null;
        this.#els.ratioBadge.hidden = !custom;
        this.#els.ratioBadge.textContent = ratio.label;
        this.#els.ratio.classList.toggle('is-on', custom);
    }
    setMode(mode) {
        for (const btn of this.#els.modes.children) btn.setAttribute('aria-selected', String(btn.dataset.mode === mode));
        this.#els.shutter.dataset.mode = mode;
        this.#els.shutter.setAttribute('aria-label', mode === 'video' ? 'Démarrer l’enregistrement' : 'Prendre une photo');
    }
    setShutterEnabled(enabled) { this.#els.shutter.disabled = !enabled; }
    setBusy(busy) { this.#els.shutter.classList.toggle('is-counting', busy); }

    setRecording(recording) {
        this.#els.shutter.classList.toggle('is-recording', recording);
        this.#els.recChip.hidden = !recording;
        this.#els.stage.classList.toggle('is-recording', recording);
        this.#els.flip.disabled = recording;
        this.#els.modes.classList.toggle('is-locked', recording);
        this.#els.shutter.setAttribute('aria-label', recording ? 'Arrêter l’enregistrement' : 'Démarrer l’enregistrement');
        if (recording) this.setRecordingTime(0);
    }
    setRecordingTime(ms) { this.#els.recChip.textContent = `REC ${formatDuration(ms)}`; }

    showCountdown(value) {
        const c = this.#els.countdown;
        c.hidden = value == null;
        if (value != null) { c.textContent = String(value); c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick'); }
    }
    showFps(fps) {
        this.#els.fpsChip.hidden = fps == null;
        if (fps != null) this.#els.fpsChip.textContent = `${fps} fps`;
    }

    flash() {
        const { flash } = this.#els;
        flash.classList.remove('is-active');
        void flash.offsetWidth; // relance l'animation CSS
        flash.classList.add('is-active');
    }

    setThumbnail(blob) {
        if (this.#thumbUrl) URL.revokeObjectURL(this.#thumbUrl);
        this.#thumbUrl = blob ? URL.createObjectURL(blob) : null;
        this.#els.gallery.style.backgroundImage = this.#thumbUrl ? `url("${this.#thumbUrl}")` : '';
        this.#els.gallery.hidden = !blob;
    }

    drawHistogram(bins) {
        const ctx = this.#histogramCtx;
        const { width, height } = this.#els.histogram;
        ctx.clearRect(0, 0, width, height);
        const max = Math.max(1, ...bins);
        const barWidth = width / bins.length;
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        bins.forEach((v, i) => {
            const h = Math.sqrt(v / max) * (height - 2);
            ctx.fillRect(i * barWidth, height - h, Math.max(1, barWidth - 0.5), h);
        });
    }
}
