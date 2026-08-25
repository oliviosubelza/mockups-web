import type { Channel, Subcanal } from "../types";

/**
 * Sales channels (Canales de Venta) with a fixed color each. These colors are
 * the single source of truth for channel color-coding across list, form & map.
 *
 * `discountPct` plays the same role for price: it is the discount a Venado
 * client of that channel is sold at over the counter, and the counter reads it
 * from here rather than holding a table of its own. It ranks by how the channel
 * actually buys — a supermarket chain negotiates on volume, a temporary stall
 * buys a box at a time — so the spread is the distribution reality, not a
 * decoration. Mock values: change one here and the agency screen changes with
 * it.
 */
export const CHANNELS: Channel[] = [
  {
    id: "ch_tradicional",
    name: "TRADICIONAL",
    color: "#6366f1",
    // Holds mayoristas and detallistas at once, so it sits mid-table: the
    // wholesalers pull it up, the neighbourhood shops hold it down.
    discountPct: 8,
    description: "Tiendas de barrio, kioscos y mercados tradicionales.",
  },
  {
    id: "ch_moderno",
    name: "MODERNO",
    color: "#06b6d4",
    // Chains and autoservicios buy by the pallet and negotiate as one account.
    discountPct: 12,
    description: "Autoservicios y cadenas de supermercados.",
  },
  {
    id: "ch_limpieza",
    name: "LIMPIEZA",
    color: "#10b981",
    // A specialised line with thinner margin to give away than food.
    discountPct: 5,
    description: "Distribución de línea de limpieza y hogar.",
  },
  {
    id: "ch_ferias",
    name: "FERIAS",
    color: "#f59e0b",
    // The smallest basket of all, and often a one-off: least room to discount.
    discountPct: 3,
    description: "Ferias zonales y puntos temporales.",
  },
  {
    id: "ch_panaderia",
    name: "PANADERIA",
    color: "#ec4899",
    // Bakeries buy raw material in steady, sizeable runs — close to wholesale.
    discountPct: 7,
    description: "Panaderías zonales y mayoristas de pan.",
  },
];

/** Subcanales — each belongs to exactly one channel. */
export const SUBCANALES: Subcanal[] = [
  // TRADICIONAL
  { id: "sc_mayorista", channelId: "ch_tradicional", name: "MAYORISTA" },
  { id: "sc_detallista", channelId: "ch_tradicional", name: "DETALLISTA" },
  { id: "sc_mayorista_pareto", channelId: "ch_tradicional", name: "MAYORISTA-PARETO" },
  // MODERNO
  { id: "sc_autoservicio", channelId: "ch_moderno", name: "AUTOSERVICIO" },
  { id: "sc_cadena", channelId: "ch_moderno", name: "CADENA" },
  // LIMPIEZA
  { id: "sc_mayorista_limpieza", channelId: "ch_limpieza", name: "MAYORISTA-LIMPIEZA" },
  { id: "sc_detallista_limpieza", channelId: "ch_limpieza", name: "DETALLISTA-LIMPIEZA" },
  // FERIAS
  { id: "sc_ferias_zonales", channelId: "ch_ferias", name: "FERIAS ZONALES" },
  { id: "sc_ferias_temporales", channelId: "ch_ferias", name: "FERIAS TEMPORALES" },
  // PANADERIA
  { id: "sc_panaderia_zonal", channelId: "ch_panaderia", name: "PANADERIA ZONAL" },
  { id: "sc_panaderia_mayorista", channelId: "ch_panaderia", name: "PANADERIA MAYORISTA" },
];

const channelById = new Map(CHANNELS.map((c) => [c.id, c]));
const subcanalById = new Map(SUBCANALES.map((s) => [s.id, s]));

export function getChannel(id: string): Channel | undefined {
  return channelById.get(id);
}

export function getSubcanal(id: string): Subcanal | undefined {
  return subcanalById.get(id);
}

export function getSubcanalesByChannel(channelId: string): Subcanal[] {
  return SUBCANALES.filter((s) => s.channelId === channelId);
}

/** Channel color with a neutral fallback. */
export function channelColor(channelId: string | undefined): string {
  return (channelId && channelById.get(channelId)?.color) || "#64748b";
}

/**
 * Discount a client of this channel is sold at, in percent — 0 when the channel
 * is unknown, because an unrecognised account is sold at list price rather than
 * at some other channel's terms.
 */
export function channelDiscountPct(channelId: string | undefined): number {
  return (channelId && channelById.get(channelId)?.discountPct) || 0;
}

/** Groups subcanal ids by their parent channel — each group keeps the channel's color. */
export function groupSubcanalesByChannel(subcanalIds: string[]) {
  const groups = new Map<string, { channelId: string; ids: string[] }>();
  for (const id of subcanalIds) {
    const sub = subcanalById.get(id);
    if (!sub) continue;
    const group = groups.get(sub.channelId) ?? { channelId: sub.channelId, ids: [] };
    group.ids.push(id);
    groups.set(sub.channelId, group);
  }
  return [...groups.values()];
}
