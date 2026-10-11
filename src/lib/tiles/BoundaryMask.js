/**
 * Fast "is this lon/lat inside the city boundary?" test. Rather than running
 * point-in-polygon for hundreds of thousands of road vertices, we rasterize the
 * boundary once onto a small canvas and look up pixels.
 */
const MASK_SIZE = 2048;

export default class BoundaryMask {
  /**
   * @param {object} geojson - Nominatim `geojson` (Polygon or MultiPolygon)
   * @returns {BoundaryMask|null} null when geometry is not an area
   */
  static fromGeoJSON(geojson) {
    if (!geojson) return null;
    let polygons;
    if (geojson.type === 'Polygon') polygons = [geojson.coordinates];
    else if (geojson.type === 'MultiPolygon') polygons = geojson.coordinates;
    else return null;

    return new BoundaryMask(polygons, geojson);
  }

  constructor(polygons, geojson) {
    this.polygons = polygons;
    this.geojson = geojson;
    let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
    polygons.forEach(poly => poly.forEach(ring => ring.forEach(([lon, lat]) => {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    })));

    // Equirectangular with longitude scaled by cos(lat), so pixels are roughly square.
    this.kx = Math.cos((south + north) / 2 * Math.PI / 180);
    let w = (east - west) * this.kx, h = north - south;
    this.scale = (MASK_SIZE - 2) / Math.max(w, h);
    this.width = Math.max(1, Math.ceil(w * this.scale) + 2);
    this.height = Math.max(1, Math.ceil(h * this.scale) + 2);
    this.west = west;
    this.north = north;
    this.bbox = {west, east, south, north};

    let canvas = document.createElement('canvas');
    canvas.width = this.width;
    canvas.height = this.height;
    let ctx = canvas.getContext('2d');
    ctx.beginPath();
    polygons.forEach(poly => poly.forEach(ring => {
      ring.forEach(([lon, lat], i) => {
        let x = this.toX(lon), y = this.toY(lat);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }));
    ctx.fillStyle = '#000';
    ctx.fill('evenodd');
    // A one-pixel stroke makes sure roads exactly on the boundary are kept.
    ctx.lineWidth = 2;
    ctx.stroke();

    let data = ctx.getImageData(0, 0, this.width, this.height).data;
    this.alpha = new Uint8Array(this.width * this.height);
    for (let i = 0; i < this.alpha.length; ++i) this.alpha[i] = data[i * 4 + 3];
  }

  toX(lon) {
    return (lon - this.west) * this.kx * this.scale + 1;
  }

  toY(lat) {
    return (this.north - lat) * this.scale + 1;
  }

  contains(lon, lat) {
    let x = Math.floor(this.toX(lon)), y = Math.floor(this.toY(lat));
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.alpha[y * this.width + x] > 0;
  }

  /**
   * Splits a flat [lon, lat, ...] polyline into pieces where every segment has
   * at least one end inside the boundary (roughly what Overpass `way(area)` does),
   * and pushes them into `target`.
   */
  splitInside(flat, target) {
    let count = flat.length / 2;
    let inside = new Uint8Array(count);
    for (let i = 0; i < count; ++i) inside[i] = this.contains(flat[2 * i], flat[2 * i + 1]) ? 1 : 0;

    let start = -1;
    for (let i = 0; i < count - 1; ++i) {
      let keep = inside[i] || inside[i + 1];
      if (keep && start < 0) start = i;
      if (!keep && start >= 0) {
        target.push(flat.slice(2 * start, 2 * (i + 1)));
        start = -1;
      }
    }
    if (start >= 0) target.push(start === 0 ? flat : flat.slice(2 * start));
  }
}
