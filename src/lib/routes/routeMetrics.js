/**
 * Values to color-code a route with, and helpers to format route statistics.
 */
export const ROUTE_METRICS = [
  {id: 'none', label: 'Single color'},
  {id: 'pace', label: 'Pace'},
  {id: 'speed', label: 'Speed'},
  {id: 'ele', label: 'Elevation'},
  {id: 'hr', label: 'Heart rate'},
  {id: 'cad', label: 'Cadence'},
];

/**
 * Low → high. Reversed ColorBrewer RdYlBu: diverging, readable on light and dark
 * maps, and avoids the red/green-only contrast of a rainbow scale.
 */
const RAMP = ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c'];

/**
 * Returns metrics that have data in this route.
 */
export function getAvailableMetrics(route) {
  let has = key => route.points.some(p => p[key] !== null && p[key] !== undefined && (key !== 'speed' || p[key] > 0));
  return ROUTE_METRICS.filter(m => {
    if (m.id === 'none') return true;
    if (m.id === 'pace') return has('speed') && isOnFoot(route);
    if (m.id === 'speed') return has('speed');
    return has(m.id);
  });
}

export function isOnFoot(route) {
  let sport = (route.sport || '').toLowerCase();
  return sport === '' || /run|walk|hik/.test(sport);
}

/**
 * Smoothed value per point (NaN when missing) and the color domain.
 * For pace we color by speed, so faster is always "hotter".
 */
export function getMetricValues(route, metric) {
  let key = metric === 'pace' ? 'speed' : metric;
  let raw = route.points.map(p => {
    let v = p[key];
    return (v === null || v === undefined) ? NaN : v;
  });
  let values = smooth(raw, key === 'ele' ? 3 : 15);

  let sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (key === 'speed') sorted = sorted.filter(v => v > 0.5); // standing still is not interesting
  if (!sorted.length) return null;
  let min = quantile(sorted, 0.05), max = quantile(sorted, 0.95);
  if (max - min < 1e-6) max = min + 1;
  return {values, min, max};
}

/**
 * Maps t in [0, 1] to a ramp color.
 */
export function rampColor(t) {
  t = Math.max(0, Math.min(1, t));
  let scaled = t * (RAMP.length - 1);
  let i = Math.min(RAMP.length - 2, Math.floor(scaled));
  return mix(RAMP[i], RAMP[i + 1], scaled - i);
}

export function getRampStops() {
  return RAMP.slice();
}

/**
 * Formats a metric value for the legend.
 */
export function formatMetric(metric, value, route) {
  if (!Number.isFinite(value)) return '';
  switch (metric) {
    case 'pace': return value > 0 ? formatPace(1000 / value) + ' /km' : '';
    case 'speed': return (value * 3.6).toFixed(1) + ' km/h';
    case 'ele': return Math.round(value) + ' m';
    case 'hr': return Math.round(value) + ' bpm';
    // FIT/GPX running cadence counts one foot; steps per minute is what runners know.
    case 'cad': return isOnFoot(route) ? Math.round(value * 2) + ' spm' : Math.round(value) + ' rpm';
  }
  return String(value);
}

export function formatPace(secondsPerKm) {
  let m = Math.floor(secondsPerKm / 60);
  let s = Math.round(secondsPerKm - m * 60);
  if (s === 60) { m += 1; s = 0; }
  return m + ':' + String(s).padStart(2, '0');
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return '';
  seconds = Math.round(seconds);
  let h = Math.floor(seconds / 3600);
  let m = Math.floor((seconds % 3600) / 60);
  let s = seconds % 60;
  return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '';
  return meters >= 10000 ? (meters / 1000).toFixed(1) + ' km' : (meters / 1000).toFixed(2) + ' km';
}

function smooth(values, radius) {
  let result = new Float64Array(values.length);
  for (let i = 0; i < values.length; ++i) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); ++j) {
      if (Number.isFinite(values[j])) { sum += values[j]; count += 1; }
    }
    result[i] = count ? sum / count : NaN;
  }
  return Array.from(result);
}

function quantile(sorted, q) {
  let pos = (sorted.length - 1) * q;
  let lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function mix(a, b, t) {
  let pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  let r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  let g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  let bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
