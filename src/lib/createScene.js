import bus from './bus';
import GridLayer from './GridLayer';
import Query from './Query';
import LoadOptions from './LoadOptions.js';
import config from '../config.js';
import tinycolor from 'tinycolor2';
import eventify from 'ngraph.events';
import {toSVG, toPNG} from './saveFile.js';
import * as wgl from 'w-gl';
import AreaUnderlay from './AreaUnderlay.js';

/**
 * This file is responsible for rendering of the grid. It uses my silly 2d webgl
 * renderer which is not very well documented, neither popular, yet it is very
 * fast.
 */

export default function createScene(canvas) {
  let scene = wgl.createScene(canvas);
  let lastLineColor = config.getDefaultLineColor();
  scene.on('transform', triggerTransform);
  scene.on('append-child', triggerAdd);
  scene.on('remove-child', triggerRemove);

  scene.setClearColor(0xf7/0xff, 0xf2/0xff, 0xe8/0xff, 1.0);
  let camera = scene.getCameraController();
  if (camera.setMoveSpeed) {
    camera.setMoveSpeed(200);
    camera.setRotationSpeed(Math.PI/500);
  }

  let gl = scene.getGL();
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  patchInstancedArrays(gl);

  let slowDownZoom = false;
  let layers = [];
  let backgroundColor = config.getBackgroundColor();
  let areaUnderlay = null;

  listenToEvents();

  let sceneAPI = {
    /**
     * Requests the scene to perform immediate re-render
     */
    render() {
      scene.renderFrame(true);
    },

    /**
     * Removes all layers in the scene
     */
    clear() {
      layers.forEach(layer => layer.destroy());
      layers = [];
      scene.clear();
    },

    /**
     * Returns all layers in the scene.
     */
    queryLayerAll,

    /**
     * Same as `queryLayerAll(filter)` but returns the first found
     * match. If no matches found - returns undefined.
     */
    queryLayer,
    
    getRenderer() {
      return scene;
    },

    getWGL() {
      // Let the plugins use the same version of wgl library
      return wgl;
    },

    version() {
      return '0.0.2'; // here be dragons
    },

    /**
     * Destroys the scene, cleans up all resources.
     */
    dispose() {
      if (areaUnderlay) areaUnderlay.dispose();
      areaUnderlay = null;
      scene.clear();
      scene.dispose();
      sceneAPI.fire('dispose', sceneAPI);
      unsubscribeFromEvents();
    },

    /**
     * Uniformly sets color to all loaded grid layer.
     */
    set lineColor(color) {
      layers.forEach(layer => {
        layer.color = color;
      });
      lastLineColor = tinycolor(color);
      bus.fire('line-color', lastLineColor);
      sceneAPI.fire('line-color', lastLineColor);
    },

    get lineColor() {
      let firstLayer = queryLayer();
      return (firstLayer && firstLayer.color) || lastLineColor;
    },

    /**
     * Sets the background color of the scene
     */
    set background(rawColor) {
      backgroundColor = tinycolor(rawColor);
      if (areaUnderlay) areaUnderlay.setColor('background', backgroundColor);
      updateClearColor();
      scene.renderFrame();
      bus.fire('background-color', backgroundColor);
      sceneAPI.fire('background-color', backgroundColor);
    },

    get background() {
      return backgroundColor;
    },

    /**
     * Creates a canvas for water and green areas (parks, forests). They are
     * rendered below the roads and can be toggled with `areasVisible`.
     * `projector` is the d3 projection used for road layers.
     */
    createAreaUnderlay(projector) {
      if (areaUnderlay) areaUnderlay.dispose();
      areaUnderlay = new AreaUnderlay(scene, projector, {background: backgroundColor.toRgbString()});
      return areaUnderlay;
    },

    hasAreas() {
      return !!areaUnderlay;
    },

    set areasVisible(isVisible) {
      if (!areaUnderlay) return;
      areaUnderlay.setVisible(isVisible);
      updateClearColor();
      scene.renderFrame();
    },

    get areasVisible() {
      return !!(areaUnderlay && areaUnderlay.visible);
    },

    /**
     * Sets color of 'water' or 'green' areas.
     */
    setAreaColor(name, color) {
      if (areaUnderlay) areaUnderlay.setColor(name, color);
    },

    getAreaColor(name) {
      return areaUnderlay && areaUnderlay.colors[name];
    },

    getAreaUnderlay() {
      return areaUnderlay;
    },

    add,

    /**
     * Executes an OverPass query and loads results into scene.
     */
    load,

    saveToPNG,

    saveToSVG
  };

  return eventify(sceneAPI); // Public bit is over. Below are just implementation details.

  /**
   * Experimental API. Can be changed/removed at any point.
   */
  function load(queryFilter, rawOptions) {
    let options = LoadOptions.parse(sceneAPI, queryFilter, rawOptions);

    let layer = new GridLayer();
    layer.id = options.place;

    // TODO: Cancellation logic?
    Query.runFromOptions(options).then(grid => {
      grid.setProjector(options.projector);
      layer.setGrid(grid);
    }).catch(e => {
      console.error(`Could not execute:
  ${queryFilter}
  The error was:`);
      console.error(e);
      layer.destroy();
    });
  
    add(layer);
    return layer;
  }

  function queryLayerAll(filter) {
    if (!filter) return layers;

    return layers.filter(layer => {
      return layer.id === filter;
    });
  }

  function queryLayer(filter) {
    let result = queryLayerAll(filter);
    if (result) return result[0];
  }

  function add(gridLayer) {
    if (layers.indexOf(gridLayer) > -1) return; // O(n).

    gridLayer.bindToScene(scene);
    layers.push(gridLayer);

    if (layers.length === 1) {
      // TODO: Should I do this for other layers?
      let viewBox = gridLayer.getViewBox();
      if (viewBox) {
        scene.setViewBox(viewBox);
        if (areaUnderlay) areaUnderlay.requestDraw();
      }
    }
  }

  function saveToPNG(name) {
    return toPNG(sceneAPI, {name});
  }

  function saveToSVG(name, options) {
    return toSVG(sceneAPI, Object.assign({}, {name}, options));
  }

  function triggerTransform(t) {
    if (areaUnderlay) areaUnderlay.requestDraw();
    bus.fire('scene-transform');
  }

  function updateClearColor() {
    if (areaUnderlay && areaUnderlay.visible) {
      // the underlay paints the background; WebGL canvas must be transparent.
      scene.setClearColor(0, 0, 0, 0);
    } else {
      let c = backgroundColor.toRgb();
      scene.setClearColor(c.r/0xff, c.g/0xff, c.b/0xff, c.a);
    }
  }

  function triggerAdd(e) {
    sceneAPI.fire('layer-added', e);
  }

  function triggerRemove(e) {
    sceneAPI.fire('layer-removed', e);
  }

  function listenToEvents() {
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
  }

  function unsubscribeFromEvents() {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
  }

  function onKeyDown(e) {
    if (e.shiftKey) {
      slowDownZoom = true;
      if (camera.setSpeed) camera.setSpeed(0.1);
    } 
  }

  function onKeyUp(e) {
    if (!e.shiftKey && slowDownZoom) {
      if (camera.setSpeed) camera.setSpeed(1);
      slowDownZoom = false;
    }
  }
}
/**
 * w-gl 0.21 thick lines (any `lineWidth` other than 1) call
 * `vertexAttribDivisorANGLE(locations.attributes.aFromColor, 1)` even when
 * per-vertex colors are disabled. The location is `undefined` then, WebGL
 * converts it to attribute 0, which turns the quad positions into per-instance
 * data - and nothing is drawn. Ignore calls with missing attribute locations.
 */
function patchInstancedArrays(gl) {
  let ext = gl.getExtension('ANGLE_instanced_arrays');
  if (!ext || ext.vertexAttribDivisorANGLE.patchedByCityRoads) return;

  let original = ext.vertexAttribDivisorANGLE.bind(ext);
  let patched = function(index, divisor) {
    if (index === undefined || index === null || index < 0) return;
    original(index, divisor);
  };
  patched.patchedByCityRoads = true;
  ext.vertexAttribDivisorANGLE = patched;
}
