import { APP } from '../config.js';
import { canInstall, isIOS, isStandalone, promptInstall } from '../pwa.js';
import { $, el } from './dom.js';

const OPTIONS = {
    photoFormat: [['jpeg', 'JPEG'], ['webp', 'WebP'], ['png', 'PNG']],
    photoWidth: [[720, '720p'], [1080, '1080p'], [1440, '1440p'], [2160, '4K']],
    previewQuality: [['eco', 'Économie'], ['standard', 'Standard'], ['high', 'Haute']],
};

/** Schéma déclaratif : ajouter une ligne ici suffit à créer un réglage. */
const SCHEMA = [
    { title: 'Photo', rows: [
        { type: 'select', key: 'photoFormat', label: 'Format du fichier' },
        { type: 'select', key: 'photoWidth', label: 'Résolution', numeric: true },
        { type: 'range', key: 'jpegQuality', label: 'Qualité de compression', min: 0.6, max: 1, step: 0.02, format: (v) => `${Math.round(v * 100)} %` },
        { type: 'toggle', key: 'timestamp', label: 'Horodatage sur la photo' },
        { type: 'toggle', key: 'shareAfterCapture', label: 'Ouvrir le partage après la capture', hint: 'Pour enregistrer dans la galerie du téléphone' },
    ] },
    { title: 'Vidéo', rows: [
        { type: 'toggle', key: 'audio', label: 'Enregistrer le son', hint: 'Demande l’accès au micro' },
    ] },
    { title: 'Affichage', rows: [
        { type: 'select', key: 'previewQuality', label: 'Qualité de l’aperçu', hint: 'Économie = plus fluide sur un ancien téléphone' },
        { type: 'toggle', key: 'mirrorFront', label: 'Effet miroir (caméra frontale)' },
        { type: 'toggle', key: 'grid', label: 'Grille de composition' },
        { type: 'toggle', key: 'histogram', label: 'Histogramme' },
        { type: 'toggle', key: 'showFps', label: 'Afficher les images par seconde' },
    ] },
    { title: 'Confort', rows: [
        { type: 'toggle', key: 'haptics', label: 'Retour haptique' },
    ] },
];

/** Écran de paramètres généré à partir de SCHEMA ; lit et écrit dans le SettingsStore. */
export class SettingsView {
    #root = $('#settings-view');
    #body = $('#settings-body');
    #settings;
    #actions;

    /** @param {{settings: import('../services/settings.js').SettingsStore, actions: {onResetSettings: Function, onClearGallery: Function}}} deps */
    constructor({ settings, actions }) {
        this.#settings = settings;
        this.#actions = actions;
        $('#settings-close').addEventListener('click', () => this.close());
    }

    get isOpen() { return !this.#root.hidden; }

    open() {
        this.#render();
        this.#root.hidden = false;
    }

    close() { this.#root.hidden = true; }

    #render() {
        const values = this.#settings.get();
        const groups = SCHEMA.map((g) => el('section', { class: 'group' },
            el('h2', { class: 'group-title' }, g.title),
            el('div', { class: 'group-card' }, g.rows.map((row) => this.#row(row, values)))));
        this.#body.replaceChildren(...groups, this.#dataGroup(), this.#aboutGroup());
    }

    #row(row, values) {
        const label = el('span', { class: 'row-text' }, el('span', { class: 'row-label' }, row.label),
            row.hint ? el('span', { class: 'row-hint' }, row.hint) : null);
        if (row.type === 'select') {
            return el('div', { class: 'row row--stacked' }, label, this.#control(row, values[row.key]));
        }
        return el('label', { class: 'row' }, label, this.#control(row, values[row.key]));
    }

    #control(row, current) {
        const { key } = row;
        if (row.type === 'toggle') {
            return el('input', { type: 'checkbox', class: 'switch', role: 'switch', checked: Boolean(current),
                onChange: (e) => this.#settings.set({ [key]: e.target.checked }) });
        }
        if (row.type === 'select') {
            // Contrôle segmenté : grandes cibles tactiles, toutes les options visibles, pas de menu natif.
            const group = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': row.label });
            for (const [value, text] of OPTIONS[key]) {
                group.append(el('button', {
                    class: 'segment', type: 'button', role: 'radio', 'aria-checked': String(value === current),
                    onClick: () => {
                        this.#settings.set({ [key]: value });
                        for (const b of group.children) b.setAttribute('aria-checked', String(b.textContent === text));
                    },
                }, text));
            }
            return group;
        }
        const out = el('output', { class: 'row-value' }, row.format(current));
        const input = el('input', { type: 'range', min: row.min, max: row.max, step: row.step, value: current, class: 'range',
            onInput: (e) => { out.textContent = row.format(Number(e.target.value)); this.#settings.set({ [key]: Number(e.target.value) }); } });
        return el('span', { class: 'row-range' }, input, out);
    }

    #dataGroup() {
        const reset = el('button', { class: 'row row--button', type: 'button', onClick: () => { this.#actions.onResetSettings(); this.#render(); } }, 'Réinitialiser les réglages');
        const clear = el('button', { class: 'row row--button row--danger', type: 'button' }, 'Vider la galerie');
        let armed = false;
        clear.addEventListener('click', async () => {
            if (!armed) {
                armed = true;
                clear.textContent = 'Appuyez de nouveau pour confirmer';
                setTimeout(() => { armed = false; clear.textContent = 'Vider la galerie'; }, 3000);
                return;
            }
            armed = false;
            clear.textContent = 'Vider la galerie';
            await this.#actions.onClearGallery();
        });
        return el('section', { class: 'group' }, el('h2', { class: 'group-title' }, 'Données'), el('div', { class: 'group-card' }, reset, clear));
    }

    /** Ligne « Installer l'application » : bouton natif si le navigateur le propose, sinon indication iOS. */
    #installRows() {
        if (isStandalone()) return [];
        if (canInstall()) {
            const btn = el('button', { class: 'row', type: 'button' }, el('span', { class: 'row-label' }, 'Installer l’application'));
            btn.addEventListener('click', async () => { await promptInstall(); this.#render?.(); });
            return [btn];
        }
        if (isIOS()) return [el('p', { class: 'about' }, 'Pour installer : Partager › Sur l’écran d’accueil.')];
        return [];
    }

    #aboutGroup() {
        return el('section', { class: 'group' },
            el('h2', { class: 'group-title' }, 'À propos'),
            el('div', { class: 'group-card' },
                el('div', { class: 'row' }, el('span', { class: 'row-label' }, APP.NAME), el('span', { class: 'row-value' }, `v${APP.VERSION}`)),
                ...this.#installRows(),
                el('p', { class: 'about' }, 'Les photos et vidéos sont conservées dans la galerie de l’application. Utilisez « Partager » ou « Télécharger » pour les enregistrer ailleurs.')));
    }
}
