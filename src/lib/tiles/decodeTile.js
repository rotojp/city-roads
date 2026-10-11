import Pbf from 'pbf';
import {VectorTile} from '@mapbox/vector-tile';
import {tileXToLon, tileYToLat} from './tileMath.js';
import {clipPolyline, clipRing} from './clip.js';
import {ROAD_GROUPS, getTransportationGroup, isWaterway, isWaterArea, isGreenArea} from './featureClasses.js';

/**
 * Decodes a single OpenMapTiles vector tile into the groups we render. All
 * coordinates are flat Float64Arrays of [lon, lat, lon, lat, ...].
 *
 * @returns {{
 *   lines: Object<string, Float64Array[]>, // road groups, 'rail' and 'waterways'
 *   water: Float64Array[],                  // rings
 *   green: Float64Array[],                  // rings
 *   pointCount: number
 * }}
 */
export default function decodeTile(tile, buffer) {
  let lines = {rail: [], waterways: []};
  ROAD_GROUPS.forEach(group => lines[group] = []);
  let result = {lines, water: [], green: [], pointCount: 0};
  if (!buffer) return result;

  let vt = new VectorTile(new Pbf(new Uint8Array(buffer)));
  let toLonLat = makeTileProjector(tile);

  forEachFeature(vt.layers.transportation, 2, (feature, extent) => {
    let group = getTransportationGroup(feature.properties);
    if (group) addLines(feature, extent, lines[group]);
  });
  forEachFeature(vt.layers.waterway, 2, (feature, extent) => {
    if (isWaterway(feature.properties)) addLines(feature, extent, lines.waterways);
  });
  forEachFeature(vt.layers.water, 3, (feature, extent) => {
    if (isWaterArea(feature.properties)) addRings(feature, extent, result.water);
  });
  ['park', 'landcover', 'landuse'].forEach(layerName => {
    forEachFeature(vt.layers[layerName], 3, (feature, extent) => {
      if (isGreenArea(layerName, feature.properties)) addRings(feature, extent, result.green);
    });
  });

  return result;

  function addLines(feature, extent, target) {
    let pieces = [];
    feature.loadGeometry().forEach(line => clipPolyline(line, 0, extent, pieces));
    pieces.forEach(piece => {
      target.push(toLonLat(piece, extent));
      result.pointCount += piece.length / 2;
    });
  }

  function addRings(feature, extent, target) {
    feature.loadGeometry().forEach(ring => {
      let clipped = clipRing(ring, 0, extent);
      if (clipped.length < 3) return;
      let flat = new Float64Array(clipped.length * 2);
      clipped.forEach((p, i) => { flat[2 * i] = p.x; flat[2 * i + 1] = p.y; });
      target.push(toLonLat(flat, extent));
    });
  }
}

function forEachFeature(layer, type, callback) {
  if (!layer) return;
  for (let i = 0; i < layer.length; ++i) {
    let feature = layer.feature(i);
    if (feature.type === type) callback(feature, layer.extent);
  }
}

/**
 * Returns a function that converts flat tile-pixel coordinates into flat [lon, lat, ...]
 */
function makeTileProjector(tile) {
  return function toLonLat(flat, extent) {
    let result = new Float64Array(flat.length);
    for (let i = 0; i < flat.length; i += 2) {
      result[i] = tileXToLon(tile.x + flat[i] / extent, tile.z);
      result[i + 1] = tileYToLat(tile.y + flat[i + 1] / extent, tile.z);
    }
    return result;
  };
}
