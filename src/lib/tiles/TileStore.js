import eventify from 'ngraph.events';
import {fetchTile, TILE_ZOOM} from './TileSource.js';
import decodeTile from './decodeTile.js';
import {tilesForBBox} from './tileMath.js';

/**
 * Keeps decoded vector tiles in memory and loads missing ones on request.
 *
 * Events:
 *  - 'tile' (key, tile) - a tile was loaded and decoded
 *  - 'status' (status)  - loading status changed, see getStatus()
 */
const CONCURRENCY = 6;
const RETRY_FAILED_AFTER_MS = 15000;

/**
 * Hard memory guard. ~3,000 tiles is roughly 80 x 50 km of a dense area.
 */
export const MAX_LOADED_TILES = 3000;

export default class TileStore {
  constructor() {
    eventify(this);
    this.zoom = TILE_ZOOM;
    this.tiles = new Map(); // key -> {x, y, z, data}
    this.failed = new Map(); // key -> time of failure
    this.queue = [];
    this.inFlight = new Map(); // key -> AbortController
    this.disposed = false;
  }

  static key(tile) {
    return tile.z + '/' + tile.x + '/' + tile.y;
  }

  has(tile) {
    return this.tiles.has(TileStore.key(tile));
  }

  get size() {
    return this.tiles.size;
  }

  isFull() {
    return this.tiles.size >= MAX_LOADED_TILES;
  }

  forEachTile(callback) {
    this.tiles.forEach(callback);
  }

  /**
   * Returns loaded tiles that intersect the bbox {south, west, north, east}.
   */
  getTilesInBBox(bbox) {
    return tilesForBBox(bbox, this.zoom)
      .map(tile => this.tiles.get(TileStore.key(tile)))
      .filter(Boolean);
  }

  /**
   * Replaces the download queue with missing tiles from `tiles` (in the given order).
   * Requests that are already in flight are not cancelled.
   */
  request(tiles) {
    if (this.disposed) return;
    let now = Date.now();
    this.queue = tiles.filter(tile => {
      let key = TileStore.key(tile);
      if (this.tiles.has(key) || this.inFlight.has(key)) return false;
      let failedAt = this.failed.get(key);
      return !(failedAt && now - failedAt < RETRY_FAILED_AFTER_MS);
    });
    this.pump();
    this.fireStatus();
  }

  /**
   * Requests tiles and resolves when all of them are loaded (or failed).
   * `progress` receives {loaded, percent} notifications and can cancel the load.
   */
  load(tiles, progress) {
    return new Promise((resolve, reject) => {
      let keys = new Set(tiles.map(TileStore.key));
      let total = keys.size;
      let bytes = 0;

      let onCancel = () => {
        cleanup();
        this.queue = [];
        this.inFlight.forEach(controller => controller.abort());
        reject({cancelled: true, message: 'Cancelled tile download'});
      };
      let onUpdate = (key, tile, byteLength) => {
        if (byteLength) bytes += byteLength;
        let done = 0;
        let failed = 0;
        keys.forEach(k => {
          if (this.tiles.has(k)) done += 1;
          else if (this.failed.has(k)) failed += 1;
        });
        if (progress) progress.notify({loaded: bytes, percent: done / total});
        if (done + failed === total) {
          cleanup();
          if (done === 0 && total > 0) reject(new Error('Could not download map tiles'));
          else resolve({loaded: done, failed});
        }
      };
      let cleanup = () => {
        this.off('tile', onUpdate);
        this.off('tile-failed', onUpdate);
        if (progress) progress.offCancel(onCancel);
      };

      this.on('tile', onUpdate);
      this.on('tile-failed', onUpdate);
      if (progress) progress.onCancel(onCancel);
      this.request(tiles);
      onUpdate(); // in case everything is already loaded
    });
  }

  getStatus() {
    return {
      loaded: this.tiles.size,
      pending: this.queue.length + this.inFlight.size,
      full: this.isFull()
    };
  }

  dispose() {
    this.disposed = true;
    this.queue = [];
    this.inFlight.forEach(controller => controller.abort());
    this.inFlight.clear();
    this.tiles.clear();
  }

  pump() {
    while (!this.disposed && this.inFlight.size < CONCURRENCY && this.queue.length && !this.isFull()) {
      this.download(this.queue.shift());
    }
  }

  download(tile) {
    let key = TileStore.key(tile);
    let controller = new AbortController();
    this.inFlight.set(key, controller);

    fetchTile(tile, controller.signal).then(buffer => {
      if (this.disposed) return;
      let data = decodeTile(tile, buffer);
      let entry = {x: tile.x, y: tile.y, z: tile.z, key, data};
      this.tiles.set(key, entry);
      this.failed.delete(key);
      this.inFlight.delete(key);
      this.fire('tile', key, entry, buffer ? buffer.byteLength : 0);
    }).catch(err => {
      this.inFlight.delete(key);
      if (this.disposed || controller.signal.aborted) return;
      console.error('Failed to load tile ' + key, err);
      this.failed.set(key, Date.now());
      this.fire('tile-failed', key);
    }).finally(() => {
      if (this.disposed) return;
      this.pump();
      this.fireStatus();
    });
  }

  fireStatus() {
    this.fire('status', this.getStatus());
  }
}
