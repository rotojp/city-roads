import tinycolor from 'tinycolor2';
import {getSceneToClientTransform} from './sceneTransform.js';

/**
 * Renders water and green areas with Canvas2D on a canvas *below* the WebGL
 * canvas. The WebGL canvas becomes transparent while areas are shown, so roads
 * are drawn on top. The underlay follows the WebGL camera via an affine transform
 * derived from `getClientCoordinate()`.
 *
 * Paths are built once per chunk in scene coordinates; every frame we only change
 * the transform.
 */
export const DEFAULT_AREA_COLORS = {
  water: '#A9C7DD',
  green: '#C9D9B4'
};

export default class AreaUnderlay {
  constructor(wglScene, projector, colors) {
    this.wglScene = wglScene;
    this.colors = Object.assign({background: '#F7F2E8'}, DEFAULT_AREA_COLORS, colors);
    this.visible = false;
    this.frame = 0;
    this.chunks = new Map(); // key -> {water, green, waterways} Path2D
    this.clip = null; // Path2D of the city boundary, when clipping is enabled
    this.project = makeProjector(projector);

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'underlay';
    Object.assign(this.canvas.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', visibility: 'hidden'
    });
    let host = wglScene.getDrawContext().canvas;
    host.parentNode.insertBefore(this.canvas, host);
    this.ctx = this.canvas.getContext('2d');

    this.requestDraw = this.requestDraw.bind(this);
    window.addEventListener('resize', this.requestDraw, true);
  }

  /**
   * @param {string} key - chunk key
   * @param {{water: Float64Array[], green: Float64Array[], waterways: Float64Array[]}} data
   *  flat [lon, lat, ...] rings and polylines
   */
  setChunk(key, {water, green, waterways}) {
    this.chunks.set(key, {
      water: buildPath(water, this.project, true),
      green: buildPath(green, this.project, true),
      waterways: buildPath(waterways, this.project, false)
    });
    this.requestDraw();
  }

  /**
   * @param {BoundaryMask|null} mask
   */
  setClip(mask) {
    this.clip = null;
    if (mask) {
      let path = new Path2D();
      mask.polygons.forEach(poly => poly.forEach(ring => {
        ring.forEach(([lon, lat], i) => {
          let [x, y] = this.project(lon, lat);
          if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
        });
        path.closePath();
      }));
      this.clip = path;
    }
    this.requestDraw();
  }

  setVisible(isVisible) {
    this.visible = isVisible;
    this.canvas.style.visibility = isVisible ? 'visible' : 'hidden';
    if (isVisible) this.draw();
  }

  setColor(name, color) {
    this.colors[name] = tinycolor(color).toRgbString();
    this.requestDraw();
  }

  requestDraw() {
    if (!this.visible || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /**
   * Returns [a, b, c, d, e, f] that maps scene coordinates to canvas pixels.
   */
  getTransform() {
    let dpr = this.wglScene.getPixelRatio();
    return getSceneToClientTransform(this.wglScene).map(x => x * dpr);
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
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, width, height);
    if (!this.visible) return;

    let t = this.getTransform();
    let scale = Math.hypot(t[0], t[1]);
    ctx.setTransform(t[0], t[1], t[2], t[3], t[4], t[5]);
    this.drawAreas(ctx, 1.5 * dpr / scale);
  }

  /**
   * Draws areas in scene coordinates. Caller sets the transform.
   */
  drawAreas(ctx, waterwayWidth) {
    ctx.save();
    if (this.clip) ctx.clip(this.clip, 'evenodd');
    ctx.fillStyle = this.colors.green;
    this.chunks.forEach(chunk => chunk.green && ctx.fill(chunk.green));
    ctx.fillStyle = this.colors.water;
    this.chunks.forEach(chunk => chunk.water && ctx.fill(chunk.water));
    ctx.strokeStyle = this.colors.water;
    ctx.lineWidth = waterwayWidth;
    ctx.lineJoin = 'round';
    this.chunks.forEach(chunk => chunk.waterways && ctx.stroke(chunk.waterways));
    ctx.restore();
  }

  dispose() {
    if (this.frame) cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.requestDraw, true);
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }
}

function makeProjector(projector) {
  let q = [0, 0];
  return function (lon, lat) {
    q[0] = lon; q[1] = lat;
    let p = projector(q);
    return [p[0], -p[1]]; // same orientation as Grid.getProjector()
  };
}

function buildPath(shapes, project, close) {
  if (!shapes || !shapes.length) return null;
  let path = new Path2D();
  shapes.forEach(shape => {
    for (let i = 0; i < shape.length; i += 2) {
      let [x, y] = project(shape[i], shape[i + 1]);
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    if (close) path.closePath();
  });
  return path;
}
