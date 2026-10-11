/**
 * Downloads OpenMapTiles vector tiles from OpenFreeMap (https://openfreemap.org/).
 * No API key is required, tiles are served from a CDN and are rebuilt from
 * OpenStreetMap roughly every week. This is much more reliable than the public
 * Overpass servers, which are frequently overloaded.
 */
const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const MAX_ATTEMPTS = 3;

let tileJSONPromise;

/**
 * Tile URLs contain a build date (e.g. /planet/20261004_113936_pt/{z}/{x}/{y}.pbf),
 * so we resolve the current template from TileJSON instead of hard-coding it.
 */
export function getTileJSON() {
  if (!tileJSONPromise) {
    tileJSONPromise = fetchWithRetry(TILEJSON_URL)
      .then(response => response.json())
      .then(tileJSON => {
        if (!tileJSON || !Array.isArray(tileJSON.tiles) || !tileJSON.tiles[0]) {
          throw new Error('Unexpected tile server response');
        }
        return tileJSON;
      })
      .catch(err => {
        tileJSONPromise = null; // allow retry
        throw err;
      });
  }
  return tileJSONPromise;
}

/**
 * Downloads a single tile. Resolves to ArrayBuffer, or null for empty tiles (open sea).
 */
export function fetchTile(tile, signal) {
  return getTileJSON().then(tileJSON => {
    let url = tileJSON.tiles[0].replace('{z}', tile.z).replace('{x}', tile.x).replace('{y}', tile.y);
    return fetchWithRetry(url, signal);
  }).then(response => (response.status === 204 || response.status === 404) ? null : response.arrayBuffer());
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
