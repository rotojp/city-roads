/**
 * Clipping helpers. Vector tiles carry a buffer of geometry from neighbouring
 * tiles. If we do not clip it, semi-transparent lines get drawn twice along
 * tile edges and show up as darker seams.
 */

/**
 * Clips a polyline (array of {x, y}) to the [min, max] square. Pushes resulting
 * pieces into `out` as flat arrays [x0, y0, x1, y1, ...].
 */
export function clipPolyline(points, min, max, out) {
  let current = null;
  let seg = [0, 0, 0, 0];

  for (let i = 1; i < points.length; ++i) {
    let a = points[i - 1], b = points[i];
    let flags = clipSegment(a.x, a.y, b.x, b.y, min, max, seg);
    if (flags < 0) {
      if (current) { out.push(current); current = null; }
      continue;
    }
    let startClipped = flags & 1;
    let endClipped = flags & 2;
    if (!current || startClipped) {
      if (current) out.push(current);
      current = [seg[0], seg[1]];
    }
    current.push(seg[2], seg[3]);
    if (endClipped) {
      out.push(current);
      current = null;
    }
  }

  if (current) out.push(current);
}

/**
 * Liang–Barsky. Returns -1 when the segment is fully outside, otherwise a bit
 * mask: 1 - start point was moved, 2 - end point was moved. Writes result into `out`.
 */
function clipSegment(x0, y0, x1, y1, min, max, out) {
  let t0 = 0, t1 = 1;
  let dx = x1 - x0, dy = y1 - y0;
  let p = [-dx, dx, -dy, dy];
  let q = [x0 - min, max - x0, y0 - min, max - y0];

  for (let i = 0; i < 4; ++i) {
    if (p[i] === 0) {
      if (q[i] < 0) return -1;
    } else {
      let r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return -1;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return -1;
        if (r < t1) t1 = r;
      }
    }
  }

  out[0] = x0 + t0 * dx; out[1] = y0 + t0 * dy;
  out[2] = x0 + t1 * dx; out[3] = y0 + t1 * dy;
  return (t0 > 0 ? 1 : 0) | (t1 < 1 ? 2 : 0);
}

/**
 * Sutherland–Hodgman clipping of a ring (array of {x, y}) against the [min, max] square.
 * Keeps ring orientation. Returns array of {x, y} (may be empty).
 */
export function clipRing(ring, min, max) {
  let output = ring;
  output = clipAgainst(output, p => p.x >= min, (a, b) => intersectX(a, b, min));
  output = clipAgainst(output, p => p.x <= max, (a, b) => intersectX(a, b, max));
  output = clipAgainst(output, p => p.y >= min, (a, b) => intersectY(a, b, min));
  output = clipAgainst(output, p => p.y <= max, (a, b) => intersectY(a, b, max));
  return output;
}

function clipAgainst(points, inside, intersect) {
  if (points.length === 0) return points;
  let result = [];
  let prev = points[points.length - 1];
  let prevInside = inside(prev);
  for (let i = 0; i < points.length; ++i) {
    let curr = points[i];
    let currInside = inside(curr);
    if (currInside) {
      if (!prevInside) result.push(intersect(prev, curr));
      result.push(curr);
    } else if (prevInside) {
      result.push(intersect(prev, curr));
    }
    prev = curr;
    prevInside = currInside;
  }
  return result;
}

function intersectX(a, b, x) {
  let t = (x - a.x) / (b.x - a.x);
  return {x, y: a.y + t * (b.y - a.y)};
}

function intersectY(a, b, y) {
  let t = (y - a.y) / (b.y - a.y);
  return {x: a.x + t * (b.x - a.x), y};
}
