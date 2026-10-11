import {getMetricValues, rampColor} from './routeMetrics.js';
import {getSceneToClientTransform} from '../sceneTransform.js';

/**
 * Draws a GPS route on a canvas above the map. The same drawing code is used
 * for the screen and for poster export (canvas and SVG), so they always match.
 *
 * Widths are in css pixels; renderers pass a scale to convert them to output pixels.
 */
const COLOR_BINS = 48;

export const DEFAULT_ROUTE_STYLE = {
  color: '#E4002B',
  width: 3,
  metric: 'none',
  outline: true,
  outlineColor: '#FFFFFF',
  markers: true,
  smoothing: 0 // 0 - raw, otherwise window radius in points
};

export default class RouteLayer {
  constructor(wglScene, projector, route, style) {
    this.wglScene = wglScene;
    this.projector = projector;
    this.route = route;
    this.style = Object.assign({}, DEFAULT_ROUTE_STYLE, style);
    this.frame = 0;
    this.visible = true;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'route-overlay';
    Object.assign(this.canvas.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none'
    });
    let host = wglScene.getDrawContext().canvas;
    host.parentNode.insertBefore(this.canvas, host.nextSibling);
    this.ctx = this.canvas.getContext('2d');

    this.requestDraw = this.requestDraw.bind(this);
    window.addEventListener('resize', this.requestDraw, true);
    wglScene.on('transform', this.requestDraw);
    this.update();
  }

  setStyle(changes) {
    Object.assign(this.style, changes);
    this.update();
  }

  /**
   * Recomputes smoothed geometry and colored pieces after a style change.
   */
  update() {
    let points = this.route.points;
    this.coordinates = smoothCoordinates(points, this.style.smoothing);
    this.legend = null;

    let pieces = [];
    let metric = this.style.metric !== 'none' && getMetricValues(this.route, this.style.metric);
    if (!metric) {
      pieces.push({color: this.style.color, start: 0, end: points.length - 1});
    } else {
      this.legend = {metric: this.style.metric, min: metric.min, max: metric.max};
      // Group consecutive segments with the same (binned) color into one piece.
      let binOf = i => {
        let a = metric.values[i], b = metric.values[i + 1];
        let v = Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : (Number.isFinite(a) ? a : b);
        if (!Number.isFinite(v)) return -1;
        let t = (v - metric.min) / (metric.max - metric.min);
        return Math.max(0, Math.min(COLOR_BINS - 1, Math.floor(t * COLOR_BINS)));
      };
      let start = 0, bin = binOf(0);
      for (let i = 1; i < points.length - 1; ++i) {
        let next = binOf(i);
        if (next === bin) continue;
        pieces.push({color: bin < 0 ? this.style.color : rampColor((bin + 0.5) / COLOR_BINS), start, end: i});
        start = i;
        bin = next;
      }
      pieces.push({color: bin < 0 ? this.style.color : rampColor((bin + 0.5) / COLOR_BINS), start, end: points.length - 1});
    }
    this.pieces = pieces;
    this.requestDraw();
  }

  /**
   * {south, west, north, east} of the route.
   */
  getBBox() {
    let bbox = {south: Infinity, west: Infinity, north: -Infinity, east: -Infinity};
    this.route.points.forEach(p => {
      bbox.south = Math.min(bbox.south, p.lat); bbox.north = Math.max(bbox.north, p.lat);
      bbox.west = Math.min(bbox.west, p.lon); bbox.east = Math.max(bbox.east, p.lon);
    });
    return bbox;
  }

  setVisible(isVisible) {
    this.visible = isVisible;
    this.canvas.style.visibility = isVisible ? 'visible' : 'hidden';
    this.requestDraw();
  }

  requestDraw() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  draw() {
    let {canvas, ctx} = this;
    let dpr = this.wglScene.getPixelRatio();
    let width = Math.round(canvas.offsetWidth * dpr), height = Math.round(canvas.offsetHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!this.visible) return;

    let [a, b, c, d, e, f] = getSceneToClientTransform(this.wglScene);
    let q = [0, 0];
    let toCanvas = (lon, lat) => {
      q[0] = lon; q[1] = lat;
      let p = this.projector(q);
      let x = p[0], y = -p[1];
      return [(a * x + c * y + e) * dpr, (b * x + d * y + f) * dpr];
    };
    this.renderToCanvas(ctx, toCanvas, dpr);
  }

  /**
   * Draws the route into a 2d context.
   * @param {function} toOutput - (lon, lat) => [x, y] in output pixels
   * @param {number} scale - output pixels per css pixel
   */
  renderToCanvas(ctx, toOutput, scale) {
    let projected = this.projectAll(toOutput);
    let {style} = this;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (style.outline) {
      ctx.strokeStyle = style.outlineColor;
      ctx.lineWidth = (style.width + 3) * scale;
      ctx.beginPath();
      addPolyline(ctx, projected, 0, projected.length / 2 - 1);
      ctx.stroke();
    }

    ctx.lineWidth = style.width * scale;
    this.pieces.forEach(piece => {
      ctx.strokeStyle = piece.color;
      ctx.beginPath();
      addPolyline(ctx, projected, piece.start, piece.end);
      ctx.stroke();
    });

    if (style.markers) {
      let last = projected.length / 2 - 1;
      drawMarker(ctx, projected[0], projected[1], scale, style, false);
      drawMarker(ctx, projected[2 * last], projected[2 * last + 1], scale, style, true);
    }
    ctx.restore();
  }

  /**
   * Returns SVG markup of the route.
   */
  renderToSVG(toOutput, scale) {
    let projected = this.projectAll(toOutput);
    let {style} = this;
    let out = ['<g id="route" fill="none" stroke-linecap="round" stroke-linejoin="round">'];
    if (style.outline) {
      out.push(`<path stroke="${style.outlineColor}" stroke-width="${round((style.width + 3) * scale)}" d="${svgPolyline(projected, 0, projected.length / 2 - 1)}"/>`);
    }
    this.pieces.forEach(piece => {
      out.push(`<path stroke="${piece.color}" stroke-width="${round(style.width * scale)}" d="${svgPolyline(projected, piece.start, piece.end)}"/>`);
    });
    if (style.markers) {
      let last = projected.length / 2 - 1;
      out.push(svgMarker(projected[0], projected[1], scale, style, false));
      out.push(svgMarker(projected[2 * last], projected[2 * last + 1], scale, style, true));
    }
    out.push('</g>');
    return out.join('\n');
  }

  projectAll(toOutput) {
    let coordinates = this.coordinates;
    let projected = new Float64Array(coordinates.length);
    for (let i = 0; i < coordinates.length; i += 2) {
      let [x, y] = toOutput(coordinates[i], coordinates[i + 1]);
      projected[i] = x;
      projected[i + 1] = y;
    }
    return projected;
  }

  dispose() {
    if (this.frame) cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.requestDraw, true);
    this.wglScene.off('transform', this.requestDraw);
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}

/**
 * Moving average of positions. GPS tracks wobble a few meters around the road;
 * smoothing gives cleaner lines on a poster.
 */
function smoothCoordinates(points, radius) {
  let result = new Float64Array(points.length * 2);
  for (let i = 0; i < points.length; ++i) {
    if (!radius) {
      result[2 * i] = points[i].lon;
      result[2 * i + 1] = points[i].lat;
      continue;
    }
    // keep the exact start and finish
    let r = Math.min(radius, i, points.length - 1 - i);
    let lon = 0, lat = 0;
    for (let j = i - r; j <= i + r; ++j) {
      lon += points[j].lon;
      lat += points[j].lat;
    }
    result[2 * i] = lon / (2 * r + 1);
    result[2 * i + 1] = lat / (2 * r + 1);
  }
  return result;
}

function addPolyline(ctx, projected, start, end) {
  ctx.moveTo(projected[2 * start], projected[2 * start + 1]);
  for (let i = start + 1; i <= end; ++i) ctx.lineTo(projected[2 * i], projected[2 * i + 1]);
}

function svgPolyline(projected, start, end) {
  let d = ['M' + round(projected[2 * start]) + ' ' + round(projected[2 * start + 1])];
  for (let i = start + 1; i <= end; ++i) d.push('L' + round(projected[2 * i]) + ' ' + round(projected[2 * i + 1]));
  return d.join('');
}

/**
 * Start: ring. Finish: filled dot with a ring.
 */
function drawMarker(ctx, x, y, scale, style, isFinish) {
  let r = (style.width + 3) * scale;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = isFinish ? markerColor(style) : style.outlineColor;
  ctx.fill();
  ctx.lineWidth = Math.max(1, style.width * 0.6) * scale;
  ctx.strokeStyle = isFinish ? style.outlineColor : markerColor(style);
  ctx.stroke();
}

function svgMarker(x, y, scale, style, isFinish) {
  let r = round((style.width + 3) * scale);
  let fill = isFinish ? markerColor(style) : style.outlineColor;
  let stroke = isFinish ? style.outlineColor : markerColor(style);
  return `<circle cx="${round(x)}" cy="${round(y)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${round(Math.max(1, style.width * 0.6) * scale)}"/>`;
}

function markerColor(style) {
  return style.metric === 'none' ? style.color : '#222222';
}

function round(x) {
  return Math.round(x * 10) / 10;
}
