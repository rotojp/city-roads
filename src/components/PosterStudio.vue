<template>
  <poster-frame ref='frame' :poster='posterView' :inset-left='showSettings ? 458 : 0' @layout='onPosterLayout'></poster-frame>
  <div class='poster-studio'>
    <div class='controls'>
      <a href="#" class='print-button' @click.prevent='toggleSettings'>{{showSettings ? 'Hide settings' : 'Customize...'}}</a>
      <a href="#" class='try-another' @click.prevent='$emit("start-over")'>Try another city</a>
    </div>
    <div v-if='showSettings' class='print-window studio-panel'>
      <details open>
        <summary>Style</summary>
        <div class='style-grid'>
          <a href='#' v-for='s in styles' :key='s.id' class='style-swatch' :class='{active: s.id === styleId}'
             @click.prevent='applyStyle(s.id)' :title='s.label'>
            <span class='swatch' :style='{background: s.background}'>
              <span class='swatch-road' :style='{background: s.roads.major.color}'></span>
              <span class='swatch-road minor' :style='{background: s.roads.minor.color}'></span>
              <span class='swatch-water' v-if='s.areas' :style='{background: s.water}'></span>
            </span>
            <span class='swatch-label'>{{s.label}}</span>
          </a>
        </div>
        <div class='row'>
          <div class='col'>Colors</div>
          <div class='col colors c-2'>
            <div v-for='entry in colorEntries' :key='entry.key' class='color-container'>
              <color-picker :modelValue='toRgb(palette[entry.key])' @change='setColor(entry.key, $event)'></color-picker>
              <div class='color-label'>{{entry.label}}</div>
            </div>
          </div>
        </div>
        <div class='row'>
          <div class='col'>Line thickness</div>
          <div class='col c-2'>
            <input type='range' min='0.4' max='3' step='0.1' v-model.number='widthScale' @input='applyPalette'>
            <span class='value'>{{widthScale.toFixed(1)}}×</span>
          </div>
        </div>
      </details>

      <details open>
        <summary>Poster</summary>
        <div class='row'>
          <div class='col'>Format</div>
          <div class='col c-2'>
            <select v-model='poster.format' @change='onPosterShapeChange'>
              <option v-for='f in paperFormats' :key='f.id' :value='f.id'>{{f.label}}</option>
            </select>
          </div>
        </div>
        <div class='row'>
          <div class='col'>Map shape</div>
          <div class='col c-2'>
            <select v-model='poster.shape' @change='onPosterShapeChange'>
              <option value='rect'>Rectangle</option>
              <option value='circle'>Circle</option>
            </select>
          </div>
        </div>
        <div class='row'>
          <div class='col'>Layout</div>
          <div class='col c-2'>
            <select v-model='poster.layout' @change='onPosterShapeChange'>
              <option v-for='l in layouts' :key='l.id' :value='l.id'>{{l.label}}</option>
            </select>
          </div>
        </div>
        <div class='row'>
          <div class='col'>Border</div>
          <div class='col c-2'>
            <select v-model='poster.border' @change='saveSettings'>
              <option v-for='b in borders' :key='b.id' :value='b.id'>{{b.label}}</option>
            </select>
          </div>
        </div>
        <div class='row'>
          <div class='col'></div>
          <div class='col c-2'><a href='#' @click.prevent='fitPlace'>Fit {{route ? 'route' : 'city'}} into the frame</a></div>
        </div>
      </details>

      <details open v-if='poster.layout !== "none"'>
        <summary>Text</summary>
        <div class='row'><div class='col'>Above title</div><div class='col c-2'><input type='text' v-model='poster.tagline' placeholder='e.g. MARATHON or CITY MAP'></div></div>
        <div class='row'><div class='col'>Title</div><div class='col c-2'><input type='text' v-model='poster.title'></div></div>
        <div class='row'><div class='col'>Subtitle</div><div class='col c-2'><input type='text' v-model='poster.subtitle'></div></div>
        <div class='row'><div class='col'>Line 1</div><div class='col c-2'><input type='text' v-model='poster.note' placeholder='e.g. a date'></div></div>
        <div class='row'><div class='col'>Line 2</div><div class='col c-2'><input type='text' v-model='poster.note2' placeholder='e.g. time and name'></div></div>
        <div class='row'>
          <div class='col'>Coordinates</div>
          <div class='col c-2'>
            <label class='toggle'><input type='checkbox' v-model='poster.showCoordinates'> show</label>
            <select v-model='poster.coordinateFormat'>
              <option value='decimal'>52.3731° N / 4.8925° E</option>
              <option value='dms'>52°22′23″ N 4°53′33″ E</option>
            </select>
          </div>
        </div>
        <div class='row'>
          <div class='col'>Title font</div>
          <div class='col c-2'>
            <select v-model='poster.titleFont' @change='saveSettings'>
              <option v-for='f in fonts' :key='f.id' :value='f.id'>{{f.label}}</option>
            </select>
            <select v-model.number='poster.titleWeight' @change='saveSettings'>
              <option v-for='w in fontWeights' :key='w.value' :value='w.value'>{{w.label}}</option>
            </select>
          </div>
        </div>
        <div class='row'>
          <div class='col'>Text font</div>
          <div class='col c-2'>
            <select v-model='poster.bodyFont' @change='saveSettings'>
              <option v-for='f in fonts' :key='f.id' :value='f.id'>{{f.label}}</option>
            </select>
            <select v-model.number='poster.bodyWeight' @change='saveSettings'>
              <option v-for='w in fontWeights' :key='w.value' :value='w.value'>{{w.label}}</option>
            </select>
          </div>
        </div>
        <div class='row'>
          <div class='col'>Letter spacing</div>
          <div class='col c-2'>
            <input type='range' min='0' max='0.8' step='0.05' v-model.number='poster.letterSpacing'>
            <span class='value'>{{poster.letterSpacing.toFixed(2)}}</span>
          </div>
        </div>
        <div class='row'>
          <div class='col'></div>
          <div class='col c-2 checks'>
            <label class='toggle'><input type='checkbox' v-model='poster.uppercase'> capitals</label>
            <label class='toggle'><input type='checkbox' v-model='poster.titleRules'> lines beside title</label>
            <label class='toggle'><input type='checkbox' v-model='poster.attribution'> © OpenStreetMap</label>
          </div>
        </div>
      </details>

      <details open>
        <summary>Route</summary>
        <div class='row'>
          <div class='col'>GPS file</div>
          <div class='col c-2'>
            <label class='file-button'>
              {{route ? 'Replace route...' : 'Add route (.gpx, .tcx, .fit)...'}}
              <input type='file' accept='.gpx,.tcx,.fit' @change='onRouteFile'>
            </label>
          </div>
        </div>
        <div class='route-error' v-if='routeError'>{{routeError}}</div>
        <template v-if='route'>
          <div class='row route-summary'>
            <div class='col'></div>
            <div class='col c-2'>{{routeSummary}}</div>
          </div>
          <div class='row'>
            <div class='col'>Color by</div>
            <div class='col c-2'>
              <select v-model='routeStyle.metric' @change='applyRouteStyle'>
                <option v-for='m in routeMetrics' :key='m.id' :value='m.id'>{{m.label}}</option>
              </select>
            </div>
          </div>
          <div class='row' v-if='routeLegend'>
            <div class='col'>Legend</div>
            <div class='col c-2 legend'>
              <span>{{routeLegend.min}}</span>
              <span class='legend-bar' :style='{background: legendGradient}'></span>
              <span>{{routeLegend.max}}</span>
            </div>
          </div>
          <div class='row' v-if='routeLegend && poster.layout !== "none"'>
            <div class='col'></div>
            <label class='col c-2 toggle'><input type='checkbox' v-model='poster.showLegend'> show legend on poster</label>
          </div>
          <div class='row'>
            <div class='col'>Width</div>
            <div class='col c-2'>
              <input type='range' min='1' max='10' step='0.5' v-model.number='routeStyle.width' @input='applyRouteStyle'>
              <span class='value'>{{routeStyle.width}}</span>
            </div>
          </div>
          <div class='row'>
            <div class='col'>Smoothing</div>
            <div class='col c-2'>
              <select v-model.number='routeStyle.smoothing' @change='applyRouteStyle'>
                <option :value='0'>None (raw GPS)</option>
                <option :value='3'>Light</option>
                <option :value='8'>Medium</option>
                <option :value='20'>Strong</option>
              </select>
            </div>
          </div>
          <div class='row'>
            <div class='col'></div>
            <div class='col c-2 checks'>
              <label class='toggle'><input type='checkbox' v-model='routeStyle.outline' @change='applyRouteStyle'> outline</label>
              <label class='toggle'><input type='checkbox' v-model='routeStyle.markers' @change='applyRouteStyle'> start / finish</label>
              <a href='#' @click.prevent='removeRoute'>remove route</a>
            </div>
          </div>
        </template>
      </details>

      <details>
        <summary>Map</summary>
        <div class='row'>
          <div class='col'>Water &amp; parks</div>
          <label class='col c-2 toggle'>
            <input type='checkbox' :checked='areasVisible' @change='setAreasVisible($event.target.checked)'>
            show water and green areas
          </label>
        </div>
        <div class='row' v-if='hasBoundary'>
          <div class='col'>Boundary</div>
          <label class='col c-2 toggle'>
            <input type='checkbox' :checked='clipToBoundary' @change='setClipToBoundary($event.target.checked)'>
            clip to city boundary
          </label>
        </div>
      </details>

      <details open>
        <summary>Export</summary>
        <div class='row'>
          <a href='#' @click.prevent='exportPoster("png")' class='col'>Poster image (.png)</a>
          <span class='col c-2'>
            <select v-model.number='exportSize'>
              <option v-for='size in exportSizes' :key='size.value' :value='size.value'>{{size.label}}</option>
            </select>
          </span>
        </div>
        <div class='row'>
          <a href='#' @click.prevent='exportPoster("svg")' class='col'>Poster vector (.svg)</a>
          <span class='col c-2'>Vector image with fonts embedded.</span>
        </div>
        <div class='preview-actions message' v-if='exportMessage'>
          <div class='loading-container'>
            <loading-icon v-if='exporting'></loading-icon>
            {{exportMessage}}
          </div>
        </div>
      </details>

      <details>
        <summary>About</summary>
        <p>Created by <a href='https://twitter.com/anvaka' target='_blank'>@anvaka</a>
          (<a href='https://github.com/anvaka/city-roads' target='_blank'>source code</a>).
          Map data © <a href='https://www.openstreetmap.org/copyright' target='_blank'>OpenStreetMap</a> contributors,
          tiles © OpenMapTiles via <a href='https://openfreemap.org/' target='_blank'>OpenFreeMap</a>.</p>
      </details>
    </div>
  </div>
  <div v-if='mapStatus' class='map-status'>{{mapStatus}}</div>
  <div class='license studio-license'><a href='https://openfreemap.org/' target="_blank">OpenFreeMap</a> © OpenMapTiles, data <a href='https://www.openstreetmap.org/copyright' target="_blank">© OpenStreetMap</a></div>
</template>

<script>
import tinycolor from 'tinycolor2';
import {geoMercator} from 'd3-geo';
import PosterFrame from './PosterFrame.vue';
import ColorPicker from './ColorPicker.vue';
import LoadingIcon from './LoadingIcon.vue';
import createScene from '../lib/createScene.js';
import TiledMapView from '../lib/TiledMapView.js';
import BoundaryMask from '../lib/tiles/BoundaryMask.js';
import RouteLayer, {DEFAULT_ROUTE_STYLE} from '../lib/routes/RouteLayer.js';
import parseRoute from '../lib/routes/parseRoute.js';
import {getAvailableMetrics, formatMetric, formatDuration, formatDistance, getRampStops} from '../lib/routes/routeMetrics.js';
import {MAP_STYLES, getStyle} from '../lib/poster/styles.js';
import {DEFAULT_POSTER, PAPER_FORMATS, LAYOUTS, BORDERS, formatCoordinates} from '../lib/poster/posterLayout.js';
import {FONTS, FONT_WEIGHTS} from '../lib/poster/fonts.js';
import {exportPosterPNG, exportPosterSVG} from '../lib/poster/exportPoster.js';
import {saveBlob, getCanvas} from '../lib/saveFile.js';
import {ROAD_GROUPS} from '../lib/tiles/featureClasses.js';
import appState from '../lib/appState.js';

const EXPORT_SIZES = [
  {value: 2400, label: '2400 px (screen, social media)'},
  {value: 4961, label: '4961 px (A3 at 300 dpi)'},
  {value: 7016, label: '7016 px (A2 at 300 dpi)'},
];

const COLOR_ENTRIES = [
  {key: 'major', label: 'main roads'},
  {key: 'medium', label: 'roads'},
  {key: 'minor', label: 'streets'},
  {key: 'paths', label: 'paths'},
  {key: 'background', label: 'land'},
  {key: 'water', label: 'water'},
  {key: 'green', label: 'parks'},
  {key: 'paper', label: 'paper'},
  {key: 'text', label: 'text'},
  {key: 'route', label: 'route'},
];

// Poster settings that are kept in the URL.
const PERSISTED = ['format', 'shape', 'layout', 'border', 'titleFont', 'titleWeight', 'bodyFont', 'bodyWeight'];

export default {
  name: 'PosterStudio',
  components: {PosterFrame, ColorPicker, LoadingIcon},
  props: {
    // {store, name, osmType, osmId, bbox, boundary, route}
    place: {type: Object, required: true}
  },
  emits: ['start-over'],
  data() {
    let poster = Object.assign({}, DEFAULT_POSTER);
    PERSISTED.forEach(key => {
      let value = appState.get('p_' + key);
      if (value !== undefined && value !== null && value !== '') poster[key] = typeof DEFAULT_POSTER[key] === 'number' ? Number(value) : value;
    });
    let nameParts = (this.place.name || '').split(',').map(x => x.trim()).filter(Boolean);
    poster.title = this.place.title || nameParts[0] || '';
    poster.subtitle = this.place.subtitle || (nameParts.length > 1 ? nameParts[nameParts.length - 1] : '');

    let styleId = appState.get('style') || (this.place.route ? 'route' : 'ink');
    return {
      showSettings: true,
      styles: MAP_STYLES,
      styleId,
      palette: {},
      widths: {},
      widthScale: 1,
      poster,
      coordinates: '',
      paperFormats: PAPER_FORMATS,
      layouts: LAYOUTS,
      borders: BORDERS,
      fonts: FONTS,
      fontWeights: FONT_WEIGHTS,
      colorEntries: COLOR_ENTRIES,
      areasVisible: appState.get('areas') === undefined ? null : appState.get('areas') == 1,
      clipToBoundary: appState.get('clip') == 1,
      hasBoundary: false,
      mapStatus: '',
      exportSizes: EXPORT_SIZES,
      exportSize: EXPORT_SIZES[1].value,
      exporting: false,
      exportMessage: '',
      route: null, // route info for the UI; the RouteLayer itself is not reactive
      routeError: '',
      routeStyle: Object.assign({}, DEFAULT_ROUTE_STYLE),
      routeLegend: null
    };
  },
  computed: {
    posterView() {
      return Object.assign({}, this.poster, {
        coordinates: this.coordinates,
        legend: this.routeLegend ? {
          label: this.routeLegend.label,
          min: this.routeLegend.min,
          max: this.routeLegend.max,
          colors: getRampStops()
        } : null
      });
    },
    routeMetrics() {
      return this.route ? this.route.metrics : [];
    },
    routeSummary() {
      if (!this.route) return '';
      let parts = [formatDistance(this.route.stats.distance)];
      if (this.route.stats.duration) parts.push(formatDuration(this.route.stats.duration));
      if (this.route.stats.elevationGain !== null) parts.push('↑ ' + Math.round(this.route.stats.elevationGain) + ' m');
      return parts.join(' · ');
    },
    legendGradient() {
      return 'linear-gradient(to right, ' + getRampStops().join(', ') + ')';
    }
  },
  mounted() {
    let canvas = getCanvas();
    canvas.style.visibility = 'visible';
    this.scene = createScene(canvas);
    window.scene = this.scene;

    let {bbox} = this.place;
    this.projector = geoMercator()
      .center([(bbox.west + bbox.east) / 2, (bbox.south + bbox.north) / 2])
      .scale(6371393); // Radius of Earth, same as Grid's default projector

    this.scene.createAreaUnderlay(this.projector);
    this.mapView = new TiledMapView(this.scene, this.place.store, {
      projector: this.projector,
      widths: {major: 2, medium: 2, minor: 2, paths: 2},
      color: '#000'
    });
    this.mapView.on('status', this.onMapStatus);

    this.boundaryMask = BoundaryMask.fromGeoJSON(this.place.boundary);
    this.hasBoundary = !!this.boundaryMask;
    if (this.hasBoundary && this.clipToBoundary) this.mapView.setBoundaryClip(this.boundaryMask);

    this.applyStyle(this.styleId, true);

    this.onTransform = debounce(this.updateCoordinates, 150);
    this.scene.getRenderer().on('transform', this.onTransform);

    if (this.place.route) this.setRoute(this.place.route);
    this.$nextTick(() => this.fitPlace());
  },
  beforeUnmount() {
    if (this.routeLayer) this.routeLayer.dispose();
    if (this.scene) this.scene.getRenderer().off('transform', this.onTransform);
    if (this.mapView) {
      this.mapView.dispose();
      this.mapView.store.dispose();
    }
    if (this.scene) {
      this.scene.dispose();
      window.scene = null;
    }
    getCanvas().style.visibility = 'hidden';
  },
  methods: {
    toggleSettings() {
      // The poster moves; onPosterLayout() keeps the same map area inside it.
      this.showSettings = !this.showSettings;
    },

    toRgb(color) {
      return tinycolor(color).toRgb();
    },

    applyStyle(id, isInitial) {
      let style = getStyle(id);
      this.styleId = style.id;
      appState.set('style', style.id);
      let palette = {
        background: style.background,
        water: style.water,
        green: style.green,
        paper: style.paper,
        text: style.text,
        route: style.route.color,
        routeOutline: style.route.outline
      };
      let widths = {};
      ROAD_GROUPS.forEach(group => {
        palette[group] = style.roads[group].color;
        widths[group] = style.roads[group].width;
      });
      this.palette = palette;
      this.widths = widths;
      // Areas follow the style, unless the user has chosen explicitly.
      if (!isInitial || this.areasVisible === null) this.setAreasVisible(style.areas, true);
      else this.setAreasVisible(this.areasVisible, true);
      this.applyPalette();
    },

    setColor(key, color) {
      this.palette[key] = tinycolor(color).toRgbString();
      this.applyPalette();
    },

    applyPalette() {
      let dpr = this.scene.getRenderer().getPixelRatio();
      let p = this.palette;
      this.mapView.getLayers().forEach(layer => layer.setStyle(p[layer.id], this.widths[layer.id] * this.widthScale, dpr));
      this.scene.background = p.background;
      this.scene.setAreaColor('water', p.water);
      this.scene.setAreaColor('green', p.green);
      this.poster.paperColor = tinycolor(p.paper).toHexString();
      this.poster.textColor = tinycolor(p.text).toHexString();
      this.routeStyle.color = tinycolor(p.route).toHexString();
      this.routeStyle.outlineColor = tinycolor(p.routeOutline).toHexString();
      this.applyRouteStyle();
      document.body.style.backgroundColor = p.background;
    },

    setAreasVisible(isVisible, skipSave) {
      this.areasVisible = isVisible;
      if (!skipSave) appState.set('areas', isVisible ? 1 : 0);
      this.scene.areasVisible = isVisible;
    },

    setClipToBoundary(isEnabled) {
      this.clipToBoundary = isEnabled;
      if (isEnabled) appState.set('clip', 1);
      else appState.unset('clip');
      this.mapView.setBoundaryClip(isEnabled ? this.boundaryMask : null);
    },

    saveSettings() {
      PERSISTED.forEach(key => appState.set('p_' + key, this.poster[key]));
    },

    onPosterShapeChange() {
      this.saveSettings();
    },

    /**
     * The map window changed (format, layout, text, border, panel). Keep the area
     * that was visible in it, so a carefully framed map doesn't get cropped.
     */
    onPosterLayout() {
      // Only after the first fit: before that the camera shows w-gl's default view.
      if (this.isFramed && isUsableBBox(this.windowBBox)) {
        let bbox = this.windowBBox;
        this.$nextTick(() => this.mapView.fitBBox(bbox, this.$refs.frame.getMapRect(), 1, true));
      }
      this.updateCoordinates();
    },

    fitPlace() {
      let frame = this.$refs.frame;
      if (!frame) return;
      this.isFramed = true;
      if (this.routeLayer) {
        // The whole route must be visible.
        this.mapView.fitBBox(this.routeLayer.getBBox(), frame.getMapRect(), 1.08, true);
      } else {
        // A city fills the frame, its edges may be cropped.
        this.mapView.fitBBox(this.place.bbox, frame.getMapRect());
      }
      this.updateCoordinates();
    },

    updateCoordinates() {
      let frame = this.$refs.frame;
      if (!frame || !this.mapView) return;
      let rect = frame.getMapRect();
      let bbox = this.mapView.clientRectToBBox(rect.left, rect.top, rect.right, rect.bottom);
      this.windowBBox = bbox;
      this.coordinates = formatCoordinates((bbox.south + bbox.north) / 2, (bbox.west + bbox.east) / 2, this.poster.coordinateFormat);
    },

    onMapStatus(status) {
      if (status.full) this.mapStatus = 'Memory limit reached: reload the page to explore another area';
      else if (status.tooFarOut) this.mapStatus = 'Zoom in to load more of the map';
      else if (status.pending > 0) this.mapStatus = `Loading map... (${status.pending} tiles left)`;
      else this.mapStatus = '';
    },

    onRouteFile(e) {
      let file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      this.routeError = '';
      file.arrayBuffer().then(buffer => parseRoute(file.name, buffer)).then(route => {
        this.setRoute(route);
        this.fitPlace();
      }).catch(err => {
        console.error(err);
        this.routeError = err.message || String(err);
      });
    },

    setRoute(route) {
      if (this.routeLayer) this.routeLayer.dispose();
      this.routeLayer = new RouteLayer(this.scene.getRenderer(), this.projector, route, this.routeStyle);
      this.route = {
        name: route.name,
        stats: route.stats,
        metrics: getAvailableMetrics(route),
        data: Object.freeze(route)
      };
      if (!this.route.metrics.find(m => m.id === this.routeStyle.metric)) this.routeStyle.metric = 'none';

      // Prefill poster lines with the date and result, like race posters do.
      if (route.startTime) this.poster.note = formatDate(route.startTime);
      let result = [formatDistance(route.stats.distance)];
      if (route.stats.duration) result.push(formatDuration(route.stats.duration));
      this.poster.note2 = result.join(' · ');
      if (this.place.route !== route || !this.poster.tagline) {
        this.poster.tagline = route.sport ? sportLabel(route.sport) : '';
      }

      // Load the map around the route.
      this.mapView.scheduleVisibleUpdate();
      this.applyRouteStyle();
    },

    applyRouteStyle() {
      if (!this.routeLayer) return;
      this.routeLayer.setStyle(Object.assign({}, this.routeStyle));
      let legend = this.routeLayer.legend;
      let route = this.route && this.route.data;
      this.routeLegend = legend ? {
        label: (this.route.metrics.find(m => m.id === legend.metric) || {}).label,
        min: formatMetric(legend.metric, legend.min, route),
        max: formatMetric(legend.metric, legend.max, route)
      } : null;
    },

    removeRoute() {
      if (this.routeLayer) this.routeLayer.dispose();
      this.routeLayer = null;
      this.route = null;
      this.routeLegend = null;
      this.poster.note = '';
      this.poster.note2 = '';
    },

    exportPoster(format) {
      if (this.exporting) return;
      this.exporting = true;
      this.exportMessage = 'Rendering ' + format.toUpperCase() + '... this can take a few seconds';

      // Let the message render first: large exports block the main thread for a moment.
      setTimeout(() => {
        let args = {
          scene: this.scene,
          mapView: this.mapView,
          route: this.routeLayer,
          poster: this.posterView,
          paperRect: this.$refs.frame.getPaperRect(),
          longSide: format === 'png' ? this.exportSize : 2400
        };
        let job = format === 'png' ? exportPosterPNG(args) : exportPosterSVG(args);
        job.then(blob => {
          saveBlob(blob, this.poster.title || 'poster', '.' + format);
          this.exportMessage = '';
        }).catch(err => {
          console.error(err);
          this.exportMessage = 'Export failed: ' + (err.message || err);
        }).finally(() => {
          this.exporting = false;
        });
      }, 50);
    }
  },
  watch: {
    'poster.coordinateFormat'() {
      this.updateCoordinates();
    }
  }
};

/**
 * At least ~10 meters across; anything smaller is a camera that was never framed.
 */
function isUsableBBox(bbox) {
  return bbox && bbox.east - bbox.west > 1e-4 && bbox.north - bbox.south > 1e-4;
}

function formatDate(date) {
  let d = new Date(date);
  return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
}

function sportLabel(sport) {
  let s = String(sport).toLowerCase();
  if (s.includes('run')) return 'Run';
  if (s.includes('cycl') || s.includes('bik')) return 'Ride';
  if (s.includes('walk')) return 'Walk';
  if (s.includes('hik')) return 'Hike';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function debounce(fn, ms) {
  let timer = 0;
  return function() {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}
</script>

<style lang='stylus'>
@import('../vars.styl');

.poster-studio {
  position: absolute;
  margin: 8px;
  z-index: 1;
}

.studio-panel {
  details {
    border-bottom: 1px solid border-color;
    padding: 4px 0 8px 0;
  }
  summary {
    cursor: pointer;
    font-size: 16px;
    padding: 6px 0;
    color: #434343;
  }
  input[type='text'] {
    width: 100%;
    font-size: 14px;
    padding: 4px;
    border: 1px solid border-color;
  }
  input[type='range'] {
    flex: 1;
  }
  .value {
    width: 44px;
    text-align: right;
    font-size: 12px;
  }
  .row .col {
    align-items: center;
  }
  .checks {
    flex-wrap: wrap;
    gap: 4px 12px;
  }
  p {
    font-size: 13px;
  }
}

.style-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}

.style-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 11px;
  color: #434343;
  padding: 3px;
  border: 1px solid transparent;
  &.active {
    border-color: highlight-color;
  }
  .swatch {
    position: relative;
    width: 100%;
    height: 34px;
    overflow: hidden;
    border: 1px solid border-color;
  }
  .swatch-road {
    position: absolute;
    left: -10%;
    width: 120%;
    height: 3px;
    top: 40%;
    transform: rotate(-18deg);
    &.minor {
      height: 1px;
      top: 65%;
      transform: rotate(12deg);
    }
  }
  .swatch-water {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 35%;
    height: 45%;
  }
  .swatch-label {
    margin-top: 2px;
    text-align: center;
  }
}

.file-button {
  cursor: pointer;
  color: highlight-color;
  input {
    display: none;
  }
}

.route-error {
  color: #c62828;
  font-size: 13px;
  padding: 4px 0;
}

.route-summary {
  font-size: 13px;
}

.legend {
  font-size: 12px;
  gap: 6px;
  .legend-bar {
    flex: 1;
    height: 8px;
  }
}

.studio-license {
  z-index: 1;
  a {
    color: inherit;
  }
}
</style>
