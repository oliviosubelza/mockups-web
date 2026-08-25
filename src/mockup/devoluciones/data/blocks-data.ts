import type { Block, LatLng } from "../types";
import { seededRandom } from "../lib/utils";

/**
 * Los tres pueblos que cubre el mock, cada uno con su distribuidora.
 *
 * They are far enough apart to be real territories — Warnes is ~30 km north of
 * the capital, Cotoca ~20 km east — which is the whole point: an operating area
 * that only ever covered one neighbourhood would not show what the layer is for.
 */
/**
 * Not the city's centre — the centre of the manzanos actually drawn below, which
 * sit in its south-west. The distributor area is sized around this, so using the
 * postcard centre would leave the northernmost manzanos outside the territory
 * that is supposed to serve them.
 */
export const SANTA_CRUZ_TOWN_CENTER: LatLng = [-17.7787, -63.1821];
export const WARNES_CENTER: LatLng = [-17.5107, -63.1683];
export const COTOCA_CENTER: LatLng = [-17.7539, -62.9975];

/**
 * Manzanos reales dibujados sobre Santa Cruz de la Sierra. Sirven como semilla
 * por defecto del editor de mapa (reemplazan la grilla generada anterior).
 */
export const SANTA_CRUZ_BLOCKS: Block[] = [
  { id: "blk_sumvdnt", createdAt: "2026-07-17T13:49:32.659Z", polygon: [[-17.789114, -63.189427], [-17.789748, -63.188783], [-17.78891, -63.187925], [-17.788665, -63.188032]] },
  { id: "blk_2h90c2o", createdAt: "2026-07-17T13:49:55.784Z", polygon: [[-17.789114, -63.189427], [-17.789687, -63.190671], [-17.790239, -63.190027]] },
  { id: "blk_evdfkdq", createdAt: "2026-07-17T13:50:15.132Z", polygon: [[-17.790239, -63.190027], [-17.790872, -63.189384], [-17.789748, -63.188783], [-17.789114, -63.189427]] },
  { id: "blk_qbi4qj0", createdAt: "2026-07-17T13:50:24.824Z", polygon: [[-17.789687, -63.190671], [-17.789952, -63.192044], [-17.790606, -63.1914]] },
  { id: "blk_aqq66d9", createdAt: "2026-07-17T13:50:32.653Z", polygon: [[-17.790606, -63.1914], [-17.791179, -63.190692], [-17.790239, -63.190027], [-17.789687, -63.190671]] },
  { id: "blk_s7a3jv5", createdAt: "2026-07-17T13:50:42.581Z", polygon: [[-17.791179, -63.190692], [-17.79171, -63.190027], [-17.790872, -63.189384], [-17.790239, -63.190027]] },
  { id: "blk_x5ftzwn", createdAt: "2026-07-17T13:50:56.433Z", polygon: [[-17.789952, -63.192044], [-17.791322, -63.192001], [-17.790606, -63.1914]] },
  { id: "blk_kov5f51", createdAt: "2026-07-17T13:51:05.294Z", polygon: [[-17.791322, -63.192001], [-17.791996, -63.191293], [-17.791179, -63.190692], [-17.790606, -63.1914]] },
  { id: "blk_pt9m2gh", createdAt: "2026-07-17T13:51:13.062Z", polygon: [[-17.791996, -63.191293], [-17.792671, -63.190692], [-17.79171, -63.190027], [-17.791179, -63.190692]] },
  { id: "blk_jx0zx6q", createdAt: "2026-07-17T13:51:23.918Z", polygon: [[-17.791322, -63.192001], [-17.792405, -63.192752], [-17.792977, -63.192066], [-17.791996, -63.191293]] },
  { id: "blk_4j4qill", createdAt: "2026-07-17T13:51:35.454Z", polygon: [[-17.792977, -63.192066], [-17.79355, -63.191293], [-17.792671, -63.190692], [-17.791996, -63.191293]] },
  { id: "blk_7pb2xqc", createdAt: "2026-07-17T13:51:46.495Z", polygon: [[-17.792405, -63.192752], [-17.7931, -63.193481], [-17.793938, -63.192773], [-17.792977, -63.192066]] },
  { id: "blk_rt612qg", createdAt: "2026-07-17T13:51:59.544Z", polygon: [[-17.793938, -63.192773], [-17.794449, -63.19198], [-17.79355, -63.191293], [-17.792977, -63.192066]] },
  { id: "blk_o9cunu0", createdAt: "2026-07-17T13:53:00.785Z", polygon: [[-17.794449, -63.19198], [-17.795177, -63.190718], [-17.794017, -63.189415], [-17.792671, -63.190692], [-17.79355, -63.191293]] },
  { id: "blk_475dpzw", createdAt: "2026-07-17T13:53:21.009Z", polygon: [[-17.792671, -63.190692], [-17.792992, -63.190388], [-17.792646, -63.188936], [-17.792349, -63.189054], [-17.79171, -63.190027]] },
  { id: "blk_52v4kng", createdAt: "2026-07-17T13:53:48.266Z", polygon: [[-17.792646, -63.188936], [-17.792999, -63.190381], [-17.794017, -63.189415], [-17.793422, -63.188485]] },
  { id: "blk_7dhrkq8", createdAt: "2026-07-17T13:54:02.947Z", polygon: [[-17.793422, -63.188485], [-17.79379, -63.188078], [-17.793075, -63.18722], [-17.793098, -63.188673]] },
  { id: "blk_vn0u4uo", createdAt: "2026-07-17T13:54:37.916Z", polygon: [[-17.792646, -63.188936], [-17.79236, -63.187295], [-17.793075, -63.18722], [-17.79309, -63.188678]] },
  { id: "blk_542f7lr", createdAt: "2026-07-17T13:54:51.381Z", polygon: [[-17.792646, -63.188936], [-17.792349, -63.189054], [-17.790653, -63.187584], [-17.79236, -63.187295]] },
  { id: "blk_c0irptu", createdAt: "2026-07-17T13:55:02.548Z", polygon: [[-17.79171, -63.190027], [-17.79127, -63.189689], [-17.790653, -63.187584], [-17.792349, -63.189054]] },
  { id: "blk_y7gbpe5", createdAt: "2026-07-17T13:55:29.478Z", polygon: [[-17.789748, -63.188783], [-17.78949, -63.18787], [-17.789541, -63.187704], [-17.789771, -63.187613], [-17.790653, -63.187584], [-17.791258, -63.18968], [-17.790872, -63.189384]] },
  { id: "blk_kajfeg5", createdAt: "2026-07-17T13:56:01.903Z", polygon: [[-17.789748, -63.188783], [-17.78891, -63.187925], [-17.789541, -63.187704], [-17.78949, -63.18787]] },
  { id: "blk_c9sikzz", createdAt: "2026-07-17T13:57:09.933Z", polygon: [[-17.777891, -63.178198], [-17.779312, -63.177844], [-17.779169, -63.1769], [-17.777697, -63.177286]] },
  { id: "blk_j4bshfz", createdAt: "2026-07-17T13:57:18.045Z", polygon: [[-17.777697, -63.177286], [-17.777091, -63.177416], [-17.777217, -63.178337], [-17.777891, -63.178198]] },
  { id: "blk_663a386", createdAt: "2026-07-17T13:57:25.318Z", polygon: [[-17.777217, -63.178337], [-17.776818, -63.178423], [-17.776266, -63.177736], [-17.777091, -63.177416]] },
  { id: "blk_hkqg0pq", createdAt: "2026-07-17T13:57:37.482Z", polygon: [[-17.776266, -63.177736], [-17.775459, -63.176996], [-17.777462, -63.176213], [-17.777976, -63.177213], [-17.777091, -63.177416]] },
  { id: "blk_2ri02b2", createdAt: "2026-07-17T13:57:56.368Z", polygon: [[-17.777462, -63.176213], [-17.777995, -63.177208], [-17.779169, -63.1769], [-17.778852, -63.175591]] },
  { id: "blk_sn68l4v", createdAt: "2026-07-17T13:58:10.455Z", polygon: [[-17.777936, -63.176001], [-17.777462, -63.174787], [-17.777442, -63.174357], [-17.778433, -63.174143], [-17.778852, -63.175591]] },
  { id: "blk_2uselac", createdAt: "2026-07-17T13:58:18.747Z", polygon: [[-17.778433, -63.174143], [-17.779711, -63.173982], [-17.779864, -63.174969], [-17.778852, -63.175591]] },
  { id: "blk_tothte8", createdAt: "2026-07-17T13:58:27.429Z", polygon: [[-17.779864, -63.174969], [-17.778852, -63.175591], [-17.779169, -63.1769], [-17.780181, -63.176696]] },
  { id: "blk_ihnxn3j", createdAt: "2026-07-17T13:58:37.380Z", polygon: [[-17.779169, -63.1769], [-17.780181, -63.176696], [-17.780344, -63.177715], [-17.779312, -63.177844]] },
  { id: "blk_5t3a1xj", createdAt: "2026-07-17T13:58:48.460Z", polygon: [[-17.776818, -63.178423], [-17.776849, -63.179109], [-17.776951, -63.179496], [-17.778065, -63.179345], [-17.777891, -63.178198], [-17.777217, -63.178337]] },
  { id: "blk_t8pu18e", createdAt: "2026-07-17T13:58:57.793Z", polygon: [[-17.778065, -63.179345], [-17.777891, -63.178198], [-17.778808, -63.177969], [-17.779138, -63.179131]] },
  { id: "blk_jy2qs4z", createdAt: "2026-07-17T13:59:06.701Z", polygon: [[-17.779138, -63.179131], [-17.778826, -63.177965], [-17.779312, -63.177844], [-17.780344, -63.177715], [-17.780487, -63.178755]] },
  { id: "blk_h62093c", createdAt: "2026-07-17T13:59:24.278Z", polygon: [[-17.777442, -63.174357], [-17.776246, -63.174765], [-17.777462, -63.176213], [-17.77792, -63.176008], [-17.777462, -63.174787]] },
  { id: "blk_6xig1ex", createdAt: "2026-07-17T13:59:34.389Z", polygon: [[-17.776755, -63.175371], [-17.775868, -63.175559], [-17.776399, -63.176628], [-17.777462, -63.176213]] },
  { id: "blk_lrsu30f", createdAt: "2026-07-17T13:59:47.406Z", polygon: [[-17.775868, -63.175559], [-17.775285, -63.17572], [-17.775009, -63.176524], [-17.775459, -63.176996], [-17.776348, -63.176649]] },
  { id: "blk_11akek1", createdAt: "2026-07-17T14:01:55.074Z", polygon: [[-17.761452, -63.162588], [-17.762586, -63.16335], [-17.764273, -63.161129], [-17.764344, -63.160797], [-17.763741, -63.160132], [-17.763404, -63.160153]] },
  { id: "blk_c4wstt0", createdAt: "2026-07-17T14:02:03.398Z", polygon: [[-17.762586, -63.16335], [-17.761319, -63.165967], [-17.760031, -63.165302], [-17.761452, -63.162588]] },
  { id: "blk_vrhyn9z", createdAt: "2026-07-17T14:02:11.603Z", polygon: [[-17.763404, -63.160153], [-17.76274, -63.159434], [-17.761922, -63.160711], [-17.762569, -63.161194]] },
  { id: "blk_edatjvu", createdAt: "2026-07-17T14:02:23.156Z", polygon: [[-17.762569, -63.161194], [-17.761922, -63.160711], [-17.76149, -63.161956], [-17.761742, -63.162226]] },
  { id: "blk_7hf9tw4", createdAt: "2026-07-17T14:02:30.355Z", polygon: [[-17.76149, -63.161956], [-17.760685, -63.161387], [-17.761432, -63.160304], [-17.761922, -63.160711]] },
  { id: "blk_sv9g72y", createdAt: "2026-07-17T14:02:37.580Z", polygon: [[-17.761922, -63.160711], [-17.761432, -63.160304], [-17.762178, -63.159016], [-17.76274, -63.159434]] },
  { id: "blk_kfq0rhk", createdAt: "2026-07-17T14:02:48.420Z", polygon: [[-17.760685, -63.161387], [-17.759142, -63.1604], [-17.758866, -63.160893], [-17.761452, -63.162588], [-17.761714, -63.162262], [-17.76149, -63.161956], [-17.761234, -63.161806]] },
  { id: "blk_5r3vvbn", createdAt: "2026-07-17T14:03:13.437Z", polygon: [[-17.759941, -63.161598], [-17.759602, -63.162149], [-17.761109, -63.163243], [-17.761452, -63.162588]] },
  { id: "blk_9wavlu9", createdAt: "2026-07-17T14:03:23.462Z", polygon: [[-17.759602, -63.162149], [-17.759346, -63.163028], [-17.760874, -63.163693], [-17.761105, -63.163251]] },
  { id: "blk_x7v8vjy", createdAt: "2026-07-17T14:04:52.048Z", polygon: [[-17.795019, -63.205068], [-17.79461, -63.204253], [-17.797778, -63.20303], [-17.798065, -63.204575], [-17.795428, -63.205411]] },
  { id: "blk_q8b03ka", createdAt: "2026-07-17T14:05:00.050Z", polygon: [[-17.795428, -63.205411], [-17.795602, -63.20735], [-17.796808, -63.206921], [-17.79653, -63.205062]] },
  { id: "blk_ipf1npv", createdAt: "2026-07-17T14:05:06.848Z", polygon: [[-17.796761, -63.206426], [-17.798351, -63.206076], [-17.798065, -63.204575], [-17.796575, -63.205047]] },
  { id: "blk_xdxawy7", createdAt: "2026-07-17T14:05:31.333Z", polygon: [[-17.795827, -63.207972], [-17.795602, -63.20735], [-17.796808, -63.206921], [-17.796849, -63.206942], [-17.796761, -63.206426], [-17.796761, -63.206426], [-17.796767, -63.20646], [-17.79723, -63.206348], [-17.797329, -63.207321], [-17.797002, -63.207492]] },
  { id: "blk_wyjcugc", createdAt: "2026-07-17T14:06:11.486Z", polygon: [[-17.797329, -63.207321], [-17.798535, -63.206548], [-17.798351, -63.206076], [-17.797248, -63.206319]] },
  { id: "blk_vw563ie", createdAt: "2026-07-17T14:06:35.764Z", polygon: [[-17.795827, -63.207972], [-17.795804, -63.208373], [-17.796442, -63.208244], [-17.796365, -63.207752]] },
  { id: "blk_pyb2j68", createdAt: "2026-07-17T14:06:42.244Z", polygon: [[-17.796442, -63.208244], [-17.797102, -63.208099], [-17.797002, -63.207492], [-17.796381, -63.207746]] },
  { id: "blk_yublf92", createdAt: "2026-07-17T14:23:52.766Z", polygon: [[-17.780742, -63.15941], [-17.781601, -63.159388], [-17.781489, -63.158359], [-17.78063, -63.158401]] },
  { id: "blk_wy5q5es", createdAt: "2026-07-17T14:24:01.902Z", polygon: [[-17.78063, -63.158401], [-17.780548, -63.157329], [-17.781356, -63.157297], [-17.781489, -63.158359]] },
  { id: "blk_asdv273", createdAt: "2026-07-17T14:24:09.974Z", polygon: [[-17.780548, -63.157329], [-17.780456, -63.155966], [-17.781233, -63.155838], [-17.781356, -63.157297]] },
];

/**
 * A town's manzanos, generated instead of traced.
 *
 * The Santa Cruz set above was drawn by hand on top of real streets, and that is
 * why it looks like a city. Warnes and Cotoca exist here to prove a different
 * point — that one department holds several distributors, each with its own
 * ground — so they get a grid: honest mock data that is obviously mock, rather
 * than fifty hand-faked coordinates pretending to be a survey.
 *
 * The jitter is seeded, so the towns are identical on every reload exactly like
 * the rest of the seed.
 */
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function townBlocks(
  prefix: string,
  [centerLat, centerLng]: LatLng,
  rows: number,
  cols: number,
  seed: number,
): Block[] {
  const rand = seededRandom(seed);
  // ~85 m × ~105 m per manzano, the size the hand-drawn Santa Cruz ones average.
  const cellLat = 0.00078;
  const cellLng = 0.00105;
  const originLat = centerLat + ((rows - 1) / 2) * cellLat;
  const originLng = centerLng - ((cols - 1) / 2) * cellLng;
  const jitter = (scale: number) => (rand() - 0.5) * scale;
  const at = (r: number, c: number): LatLng => [
    round6(originLat - r * cellLat + jitter(cellLat * 0.22)),
    round6(originLng + c * cellLng + jitter(cellLng * 0.22)),
  ];

  const blocks: Block[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Corners are sampled independently, so neighbouring manzanos do not share
      // vertices — the same slightly-ragged coverage a real grid of blocks has.
      blocks.push({
        id: `blk_${prefix}${String(r * cols + c + 1).padStart(2, "0")}`,
        createdAt: "2026-07-21T09:00:00.000Z",
        polygon: [at(r, c), at(r, c + 1), at(r + 1, c + 1), at(r + 1, c)],
      });
    }
  }
  return blocks;
}

/** Manzanos de Warnes. */
export const WARNES_BLOCKS: Block[] = townBlocks("wrn", WARNES_CENTER, 4, 5, 20260721);

/** Manzanos de Cotoca. */
export const COTOCA_BLOCKS: Block[] = townBlocks("ctc", COTOCA_CENTER, 4, 5, 20260722);

/**
 * The three towns this mock covers, kept as groups rather than as one flat list.
 *
 * The grouping is not cosmetic: clients that fall in no manzano are scattered
 * *around each town*, and a single bounding box over all three would drop them
 * in the farmland between Warnes and Cotoca, where no distributor has anything
 * to sell.
 */
export const BLOCK_GROUPS: { key: string; blocks: Block[] }[] = [
  { key: "santa-cruz", blocks: SANTA_CRUZ_BLOCKS },
  { key: "warnes", blocks: WARNES_BLOCKS },
  { key: "cotoca", blocks: COTOCA_BLOCKS },
];

/** Every manzano the seed ships with. */
export const ALL_BLOCKS: Block[] = BLOCK_GROUPS.flatMap((g) => g.blocks);
