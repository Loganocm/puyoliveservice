/**
 * Imported skins, kept in the browser's IndexedDB (database `puyolive`,
 * store `skins`), so they survive reloads and never leave the device.
 * Every call resolves even where storage is unavailable (private windows):
 * reads come back empty and writes report failure.
 */

export interface StoredSkin {
    id: string;
    /** The skin.json as imported. */
    manifestJson: unknown;
    files: { name: string; type: string; blob: Blob }[];
    importedAt: number;
}

const DB = 'puyolive';
const STORE = 'skins';

function open(): Promise<IDBDatabase | null> {
    return new Promise(resolve => {
        try {
            const req = indexedDB.open(DB, 1);
            req.onupgradeneeded = () => {
                if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
            req.onblocked = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

async function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
    const db = await open();
    if (!db) return null;
    return new Promise(resolve => {
        try {
            const tx = db.transaction(STORE, mode);
            const req = body(tx.objectStore(STORE));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
            tx.oncomplete = () => db.close();
        } catch {
            db.close();
            resolve(null);
        }
    });
}

export async function listStoredSkins(): Promise<StoredSkin[]> {
    return (await run<StoredSkin[]>('readonly', s => s.getAll() as IDBRequest<StoredSkin[]>)) ?? [];
}

export async function getStoredSkin(id: string): Promise<StoredSkin | null> {
    return (await run<StoredSkin | undefined>('readonly', s => s.get(id) as IDBRequest<StoredSkin | undefined>)) ?? null;
}

/** Save a skin. Resolves false if it could not be stored. */
export async function putStoredSkin(skin: StoredSkin): Promise<boolean> {
    return (await run('readwrite', s => s.put(skin))) !== null;
}

export async function deleteStoredSkin(id: string): Promise<void> {
    await run('readwrite', s => s.delete(id));
}
