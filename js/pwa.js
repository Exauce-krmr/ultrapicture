import { PWA } from './config.js';

let installEvent = null;
const listeners = new Set();

/** Enregistre le service worker (hors-ligne). Sans effet si non supporté ou hors HTTPS/localhost. */
export function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(PWA.SW_PATH).catch((err) => console.warn('[pwa] service worker', err));
}

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installEvent = event;
    listeners.forEach((fn) => fn());
});
window.addEventListener('appinstalled', () => { installEvent = null; listeners.forEach((fn) => fn()); });

export const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const canInstall = () => installEvent !== null;

export async function promptInstall() {
    if (!installEvent) return false;
    const event = installEvent;
    installEvent = null;
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === 'accepted';
}
