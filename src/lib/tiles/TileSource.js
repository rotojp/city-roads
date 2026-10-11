/**
 * Downloads OpenMapTiles vector tiles from OpenFreeMap (https://openfreemap.org/).
 * No API key is required, tiles are served from a CDN and are rebuilt from
 * OpenStreetMap roughly every week. This is much more reliable than the public
 * Overpass servers, which are frequently overloaded.
 */
import {getCachedTile, putCachedTile, isFresh} from './tileCache.js';

const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const TILEJSON_STORAGE_KEY = 'city-roads-tilejson';
const TILEJSON_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

let tileJSONPromise;

/**
 * Tile URLs contain a build date (e.g. /planet/20261004_113936_pt/{z}/{x}/{y}.pbf),
 * so we resolve the current template from TileJSON instead of hard-coding it.
 */
export function getTileJSON() {
  if (!tileJSONPromise) {
    let stored = readStoredTileJSON();
    if (stored && Date.now() - stored.savedAt < TILEJSON_MAX_AGE_MS) {
      tileJSONPromise = Promise.resolve(stored.tileJSON);
      return tileJSONPromise;
    }

    tileJSONPromise = fetchWithRetry(TILEJSON_URL)
      .then(response => response.json())
      .then(tileJSON => {
        if (!tileJSON || !Array.isArray(tileJSON.tiles) || !tileJSON.tiles[0]) {
          throw new Error('Unexpected tile server response');
        }
        storeTileJSON(tileJSON);
        return tileJSON;
      })
      .catch(err => {
        tileJSONPromise = null; // allow retry
        // Offline: an outdated template still works for tiles of that build.
        if (stored) return stored.tileJSON;
        throw err;
      });
  }
  return tileJSONPromise;
}

/**
 * Returns a single tile: from the local cache when it is fresh, otherwise from
 * the network (and then stores it). Resolves to ArrayBuffer, or null for empty
 * tiles (open sea).
 */
export function fetchTile(tile, signal) {
  let key = tile.z + '/' + tile.x + '/' + tile.y;
  return getCachedTile(key).then(cached => {
    if (isFresh(cached)) return cached.buffer;

    return downloadTile(tile, signal).then(buffer => {
      // Only real tiles are cached (open sea is a small, valid tile too). A
      // 204/404 might be a temporary server problem, don't keep it for weeks.
      if (buffer) putCachedTile(key, buffer);
      return buffer;
    }, err => {
      // Network failed: an outdated tile is better than no map.
      if (cached && !(signal && signal.aborted)) return cached.buffer;
      throw err;
    });
  });
}

function downloadTile(tile, signal) {
  return getTileJSON().then(tileJSON => {
    let url = tileJSON.tiles[0].replace('{z}', tile.z).replace('{x}', tile.x).replace('{y}', tile.y);
    return fetchWithRetry(url, signal);
  }).then(response => (response.status === 204 || response.status === 404) ? null : response.arrayBuffer());
}

function readStoredTileJSON() {
  try {
    let stored = JSON.parse(localStorage.getItem(TILEJSON_STORAGE_KEY));
    if (stored && stored.tileJSON && Array.isArray(stored.tileJSON.tiles)) return stored;
  } catch (e) {
    // storage unavailable or corrupted - just don't use it
  }
  return null;
}

function storeTileJSON(tileJSON) {
  try {
    localStorage.setItem(TILEJSON_STORAGE_KEY, JSON.stringify({savedAt: Date.now(), tileJSON}));
  } catch (e) {
    // storage unavailable - fine, we will fetch it again next time
  }
}

/**
 * The most detailed zoom level of OpenMapTiles. It has every road, footway and cycleway.
 */
export const TILE_ZOOM = 14;

function fetchWithRetry(url, signal, attempt = 1) {
  return fetch(url, {signal}).then(response => {
    if (response.ok || response.status === 204 || response.status === 404) return response;
    throw new Error(`Tile server responded with ${response.status} for ${url}`);
  }).catch(err => {
    if (signal && signal.aborted) throw err;
    if (attempt >= MAX_ATTEMPTS) throw err;
    return wait(500 * attempt).then(() => fetchWithRetry(url, signal, attempt + 1));
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
