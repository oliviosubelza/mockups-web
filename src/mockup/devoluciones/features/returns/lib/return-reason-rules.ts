import type { ReturnReason } from "../../../types";

/**
 * What each motivo de devolución actually needs on the line.
 *
 * **The rule this file exists to enforce: never ask for a fact the reason says does
 * not exist.** A line returned as `PRODUCTO SIN LOTE O SIN FECHA DE VENCIMIENTO`
 * cannot be made to carry a lot number — that absence *is* the claim — and a form that
 * demands one is a form that gets a made-up number typed into it to get past the
 * button. Same for `FALTANTE EN CAJA CERRADA`: the units are missing, so there is no
 * package to read a code off.
 *
 * So a field has three states here, not two:
 *
 * - `required` — the claim is not assessable without it.
 * - `optional` — readable off the package, but not what this reason turns on. Asked,
 *   may be left blank.
 * - `hidden` — the reason itself says the datum does not exist. Not asked, and cleared
 *   if it was filled before the reason was changed, so a stale value cannot ride along.
 *
 * **Photos and the observación are required for every reason, and are not in the
 * table.** Whatever is coming back, somebody has to see it and the approver has to read
 * why — those two do not vary, and a column of identical `required` would suggest they
 * might.
 *
 * ## Reading the table
 *
 * `lot` and `dueDate` are `required` by default because that is what traceability
 * needs: a quality claim without a lot cannot reach the production run that caused it.
 * The exceptions fall into three groups, and each is a reason about something other
 * than the product's condition:
 *
 * - **The datum does not exist** (`hidden`): the two cases above.
 * - **Commercial or logistic** (`optional`): the goods are fine and the reason is
 *   business — the shop closed, the order was keyed wrong, it does not sell. The lot is
 *   on the package and can be written down, but no assessment depends on it.
 * - **Everything else** (`required`): a condition claim, where the lot and the expiry
 *   are the evidence.
 */
export type FieldRule = "required" | "optional" | "hidden";

export interface ReturnReasonRules {
  /** The lot selector and the printed lot number, together — they are one fact. */
  lot: FieldRule;
  /** Expiry printed on the package. */
  dueDate: FieldRule;
}

const RULES: Record<ReturnReason, ReturnReasonRules> = {
  // ---- The datum does not exist -------------------------------------------
  // The absence is the claim itself; asking for it would be asking the seller to
  // invent one.
  sin_lote_ni_vencimiento: { lot: "hidden", dueDate: "hidden" },
  // The units never arrived, so there is no package in the seller's hands to read.
  faltante_caja_cerrada: { lot: "hidden", dueDate: "hidden" },

  // ---- Commercial or logistic: the product is fine ------------------------
  bajo_rendimiento: { lot: "optional", dueDate: "optional" },
  cierre_negocio: { lot: "optional", dueDate: "optional" },
  error_pedido: { lot: "optional", dueDate: "optional" },
  error_entrega: { lot: "optional", dueDate: "optional" },
  vigente_buen_estado: { lot: "optional", dueDate: "optional" },
  excepcional: { lot: "optional", dueDate: "optional" },
  danos_manejo_cliente: { lot: "optional", dueDate: "optional" },

  // ---- Expiry claims: the date is the claim -------------------------------
  cambio_bebidas_vencidas: { lot: "required", dueDate: "required" },
  vencimiento_baja_rotacion: { lot: "required", dueDate: "required" },
  vencimiento_corta_vida_util: { lot: "required", dueDate: "required" },
  vencimiento_sobre_stock: { lot: "required", dueDate: "required" },

  // ---- Quality claims: the lot is how the cause is found ------------------
  contaminacion_fisica: { lot: "required", dueDate: "required" },
  envases_sin_contenido: { lot: "required", dueDate: "required" },
  fallas_envase: { lot: "required", dueDate: "required" },
  fuga_mal_sellado: { lot: "required", dueDate: "required" },
  menor_contenido_neto: { lot: "required", dueDate: "required" },
  producto_hinchado: { lot: "required", dueDate: "required" },
  variacion_sensorial: { lot: "required", dueDate: "required" },
  // A recall targets lots — without one there is nothing to recall against.
  recall: { lot: "required", dueDate: "required" },
  // Samples are traced back to a production run; that is the whole point of sending
  // them to a laboratory.
  muestras_laboratorio: { lot: "required", dueDate: "required" },
};

/**
 * What this reason asks for. Before a reason is chosen, everything is asked and
 * nothing is demanded — the seller can fill the package data they are holding while
 * they decide how to classify it.
 */
export const rulesFor = (reason: ReturnReason | ""): ReturnReasonRules =>
  reason ? RULES[reason] : { lot: "optional", dueDate: "optional" };

/** True when the reason says this datum does not exist, so the boxes are not drawn. */
export const isHidden = (rule: FieldRule): boolean => rule === "hidden";
