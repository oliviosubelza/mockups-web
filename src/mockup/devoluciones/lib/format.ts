/**
 * How amounts and dates are printed across the app.
 *
 * These started inside the orders feature and moved here the moment a second
 * feature — devoluciones — had to print the same figures. Two copies of a money
 * formatter is two ways for the same amount to read differently on two screens,
 * which is the one thing a currency format exists to prevent.
 */
 
/** Amounts keep the ERP's two decimals (the unit travels in the column header). */
export const amount = (n: number) =>
  n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
 
/** `Bs 1.234,50` — used where the header doesn't carry the unit. */
export const bs = (n: number) => `Bs ${amount(n)}`;
 
/** `dd/mm/aaaa` from an ISO timestamp. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}
 
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
 
/** `dd/mm/aaaa` from a `YYYY-MM-DD` key, parsed local so the day never shifts. */
export function formatDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}
 