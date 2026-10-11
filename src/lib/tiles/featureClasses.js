/**
 * Maps OpenMapTiles schema (https://openmaptiles.org/schema/) features to the
 * groups we render. Road groups get their own layer, so they can have their own
 * color and line width.
 */
export const ROAD_GROUPS = ['major', 'medium', 'minor', 'paths'];

const roadGroupByClass = {
  motorway: 'major',
  trunk: 'major',
  primary: 'major',
  secondary: 'medium',
  tertiary: 'medium',
  minor: 'minor',
  service: 'minor',
  raceway: 'minor',
  busway: 'minor',
  path: 'paths',
  track: 'paths',
  rail: 'rail',
  transit: 'rail',
};

export function getTransportationGroup(properties) {
  let group = roadGroupByClass[properties.class];
  if (group === 'paths' && properties.subclass === 'platform') return; // railway platforms
  return group;
}

const WATERWAY_CLASSES = new Set(['river', 'canal', 'stream']);

export function isWaterway(properties) {
  return WATERWAY_CLASSES.has(properties.class);
}

export function isWaterArea(properties) {
  return properties.class !== 'swimming_pool';
}

const GREEN_LANDCOVER_SUBCLASSES = new Set(['park', 'garden', 'recreation_ground', 'village_green']);

/**
 * Parks, gardens, cemeteries and forests. Large protected areas (nature reserves,
 * national parks) are skipped, they often cover a whole region.
 */
export function isGreenArea(layerName, properties) {
  if (layerName === 'park') return properties.class === 'park';
  if (layerName === 'landcover') {
    return properties.class === 'wood' || GREEN_LANDCOVER_SUBCLASSES.has(properties.subclass);
  }
  if (layerName === 'landuse') return properties.class === 'cemetery';
  return false;
}
