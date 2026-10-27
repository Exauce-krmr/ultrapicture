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
    #urls = [];
    #index = 0;
    #viewerUrl = null;
    #deleteTimer = 0;
    #deleteArmed = false;

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
    }

    get isOpen() { return !this.#root.hidden; }
    get isViewerOpen() { return !this.#viewer.hidden; }

    async open() {
        this.#root.hidden = false;
        await this.refresh();
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
        this.#disarmDelete();
    }

    async refresh() {
        try {
            this.#items = await this.#store.list();
        } catch (err) {
            console.error('[gallery] lecture impossible', err);
            this.#onError(err);
            this.#items = [];
        }
        this.#revokeUrls();
        this.#renderGrid();
        $('#gallery-count').textContent = this.#items.length ? `(${this.#items.length})` : '';
        $('#gallery-empty').hidden = this.#items.length > 0;
        this.#onChange(this.#items);
    }

    #renderGrid() {
        this.#grid.replaceChildren(
            ...this.#items.map((item, index) => {
                const url = URL.createObjectURL(item.thumb ?? item.blob);
                this.#urls.push(url);
                const cell = el('button', { class: 'cell', type: 'button', 'aria-label': `${item.type === 'video' ? 'Vidéo' : 'Photo'} du ${formatDate(item.createdAt)}`, onClick: () => this.#show(index) },
                    el('img', { src: url, alt: '', loading: 'lazy' }));
                if (item.type === 'video') {
                    const badge = el('span', { class: 'cell-badge' });
                    badge.innerHTML = `${icon('play')}<span>${formatDuration(item.durationMs ?? 0)}</span>`;
                    cell.append(badge);
                }
                return cell;
            }),
        );
    }

    #show(index) {
        if (index < 0 || index >= this.#items.length) return;
        this.#index = index;
        this.#disarmDelete();
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

    /** Suppression en deux temps : le premier appui demande confirmation. */
    async #delete() {
        const label = $('#viewer-delete-label');
        if (!this.#deleteArmed) {
            this.#deleteArmed = true;
            label.textContent = 'Confirmer';
            $('#viewer-delete').classList.add('is-armed');
            this.#deleteTimer = setTimeout(() => this.#disarmDelete(), CONFIG.DELETE_CONFIRM_MS);
            return;
        }
        this.#disarmDelete();
        const { id } = this.#items[this.#index];
        try {
            await this.#store.remove(id);
        } catch (err) {
            this.#onError(err);
            return;
        }
        const next = Math.min(this.#index, this.#items.length - 2);
        await this.refresh();
        if (next >= 0) this.#show(next); else this.closeViewer();
    }

    #disarmDelete() {
        clearTimeout(this.#deleteTimer);
        this.#deleteArmed = false;
        $('#viewer-delete-label').textContent = 'Supprimer';
        $('#viewer-delete').classList.remove('is-armed');
    }

    #revokeUrls() {
        this.#urls.forEach((u) => URL.revokeObjectURL(u));
        this.#urls = [];
    }
}

hydrateIcons();
