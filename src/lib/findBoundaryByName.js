import request from './request.js';

let cachedResults = new Map();

/**
 * Boundary polygons (simplified by Nominatim to ~30m) are used for the optional
 * "clip to city boundary" mode.
 */
const GEOMETRY_PARAMS = 'polygon_geojson=1&polygon_threshold=0.0003';

export default function findBoundaryByName(inputName) {
  let results = cachedResults.get(inputName);
  if (results) return Promise.resolve(results);

  let name = encodeURIComponent(inputName);
  return request(`https://nominatim.openstreetmap.org/search?format=json&${GEOMETRY_PARAMS}&q=${name}`, {responseType: 'json'})
      .then(extractBoundaries)
      .then(x => {
        cachedResults.set(inputName, x);
        return x;
      });
}

/**
 * Finds a single place by its OSM type ('relation' | 'way' | 'node') and id.
 * Used to restore a place from the URL.
 */
export function lookupBoundary(osmType, osmId) {
  let prefix = {relation: 'R', way: 'W', node: 'N'}[osmType];
  if (!prefix) return Promise.reject(new Error('Unknown OSM type ' + osmType));

  let key = prefix + osmId;
  let results = cachedResults.get(key);
  if (results) return Promise.resolve(results[0]);

  return request(`https://nominatim.openstreetmap.org/lookup?format=json&${GEOMETRY_PARAMS}&osm_ids=${key}`, {responseType: 'json'})
    .then(extractBoundaries)
    .then(x => {
      cachedResults.set(key, x);
      return x[0];
    });
}

/**
 * Returns {city, country} of a location, used to title posters of GPS routes.
 */
export function reverseGeocode(lat, lon) {
  return request(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&addressdetails=1&lat=${lat}&lon=${lon}`, {responseType: 'json'})
    .then(result => {
      let address = (result && result.address) || {};
      return {
        city: address.city || address.town || address.village || address.municipality || address.county || '',
        country: address.country || ''
      };
    });
}

function extractBoundaries(x) {
  let areas = x.map(row => {
      let areaId, bbox;
      if (row.osm_type === 'relation') {
        // By convention the area id can be calculated from an existing 
        // OSM way by adding 2400000000 to its OSM id, or in case of a 
        // relation by adding 3600000000 respectively. So we are adding this
        // https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#By_area_.28area.29
        // Note: we may want to do another case for osm_type = 'way'. Need to check
        // if it returns correct values.
        areaId = row.osm_id + 36e8;
      } else if (row.osm_type === 'way') {
        areaId = row.osm_id + 24e8;
      }
      if (row.boundingbox) {
        bbox = [
          Number.parseFloat(row.boundingbox[0]),
          Number.parseFloat(row.boundingbox[2]),
          Number.parseFloat(row.boundingbox[1]),
          Number.parseFloat(row.boundingbox[3]),
        ];
      }

      return {
        areaId,
        bbox,
        lat: row.lat,
        lon: row.lon,
        osmId: row.osm_id,
        osmType: row.osm_type,
        name: row.display_name,
        type: row.type,
        geojson: row.geojson,
      };
    });

  return areas;
}