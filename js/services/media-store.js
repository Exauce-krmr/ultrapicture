const DB_NAME = 'ultrapicture';
const DB_VERSION = 1;
const STORE = 'media';

/**
 * @typedef {{id?: number, type: 'photo'|'video', blob: Blob, thumb?: Blob, mime: string,
 *            width: number, height: number, createdAt: number, durationMs?: number}} MediaRecord
 */

/** Galerie interne stockée dans IndexedDB (pas de plugin nécessaire). */
export class MediaStore {
    #dbPromise = null;

    #open() {
        this.#dbPromise ??= new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return this.#dbPromise;
    }

    async #run(mode, action) {
        const db = await this.#open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const request = action(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(request?.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }

    /** @param {MediaRecord} record @returns {Promise<number>} identifiant créé */
    add(record) { return this.#run('readwrite', (s) => s.add(record)); }

    /** @returns {Promise<MediaRecord[]>} du plus récent au plus ancien */
    async list() {
        const all = await this.#run('readonly', (s) => s.getAll());
        return all.sort((a, b) => b.createdAt - a.createdAt);
    }

    count() { return this.#run('readonly', (s) => s.count()); }
    remove(id) { return this.#run('readwrite', (s) => s.delete(id)); }
    clear() { return this.#run('readwrite', (s) => s.clear()); }
}
