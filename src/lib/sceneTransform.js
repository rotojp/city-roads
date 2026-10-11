const SAMPLE = 1000; // scene units used to derive the affine transform

/**
 * Returns [a, b, c, d, e, f] that maps w-gl scene coordinates (z = 0) to client
 * (css) pixels: x' = a*x + c*y + e, y' = b*x + d*y + f.
 *
 * The map camera looks straight down, so the projection of the z = 0 plane is affine.
 */
export function getSceneToClientTransform(renderer) {
  let o = renderer.getClientCoordinate(0, 0);
  let px = renderer.getClientCoordinate(SAMPLE, 0);
  let py = renderer.getClientCoordinate(0, SAMPLE);
  return [
    (px.x - o.x) / SAMPLE, (px.y - o.y) / SAMPLE,
    (py.x - o.x) / SAMPLE, (py.y - o.y) / SAMPLE,
    o.x, o.y
  ];
}
