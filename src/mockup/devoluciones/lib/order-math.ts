import type { OrderLine } from "../types";
import { getProduct, type Product } from "../data/products";

/**
 * How an order's amounts are built, in one place, so the form, the pricing
 * service and the stored order can never disagree about them.
 *
 * Everything reduces to *minimum units*: a case is not a separate tariff, it is
 * shorthand for the units it contains. That is what makes the ERP's identity
 * hold on every row — `Importe = Precio × Cant. unidades mínimas` — and it is
 * also the basis ICE and the bonification tiers are measured in.
 */

/** Bs amounts are money: rounded to two decimals wherever they are produced. */
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** The line expressed entirely in minimum units: `qtyCase × unitsPerCase + qtyUnit`. */
export const lineMinUnits = (line: OrderLine): number =>
  line.qtyCase * line.unitsPerCase + line.qtyUnit;

/**
 * What the warehouse counts for this line's product, in minimum units — the very
 * unit the line is measured in, so the two figures compare directly.
 *
 * Read from the catalogue instead of frozen onto the line, and that is the
 * opposite of what happens with the tariff on purpose: a *price* has to be the
 * one that was agreed when the line was keyed, while *stock* is only ever
 * interesting as of now. A figure copied onto the line at add-time would go stale
 * while the basket sits open.
 *
 * An unknown product answers zero rather than infinity: if the catalogue cannot
 * say what is on hand, "none" is the answer that refuses a sale instead of
 * promising one.
 */
export const lineStock = (line: OrderLine): number => getProduct(line.productId)?.stock ?? 0;

/**
 * Minimum units this line asks for beyond what is on hand — `0` when it fits.
 *
 * Per line and that is the whole answer for the SKU, because every picker in the
 * app excludes what is already on the table: no product can appear twice and
 * quietly spend the same stock from two rows.
 */
export const lineOverStock = (line: OrderLine): number =>
  Math.max(0, lineMinUnits(line) - lineStock(line));

/** `Importe`: the line's minimum units at its single tariff. */
export const lineAmount = (line: OrderLine): number =>
  round2(lineMinUnits(line) * line.priceUnit);

/** ICE owed by the line: its minimum units at the per-unit rate. */
export const lineIce = (line: OrderLine): number => round2(lineMinUnits(line) * line.ice);

/** `Desct.`: the share of the order's `pct` that falls on this line. */
export const lineDiscount = (line: OrderLine, pct: number): number =>
  round2((lineAmount(line) * pct) / 100);

/**
 * `Total` of the line: its amount less its discount.
 *
 * ICE is deliberately not added — it is already contained in the sale price and
 * travels as an informative column. If that ever stops being true, this is the
 * line to change, together with the order total in the cart panel.
 */
export const lineTotal = (line: OrderLine, pct: number): number =>
  round2(lineAmount(line) - lineDiscount(line, pct));

export const subtotalOf = (lines: OrderLine[]): number =>
  round2(lines.reduce((sum, line) => sum + lineAmount(line), 0));

export const iceTotalOf = (lines: OrderLine[]): number =>
  round2(lines.reduce((sum, line) => sum + lineIce(line), 0));

/** The discount `pct` amounts to over `subtotal`. */
export const discountOf = (subtotal: number, pct: number): number => round2((subtotal * pct) / 100);

/**
 * Bonification tiers, richest first — the first one met wins.
 *
 * The tier is per line and measured in minimum units, so a line of two cases
 * and one with the same quantity loose earn the same: they paid the same.
 */
export const BONIFICATION_TIERS: { minUnits: number; gift: number }[] = [
  { minUnits: 120, gift: 12 },
  { minUnits: 60, gift: 6 },
  { minUnits: 24, gift: 2 },
];

/** Free minimum units a line of `minUnits` earns, or 0 below the first tier. */
export const giftUnitsFor = (minUnits: number): number =>
  BONIFICATION_TIERS.find((tier) => minUnits >= tier.minUnits)?.gift ?? 0;

/** A fresh, empty line for `product`, with the catalog's prices frozen onto it. */
export function lineFromProduct(product: Product): OrderLine {
  return {
    productId: product.id,
    code: product.code,
    company: product.company,
    storage: product.storage,
    productName: product.name,
    unitLabel: product.unitLabel,
    caseLabel: product.caseLabel,
    unitsPerCase: product.unitsPerCase,
    qtyCase: 0,
    qtyUnit: 0,
    priceUnit: product.priceUnit,
    ice: product.ice,
  };
}
