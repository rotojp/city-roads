import {getFont, resolveWeight, cssFamily} from './fonts.js';

/**
 * Poster layout: where the map window is, and where text, borders and rules go.
 *
 * All sizes are relative to the paper width (1 unit = 1% of the width), so the
 * same layout is used for the on-screen frame and for exports of any size.
 * The overlay (paper, borders, text) is produced as SVG markup, which is used
 * on screen, embedded in SVG exports and rasterized for PNG exports.
 */
export const PAPER_FORMATS = [
  {id: 'a-portrait', label: 'A-series portrait (1:√2)', value: 1 / Math.SQRT2},
  {id: 'a-landscape', label: 'A-series landscape (√2:1)', value: Math.SQRT2},
  {id: '50x70', label: '50 × 70 cm', value: 5 / 7},
  {id: '70x50', label: '70 × 50 cm', value: 7 / 5},
  {id: '30x40', label: '30 × 40 cm (3:4)', value: 3 / 4},
  {id: '40x30', label: '40 × 30 cm (4:3)', value: 4 / 3},
  {id: 'square', label: 'Square', value: 1},
  {id: '16x9', label: 'Widescreen (16:9)', value: 16 / 9},
];

export const LAYOUTS = [
  {id: 'bottom', label: 'Text below the map'},
  {id: 'top', label: 'Text above the map'},
  {id: 'overlay', label: 'Full bleed, text on a fade'},
  {id: 'none', label: 'Map only'},
];

export const BORDERS = [
  {id: 'none', label: 'None'},
  {id: 'thin', label: 'Thin line'},
  {id: 'double', label: 'Double line'},
];

export const DEFAULT_POSTER = {
  format: 'a-portrait',
  shape: 'rect',
  layout: 'bottom',
  border: 'none',
  tagline: '',
  title: '',
  subtitle: '',
  note: '',
  note2: '',
  showCoordinates: true,
  coordinateFormat: 'decimal',
  titleFont: 'montserrat',
  titleWeight: 700,
  bodyFont: 'montserrat',
  bodyWeight: 400,
  uppercase: true,
  letterSpacing: 0.15, // em
  titleRules: false,
  attribution: true,
  // Set by the app when a route is color-coded: {label, colors: [...], min, max}
  legend: null,
  showLegend: true,
  paperColor: '#FFFFFF',
  textColor: '#1A1A1A',
};

export function getPaperRatio(poster) {
  if (poster.shape === 'circle' && poster.layout === 'none') return 1;
  return (PAPER_FORMATS.find(f => f.id === poster.format) || PAPER_FORMATS[0]).value;
}

/**
 * Collects fonts (id + weight) used by the poster.
 */
export function getFontUsages(poster) {
  return [
    {id: poster.titleFont, weight: poster.titleWeight},
    {id: poster.bodyFont, weight: poster.bodyWeight},
  ];
}

/**
 * @param {object} poster - see DEFAULT_POSTER; `coordinates` is the formatted text
 * @param {number} W - paper width
 * @param {number} H - paper height
 * @returns {{W, H, map: {x, y, w, h, shape, cx, cy, r}, texts, rules, borders, fade}}
 */
export function computeLayout(poster, W, H) {
  let u = W / 100;
  let titleFont = getFont(poster.titleFont), bodyFont = getFont(poster.bodyFont);
  let titleWeight = resolveWeight(titleFont, poster.titleWeight);
  let bodyWeight = resolveWeight(bodyFont, poster.bodyWeight);
  let spacing = Number(poster.letterSpacing) || 0;
  let caseOf = text => poster.uppercase ? text.toUpperCase() : text;

  let hasText = poster.layout !== 'none';
  let margin = poster.layout === 'overlay' ? 0 : (poster.border === 'none' ? 6 * u : 8 * u);
  let mapWidth = W - 2 * margin;

  // Text lines from top to bottom: [text, font, weight, size, letterSpacing (em), gapAfter]
  let lines = [];
  if (hasText) {
    if (poster.tagline) lines.push(line('tagline', caseOf(poster.tagline), bodyFont, bodyWeight, 2.4 * u, Math.max(spacing, 0.2), 1.4 * u));
    if (poster.title) {
      let available = mapWidth * 0.92 - (poster.titleRules ? 30 * u : 0);
      let size = fitSize(caseOf(poster.title), titleFont, titleWeight, 10 * u, spacing, available);
      lines.push(line('title', caseOf(poster.title), titleFont, titleWeight, size, spacing, 1.8 * u));
    }
    if (poster.subtitle) lines.push(line('subtitle', caseOf(poster.subtitle), bodyFont, bodyWeight, 2.8 * u, spacing, 1.4 * u));
    if (poster.note) lines.push(line('note', poster.note, bodyFont, bodyWeight, 2.4 * u, spacing * 0.5, 1.2 * u));
    if (poster.note2) lines.push(line('note2', poster.note2, bodyFont, bodyWeight, 2.0 * u, spacing * 0.5, 1.2 * u));
    if (poster.showCoordinates && poster.coordinates) {
      lines.push(line('coordinates', poster.coordinates, bodyFont, bodyWeight, 1.9 * u, Math.max(spacing, 0.1), 1.2 * u));
    }
  }
  let legendHeight = 0;
  if (hasText && poster.legend && poster.showLegend) legendHeight = 5.2 * u;
  let textHeight = legendHeight + lines.reduce((sum, l, i) => sum + l.size * 1.15 + (i < lines.length - 1 ? l.gapAfter : 0), 0);

  let map, textTop, fade = null;
  if (poster.layout === 'bottom') {
    textTop = H - margin * 0.85 - textHeight;
    map = {x: margin, y: margin, w: mapWidth, h: textTop - 4 * u - margin};
  } else if (poster.layout === 'top') {
    textTop = margin * 0.85;
    let mapTop = textTop + textHeight + 4 * u;
    map = {x: margin, y: mapTop, w: mapWidth, h: H - margin - mapTop};
  } else if (poster.layout === 'overlay') {
    textTop = H - 7 * u - textHeight;
    map = {x: 0, y: 0, w: W, h: H};
    if (lines.length) fade = {from: Math.max(0, textTop - 22 * u), to: Math.min(H, textTop + 2 * u)};
  } else {
    map = {x: margin, y: margin, w: mapWidth, h: H - 2 * margin};
  }
  if (lines.length === 0 && poster.layout !== 'overlay') map.h = H - map.y - margin;
  map.h = Math.max(map.h, 10 * u);
  map.shape = poster.shape;
  map.cx = map.x + map.w / 2;
  map.cy = map.y + map.h / 2;
  map.r = Math.min(map.w, map.h) / 2;

  let texts = [];
  let rules = [];
  let y = textTop;
  lines.forEach(l => {
    let baseline = y + l.size * 0.95;
    texts.push({
      text: l.text,
      x: W / 2,
      y: baseline,
      size: l.size,
      family: cssFamily(l.font),
      fontId: l.font.id,
      weight: l.weight,
      letterSpacing: l.spacing * l.size,
      color: poster.textColor
    });
    if (l.id === 'title' && poster.titleRules) {
      let half = l.width / 2 + 4 * u;
      let ruleY = y + l.size * 0.6;
      let length = Math.min(18 * u, (mapWidth - 2 * half) / 2);
      if (length > 2 * u) {
        rules.push({x1: W / 2 - half - length, x2: W / 2 - half, y: ruleY, width: 0.3 * u});
        rules.push({x1: W / 2 + half, x2: W / 2 + half + length, y: ruleY, width: 0.3 * u});
      }
    }
    y += l.size * 1.15 + l.gapAfter;
  });

  let legend = null;
  if (legendHeight) {
    let barWidth = 26 * u, barHeight = 0.9 * u, labelSize = 1.6 * u;
    let top = y + 1.2 * u;
    legend = {
      x: W / 2 - barWidth / 2, y: top + labelSize * 1.3, w: barWidth, h: barHeight,
      colors: poster.legend.colors,
      labels: [
        {text: poster.legend.label, x: W / 2, y: top + labelSize * 0.9, anchor: 'middle'},
        {text: poster.legend.min, x: W / 2 - barWidth / 2 - 1.5 * u, y: top + labelSize * 1.3 + barHeight, anchor: 'end'},
        {text: poster.legend.max, x: W / 2 + barWidth / 2 + 1.5 * u, y: top + labelSize * 1.3 + barHeight, anchor: 'start'},
      ].map(l => Object.assign(l, {
        size: labelSize, family: cssFamily(bodyFont), fontId: bodyFont.id, weight: bodyWeight,
        letterSpacing: 0, color: poster.textColor
      }))
    };
    legend.labels.forEach(l => texts.push(l));
  }

  if (poster.attribution) {
    let size = 0.9 * u;
    let inset = Math.max(margin * 0.4, 2 * u);
    texts.push({
      text: '© OpenStreetMap contributors',
      x: W - inset,
      y: H - inset * 0.6,
      size,
      family: cssFamily(bodyFont),
      fontId: bodyFont.id,
      weight: bodyWeight,
      letterSpacing: 0,
      color: poster.textColor,
      anchor: 'end',
      opacity: 0.55
    });
  }

  let borders = [];
  if (poster.border === 'thin') {
    borders.push({inset: 3 * u, width: 0.3 * u});
  } else if (poster.border === 'double') {
    borders.push({inset: 2.4 * u, width: 0.7 * u});
    borders.push({inset: 3.8 * u, width: 0.2 * u});
  }

  return {W, H, u, map, texts, rules, borders, fade, legend};

  function line(id, text, font, weight, size, letterSpacing, gapAfter) {
    let width = measure(text, font, weight, size, letterSpacing);
    return {id, text, font, weight, size, spacing: letterSpacing, gapAfter, width};
  }
}

/**
 * Builds the overlay as an <svg> element string of size W x H.
 * @param {string} [embeddedFontCSS] - @font-face rules (for exports)
 * @param {string} [idPrefix] - unique prefix for gradient ids
 */
export function overlaySVG(layout, poster, embeddedFontCSS, idPrefix = 'poster') {
  let {W, H, map, texts, rules, borders, fade, legend} = layout;
  let out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${r(W)}" height="${r(H)}" viewBox="0 0 ${r(W)} ${r(H)}">`);
  out.push('<defs>');
  if (embeddedFontCSS) out.push(`<style>${embeddedFontCSS}</style>`);
  if (fade) {
    out.push(`<linearGradient id="${idPrefix}-fade" gradientUnits="userSpaceOnUse" x1="0" y1="${r(fade.from)}" x2="0" y2="${r(fade.to)}">` +
      `<stop offset="0" stop-color="${poster.paperColor}" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="${poster.paperColor}" stop-opacity="0.96"/></linearGradient>`);
  }
  if (legend) {
    out.push(`<linearGradient id="${idPrefix}-legend" x1="0" y1="0" x2="1" y2="0">` +
      legend.colors.map((c, i) => `<stop offset="${r(i / (legend.colors.length - 1))}" stop-color="${c}"/>`).join('') +
      '</linearGradient>');
  }
  out.push('</defs>');

  // Paper everywhere except the map window.
  let paper = `M0 0H${r(W)}V${r(H)}H0Z`;
  let hole = map.shape === 'circle'
    ? `M${r(map.cx - map.r)} ${r(map.cy)}a${r(map.r)} ${r(map.r)} 0 1 0 ${r(2 * map.r)} 0a${r(map.r)} ${r(map.r)} 0 1 0 ${r(-2 * map.r)} 0Z`
    : `M${r(map.x)} ${r(map.y)}h${r(map.w)}v${r(map.h)}h${r(-map.w)}Z`;
  out.push(`<path fill="${poster.paperColor}" fill-rule="evenodd" d="${paper}${hole}"/>`);

  if (fade) {
    out.push(`<rect x="0" y="${r(fade.from)}" width="${r(W)}" height="${r(fade.to - fade.from)}" fill="url(#${idPrefix}-fade)"/>`);
    out.push(`<rect x="0" y="${r(fade.to)}" width="${r(W)}" height="${r(H - fade.to)}" fill="${poster.paperColor}" fill-opacity="0.96"/>`);
  }

  borders.forEach(b => {
    out.push(`<rect x="${r(b.inset)}" y="${r(b.inset)}" width="${r(W - 2 * b.inset)}" height="${r(H - 2 * b.inset)}" fill="none" stroke="${poster.textColor}" stroke-width="${r(b.width)}"/>`);
  });
  rules.forEach(l => {
    out.push(`<line x1="${r(l.x1)}" y1="${r(l.y)}" x2="${r(l.x2)}" y2="${r(l.y)}" stroke="${poster.textColor}" stroke-width="${r(l.width)}"/>`);
  });

  if (legend) {
    out.push(`<rect x="${r(legend.x)}" y="${r(legend.y)}" width="${r(legend.w)}" height="${r(legend.h)}" fill="url(#${idPrefix}-legend)"/>`);
  }

  texts.forEach(t => {
    let anchor = t.anchor || 'middle';
    // letter-spacing adds space after every glyph, including the last one; shift to stay centered.
    let x = anchor === 'middle' ? t.x + t.letterSpacing / 2 : t.x;
    out.push(`<text x="${r(x)}" y="${r(t.y)}" text-anchor="${anchor}" font-family="${escapeAttr(t.family)}" ` +
      `font-size="${r(t.size)}" font-weight="${t.weight}" letter-spacing="${r(t.letterSpacing)}" fill="${t.color}"` +
      `${t.opacity ? ` fill-opacity="${t.opacity}"` : ''}>${escapeText(t.text)}</text>`);
  });
  out.push('</svg>');
  return out.join('\n');
}

let measureContext = null;

function measure(text, font, weight, size, letterSpacing) {
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  measureContext.font = `${weight} ${size}px ${cssFamily(font)}`;
  let width = measureContext.measureText(text).width;
  return width + letterSpacing * size * Math.max(0, text.length - 1);
}

function fitSize(text, font, weight, maxSize, letterSpacing, available) {
  let width = measure(text, font, weight, maxSize, letterSpacing);
  return width > available ? maxSize * available / width : maxSize;
}

/**
 * Formats map center coordinates for the poster.
 */
export function formatCoordinates(lat, lon, format) {
  let ns = lat >= 0 ? 'N' : 'S', ew = lon >= 0 ? 'E' : 'W';
  if (format === 'dms') return `${dms(Math.abs(lat))} ${ns}  ${dms(Math.abs(lon))} ${ew}`;
  return `${Math.abs(lat).toFixed(4)}° ${ns} / ${Math.abs(lon).toFixed(4)}° ${ew}`;
}

function dms(value) {
  let d = Math.floor(value);
  let mFloat = (value - d) * 60;
  let m = Math.floor(mFloat);
  let s = Math.round((mFloat - m) * 60);
  if (s === 60) { s = 0; m += 1; }
  if (m === 60) { m = 0; d += 1; }
  return `${d}°${String(m).padStart(2, '0')}′${String(s).padStart(2, '0')}″`;
}

function r(x) {
  return Math.round(x * 100) / 100;
}

function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}
