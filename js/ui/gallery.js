import { CONFIG } from '../config.js';
import { exportFile, fileNameFor, formatDate, formatDuration } from '../capture.js';
import { $, el } from './dom.js';
import { hydrateIcons, icon } from './icons.js';

/** Galerie interne (grille) et visionneuse plein écran avec partage, téléchargement et suppression. */
export class Gallery {
    #store;
    #onChange;
    #onError;
    #root = $('#gallery-view');
    #grid = $('#gallery-grid');
    #viewer = $('#viewer');
    #items = [];
    #loaded = false; // la liste est gardée en mémoire : plus de relecture complète à chaque ouverture ou suppression
    #cells = new Map();
    #pending = null; // suppression en attente d'être confirmée (annulable)
    #urls = [];
    #index = 0;
    #viewerUrl = null;

    /** @param {{store: import('../services/media-store.js').MediaStore, onChange: Function, onError: Function}} deps */
    constructor({ store, onChange, onError }) {
        this.#store = store;
        this.#onChange = onChange;
        this.#onError = onError;
        $('#gallery-close').addEventListener('click', () => this.close());
        $('#viewer-close').addEventListener('click', () => this.closeViewer());
        $('#viewer-prev').addEventListener('click', () => this.#show(this.#index - 1));
        $('#viewer-next').addEventListener('click', () => this.#show(this.#index + 1));
        $('#viewer-share').addEventListener('click', () => this.#export());
        $('#viewer-download').addEventListener('click', () => this.#export());
        $('#viewer-delete').addEventListener('click', () => this.#delete());
        document.addEventListener('keydown', (e) => {
            if (this.#viewer.hidden) return;
            if (e.key === 'ArrowLeft') this.#show(this.#index - 1);
            if (e.key === 'ArrowRight') this.#show(this.#index + 1);
            if (e.key === 'Escape') this.closeViewer();
        });
        $('#snack-undo').addEventListener('click', () => this.#undo());
        // Si l'application part en arrière-plan, la suppression en attente devient définitive tout de suite.
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.#commitPending(); });
    }

    get isOpen() { return !this.#root.hidden; }
    get isViewerOpen() { return !this.#viewer.hidden; }

    async open() {
        this.#root.hidden = false;
        if (this.#loaded) this.#renderAll(); else await this.refresh();
    }

    /** Ajoute un média qui vient d'être enregistré, sans relire la base. */
    noteAdded(record) {
        if (!this.#loaded) return;
        this.#items.unshift(record);
        if (this.isOpen) this.#renderAll();
    }

    close() {
        this.closeViewer();
        this.#root.hidden = true;
        this.#revokeUrls();
        this.#grid.replaceChildren();
    }

    closeViewer() {
        this.#viewer.hidden = true;
        this.#clearViewerMedia();
    }

    async refresh() {
        try {
            this.#items = await this.#store.list();
        } catch (err) {
            console.error('[gallery] lecture impossible', err);
            this.#onError(err);
            this.#items = [];
        }
        this.#loaded = true;
        this.#renderAll();
    }

    #renderAll() {
        this.#revokeUrls();
        this.#renderGrid();
        this.#updateCount();
        this.#onChange(this.#items);
    }

    #updateCount() {
        $('#gallery-count').textContent = this.#items.length ? `(${this.#items.length})` : '';
        $('#gallery-empty').hidden = this.#items.length > 0;
    }

    #renderGrid() {
        this.#cells.clear();
        this.#grid.replaceChildren(
            ...this.#items.map((item) => {
                const url = URL.createObjectURL(item.thumb ?? item.blob);
                this.#urls.push(url);
                const cell = el('button', { class: 'cell', type: 'button', 'aria-label': `${item.type === 'video' ? 'Vidéo' : 'Photo'} du ${formatDate(item.createdAt)}`, onClick: () => this.#show(this.#items.indexOf(item)) },
                    el('img', { src: url, alt: '', loading: 'lazy' }));
                if (item.type === 'video') {
                    const badge = el('span', { class: 'cell-badge' });
                    badge.innerHTML = `${icon('play')}<span>${formatDuration(item.durationMs ?? 0)}</span>`;
                    cell.append(badge);
                }
                this.#cells.set(item, cell);
                return cell;
            }),
        );
    }

    #show(index) {
        if (index < 0 || index >= this.#items.length) return;
        this.#index = index;
        this.#clearViewerMedia();

        const item = this.#items[index];
        this.#viewerUrl = URL.createObjectURL(item.blob);
        const media = item.type === 'video'
            ? el('video', { src: this.#viewerUrl, controls: true, playsInline: true, autoplay: false })
            : el('img', { src: this.#viewerUrl, alt: `Photo du ${formatDate(item.createdAt)}` });
        $('#viewer-media').replaceChildren(media);
        $('#viewer-info').textContent = `${formatDate(item.createdAt)} · ${index + 1}/${this.#items.length}`;
        $('#viewer-prev').hidden = index === 0;
        $('#viewer-next').hidden = index === this.#items.length - 1;
        this.#viewer.hidden = false;
    }

    #clearViewerMedia() {
        $('#viewer-media').replaceChildren();
        if (this.#viewerUrl) URL.revokeObjectURL(this.#viewerUrl);
        this.#viewerUrl = null;
    }

    async #export() {
        const item = this.#items[this.#index];
        try {
            await exportFile(item.blob, fileNameFor(item.createdAt, item.mime));
        } catch (err) {
            console.error('[gallery] export', err);
            this.#onError(err);
        }
    }

    /**
     * Suppression immédiate (l'écran réagit tout de suite) avec « Annuler » pendant quelques secondes ;
     * l'effacement dans la base n'a lieu qu'ensuite, en arrière-plan.
     */
    #delete() {
        const item = this.#items[this.#index];
        if (!item) return;
        this.#commitPending();
        const index = this.#index;
        this.#items.splice(index, 1);
        this.#cells.get(item)?.remove();
        this.#cells.delete(item);
        this.#pending = { item, index, timer: setTimeout(() => this.#commitPending(), CONFIG.UNDO_MS) };
        $('#snack-text').textContent = item.type === 'video' ? 'Vidéo supprimée' : 'Photo supprimée';
        $('#snack').hidden = false;
        this.#updateCount();
        this.#onChange(this.#items);
        const next = Math.min(index, this.#items.length - 1);
        if (next >= 0) this.#show(next); else this.closeViewer();
    }

    #undo() {
        const pending = this.#pending;
        if (!pending) return;
        clearTimeout(pending.timer);
        this.#pending = null;
        $('#snack').hidden = true;
        this.#items.splice(pending.index, 0, pending.item);
        this.#renderAll();
        if (this.isViewerOpen) this.#show(pending.index);
    }

    /** Rend la suppression en attente définitive (délai écoulé, nouvelle suppression, mise en arrière-plan). */
    #commitPending() {
        const pending = this.#pending;
        if (!pending) return;
        clearTimeout(pending.timer);
        this.#pending = null;
        $('#snack').hidden = true;
        this.#store.remove(pending.item.id).catch((err) => { console.error('[gallery] suppression', err); this.#onError(err); });
    }

    #revokeUrls() {
        this.#urls.forEach((u) => URL.revokeObjectURL(u));
        this.#urls = [];
    }
}

hydrateIcons();
