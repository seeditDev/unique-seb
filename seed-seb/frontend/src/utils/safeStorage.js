/**
 * safeStorage.js
 * Resilient client storage with IndexedDB backup to prevent data loss
 * from localStorage QuotaExceededError during offline assessment submissions.
 */

const DB_NAME = 'seed_seb_offline_store';
const STORE_NAME = 'pending_envelopes';
const DB_VERSION = 1;

let dbPromise = null;

function getIDB() {
  if (typeof window === 'undefined' || !window.indexedDB) return null;
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('[SafeStorage] IndexedDB open error:', req.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('[SafeStorage] IndexedDB initialization error:', err);
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function savePendingEnvelope(key, envelope) {
  const payloadStr = typeof envelope === 'string' ? envelope : JSON.stringify(envelope);
  
  // 1. Attempt primary localStorage write
  try {
    localStorage.setItem(key, payloadStr);
    console.log(`[SafeStorage] Envelope saved to localStorage: ${key}`);
  } catch (lsErr) {
    console.warn(`[SafeStorage] localStorage write failed for ${key} (${lsErr?.message}). Falling back to IndexedDB.`);
    // Try clearing old non-critical caches to free space
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('course_progress_cache_') || k.startsWith('firebase:previous_websocket_failure'))) {
          localStorage.removeItem(k);
        }
      }
      localStorage.setItem(key, payloadStr);
      console.log(`[SafeStorage] Envelope saved to localStorage after clearing non-critical cache: ${key}`);
    } catch (_) { /* continue to IndexedDB */ }
  }

  // 2. Mirror into IndexedDB as persistent reliable store
  try {
    const idb = await getIDB();
    if (idb) {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const parsedObj = typeof envelope === 'string' ? JSON.parse(envelope) : envelope;
      store.put({ key, ...parsedObj, savedAtLocal: new Date().toISOString() });
    }
  } catch (idbErr) {
    console.warn('[SafeStorage] IndexedDB mirror write failed:', idbErr);
  }
}

export async function removePendingEnvelope(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {}

  try {
    const idb = await getIDB();
    if (idb) {
      const tx = idb.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(key);
    }
  } catch (_) {}
}

export function readJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

export default {
  savePendingEnvelope,
  removePendingEnvelope,
  readJSON,
  writeJSON,
};
