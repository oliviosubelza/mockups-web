import type { LatLng, Polygon } from "../types";

/** Santa Cruz de la Sierra, Bolivia — default map center. */
export const SANTA_CRUZ_CENTER: LatLng = [-17.783, -63.182];
export const DEFAULT_ZOOM = 14;

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(point: LatLng, polygon: Polygon): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Count how many of the given points fall inside the polygon. */
export function countPointsInPolygon(points: LatLng[], polygon: Polygon): number {
  let n = 0;
  for (const p of points) if (pointInPolygon(p, polygon)) n++;
  return n;
}

function centroid(polygon: Polygon): LatLng {
  const n = polygon.length;
  const sum = polygon.reduce<[number, number]>(
    (acc, [la, ln]) => [acc[0] + la, acc[1] + ln],
    [0, 0],
  );
  return [sum[0] / n, sum[1] / n];
}

/** Axis-aligned geographic box (also the shape `bbox` returns). */
export interface Box {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Axis-aligned bounding box of a polygon. */
export function bbox(polygon: Polygon): Box {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const [la, ln] of polygon) {
    minLat = Math.min(minLat, la);
    maxLat = Math.max(maxLat, la);
    minLng = Math.min(minLng, ln);
    maxLng = Math.max(maxLng, ln);
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * True when the polygon's centroid falls inside the box. Used by the map's
 * rubber-band selection: a manzano counts as "inside the dragged area" when its
 * center is, so blocks merely clipped by the edge of the box aren't swept in.
 */
export function polygonCenterInBox(polygon: Polygon, box: Box): boolean {
  const [lat, lng] = centroid(polygon);
  return lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;
}

/**
 * Interior sample points of a polygon: its centroid plus every vertex pulled
 * slightly toward the centroid. Pulling the vertices inward means points that
 * sit exactly ON the boundary (e.g. the shared edge of two adjacent grid cells)
 * don't register as "inside" the neighbor.
 */
function interiorProbe(poly: Polygon): LatLng[] {
  const c = centroid(poly);
  const pts: LatLng[] = [c];
  for (const [la, ln] of poly) {
    pts.push([la + (c[0] - la) * 1e-3, ln + (c[1] - ln) * 1e-3]);
  }
  return pts;
}

/**
 * Lightweight overlap heuristic used to warn the user when a block collides
 * with another: true if bounding boxes intersect AND an interior sample of one
 * polygon falls inside the other. Boundary-only contact — such as edge-adjacent
 * cells of a grid subdivision — is intentionally NOT flagged as an overlap.
 */
export function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  const ba = bbox(a);
  const bb = bbox(b);
  const bboxIntersect =
    ba.minLat <= bb.maxLat &&
    ba.maxLat >= bb.minLat &&
    ba.minLng <= bb.maxLng &&
    ba.maxLng >= bb.minLng;
  if (!bboxIntersect) return false;
  return (
    interiorProbe(a).some((p) => pointInPolygon(p, b)) ||
    interiorProbe(b).some((p) => pointInPolygon(p, a))
  );
}

/** Shoelace area of a polygon (in squared degrees — for relative comparisons only). */
export function polygonArea(polygon: Polygon): number {
  let a = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    a += polygon[j][1] * polygon[i][0] - polygon[i][1] * polygon[j][0];
  }
  return Math.abs(a) / 2;
}

/**
 * Sutherland–Hodgman clip of `poly` against a single half-plane.
 * `keep` decides which side to retain; `intersect` builds the crossing point.
 */
function clipHalfPlane(
  poly: Polygon,
  keep: (p: LatLng) => boolean,
  intersect: (a: LatLng, b: LatLng) => LatLng,
): Polygon {
  if (poly.length === 0) return poly;
  const out: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const curIn = keep(cur);
    const prevIn = keep(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

/** Crossing point of segment a→b with the horizontal line lat = L. */
export const crossLat = (a: LatLng, b: LatLng, L: number): LatLng => {
  const t = (L - a[0]) / (b[0] - a[0]);
  return [L, a[1] + t * (b[1] - a[1])];
};
/** Crossing point of segment a→b with the vertical line lng = L. */
export const crossLng = (a: LatLng, b: LatLng, L: number): LatLng => {
  const t = (L - a[1]) / (b[1] - a[1]);
  return [a[0] + t * (b[0] - a[0]), L];
};

/**
 * Clip a polygon to an axis-aligned box. Because the box is convex, this works
 * even for concave polygons. Returns [] if nothing remains.
 */
export function clipPolygonToBox(
  poly: Polygon,
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
): Polygon {
  let p: Polygon = poly;
  p = clipHalfPlane(p, (q) => q[0] >= minLat, (a, b) => crossLat(a, b, minLat));
  if (p.length < 3) return [];
  p = clipHalfPlane(p, (q) => q[0] <= maxLat, (a, b) => crossLat(a, b, maxLat));
  if (p.length < 3) return [];
  p = clipHalfPlane(p, (q) => q[1] >= minLng, (a, b) => crossLng(a, b, minLng));
  if (p.length < 3) return [];
  p = clipHalfPlane(p, (q) => q[1] <= maxLng, (a, b) => crossLng(a, b, maxLng));
  if (p.length < 3) return [];
  return p;
}

/**
 * Subdivide a polygon into a `rows`×`cols` grid. Every cell is the intersection
 * of a grid rectangle with the polygon, so interior cells are full squares and
 * boundary cells conform to the outline — together they tile the original with
 * no gaps or overlaps. Empty / sliver cells are dropped. Returns one polygon
 * per non-empty cell.
 */
export function subdivideIntoGrid(polygon: Polygon, rows: number, cols: number): Polygon[] {
  if (polygon.length < 3 || rows < 1 || cols < 1) return [];
  const { minLat, maxLat, minLng, maxLng } = bbox(polygon);
  const cellH = (maxLat - minLat) / rows;
  const cellW = (maxLng - minLng) / cols;
  const minArea = polygonArea(polygon) * 1e-4; // discard boundary slivers
  const cells: Polygon[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = clipPolygonToBox(
        polygon,
        minLat + r * cellH,
        minLat + (r + 1) * cellH,
        minLng + c * cellW,
        minLng + (c + 1) * cellW,
      );
      if (cell.length >= 3 && polygonArea(cell) > minArea) cells.push(cell);
    }
  }
  return cells;
}

/**
 * Split a polygon in two along a straight axis-aligned line (`lat = value` or
 * `lng = value`), built the same way `clipPolygonToBox` is: one `clipHalfPlane`
 * call per side of the line. A resulting side is dropped (empty array) if it
 * has fewer than 3 points or ~zero area — mirrors the `minArea` pattern used
 * in `subdivideIntoGrid`.
 */
export function splitPolygonByLine(
  polygon: Polygon,
  axis: "lat" | "lng",
  value: number,
): [Polygon, Polygon] {
  if (polygon.length < 3) return [[], []];
  const minArea = polygonArea(polygon) * 1e-4;
  const [sideA, sideB] =
    axis === "lat"
      ? [
          clipHalfPlane(polygon, (q) => q[0] <= value, (a, b) => crossLat(a, b, value)),
          clipHalfPlane(polygon, (q) => q[0] >= value, (a, b) => crossLat(a, b, value)),
        ]
      : [
          clipHalfPlane(polygon, (q) => q[1] <= value, (a, b) => crossLng(a, b, value)),
          clipHalfPlane(polygon, (q) => q[1] >= value, (a, b) => crossLng(a, b, value)),
        ];
  const valid = (p: Polygon) => p.length >= 3 && polygonArea(p) > minArea;
  return [valid(sideA) ? sideA : [], valid(sideB) ? sideB : []];
}

export { centroid };
