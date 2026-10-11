import {Element, WireCollection} from 'w-gl';
import tinycolor from 'tinycolor2';

/**
 * All roads of one class (e.g. 'major') as a w-gl scene element. Roads are
 * stored in chunks (blocks of tiles), so newly loaded tiles only rebuild their
 * own chunk.
 *
 * Exposes `id` and `color` (ratio color {r, g, b, a}) like a WireCollection, so the
 * Customize panel can list it and change its color.
 */
export default class RoadClassLayer extends Element {
  constructor(id, {color, width}) {
    super();
    this.id = id;
    this._color = toRatioColor(tinycolor(color).toRgb());
    this._width = width === 1 ? 1.001 : width; // see `set lineWidth()`
    this.chunks = new Map();
  }

  get color() {
    return this._color;
  }

  set color(ratioColor) {
    this._color = ratioColor;
    this.chunks.forEach(collection => collection.color = ratioColor);
    if (this.scene) this.scene.renderFrame();
  }

  /**
   * Sets color (any css color) and width in css pixels. Screen width is converted to
   * device pixels; `cssWidth` is kept so exports can scale it with the poster.
   */
  setStyle(cssColor, cssWidth, pixelRatio) {
    let c = tinycolor(cssColor).toRgb();
    this.color = toRatioColor(c);
    this.cssWidth = cssWidth;
    this.lineWidth = Math.max(1, cssWidth * pixelRatio);
  }

  get lineWidth() {
    return this._width;
  }

  set lineWidth(width) {
    // Never use exactly 1: w-gl draws width 1 with a different GL program, and
    // switching programs disposes the program that other collections share.
    if (width === 1) width = 1.001;
    this._width = width;
    this.chunks.forEach(collection => collection.setLineWidth(width));
    if (this.scene) this.scene.renderFrame();
  }

  /**
   * Replaces roads of the chunk.
   * @param {string} key
   * @param {Float64Array[]} lines - flat [lon, lat, ...] polylines
   * @param {function} project - (lon, lat) => {x, y} in scene coordinates
   */
  setChunk(key, lines, project) {
    let old = this.chunks.get(key);
    if (old) {
      // Note: we don't call old.dispose(), w-gl shares GL programs between collections.
      this.removeChild(old);
      this.chunks.delete(key);
    }

    let segmentCount = 0;
    lines.forEach(line => segmentCount += line.length / 2 - 1);
    if (segmentCount <= 0) return;

    let collection = new WireCollection(segmentCount, {
      width: this._width,
      allowColors: false,
      is3D: false
    });
    lines.forEach(line => {
      let last = project(line[0], line[1]);
      for (let i = 2; i < line.length; i += 2) {
        let next = project(line[i], line[i + 1]);
        collection.add({from: last, to: next});
        last = next;
      }
    });
    collection.color = this._color;
    collection.id = this.id;
    this.chunks.set(key, collection);
    this.appendChild(collection);
  }

  clear() {
    this.chunks.forEach(collection => this.removeChild(collection));
    this.chunks.clear();
  }
}

function toRatioColor(c) {
  return {r: c.r / 0xff, g: c.g / 0xff, b: c.b / 0xff, a: c.a};
}
