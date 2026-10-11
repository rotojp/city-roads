<template>
<div class='find-place' :class='{centered: boxInTheMiddle }'>
  <div v-if='boxInTheMiddle'>
    <h3 class='site-header'>city roads</h3>
    <p class='description'>This website renders every single road within a city</p>
  </div>
  <form v-on:submit.prevent="onSubmit" class='search-box'>
      <input class='query-input' v-model='enteredInput' type='text' placeholder='Enter a city name to start' ref='input'>
      <a type='submit' class='search-submit' href='#' @click.prevent='onSubmit' v-if='enteredInput && !hideInput'>{{mainActionText}}</a>
  </form>
  <div class='route-start' v-if='!loading && !suggestions.length'>
    <label>
      or start from a GPS route (.gpx, .tcx, .fit)
      <input type='file' accept='.gpx,.tcx,.fit' @change='onRouteFile'>
    </label>
  </div>
  <div v-if='showWarning' class='prompt message note shadow'>
    Note: Large cities may require 200MB+ of data transfer and may need a powerful device to render.
  </div>
  <div class='results' v-if='!loading'>
    <div v-if='suggestionsLoaded && suggestions.length' class='suggestions shadow'>
      <div class='prompt message'>
        <div>Select boundaries below to download all roads within</div>
        <div class='note'>large cities may require 200MB+ of data transfer and a powerful device</div>
      </div>
      <ul>
        <li v-for='(suggestion, index) in suggestions' :key="index">
          <a @click.prevent='pickSuggestion(suggestion)' class='suggestion'
          href='#'>
          <span>
          {{suggestion.name}} <small>({{suggestion.type}})</small>
          </span>
          </a>
        </li>
      </ul>
    </div>
    <div v-if='suggestionsLoaded && !suggestions.length && !loading && !error' class='no-results message shadow'>
      Didn't find matching cities. Try a different query?
    </div>
    <div v-if='noRoads' class='no-results message shadow'>
      Didn't find any roads. Try a different query?
    </div>
  </div>
  <div v-if='error' class='error message shadow'>
    <div v-if='isServerError(error)'>
      <div>OpenStreetMap servers are busy or temporarily unavailable.</div>
      <div class='error-note'>We tried {{error.serversAttempted || 'multiple'}} servers but none responded in time. This usually resolves within a few minutes.</div>
      <div class='error-actions'>
        <a href='#' @click.prevent="retry" class='retry-btn'>Retry</a>
      </div>
    </div>
    <div v-else>
      <div>Sorry, something went wrong while loading data.</div>
      <div class='error-note'>{{error.message || error.toString()}}</div>
      <div class='error-actions'>
        <a href='#' @click.prevent="retry" class='retry-btn'>Retry</a>
      </div>
      <div class='error-links'>
        <a href='https://twitter.com/anvaka/status/1218971717734789120' title='see what it supposed to do' target="_blank">see how it should have worked</a>
        <a :href='getBugReportURL(error)' :title='"report error: " + error' target='_blank'>report this bug</a>
      </div>
    </div>
  </div>
  <div v-if='loading' class='loading message shadow'>
    <loading-icon></loading-icon>
    <span>{{loading}}</span>
    <a href="#" @click.prevent='cancelRequest' class='cancel-request'>cancel</a>
    <div class='load-padding' v-if='stillLoading > 0'>
      Still loading...
    </div>
    <div class='load-padding' v-if='stillLoading > 1'>
      Sorry it takes so long!
    </div>
  </div>
</div>
</template>

<script>
import LoadingIcon from './LoadingIcon.vue';
import Query from '../lib/Query.js';
import request from '../lib/request.js';
import findBoundaryByName, {lookupBoundary, reverseGeocode} from '../lib/findBoundaryByName.js';
import parseRoute from '../lib/routes/parseRoute.js';
import TileStore from '../lib/tiles/TileStore.js';
import {tilesForBBox, tileXToLon, tileYToLat} from '../lib/tiles/tileMath.js';

/**
 * Number of tiles we load before showing the map. The rest is loaded on demand,
 * when the user pans and zooms.
 */
const MAX_INITIAL_TILES = 400;
import appState from '../lib/appState.js';
import Grid from '../lib/Grid.js';
import queryState from '../lib/appState.js';
import config from '../config.js';
import Progress from '../lib/Progress.js'
import LoadOptions from '../lib/LoadOptions.js';
import Pbf from 'pbf';
import {place} from '../proto/place.js';

const FIND_TEXT = 'Find City Bounds';

export default {
  name: 'FindPlace',
  components: {
    LoadingIcon
  },
  data () {
    const enteredInput = appState.get('q') || '';
    let hasValidArea = restoreStateFromQueryString();

    return {
      enteredInput,
      loading: null,
      lastCancel: null,
      suggestionsLoaded: false,
      boxInTheMiddle: true,
      stillLoading: 0,
      error: null,
      hideInput: false,
      noRoads: false,
      clicked: false,
      showWarning: hasValidArea, 
      mainActionText: hasValidArea ? 'Download Area' : FIND_TEXT,
      suggestions: []
    }
  },
  watch: {
    enteredInput() {
      // As soon as they change it, we need not to download:
      this.mainActionText = FIND_TEXT;
      this.showWarning = false;
      this.hideInput = false;
      appState.unsetPlace();
    }
  },
  mounted() {
    this.$refs.input.focus();
    if (queryState.get('auto')) {
      this.onSubmit();
    }
  },
  beforeUnmount() {
    if (this.lastCancel) this.lastCancel();
    clearInterval(this.notifyStillLoading);
  },
  methods: {
    onSubmit() {
      queryState.set('q', this.enteredInput);
      this.cancelRequest()
      this.suggestions = [];
      this.noRoads = false;
      this.error = false;
      this.showWarning = false;

      const restoredState = restoreStateFromQueryString(this.enteredInput);
      if (restoredState) {
        this.pickSuggestion(restoredState);
        return;
      }

      this.loading = 'Searching cities that match your query...'
      findBoundaryByName(this.enteredInput)
        .then(suggestions => {
          this.loading = null;
          this.hideInput = suggestions && suggestions.length;
          if (this.boxInTheMiddle) {
            // let animation that moves input box proceed a bit
            this.boxInTheMiddle = false; // This triggers transition
            // wait for it and then set the suggestions:
            setTimeout(() => {
              this.suggestionsLoaded = true;
              this.suggestions = suggestions;
            }, 50)
          } else {
              this.suggestionsLoaded = true;
              this.suggestions = suggestions; 
          }
        });
    },

    /**
     * Starts from a GPS route: loads the map around it and names the poster
     * after the place where the route is.
     */
    onRouteFile(e) {
      let file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      this.error = false;
      this.noRoads = false;
      this.loading = 'Reading ' + file.name + '...';
      let progress = this.generateNewProgressToken();
      let route;
      file.arrayBuffer().then(buffer => parseRoute(file.name, buffer)).then(parsed => {
        route = parsed;
        let bbox = routeBBox(route.points, 0.15);
        let center = {lat: (bbox.south + bbox.north) / 2, lon: (bbox.west + bbox.east) / 2};
        this.loading = 'Downloading map data...';
        let store = new TileStore();
        let tiles = tilesForBBox(bbox, store.zoom).slice(0, MAX_INITIAL_TILES);
        // Naming is optional: a failed reverse geocode should not block the map.
        let naming = reverseGeocode(center.lat, center.lon).catch(() => ({city: '', country: ''}));
        return Promise.all([store.load(tiles, progress), naming]).then(([, place]) => {
          this.loading = null;
          let loaded = {
            store,
            name: [place.city, place.country].filter(Boolean).join(', ') || route.name,
            title: place.city || route.name,
            subtitle: place.country,
            bbox: clampToTiles(bbox, tiles),
            boundary: null,
            route
          };
          setTimeout(() => this.$emit('loaded', loaded), 0);
        }, err => {
          store.dispose();
          throw err;
        });
      }).catch(err => {
        if (err && err.cancelled) return;
        console.error(err);
        this.loading = null;
        this.error = err instanceof Error ? err : new Error(String(err.message || err));
      });
    },

    isServerError(error) {
      if (!error) return false;
      // These are transient server issues, not bugs in our code
      return error.allServersFailed ||
             error.invalidResponse ||
             error.statusError ||
             (error.message && error.message.includes('Failed to download'));
    },

    getBugReportURL(error) {
      let title = encodeURIComponent('OSM Error');
      let body = '';
      if (error) {
        body = 'Hello, an error occurred on the website:\n\n```\n' +
          error.toString() + '\n```\n\n Can you please help?';
      }

      return `https://github.com/anvaka/city-roads/issues/new?title=${title}&body=${encodeURIComponent(body)}`
    },

    updateProgress(status) {
      this.stillLoading = 0;
      clearInterval(this.notifyStillLoading);
      if (status.loaded < 0) {
        this.loading = 'Trying a different server'
        this.restartLoadingMonitor();
        return;
      }
      if (status.percent !== undefined) {
        this.loading = 'Loaded ' + Math.round(100 * status.percent) + '% (' + formatNumber(status.loaded) + ' bytes)...';
      } else {
        this.loading = 'Loaded ' + formatNumber(status.loaded) + ' bytes...';
      }
    },

    retry() {
      if (this.lastSuggestion) {
        this.pickSuggestion(this.lastSuggestion);
      }
    },

    pickSuggestion(suggestion) {
      this.lastSuggestion = suggestion;
      this.error = false;
      this.noRoads = false;
      if (appState.get('source') === 'osm') {
        // Explicitly requested raw OpenStreetMap data via Overpass.
        this.useOSM(suggestion);
        return;
      }

      this.useTiles(suggestion).catch(err => {
        if (err.cancelled) return;
        if (err.areaTooLarge) {
          this.loading = null;
          this.error = err;
          return;
        }
        console.error('Could not load vector tiles, falling back to OpenStreetMap', err);
        this.useLegacySources(this.lastSuggestion);
      });
    },

    /**
     * Primary data source: OpenMapTiles vector tiles (via OpenFreeMap CDN).
     */
    useTiles(suggestion) {
      this.loading = 'Downloading map data...';
      this.restartLoadingMonitor();
      let progress = this.generateNewProgressToken();

      return resolveGeometry(suggestion).then(resolved => {
        if (progress.isCancelled) throw {cancelled: true};
        this.lastSuggestion = resolved;

        let store = new TileStore();
        let bbox = toBBoxObject(resolved.bbox);
        // tiles are sorted from the center outwards, so the cap keeps the middle of the place.
        let tiles = tilesForBBox(bbox, store.zoom).slice(0, MAX_INITIAL_TILES);
        return store.load(tiles, progress).then(() => {
          clearInterval(this.notifyStillLoading);
          this.stillLoading = 0;
          this.loading = null;

          let hasRoads = false;
          store.forEachTile(tile => hasRoads = hasRoads || tile.data.pointCount > 0);
          if (!hasRoads) {
            store.dispose();
            this.noRoads = true;
            return;
          }
          // Emit outside of this promise chain: errors in the handler must not
          // be mistaken for a tile download failure (which falls back to Overpass).
          let loaded = {
            store,
            name: resolved.name || '',
            osmType: resolved.osmType,
            osmId: resolved.osmId,
            bbox: clampToTiles(bbox, tiles),
            boundary: resolved.geojson,
            center: {lat: Number.parseFloat(resolved.lat), lon: Number.parseFloat(resolved.lon)}
          };
          setTimeout(() => this.$emit('loaded', loaded), 0);
        }, err => {
          store.dispose();
          throw err;
        });
      }).catch(err => {
        clearInterval(this.notifyStillLoading);
        this.stillLoading = 0;
        throw err;
      });
    },

    /**
     * Fallbacks: 2020 cache of large cities, then Overpass API.
     */
    useLegacySources(suggestion) {
      if (appState.isCacheEnabled() && suggestion.areaId) {
        this.checkCache(suggestion)
          .catch(error => {
            if (error.cancelled) return; // no need to do anything. They've cancelled

            // No Cache - fallback
            return this.useOSM(suggestion);
          });
      } else {
        // we don't have cache for nodes yet.
        this.useOSM(suggestion);
      }
    },

    restartLoadingMonitor() {
      clearInterval(this.notifyStillLoading);
      this.stillLoading = 0;
      this.notifyStillLoading = setInterval(() => {
        this.stillLoading++;
      }, 10000);
    },

    checkCache(suggestion) {
      this.loading = 'Checking cache...'
      let areaId = suggestion.areaId;

      return request(config.areaServer + '/' + areaId + '.pbf', {
        progress: this.generateNewProgressToken(),
        responseType: 'arraybuffer'
      }).then(arrayBuffer => {
        var byteArray = new Uint8Array(arrayBuffer);
        return byteArray;
      }).then(byteArray => {
        var pbf = new Pbf(byteArray);
        var obj = place.read(pbf);
        let grid = Grid.fromPBF(obj)
        this.$emit('loaded', grid);
      });
    },

    useOSM(suggestion) {
      this.loading = 'Connecting to OpenStreetMap...'
      
      // it may take a while to load data. 
      this.restartLoadingMonitor();
      Query.runFromOptions(new LoadOptions({
        wayFilter: Query.Road,
        areaId: suggestion.areaId,
        bbox: suggestion.bbox
      }), this.generateNewProgressToken())
      .then(grid => {
        this.loading = null;
        if (!grid.hasRoads()) {
          this.noRoads = true;
        } else {
          grid.setName(suggestion.name);
          grid.setId(suggestion.areaId || suggestion.osm_id);
          grid.setIsArea(suggestion.areaId); // osm nodes don't have area.
          grid.setBBox(serializeBBox(suggestion.bbox));
          this.$emit('loaded', grid);
        }
      }).catch(err => {
        if (err.cancelled) {
          this.loading = null;
          return;
        }
        console.error(err);
        this.error = err;
        this.loading = null;
        this.suggestions = [];
      })
      .finally(() => {
        clearInterval(this.notifyStillLoading);
        this.stillLoading = 0;
      });
    },

    cancelRequest() {
      if (this.progressToken) {
        this.progressToken.cancel();
        this.progressToken = null;
        this.loading = false;
      }
    },

    generateNewProgressToken() {
      if (this.progressToken) {
        this.progressToken.cancel();
        this.progressToken = null;
      }

      this.progressToken = new Progress(this.updateProgress);
      return this.progressToken;
    }
  }
}

function serializeBBox(bbox) {
  return bbox && bbox.join(',');
}

function formatNumber(x) {
  if (!Number.isFinite(x)) return 'N/A';
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Makes sure we have bounding box of the place. Places restored from the URL
 * only have OSM type and id.
 */
function resolveGeometry(suggestion) {
  if (suggestion.bbox && suggestion.lat !== undefined) return Promise.resolve(suggestion);
  if (!suggestion.osmType || !suggestion.osmId) {
    return Promise.reject(new Error('Cannot determine boundaries of the place'));
  }

  return lookupBoundary(suggestion.osmType, suggestion.osmId).then(found => {
    if (!found) throw new Error('Place not found: ' + suggestion.osmType + ' ' + suggestion.osmId);
    return Object.assign({}, found, {name: found.name || suggestion.name});
  });
}

/**
 * Nominatim bbox is [south, west, north, east]
 */
function toBBoxObject(bbox) {
  if (!bbox) return null;
  return {south: bbox[0], west: bbox[1], north: bbox[2], east: bbox[3]};
}

function routeBBox(points, padding) {
  let bbox = {south: Infinity, west: Infinity, north: -Infinity, east: -Infinity};
  points.forEach(p => {
    bbox.south = Math.min(bbox.south, p.lat); bbox.north = Math.max(bbox.north, p.lat);
    bbox.west = Math.min(bbox.west, p.lon); bbox.east = Math.max(bbox.east, p.lon);
  });
  let dx = (bbox.east - bbox.west) * padding, dy = (bbox.north - bbox.south) * padding;
  return {west: bbox.west - dx, east: bbox.east + dx, south: bbox.south - dy, north: bbox.north + dy};
}

/**
 * When initial tiles were capped, shrinks the bbox to the loaded area.
 */
function clampToTiles(bbox, tiles) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  tiles.forEach(t => {
    minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x + 1);
    minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y + 1);
  });
  let z = tiles[0].z;
  return {
    west: Math.max(bbox.west, tileXToLon(minX, z)),
    east: Math.min(bbox.east, tileXToLon(maxX, z)),
    north: Math.min(bbox.north, tileYToLat(minY, z)),
    south: Math.max(bbox.south, tileYToLat(maxY, z))
  };
}

function restoreStateFromQueryString(name) {
  let osmType = appState.get('osm_type');
  let osmId = Number.parseInt(appState.get('osm_id'), 10);
  if (osmType && Number.isFinite(osmId)) {
    return {
      name,
      osmType,
      osmId,
      areaId: osmType === 'relation' ? osmId + 36e8 : osmType === 'way' ? osmId + 24e8 : undefined
    };
  }

  let areaId = getCurrentAreaId();
  if (areaId) {
    // Legacy URLs. Area ids are OSM ids with an offset, see findBoundaryByName.js
    areaId = Number.parseInt(areaId, 10);
    let isRelation = areaId >= 36e8;
    return {
      name,
      areaId,
      osmType: isRelation ? 'relation' : 'way',
      osmId: areaId - (isRelation ? 36e8 : 24e8)
    };
  }

  let nodeAndBox = getCurrentNodeAndBox();
  if (nodeAndBox) {
    return {
      name,
      osm_id: nodeAndBox.osm_id,
      bbox: nodeAndBox.bbox
    };
  }
}

function getCurrentAreaId() {
  let areaId = appState.get('areaId');
  if (!Number.isFinite(Number.parseInt(areaId, 10))) {
    areaId = null;
  }
  return areaId;
}

function getCurrentNodeAndBox() {
  let osm_id = appState.get('osm_id');
  if (!Number.isFinite(Number.parseInt(osm_id, 10))) return;

  let bbox = parseBBox(appState.get('bbox'));
  if (!bbox) return;

  return { osm_id, bbox };
}

function parseBBox(bboxStr) {
  if (!bboxStr) return null;

  let bbox = bboxStr.split(',').map(x => Number.parseFloat(x)).filter(x => Number.isFinite(x));
  return bbox.length === 4 ? bbox : null;
}

</script>

<style lang="stylus">
@import('../vars.styl');
.find-place  {
  width: desktop-controls-width;
}

.route-start {
  text-align: center;
  font-size: 14px;
  padding: 10px 0;
  label {
    cursor: pointer;
    color: highlight-color;
  }
  input {
    display: none;
  }
}

h3.site-header {
  margin: 0;
  font-weight: normal;
  font-size: 32px;
  text-align: center;
}

input {
  border: none;
  flex: 1;
  font-family: 'Avenir', Helvetica, Arial, sans-serif;
  padding: 0;
  color: #434343;
  height: 100%;
  font-size: 16px;
  &:focus {
    outline: none;
  }
}

.search-box {
  position: relative;
  background-color: emphasis-background;
  padding: 0 8px;
  padding: 0 0 0 8px;

  box-shadow: 0 2px 4px rgba(0,0,0,0.2), 0 -1px 0px rgba(0,0,0,0.02);
  height: 48px;
  display: flex;
  font-size: 16px;
  cursor: text;
  a {
    cursor: pointer;
  }
  span {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
}

.prompt {
  padding: 4px;
  text-align: center;
  font-size: 12px;
}

.search-submit {
  padding: 0 8px;
  align-items: center;
  text-decoration: none;
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  outline: none;
  z-index: 1;
  color: highlight-color
  &:hover {
    color: emphasis-background;
    background: highlight-color;
  }
}

.suggestion {
  display: block
  min-height: 64px
  align-items: center;
  border-bottom: 1px solid border-color
  display: flex
  padding: 0 10px;
  text-decoration: none
  color: highlight-color
}

.suggestions {
  position: relative;
  background: white
  .note {
    font-size: 10px;
    font-style: italic;
  }

  ul {
    list-style-type: none;
    margin: 0;
    padding: 0;
    max-height: calc(100vh - 128px);
    overflow-y: auto;
    overflow-x: hidden;
  }
}

.message,
.loading {
  padding: 4px 8px;
  position: relative;
}
.loading svg {
  margin-right: 8px;
}

.shadow {
  box-shadow: 0 2px 4px rgba(0,0,0,0.2)
}

.error {
  overflow-x: auto;
}

.find-place {
  position: absolute;
  display: flex;
  flex-direction: column;
  top: 8px;
  left: 50%;

  transform: translateX(-50%) translateY(0);
  transition-timing-function: ease-out;
  transition-property: top left transform;
  transition-duration: 0.2s;
}

.find-place.centered {
  top: 50%;
  left: 50%;
  transform: translateX(-50%) translateY(-143px);
}
.load-padding {
  padding-left: 16px;
}
.description {
  padding: 8px;
  margin: 0;
  text-align: center;
}

.cancel-request {
  position: absolute;
  right: 4px;
  top: 4px;
  font-size: 12px;
}
.error-note {
  font-size: 12px;
  color: #666;
  margin: 8px 0;
}
.error-actions {
  margin: 12px 0 8px 0;
}
.retry-btn {
  display: inline-block;
  padding: 8px 24px;
  background: highlight-color;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 14px;
  &:hover {
    opacity: 0.9;
  }
}
.error-links {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid border-color;
}

@media (max-width: small-screen) {
  .find-place {
    width: 100%;
  }
  .find-place.centered {
    top: 8px;
    left: 0;
    transform: none;
  }
  .message {
    font-size: 12px;
  }
  .prompt {
    font-size: 12px;
    .note {
      font-size: 9px;
    }
  }
}

</style>
