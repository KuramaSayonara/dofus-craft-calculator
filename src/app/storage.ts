// Persistance locale : IndexedDB en priorité, localStorage en repli.
// Un seul document (AppData) — aucune donnée n'est envoyée nulle part.

const DB_NAME = 'dofus-craft-calculator';
const STORE = 'app';
const KEY = 'data';
const LS_KEY = 'dofus-craft-calculator:data';

export type StorageBackend = 'indexeddb' | 'localstorage';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB inaccessible'));
  });
}

function idbGet(db: IDBDatabase): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result as unknown);
    request.onerror = () => reject(request.error ?? new Error('lecture IndexedDB impossible'));
  });
}

function idbPut(db: IDBDatabase, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('écriture IndexedDB impossible'));
  });
}

/** Charge le document persisté (null si absent ou stockage indisponible). */
export async function loadPersisted(): Promise<{ raw: unknown; backend: StorageBackend } | null> {
  try {
    const db = await openDb();
    const raw = await idbGet(db);
    db.close();
    if (raw !== undefined) return { raw, backend: 'indexeddb' };
    // rien en IndexedDB : une ancienne sauvegarde localStorage existe peut-être
  } catch {
    // IndexedDB indisponible (navigation privée stricte…) → repli
  }
  try {
    const text = localStorage.getItem(LS_KEY);
    if (text !== null) return { raw: JSON.parse(text) as unknown, backend: 'localstorage' };
  } catch {
    // localStorage aussi indisponible
  }
  return null;
}

/** Persiste le document ; renvoie le backend réellement utilisé. */
export async function persist(data: unknown): Promise<StorageBackend | null> {
  try {
    const db = await openDb();
    await idbPut(db, data);
    db.close();
    return 'indexeddb';
  } catch {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
      return 'localstorage';
    } catch {
      return null; // aucun stockage disponible : l'app reste utilisable en mémoire
    }
  }
}
