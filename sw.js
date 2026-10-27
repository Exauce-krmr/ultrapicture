// Service worker d'UltraPicture : l'application fonctionne hors ligne après la première visite.
// Incrémenter VERSION à chaque déploiement pour renouveler le cache.
const VERSION = 'ultrapicture-v4';
const SHELL = [
    './', 'index.html', 'manifest.webmanifest', 'css/index.css',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(VERSION);
        await Promise.allSettled(SHELL.map((url) => cache.add(url)));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
        await self.clients.claim();
    })());
});

const isVendor = (url) => url.pathname.includes('/vendor/');

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        const cache = await caches.open(VERSION);
        const cached = await cache.match(request, { ignoreSearch: true });
        // Fichiers volumineux et immuables (MediaPipe) : cache d'abord.
        if (cached && isVendor(url)) return cached;
        // Reste : réseau en parallèle, mais on répond tout de suite avec le cache s'il existe.
        const network = fetch(request).then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
        });
        if (cached) { network.catch(() => {}); return cached; }
        try { return await network; }
        catch (err) {
            if (request.mode === 'navigate') return (await cache.match('index.html')) ?? Response.error();
            throw err;
        }
    })());
});
