import type { Distributor, LatLng, Polygon } from "../types";
import { COTOCA_CENTER, SANTA_CRUZ_TOWN_CENTER, WARNES_CENTER } from "./blocks-data";
import { DEPARTMENT_NAME } from "./locations";

/**
 * The palette an operating area may wear.
 *
 * None of these is the manzano blue (`#264bc5`), the selection amber or the
 * overlap red: a distributor area is the layer *underneath*, so its colours have
 * to stay legible next to the manzanos without ever being mistaken for one.
 */
export const DISTRIBUTOR_COLORS = [
  "#7c3aed", // violeta
  "#0d9488", // teal
  "#db2777", // magenta
  "#ea580c", // naranja
  "#0891b2", // cian
  "#65a30d", // lima
] as const;

/**
 * A rounded box around a town — the shape a real operating area has once the
 * legal boundary is simplified to something a seller can read off a map.
 *
 * Corners are cut rather than square so the three areas never look like the
 * output of a grid: this layer answers "who serves this ground", and ground has
 * edges, not cells.
 */
function areaAround([lat, lng]: LatLng, latSpan: number, lngSpan: number): Polygon {
  const la = latSpan / 2;
  const ln = lngSpan / 2;
  // Corner bite, as a fraction of each span.
  const cut = 0.28;
  return [
    [lat + la, lng - ln * (1 - cut)],
    [lat + la, lng + ln * (1 - cut)],
    [lat + la * (1 - cut), lng + ln],
    [lat - la * (1 - cut), lng + ln],
    [lat - la, lng + ln * (1 - cut)],
    [lat - la, lng - ln * (1 - cut)],
    [lat - la * (1 - cut), lng - ln],
    [lat + la * (1 - cut), lng - ln],
  ].map(([a, b]) => [Math.round(a * 1e6) / 1e6, Math.round(b * 1e6) / 1e6] as LatLng);
}

/**
 * La distribuidora a la que pertenece el login sembrado.
 *
 * Separate from `SANTA_CRUZ_DISTRIBUTORS` below, which are operating *areas* on
 * the map: this one is the commercial unit every seeded document is registered
 * under, and it has to be one string in one place because the session and the
 * documents must agree — a note that claims a distributor the signed-in user
 * does not belong to is a bug you only notice in a list.
 */
export const OPERATING_DISTRIBUTOR = "DIST. BENI";

/**
 * Áreas de operación sembradas: una distribuidora por pueblo.
 *
 * Three towns of one department, each with its own distributor — which is the
 * relationship this layer exists to show. They do not touch each other, and that
 * is deliberate too: the ground between them belongs to nobody, and the legend's
 * "Sin distribuidora" count is the map telling the truth about it.
 *
 * Santa Cruz gets the widest area because it is where the hand-drawn manzanos
 * are; the spans below are sized to contain each town's manzanos with room to
 * spare, so a manzano never pokes out of the area that is supposed to serve it.
 */
export const SANTA_CRUZ_DISTRIBUTORS: Distributor[] = [
  {
    id: "dst_scz",
    name: "DIST. SANTA CRUZ",
    code: "DIS-01",
    departmentName: DEPARTMENT_NAME,
    color: DISTRIBUTOR_COLORS[0],
    createdAt: "2026-07-20T10:00:00.000Z",
    polygon: areaAround(SANTA_CRUZ_TOWN_CENTER, 0.056, 0.07),
  },
  {
    id: "dst_warnes",
    name: "DIST. WARNES",
    code: "DIS-02",
    departmentName: DEPARTMENT_NAME,
    color: DISTRIBUTOR_COLORS[1],
    createdAt: "2026-07-20T10:05:00.000Z",
    polygon: areaAround(WARNES_CENTER, 0.026, 0.032),
  },
  {
    id: "dst_cotoca",
    name: "DIST. COTOCA",
    code: "DIS-03",
    departmentName: DEPARTMENT_NAME,
    color: DISTRIBUTOR_COLORS[2],
    createdAt: "2026-07-20T10:10:00.000Z",
    polygon: areaAround(COTOCA_CENTER, 0.026, 0.032),
  },
];

/**
 * Distributor names a devolución may be registered under, for the
 * `Distribuidora` filter and the seed. The operating one first (the login's
 * own, and the most common case), then the mapped operating areas — same
 * names as `SANTA_CRUZ_DISTRIBUTORS`, reused rather than duplicated so the
 * filter and the areas layer never drift apart.
 */
export const RETURN_DISTRIBUTOR_NAMES: string[] = [
  OPERATING_DISTRIBUTOR,
  ...SANTA_CRUZ_DISTRIBUTORS.map((d) => d.name),
];
