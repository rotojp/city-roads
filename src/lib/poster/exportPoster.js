import tinycolor from 'tinycolor2';
import {makeProjector} from '../TiledMapView.js';
import {renderToCanvas, renderToSVG} from './renderMap.js';
import {getSceneToClientTransform} from '../sceneTransform.js';
import {computeLayout, overlaySVG, getFontUsages} from './posterLayout.js';
import {getEmbeddedFontCSS, loadFont} from './fonts.js';

const WATERWAY_WIDTH = 1.5; // css pixels, same as on screen

/**
 * Prepares everything needed to render the poster at `longSide` pixels.
 *
 * @param {object} args
 * @param {object} args.scene - city-roads scene API
 * @param {TiledMapView} args.mapView
 * @param {RouteLayer} [args.route]
 * @param {object} args.poster - poster settings (see posterLayout.js)
 * @param {DOMRect} args.paperRect - the poster frame on screen, client (css) pixels
 * @param {number} args.longSide - size of the longer output side in pixels
 */
export function preparePoster({scene, mapView, route, poster, paperRect, longSide}) {
  let renderer = scene.getRenderer();
  let project = makeProjector(mapView.projector);
  let [a, b, c, d, e, f] = getSceneToClientTransform(renderer);

  let k = longSide / Math.max(paperRect.width, paperRect.height);
  let width = Math.round(paperRect.width * k);
  let height = Math.round(paperRect.height * k);
  let layout = computeLayout(poster, width, height);

  let toOutput = (lon, lat) => {
    let s = project(lon, lat);
    return [
      (a * s.x + c * s.y + e - paperRect.left) * k,
      (b * s.x + d * s.y + f - paperRect.top) * k
    ];
  };

  let map = layout.map;
  let bbox = mapView.clientRectToBBox(
    paperRect.left + map.x / k, paperRect.top + map.y / k,
    paperRect.left + (map.x + map.w) / k, paperRect.top + (map.y + map.h) / k
  );

  let dpr = renderer.getPixelRatio();
  let layers = mapView.getLayers().slice().reverse().map(layer => ({
    id: layer.id,
    color: tinycolor.fromRatio(layer.color).toRgbString(),
    width: (layer.cssWidth || layer.lineWidth / dpr) * k
  }));

  let underlay = scene.getAreaUnderlay();
  let areas = scene.areasVisible && underlay ? {
    water: underlay.colors.water,
    green: underlay.colors.green,
    waterwayWidth: WATERWAY_WIDTH * k
  } : null;

  return {
    layout,
    mapOptions: {
      tiles: mapView.store.getTilesInBBox(bbox),
      toOutput,
      width,
      height,
      window: map,
      scale: k,
      route: route && route.visible ? route : null,
      background: scene.background.toRgbString(),
      layers,
      areas,
      mask: mapView.boundaryMask
    }
  };
}

export function exportPosterPNG(args) {
  let {layout, mapOptions} = preparePoster(args);
  return loadPosterFonts(args.poster).then(fontCSS => {
    let canvas = renderToCanvas(mapOptions);
    let overlay = overlaySVG(layout, args.poster, fontCSS, 'png');
    return drawSVG(canvas, overlay).then(() => toBlob(canvas));
  });
}

export function exportPosterSVG(args) {
  let {layout, mapOptions} = preparePoster(args);
  return loadPosterFonts(args.poster).then(fontCSS => {
    let {width, height} = mapOptions;
    let svg = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<!-- Generator: https://github.com/anvaka/city-roads',
      'Map data © OpenStreetMap contributors (ODbL), tiles © OpenMapTiles via OpenFreeMap -->',
      `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      renderToSVG(mapOptions),
      overlaySVG(layout, args.poster, fontCSS, 'svg'),
      '</svg>'
    ].join('\n');
    return new Blob([svg], {type: 'image/svg+xml'});
  });
}

function loadPosterFonts(poster) {
  let usages = getFontUsages(poster);
  return Promise.all(usages.map(u => loadFont(u.id, u.weight))).then(() => getEmbeddedFontCSS(usages));
}

/**
 * Rasterizes SVG markup on top of the canvas. Fonts must be embedded in the
 * markup: SVG images cannot use the page's fonts.
 */
function drawSVG(canvas, markup) {
  return new Promise((resolve, reject) => {
    let blob = new Blob([markup], {type: 'image/svg+xml'});
    let url = URL.createObjectURL(blob);
    let image = new Image();
    image.onload = () => {
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve();
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not render poster text'));
    };
    image.src = url;
  });
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create image. Try a smaller size.')), 'image/png');
  });
}
