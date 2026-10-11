/**
 * Renders the map inside the poster's map window, straight from tile data.
 * The same input produces a raster (Canvas2D) or a vector (SVG) image, so both
 * exports look the same as the screen.
 *
 * Options:
 *   tiles      - loaded tiles to draw (see TileStore)
 *   toOutput   - (lon, lat) => [x, y] in output pixels
 *   width, height - output (paper) size in pixels
 *   window     - map window {shape: 'rect'|'circle', x, y, w, h, cx, cy, r} in output pixels
 *   scale      - output pixels per css pixel (for route widths)
 *   route      - RouteLayer or null
 *   background - css color
 *   layers     - [{id, color, width}] road layers in draw order (least important first);
 *                `width` is in output pixels
 *   areas      - null, or {water, green, waterwayWidth} (colors and width in output pixels)
 *   mask       - BoundaryMask or null (clip to city boundary)
 */

export function renderToCanvas(options) {
  let {width, height} = options;
  let canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  let ctx = canvas.getContext('2d');

  ctx.save();
  ctx.beginPath();
  addShape(ctx, options);
  ctx.clip();

  ctx.fillStyle = options.background;
  ctx.fillRect(0, 0, width, height);


  if (options.areas) {
    ctx.save();
    if (options.mask) {
      ctx.beginPath();
      addBoundary(ctx, options);
      ctx.clip('evenodd');
    }
    fillRings(ctx, options, 'green', options.areas.green);
    fillRings(ctx, options, 'water', options.areas.water);
    strokeLines(ctx, options, collectLines(options, 'waterways'), options.areas.water, options.areas.waterwayWidth);
    ctx.restore();
  }

  options.layers.forEach(layer => {
    strokeLines(ctx, options, collectLines(options, layer.id), layer.color, layer.width);
  });

  if (options.route) options.route.renderToCanvas(ctx, options.toOutput, options.scale);

  ctx.restore();
  return canvas;
}

/**
 * Returns SVG elements (no outer <svg>) of the map window.
 */
export function renderToSVG(options) {
  let {width, height} = options;
  let out = [];
  out.push('<defs>');
  out.push(`<clipPath id="frame">${shapeSVG(options)}</clipPath>`);
  if (options.mask && options.areas) {
    out.push(`<clipPath id="city-boundary"><path clip-rule="evenodd" d="${boundaryPath(options)}"/></clipPath>`);
  }
  out.push('</defs>');

  out.push('<g clip-path="url(#frame)">');
  out.push(`<rect id="background" x="0" y="0" width="${width}" height="${height}" fill="${options.background}"/>`);

  if (options.areas) {
    out.push(`<g id="areas"${options.mask ? ' clip-path="url(#city-boundary)"' : ''}>`);
    let green = ringsPath(options, 'green');
    if (green) out.push(`<path id="green" fill="${options.areas.green}" d="${green}"/>`);
    let water = ringsPath(options, 'water');
    if (water) out.push(`<path id="water" fill="${options.areas.water}" d="${water}"/>`);
    let waterways = linesPath(options, collectLines(options, 'waterways'));
    if (waterways) {
      out.push(`<path id="waterways" fill="none" stroke="${options.areas.water}" stroke-width="${round(options.areas.waterwayWidth)}" stroke-linecap="round" stroke-linejoin="round" d="${waterways}"/>`);
    }
    out.push('</g>');
  }

  out.push('<g id="roads" fill="none" stroke-linecap="round" stroke-linejoin="round">');
  options.layers.forEach(layer => {
    let d = linesPath(options, collectLines(options, layer.id));
    if (!d) return;
    out.push(`<path id="${layer.id}" stroke="${layer.color}" stroke-width="${round(layer.width)}" d="${d}"/>`);
  });
  out.push('</g>');
  if (options.route) out.push(options.route.renderToSVG(options.toOutput, options.scale));
  out.push('</g>');
  return out.join('\n');
}

function collectLines(options, group) {
  let lines = [];
  options.tiles.forEach(tile => {
    let source = tile.data.lines[group];
    if (!source) return;
    source.forEach(line => {
      if (options.mask) options.mask.splitInside(line, lines);
      else lines.push(line);
    });
  });
  return lines;
}

function addShape(ctx, {window: w}) {
  if (w.shape === 'circle') {
    ctx.arc(w.cx, w.cy, w.r, 0, 2 * Math.PI);
  } else {
    ctx.rect(w.x, w.y, w.w, w.h);
  }
}

function shapeSVG({window: w}) {
  if (w.shape === 'circle') {
    return `<circle cx="${round(w.cx)}" cy="${round(w.cy)}" r="${round(w.r)}"/>`;
  }
  return `<rect x="${round(w.x)}" y="${round(w.y)}" width="${round(w.w)}" height="${round(w.h)}"/>`;
}

function addBoundary(ctx, {mask, toOutput}) {
  mask.polygons.forEach(poly => poly.forEach(ring => {
    ring.forEach(([lon, lat], i) => {
      let [x, y] = toOutput(lon, lat);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }));
}

function boundaryPath({mask, toOutput}) {
  let d = [];
  mask.polygons.forEach(poly => poly.forEach(ring => {
    ring.forEach(([lon, lat], i) => {
      let [x, y] = toOutput(lon, lat);
      d.push((i === 0 ? 'M' : 'L') + round(x) + ' ' + round(y));
    });
    d.push('Z');
  }));
  return d.join('');
}

function fillRings(ctx, {tiles, toOutput}, kind, color) {
  ctx.beginPath();
  tiles.forEach(tile => tile.data[kind].forEach(ring => {
    for (let i = 0; i < ring.length; i += 2) {
      let [x, y] = toOutput(ring[i], ring[i + 1]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }));
  ctx.fillStyle = color;
  ctx.fill();
}

function ringsPath({tiles, toOutput}, kind) {
  let d = [];
  tiles.forEach(tile => tile.data[kind].forEach(ring => {
    for (let i = 0; i < ring.length; i += 2) {
      let [x, y] = toOutput(ring[i], ring[i + 1]);
      d.push((i === 0 ? 'M' : 'L') + round(x) + ' ' + round(y));
    }
    d.push('Z');
  }));
  return d.join('');
}

function strokeLines(ctx, {toOutput}, lines, color, width) {
  if (!lines.length) return;
  ctx.beginPath();
  lines.forEach(line => {
    for (let i = 0; i < line.length; i += 2) {
      let [x, y] = toOutput(line[i], line[i + 1]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function linesPath({toOutput}, lines) {
  let d = [];
  lines.forEach(line => {
    for (let i = 0; i < line.length; i += 2) {
      let [x, y] = toOutput(line[i], line[i + 1]);
      d.push((i === 0 ? 'M' : 'L') + round(x) + ' ' + round(y));
    }
  });
  return d.join('');
}

function round(x) {
  return Math.round(x * 10) / 10;
}
