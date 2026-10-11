/**
 * Persistent cache of downloaded vector tiles (IndexedDB), so places that were
 * opened before load without downloading them again.
 *
 * - A cached tile younger than MAX_AGE is used without asking the network.
 *   OpenFreeMap rebuilds tiles weekly, so this keeps data reasonably current.
 * - Older tiles are refreshed, but still used when the network fails (offline).
 * - Total size is capped; least recently used tiles are evicted first.
 *
 * Every function degrades gracefully: when IndexedDB is unavailable (private
 * mode, blocked storage) the cache behaves as always empty.
 */
const DB_NAME = 'city-roads-tiles';
const DB_VERSION = 1;
const STORE = 'tiles';

export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 500 * 1024 * 1024;
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000; // how often "last used" is updated
const EVICT_DELAY_MS = 5000;

let dbPromise = null;
let evictTimer = 0;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      let store = request.result.createObjectStore(STORE, {keyPath: 'key'});
      store.createIndex('usedAt', 'usedAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function run(mode, action) {
  return openDB().then(db => {
    if (!db) return null;
    return new Promise(resolve => {
      let result = null;
      try {
        let tx = db.transaction(STORE, mode);
        let store = tx.objectStore(STORE);
        let request = action(store);
        if (request) request.onsuccess = () => result = request.result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  });
}

/**
 * Returns {buffer, savedAt, usedAt, size} or null.
 */
export function getCachedTile(key) {
  return run('readonly', store => store.get(key)).then(entry => {
    if (!entry) return null;
    let now = Date.now();
    if (now - entry.usedAt > TOUCH_INTERVAL_MS) {
      entry.usedAt = now;
      run('readwrite', store => store.put(entry));
    }
    return entry;
  });
}

export function isFresh(entry) {
  return entry && Date.now() - entry.savedAt < MAX_AGE_MS;
}

/**
 * @param {string} key - z/x/y
 * @param {ArrayBuffer} buffer
 */
export function putCachedTile(key, buffer) {
  let now = Date.now();
  let entry = {key, buffer, size: buffer ? buffer.byteLength : 0, savedAt: now, usedAt: now};
  return run('readwrite', store => store.put(entry)).then(() => scheduleEviction());
}

/**
 * Returns {count, bytes}.
 */
export function getCacheStats() {
  let stats = {count: 0, bytes: 0};
  return run('readonly', store => {
    let cursorRequest = store.openCursor();
    cursorRequest.onsuccess = () => {
      let cursor = cursorRequest.result;
      if (!cursor) return;
      stats.count += 1;
      stats.bytes += cursor.value.size || 0;
      cursor.continue();
    };
    return null;
  }).then(() => stats);
}

export function clearTileCache() {
  return run('readwrite', store => store.clear());
}

function scheduleEviction() {
  if (evictTimer) return;
  evictTimer = setTimeout(() => {
    evictTimer = 0;
    evictIfNeeded();
  }, EVICT_DELAY_MS);
}

/**
 * Deletes least recently used tiles until the cache is ~10% below the limit.
 */
function evictIfNeeded() {
  return getCacheStats().then(stats => {
    if (stats.bytes <= MAX_BYTES) return;
    let toFree = stats.bytes - MAX_BYTES * 0.9;
    return run('readwrite', store => {
      let cursorRequest = store.index('usedAt').openCursor();
      cursorRequest.onsuccess = () => {
        let cursor = cursorRequest.result;
        if (!cursor || toFree <= 0) return;
        toFree -= cursor.value.size || 0;
        cursor.delete();
        cursor.continue();
      };
      return null;
    });
  });
}
