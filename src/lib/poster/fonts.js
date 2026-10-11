/**
 * Poster fonts. Files are bundled with the app (via @fontsource, SIL Open Font
 * License), so posters work offline and exports don't depend on a font CDN.
 * Only the latin subset is included.
 */
import montserrat300 from '@fontfiles/montserrat/files/montserrat-latin-300-normal.woff2';
import montserrat400 from '@fontfiles/montserrat/files/montserrat-latin-400-normal.woff2';
import montserrat700 from '@fontfiles/montserrat/files/montserrat-latin-700-normal.woff2';
import josefin300 from '@fontfiles/josefin-sans/files/josefin-sans-latin-300-normal.woff2';
import josefin400 from '@fontfiles/josefin-sans/files/josefin-sans-latin-400-normal.woff2';
import josefin700 from '@fontfiles/josefin-sans/files/josefin-sans-latin-700-normal.woff2';
import playfair400 from '@fontfiles/playfair-display/files/playfair-display-latin-400-normal.woff2';
import playfair700 from '@fontfiles/playfair-display/files/playfair-display-latin-700-normal.woff2';
import cormorant300 from '@fontfiles/cormorant-garamond/files/cormorant-garamond-latin-300-normal.woff2';
import cormorant400 from '@fontfiles/cormorant-garamond/files/cormorant-garamond-latin-400-normal.woff2';
import cormorant700 from '@fontfiles/cormorant-garamond/files/cormorant-garamond-latin-700-normal.woff2';
import oswald300 from '@fontfiles/oswald/files/oswald-latin-300-normal.woff2';
import oswald400 from '@fontfiles/oswald/files/oswald-latin-400-normal.woff2';
import oswald700 from '@fontfiles/oswald/files/oswald-latin-700-normal.woff2';
import bebas400 from '@fontfiles/bebas-neue/files/bebas-neue-latin-400-normal.woff2';
import raleway300 from '@fontfiles/raleway/files/raleway-latin-300-normal.woff2';
import raleway400 from '@fontfiles/raleway/files/raleway-latin-400-normal.woff2';
import raleway700 from '@fontfiles/raleway/files/raleway-latin-700-normal.woff2';
import spaceMono400 from '@fontfiles/space-mono/files/space-mono-latin-400-normal.woff2';
import spaceMono700 from '@fontfiles/space-mono/files/space-mono-latin-700-normal.woff2';

export const FONTS = [
  {id: 'montserrat', family: 'Montserrat', label: 'Montserrat (geometric sans)', fallback: 'sans-serif',
    files: {300: montserrat300, 400: montserrat400, 700: montserrat700}},
  {id: 'josefin', family: 'Josefin Sans', label: 'Josefin Sans (Futura-like)', fallback: 'sans-serif',
    files: {300: josefin300, 400: josefin400, 700: josefin700}},
  {id: 'raleway', family: 'Raleway', label: 'Raleway (elegant sans)', fallback: 'sans-serif',
    files: {300: raleway300, 400: raleway400, 700: raleway700}},
  {id: 'oswald', family: 'Oswald', label: 'Oswald (condensed)', fallback: 'sans-serif',
    files: {300: oswald300, 400: oswald400, 700: oswald700}},
  {id: 'bebas', family: 'Bebas Neue', label: 'Bebas Neue (display)', fallback: 'sans-serif',
    files: {400: bebas400}},
  {id: 'playfair', family: 'Playfair Display', label: 'Playfair Display (serif)', fallback: 'serif',
    files: {400: playfair400, 700: playfair700}},
  {id: 'cormorant', family: 'Cormorant Garamond', label: 'Cormorant Garamond (classic serif)', fallback: 'serif',
    files: {300: cormorant300, 400: cormorant400, 700: cormorant700}},
  {id: 'spacemono', family: 'Space Mono', label: 'Space Mono (monospace)', fallback: 'monospace',
    files: {400: spaceMono400, 700: spaceMono700}},
];

export const FONT_WEIGHTS = [
  {value: 300, label: 'Light'},
  {value: 400, label: 'Regular'},
  {value: 700, label: 'Bold'},
];

export function getFont(id) {
  return FONTS.find(f => f.id === id) || FONTS[0];
}

/**
 * Closest available weight of the font.
 */
export function resolveWeight(font, weight) {
  let available = Object.keys(font.files).map(Number);
  return available.reduce((best, w) => Math.abs(w - weight) < Math.abs(best - weight) ? w : best, available[0]);
}

export function cssFamily(font) {
  return `'${font.family}', ${font.fallback}`;
}

let loaded = new Map(); // `${id}-${weight}` -> Promise

/**
 * Loads a font weight into the document (needed before measuring text).
 */
export function loadFont(id, weight) {
  let font = getFont(id);
  let w = resolveWeight(font, weight);
  let key = font.id + '-' + w;
  if (!loaded.has(key)) {
    let face = new FontFace(font.family, `url(${font.files[w]}) format('woff2')`, {weight: String(w), style: 'normal'});
    loaded.set(key, face.load().then(f => {
      document.fonts.add(f);
      return f;
    }));
  }
  return loaded.get(key);
}

let dataUrls = new Map(); // file url -> Promise<data url>

/**
 * Returns @font-face CSS with base64-embedded fonts, so an SVG renders with the
 * right fonts outside of this page (and when drawn into a canvas as an image).
 * @param {Array<{id, weight}>} usages
 */
export function getEmbeddedFontCSS(usages) {
  let unique = new Map();
  usages.forEach(({id, weight}) => {
    let font = getFont(id);
    let w = resolveWeight(font, weight);
    unique.set(font.id + '-' + w, {font, weight: w});
  });

  return Promise.all(Array.from(unique.values()).map(({font, weight}) => {
    let url = font.files[weight];
    if (!dataUrls.has(url)) {
      dataUrls.set(url, fetch(url).then(r => r.blob()).then(blobToDataURL));
    }
    return dataUrls.get(url).then(dataUrl =>
      `@font-face{font-family:'${font.family}';font-weight:${weight};font-style:normal;src:url(${dataUrl}) format('woff2');}`
    );
  })).then(rules => rules.join('\n'));
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
