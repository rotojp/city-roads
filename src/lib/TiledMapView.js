import eventify from 'ngraph.events';
import RoadClassLayer from './RoadClassLayer.js';
import TileStore from './tiles/TileStore.js';
import {ROAD_GROUPS} from './tiles/featureClasses.js';
import {tilesForBBox} from './tiles/tileMath.js';

/**
 * Connects a TileStore with the scene: renders loaded tiles, and loads tiles that
 * become visible when the user pans or zooms the map.
 *
 * Events:
 *  - 'status' ({loaded, pending, tooFarOut, full})
 */
const CHUNK_SHIFT = 3; // 8 x 8 tiles per chunk
const MAX_VISIBLE_TILES = 1000;

export default class TiledMapView {
  constructor(scene, store, {projector, widths, color}) {
    eventify(this);
    this.scene = scene;
    this.renderer = scene.getRenderer();
    this.store = store;
    this.projector = projector;
    this.tooFarOut = false;
    this.boundaryMask = null;
    this.dirtyChunks = new Set();
    this.rebuildTimer = 0;
    this.visibleTimer = 0;
    this.project = makeProjector(projector);

    // Least important roads first, so that major roads are rendered on top.
    this.layers = {};
    ROAD_GROUPS.slice().reverse().forEach(group => {
      let layer = new RoadClassLayer(group, {color, width: widths[group]});
      this.layers[group] = layer;
      this.renderer.appendChild(layer);
    });

    this.onTile = this.onTile.bind(this);
    this.onStatus = this.onStatus.bind(this);
    this.onTransform = this.onTransform.bind(this);
    store.on('tile', this.onTile);
    store.on('status', this.onStatus);
    this.renderer.on('transform', this.onTransform);
    window.addEventListener('resize', this.onTransform);

    store.forEachTile(tile => this.dirtyChunks.add(chunkKey(tile)));
    this.rebuildDirtyChunks();
  }

  getLayers() {
    return ROAD_GROUPS.map(group => this.layers[group]);
  }

  setLineWidths(widths) {
    ROAD_GROUPS.forEach(group => this.layers[group].lineWidth = widths[group]);
  }

  /**
   * Optional "clip to city boundary" mode. Pass a BoundaryMask to keep only roads
   * and areas inside the boundary, or null to show everything.
   */
  setBoundaryClip(mask) {
    this.boundaryMask = mask;
    let underlay = this.scene.getAreaUnderlay();
    if (underlay) underlay.setClip(mask);
    this.store.forEachTile(tile => this.dirtyChunks.add(chunkKey(tile)));
    this.rebuildDirtyChunks();
    this.scheduleVisibleUpdate();
  }

  /**
   * Moves the camera so that bbox {south, west, north, east} covers `clientRect`
   * (a rectangle in client pixels, e.g. the poster's map window). With
   * `contain` (or without `clientRect`) the whole bbox is visible instead.
   */
  fitBBox(bbox, clientRect, padding = 1.05, contain = false) {
    let topLeft = this.project(bbox.west, bbox.north);
    let bottomRight = this.project(bbox.east, bbox.south);
    let cx = (topLeft.x + bottomRight.x) / 2;
    let cy = (topLeft.y + bottomRight.y) / 2;
    let halfWidth = Math.abs(bottomRight.x - topLeft.x) / 2;
    let halfHeight = Math.abs(topLeft.y - bottomRight.y) / 2;

    let canvasRect = this.renderer.getDrawContext().canvas.getBoundingClientRect();
    if (clientRect) {
      // The rect covers only part of the screen, so the screen must show more.
      halfWidth *= canvasRect.width / clientRect.width;
      halfHeight *= canvasRect.height / clientRect.height;
    }

    let drawContext = this.renderer.getDrawContext();
    let aspect = drawContext.width / drawContext.height;
    // With a rect we "cover" it (the place fills it, sides may be cropped), which
    // is what a poster needs. Without it we "contain" the whole place.
    let fit = (clientRect && !contain) ? Math.min : Math.max;
    let visibleHalfHeight = fit(halfHeight, halfWidth / aspect) * padding;

    if (clientRect) {
      // Put the place in the middle of the rect, not in the middle of the screen.
      let unitsPerPixel = 2 * visibleHalfHeight / canvasRect.height;
      let dx = (clientRect.left + clientRect.width / 2) - (canvasRect.left + canvasRect.width / 2);
      let dy = (clientRect.top + clientRect.height / 2) - (canvasRect.top + canvasRect.height / 2);
      cx -= dx * unitsPerPixel;
      cy += dy * unitsPerPixel; // scene y points up
    }

    // w-gl's setViewBox() shows `pixelRatio` times the requested half-size.
    let half = visibleHalfHeight / drawContext.pixelRatio;
    this.renderer.setViewBox({left: cx - half, right: cx + half, top: cy + half, bottom: cy - half});
    this.renderer.renderFrame();
    this.scheduleVisibleUpdate();
  }

  /**
   * Returns {south, west, north, east} of the area visible on screen.
   */
  getVisibleBBox() {
    let canvas = this.renderer.getDrawContext().canvas;
    let rect = canvas.getBoundingClientRect();
    return this.clientRectToBBox(rect.left, rect.top, rect.right, rect.bottom);
  }

  clientRectToBBox(left, top, right, bottom) {
    let corners = [[left, top], [right, top], [left, bottom], [right, bottom]].map(([x, y]) => {
      let p = this.renderer.getSceneCoordinate(x, y);
      return this.projector.invert([p[0], -p[1]]);
    });
    return {
      west: Math.min(...corners.map(c => c[0])),
      east: Math.max(...corners.map(c => c[0])),
      south: Math.min(...corners.map(c => c[1])),
      north: Math.max(...corners.map(c => c[1]))
    };
  }

  onTransform() {
    this.scheduleVisibleUpdate();
  }

  scheduleVisibleUpdate() {
    clearTimeout(this.visibleTimer);
    this.visibleTimer = setTimeout(() => this.requestVisibleTiles(), 250);
  }

  requestVisibleTiles() {
    let bbox = this.getVisibleBBox();
    // Prefetch a bit around the screen, so small pans don't show empty edges.
    let dx = (bbox.east - bbox.west) * 0.15, dy = (bbox.north - bbox.south) * 0.15;
    let area = {west: bbox.west - dx, east: bbox.east + dx, south: bbox.south - dy, north: bbox.north + dy};
    if (this.boundaryMask) {
      // nothing to show outside of the boundary
      area = intersect(area, this.boundaryMask.bbox);
    }
    let tiles = area ? tilesForBBox(area, this.store.zoom) : [];

    this.tooFarOut = tiles.length > MAX_VISIBLE_TILES;
    if (this.tooFarOut) {
      this.store.request([]);
    } else {
      this.store.request(tiles);
    }
    this.onStatus(this.store.getStatus());
  }

  onTile(key, tile) {
    this.dirtyChunks.add(chunkKey(tile));
    if (!this.rebuildTimer) {
      // Batch tiles that arrive close to each other.
      this.rebuildTimer = setTimeout(() => this.rebuildDirtyChunks(), 150);
    }
  }

  onStatus(status) {
    this.fire('status', Object.assign({tooFarOut: this.tooFarOut}, status));
  }

  rebuildDirtyChunks() {
    this.rebuildTimer = 0;
    let underlay = this.scene.getAreaUnderlay();

    this.dirtyChunks.forEach(key => {
      let tiles = this.getChunkTiles(key);
      ROAD_GROUPS.forEach(group => {
        let lines = [];
        let mask = this.boundaryMask;
        tiles.forEach(tile => tile.data.lines[group].forEach(line => {
          if (mask) mask.splitInside(line, lines);
          else lines.push(line);
        }));
        this.layers[group].setChunk(key, lines, this.project);
      });

      if (underlay) {
        let water = [], green = [], waterways = [];
        tiles.forEach(({data}) => {
          data.water.forEach(ring => water.push(ring));
          data.green.forEach(ring => green.push(ring));
          data.lines.waterways.forEach(line => waterways.push(line));
        });
        underlay.setChunk(key, {water, green, waterways});
      }
    });
    this.dirtyChunks.clear();
    this.renderer.renderFrame();
  }

  getChunkTiles(key) {
    let [cx, cy] = key.split(':').map(Number);
    let size = 1 << CHUNK_SHIFT;
    let tiles = [];
    for (let x = cx * size; x < (cx + 1) * size; ++x) {
      for (let y = cy * size; y < (cy + 1) * size; ++y) {
        let tile = this.store.tiles.get(TileStore.key({x, y, z: this.store.zoom}));
        if (tile) tiles.push(tile);
      }
    }
    return tiles;
  }

  dispose() {
    clearTimeout(this.rebuildTimer);
    clearTimeout(this.visibleTimer);
    this.store.off('tile', this.onTile);
    this.store.off('status', this.onStatus);
    this.renderer.off('transform', this.onTransform);
    window.removeEventListener('resize', this.onTransform);
  }
}

function intersect(a, b) {
  let result = {
    west: Math.max(a.west, b.west), east: Math.min(a.east, b.east),
    south: Math.max(a.south, b.south), north: Math.min(a.north, b.north)
  };
  return (result.west < result.east && result.south < result.north) ? result : null;
}

function chunkKey(tile) {
  return (tile.x >> CHUNK_SHIFT) + ':' + (tile.y >> CHUNK_SHIFT);
}

/**
 * (lon, lat) => {x, y} in scene coordinates. Same orientation as Grid.getProjector().
 */
export function makeProjector(projector) {
  let q = [0, 0];
  return function project(lon, lat) {
    q[0] = lon; q[1] = lat;
    let p = projector(q);
    return {x: p[0], y: -p[1]};
  };
}
