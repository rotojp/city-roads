/**
 * Parses a GPX, TCX or FIT file into a route. Returns a Promise of:
 *
 * {
 *   name, sport, startTime (Date|null),
 *   points: [{lat, lon, time (ms|null), ele, hr, cad, dist (m), speed (m/s)}],
 *   stats: {distance (m), duration (s, elapsed), elevationGain (m)}
 * }
 *
 * Values that are not present in the file are `null`. Distance and speed are
 * derived from positions and timestamps when the file has none.
 */
export default function parseRoute(fileName, arrayBuffer) {
  return Promise.resolve().then(() => {
    let format = detectFormat(fileName, arrayBuffer);
    if (format === 'fit') {
      // The FIT SDK is large; load it only when somebody opens a FIT file.
      return import('@garmin/fitsdk').then(sdk => finish(parseFIT(sdk, arrayBuffer), format, fileName));
    }
    let text = new TextDecoder('utf-8').decode(arrayBuffer);
    let xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('Could not read ' + fileName + ': invalid XML');
    return finish(format === 'tcx' ? parseTCX(xml) : parseGPX(xml), format, fileName);
  });
}

function finish(route, format, fileName) {
  route.points = route.points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && !(p.lat === 0 && p.lon === 0));
  if (route.points.length < 2) throw new Error('No GPS track found in ' + fileName);
  route.format = format;
  if (!route.name) route.name = fileName.replace(/\.[^.]+$/, '');
  fillDerivedValues(route);
  return route;
}

function detectFormat(fileName, arrayBuffer) {
  let ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'fit' || ext === 'gpx' || ext === 'tcx') return ext;
  // FIT files have ".FIT" at bytes 8-11 of the header.
  let bytes = new Uint8Array(arrayBuffer, 0, Math.min(arrayBuffer.byteLength, 400));
  if (String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === '.FIT') return 'fit';
  let head = new TextDecoder().decode(bytes);
  if (head.includes('TrainingCenterDatabase')) return 'tcx';
  if (head.includes('<gpx')) return 'gpx';
  throw new Error('Unsupported file type. Please use .gpx, .tcx or .fit');
}

function parseGPX(xml) {
  let points = [];
  // Tracks first; fall back to planned routes (rtept) when there is no recorded track.
  let nodes = xml.getElementsByTagName('trkpt');
  if (!nodes.length) nodes = xml.getElementsByTagName('rtept');
  for (let i = 0; i < nodes.length; ++i) {
    let node = nodes[i];
    points.push({
      lat: parseFloat(node.getAttribute('lat')),
      lon: parseFloat(node.getAttribute('lon')),
      time: parseTime(childText(node, 'time')),
      ele: parseNumber(childText(node, 'ele')),
      // Garmin TrackPointExtension: <ns3:hr>, <ns3:cad>. Match on local name to ignore prefixes.
      hr: parseNumber(descendantText(node, 'hr')),
      cad: parseNumber(descendantText(node, 'cad')),
      dist: null,
      speed: parseNumber(descendantText(node, 'speed'))
    });
  }
  let name = firstText(xml, 'name');
  let sport = firstText(xml, 'type');
  return {name, sport, startTime: points.length && points[0].time ? new Date(points[0].time) : null, points};
}

function parseTCX(xml) {
  let points = [];
  let nodes = xml.getElementsByTagName('Trackpoint');
  for (let i = 0; i < nodes.length; ++i) {
    let node = nodes[i];
    let hrNode = node.getElementsByTagName('HeartRateBpm')[0];
    points.push({
      lat: parseNumber(descendantText(node, 'LatitudeDegrees')),
      lon: parseNumber(descendantText(node, 'LongitudeDegrees')),
      time: parseTime(childText(node, 'Time')),
      ele: parseNumber(childText(node, 'AltitudeMeters')),
      hr: hrNode ? parseNumber(descendantText(hrNode, 'Value')) : null,
      cad: parseNumber(descendantText(node, 'RunCadence')) ?? parseNumber(childText(node, 'Cadence')),
      dist: parseNumber(childText(node, 'DistanceMeters')),
      speed: parseNumber(descendantText(node, 'Speed'))
    });
  }
  let activity = xml.getElementsByTagName('Activity')[0];
  let sport = activity ? activity.getAttribute('Sport') : null;
  let name = firstText(xml, 'Name') || (sport ? sport + ' activity' : null);
  return {name, sport, startTime: points.length && points[0].time ? new Date(points[0].time) : null, points};
}

const SEMICIRCLES_TO_DEGREES = 180 / Math.pow(2, 31);

function parseFIT({Decoder, Stream}, arrayBuffer) {
  let decoder = new Decoder(Stream.fromArrayBuffer(arrayBuffer));
  if (!decoder.isFIT() || !decoder.checkIntegrity()) throw new Error('This is not a valid FIT file');
  let {messages, errors} = decoder.read({
    applyScaleAndOffset: true,
    expandComponents: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    mergeHeartRates: true
  });
  if (errors && errors.length) console.warn('FIT decoding warnings', errors);

  let points = (messages.recordMesgs || [])
    .filter(r => r.positionLat !== undefined && r.positionLong !== undefined)
    .map(r => ({
      lat: r.positionLat * SEMICIRCLES_TO_DEGREES,
      lon: r.positionLong * SEMICIRCLES_TO_DEGREES,
      time: r.timestamp ? r.timestamp.getTime() : null,
      ele: valueOrNull(r.enhancedAltitude ?? r.altitude),
      hr: valueOrNull(r.heartRate),
      cad: valueOrNull(r.cadence),
      dist: valueOrNull(r.distance),
      speed: valueOrNull(r.enhancedSpeed ?? r.speed)
    }));

  let session = (messages.sessionMesgs || [])[0] || {};
  let sport = session.sport ? String(session.sport) : null;
  return {
    name: sport ? capitalize(sport) + ' activity' : null,
    sport,
    startTime: session.startTime || (points[0] && points[0].time ? new Date(points[0].time) : null),
    points
  };
}

/**
 * Cumulative distance, speed and summary statistics.
 */
function fillDerivedValues(route) {
  let points = route.points;
  let hasDistance = points.every(p => p.dist !== null);
  if (!hasDistance) {
    let total = 0;
    points[0].dist = 0;
    for (let i = 1; i < points.length; ++i) {
      total += haversine(points[i - 1], points[i]);
      points[i].dist = total;
    }
  }

  let hasSpeed = points.some(p => p.speed !== null && p.speed > 0);
  if (!hasSpeed && points.every(p => p.time !== null)) {
    // Speed over a ~10 second window, so GPS jitter doesn't dominate.
    let j = 0;
    for (let i = 0; i < points.length; ++i) {
      while (j < i && points[i].time - points[j].time > 10000) j++;
      let dt = (points[i].time - points[j].time) / 1000;
      points[i].speed = dt > 0 ? (points[i].dist - points[j].dist) / dt : null;
    }
  }

  let gain = 0;
  let lastEle = null;
  points.forEach(p => {
    if (p.ele === null) return;
    // Ignore small fluctuations, barometric/GPS altitude is noisy.
    if (lastEle === null) lastEle = p.ele;
    else if (p.ele - lastEle > 2) { gain += p.ele - lastEle; lastEle = p.ele; }
    else if (lastEle - p.ele > 2) lastEle = p.ele;
  });

  let first = points[0], last = points[points.length - 1];
  route.stats = {
    distance: last.dist - first.dist,
    duration: (first.time !== null && last.time !== null) ? (last.time - first.time) / 1000 : null,
    elevationGain: points.some(p => p.ele !== null) ? gain : null
  };
}

export function haversine(a, b) {
  const R = 6371008.8;
  let toRad = Math.PI / 180;
  let dLat = (b.lat - a.lat) * toRad, dLon = (b.lon - a.lon) * toRad;
  let s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function childText(node, name) {
  for (let child = node.firstElementChild; child; child = child.nextElementSibling) {
    if (child.localName === name) return child.textContent;
  }
  return null;
}

function descendantText(node, localName) {
  let found = node.getElementsByTagNameNS('*', localName)[0];
  return found ? found.textContent : null;
}

function firstText(xml, localName) {
  let found = xml.getElementsByTagNameNS('*', localName)[0];
  return found ? found.textContent.trim() : null;
}

function parseNumber(text) {
  if (text === null || text === undefined) return null;
  let value = parseFloat(text);
  return Number.isFinite(value) ? value : null;
}

function parseTime(text) {
  if (!text) return null;
  let t = Date.parse(text);
  return Number.isFinite(t) ? t : null;
}

function valueOrNull(x) {
  return (x === undefined || x === null || !Number.isFinite(x)) ? null : x;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
