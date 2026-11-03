import { ADJUSTMENTS, LOOKS } from '../looks.js';
import { $, el } from './dom.js';
import { icon } from './icons.js';
import { AR_ACCESSORIES } from '../ar.js';

const STRIP_LABELS = { looks: 'Looks', effects: 'Effets', fun: 'Effets fun et accessoires' };

/**
 * Panneau d'outils sous l'aperçu : looks, effets (avec intensité) et réglages manuels.
 * Reçoit son état via `setState`, notifie via les callbacks du constructeur.
 */
export class ToolPanel {
    #panel = $('#panel');
    #tabs = $('#tabs');
    #active = 'looks';
    #sliderMode = false; // curseur d'intensité affiché à la place des pastilles
    #open = false; // replié au départ : l'image garde toute la place, un appui sur un onglet ouvre ses outils
    #selectedAdjust = ADJUSTMENTS[0].id;
    #renderedTab = null;
    #state = { lookId: 'original', adjustments: {}, effectIntensity: 100, arId: null };

    /** @param {{onLook: Function, onAr: Function, onAdjust: Function, onIntensity: Function, onReset: Function}} handlers */
    constructor(handlers) {
        this.h = handlers;
        this.#tabs.addEventListener('click', (e) => {
            const tab = e.target.closest('[data-tab]');
            if (!tab) return;
            // Un second appui sur l'onglet actif replie le panneau.
            this.#open = !(this.#open && this.#active === tab.dataset.tab);
            this.#active = tab.dataset.tab;
            this.#sliderMode = false;
            this.#render();
        });
        this.#render();
    }

    /** Replie le panneau (appui sur l'image). */
    close() {
        if (!this.#open) return;
        this.#open = false;
        this.#sliderMode = false;
        this.#render();
    }

    setState(state) {
        const previous = this.#state;
        this.#state = state;
        if (previous.lookId !== state.lookId) this.#sliderMode = false;
        // Mise à jour fine (sans reconstruire le DOM) pour ne pas casser un glissement de slider en cours.
        if (this.#active === 'adjust' && this.#open && this.#panel.querySelector('[data-adjust]')) this.#syncSliders();
        else if (this.#active !== 'adjust' && this.#open && previous.lookId === state.lookId && previous.arId === state.arId) return;
        else this.#render();
    }

    #render() {
        for (const tab of this.#tabs.querySelectorAll('[data-tab]')) {
            const selected = this.#open && tab.dataset.tab === this.#active;
            tab.setAttribute('aria-selected', String(selected));
        }
        // Les rangées défilantes gardent leur position quand le contenu est reconstruit (sinon elles reviennent au début).
        const scrolls = this.#renderedTab === this.#active ? [...this.#panel.querySelectorAll('.strip')].map((strip) => strip.scrollLeft) : [];
        this.#panel.hidden = !this.#open;
        this.#panel.replaceChildren(...(this.#open ? [this.#content()] : []));
        this.#panel.querySelectorAll('.strip').forEach((strip, i) => { strip.scrollLeft = scrolls[i] ?? 0; });
        this.#renderedTab = this.#open ? this.#active : null;
    }

    #content() {
        return this.#active === 'adjust' ? this.#adjustPanel() : this.#lookPanel(this.#active);
    }

    /**
     * Une seule rangée de pastilles (jamais empilée) : l'image reste visible.
     * Toucher l'effet déjà actif remplace la rangée par son curseur d'intensité, comme dans les réglages.
     */
    #lookPanel(category) {
        const { lookId, effectIntensity, arId } = this.#state;
        const current = LOOKS.find((l) => l.id === lookId);
        const adjustable = category !== 'looks' && Boolean(current?.effect) && current.category === category;
        if (adjustable && this.#sliderMode) return this.#intensityRow(category, effectIntensity);

        const chip = (label, selected, onClick) => el('button', {
            class: 'chip', type: 'button', role: 'option', 'aria-selected': String(selected), onClick,
        }, label);
        const items = [];
        if (category !== 'looks') {
            const none = chip('Aucun', lookId === 'original' && !arId, () => { this.h.onLook('original'); if (arId) this.h.onAr(null); });
            none.classList.add('chip--none');
            items.push(none);
        }
        for (const look of LOOKS.filter((l) => l.category === category)) {
            const selected = look.id === lookId;
            const node = chip(look.label, selected, () => {
                if (selected && adjustable) { this.#sliderMode = true; this.#render(); }
                else if (!selected) this.h.onLook(look.id);
            });
            if (selected && adjustable) {
                node.classList.add('chip--adjustable');
                node.setAttribute('aria-label', `${look.label} : régler l’intensité`);
                node.insertAdjacentHTML('beforeend', icon('sliders'));
            }
            items.push(node);
        }
        if (category === 'fun') {
            items.push(el('span', { class: 'strip-divider', 'aria-hidden': 'true' }));
            for (const [id, { label }] of Object.entries(AR_ACCESSORIES)) {
                items.push(chip(label, id === arId, () => this.h.onAr(id === arId ? null : id)));
            }
        }
        return el('div', { class: 'strip', role: 'listbox', 'aria-label': STRIP_LABELS[category] }, items);
    }

    /** Rangée « curseur » : remplace la rangée de pastilles le temps du réglage. */
    #intensityRow(category, value) {
        const label = category === 'fun' ? 'Force' : 'Intensité';
        const output = el('output', { class: 'adjust-value adjust-value--inline' }, `${value}%`);
        const slider = el('input', {
            type: 'range', min: 0, max: 100, step: 1, value, 'aria-label': `${label} de l’effet`,
            onInput: (e) => { output.textContent = `${e.target.value}%`; this.h.onIntensity(Number(e.target.value)); },
        });
        const done = el('button', { class: 'chip chip--done', type: 'button', onClick: () => { this.#sliderMode = false; this.#render(); } }, 'OK');
        return el('div', { class: 'intensity-row' }, el('span', { class: 'slider-label' }, label), slider, output, done);
    }

    /**
     * Réglages « à la Apple » : une rangée d'outils à faire défiler horizontalement,
     * puis UN seul grand curseur pour l'outil choisi (aucun défilement vertical).
     */
    #adjustPanel() {
        const { adjustments } = this.#state;
        const current = ADJUSTMENTS.find((a) => a.id === this.#selectedAdjust) ?? ADJUSTMENTS[0];
        const value = adjustments[current.id] ?? current.default;

        const chips = ADJUSTMENTS.map((adj) => el('button', {
            class: `chip chip--adjust${adjustments[adj.id] !== adj.default ? ' is-modified' : ''}`,
            type: 'button', role: 'option', dataset: { chip: adj.id },
            'aria-selected': String(adj.id === current.id),
            onClick: () => { this.#selectedAdjust = adj.id; this.#render(); },
        }, adj.label));
        const resetAll = el('button', { class: 'chip chip--ghost', type: 'button', 'aria-label': 'Tout réinitialiser', onClick: () => this.h.onReset() });
        resetAll.innerHTML = icon('reset');

        const step = (delta) => () => this.h.onAdjust(current.id, clamp(this.#state.adjustments[current.id] + delta, current.min, current.max));
        const slider = el('input', {
            type: 'range', min: current.min, max: current.max, step: 1, value, dataset: { adjust: current.id },
            'aria-label': current.label,
            onInput: (e) => this.h.onAdjust(current.id, Number(e.target.value)),
        });
        const stepBtn = (text, label, delta) => el('button', { class: 'step', type: 'button', 'aria-label': label, onClick: step(delta) }, text);
        const reset = el('button', { class: 'text-btn', type: 'button', onClick: () => this.h.onAdjust(current.id, current.default) }, 'Réinitialiser');

        return el('div', { class: 'adjust' },
            el('div', { class: 'strip', role: 'listbox', 'aria-label': 'Outils de réglage' }, ...chips, resetAll),
            el('div', { class: 'adjust-head' },
                el('output', { class: 'adjust-value', dataset: { adjustValue: '' } }, formatValue(current, value)), reset),
            el('div', { class: 'adjust-slider' }, stepBtn('−', 'Diminuer', -5), slider, stepBtn('+', 'Augmenter', 5)));
    }

    /** Met à jour valeur, curseur et pastilles « modifié » sans reconstruire le DOM (un glissement reste fluide). */
    #syncSliders() {
        const { adjustments } = this.#state;
        for (const input of this.#panel.querySelectorAll('[data-adjust]')) {
            const adj = ADJUSTMENTS.find((a) => a.id === input.dataset.adjust);
            const value = adjustments[adj.id];
            if (Number(input.value) !== value) input.value = value;
            this.#panel.querySelector('[data-adjust-value]').textContent = formatValue(adj, value);
        }
        for (const chip of this.#panel.querySelectorAll('[data-chip]')) {
            const adj = ADJUSTMENTS.find((a) => a.id === chip.dataset.chip);
            chip.classList.toggle('is-modified', adjustments[adj.id] !== adj.default);
        }
    }
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Valeur signée pour les réglages bipolaires (+25 / −25), simple pour les autres. */
function formatValue({ min }, value) {
    if (min >= 0) return String(value);
    return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';
}
