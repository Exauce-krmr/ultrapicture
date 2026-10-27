import { ADJUSTMENTS, LOOKS } from '../looks.js';
import { $, el } from './dom.js';
import { icon } from './icons.js';
import { AR_ACCESSORIES } from '../ar.js';

const STRIP_LABELS = { looks: 'Looks', effects: 'Effets', fun: 'Effets fun' };

/**
 * Panneau d'outils sous l'aperçu : looks, effets (avec intensité) et réglages manuels.
 * Reçoit son état via `setState`, notifie via les callbacks du constructeur.
 */
export class ToolPanel {
    #panel = $('#panel');
    #tabs = $('#tabs');
    #active = 'looks';
    #open = true;
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
            this.#render();
        });
        this.#render();
    }

    setState(state) {
        const previous = this.#state;
        this.#state = state;
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

    #lookPanel(category) {
        const { lookId, effectIntensity, arId } = this.#state;
        const looks = LOOKS.filter((l) => l.category === category);
        const current = LOOKS.find((l) => l.id === lookId);
        const sliderLabel = category === 'fun' ? 'Force' : 'Intensité';

        // Un second appui sur un effet actif le désactive (retour à « Original »).
        const chip = (label, selected, onClick) => el('button', {
            class: 'chip', type: 'button', role: 'option', 'aria-selected': String(selected), onClick,
        }, label);
        const lookChip = (look) => chip(look.label, look.id === lookId,
            () => this.h.onLook(look.category !== 'looks' && look.id === lookId ? 'original' : look.id));
        const strip = (label, chips) => el('div', { class: 'strip', role: 'listbox', 'aria-label': label }, chips);

        const parts = [strip(STRIP_LABELS[category], looks.map(lookChip))];
        if (category === 'fun') {
            parts.push(el('p', { class: 'strip-label' }, 'Visage (réalité augmentée)'));
            parts.push(strip('Accessoires de visage', Object.entries(AR_ACCESSORIES).map(([id, { label }]) =>
                chip(label, id === arId, () => this.h.onAr(id === arId ? null : id)))));
        }
        if (category !== 'looks' && current?.effect && current.category === category) {
            const slider = el('input', {
                type: 'range', min: 0, max: 100, step: 1, value: effectIntensity, 'aria-label': `${sliderLabel} de l’effet`,
                onInput: (e) => { e.target.nextElementSibling.textContent = `${e.target.value}%`; this.h.onIntensity(Number(e.target.value)); },
            });
            parts.push(el('label', { class: 'slider-row slider-row--inline' }, el('span', { class: 'slider-label' }, sliderLabel), slider,
                el('output', { class: 'slider-value' }, `${effectIntensity}%`)));
        }
        return el('div', {}, ...parts);
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
