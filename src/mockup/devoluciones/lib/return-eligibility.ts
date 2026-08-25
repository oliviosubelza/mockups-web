import type { ReturnLine, ReturnableProduct } from "../types";
import { lineMinUnits } from "./order-math";

/**
 * The rule that decides whether goods may be returned at all: nothing comes
 * back that was not sold first.
 *
 * It lives here, apart from the approval flow, because it is a different kind of
 * rule. The flow decides *who signs* a claim; this decides whether there is a
 * claim to sign. A product the client never bought, or a quantity larger than
 * what he was invoiced, is not a return an approver should ever see — so the
 * check runs at the moment the product is added to the detail, not at the end.
 *
 * Both the form and the service read it from here. A quantity the screen accepts
 * and the API rejects is the one failure this file exists to make impossible.
 */

/**
 * How far back invoices are looked up. A sale from two years ago is not evidence
 * for a claim today, and an unbounded history would let a single old invoice
 * justify returns forever.
 */
export const RETURN_INVOICE_WINDOW_DAYS = 90;

/** Minimum units a quantity pair amounts to: `cajas × contenido + unidades`. */
export const minUnitsOf = (qtyCase: number, qtyUnit: number, unitsPerCase: number): number =>
  qtyCase * unitsPerCase + qtyUnit;

/**
 * Why `requested` minimum units cannot come back, or `null` when they can.
 *
 * Phrased as what the seller has to do about it, because it is read from the
 * control it disables. The order of the checks is the order in which they stop
 * being interesting: whether the product was ever sold comes before how much of
 * it was.
 */
export function qtyBlockedReason(
  requested: number,
  returnable: ReturnableProduct | undefined,
): string | null {
  if (!returnable || returnable.invoicedMinUnits === 0) {
    return `Este producto no figura facturado a este cliente en los últimos ${RETURN_INVOICE_WINDOW_DAYS} días. No se puede devolver.`;
  }
  if (returnable.availableMinUnits === 0) {
    return "Todo lo facturado de este producto ya fue devuelto en otra devolución.";
  }
  if (requested === 0) {
    return "Indicá la cantidad que devuelve el cliente.";
  }
  if (requested > returnable.availableMinUnits) {
    return `Solo se pueden devolver ${returnable.availableMinUnits} unidades: es lo que queda de las ${returnable.invoicedMinUnits} facturadas a este cliente.`;
  }
  return null;
}

/** The same rule over a finished line — what the service checks on save. */
export const lineQtyBlockedReason = (
  line: ReturnLine,
  returnable: ReturnableProduct | undefined,
): string | null => qtyBlockedReason(lineMinUnits(line), returnable);
