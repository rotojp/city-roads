/**
 * Web-mercator "slippy map" tile math. See
 * https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
 */

export function lonToTileX(lon, z) {
  return (lon + 180) / 360 * (1 << z);
}

export function latToTileY(lat, z) {
  let rad = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * (1 << z);
}

export function tileXToLon(x, z) {
  return x / (1 << z) * 360 - 180;
}

export function tileYToLat(y, z) {
  let n = Math.PI - 2 * Math.PI * y / (1 << z);
  return 180 / Math.PI * Math.atan(Math.sinh(n));
}

/**
 * Returns list of {x, y, z} tiles that cover the bounding box.
 * bbox is {south, west, north, east} in degrees.
 */
export function tilesForBBox(bbox, z) {
  let minX = Math.floor(lonToTileX(bbox.west, z));
  let maxX = Math.floor(lonToTileX(bbox.east, z));
  let minY = Math.floor(latToTileY(bbox.north, z));
  let maxY = Math.floor(latToTileY(bbox.south, z));
  let max = (1 << z) - 1;
  minX = clamp(minX, 0, max); maxX = clamp(maxX, 0, max);
  minY = clamp(minY, 0, max); maxY = clamp(maxY, 0, max);

  let tiles = [];
  for (let x = minX; x <= maxX; ++x) {
    for (let y = minY; y <= maxY; ++y) {
      tiles.push({x, y, z});
    }
  }

  // Load from the center outwards, so that partial results look sensible.
  let cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  tiles.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
  return tiles;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
