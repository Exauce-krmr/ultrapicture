import { CONFIG } from '../config.js';
import { $ } from './dom.js';

/** Message court non bloquant. durationMs = 0 : reste affiché jusqu'à hide(). */
export class Toast {
    #el = $('#message');
    #timer = 0;

    show(text, durationMs = CONFIG.TOAST_MS) {
        clearTimeout(this.#timer);
        this.#el.textContent = text;
        this.#el.hidden = false;
        if (durationMs > 0) this.#timer = setTimeout(() => this.hide(), durationMs);
    }

    hide() {
        clearTimeout(this.#timer);
        this.#el.hidden = true;
    }
}
