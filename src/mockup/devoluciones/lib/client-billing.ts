/**
 * The invoicing identity of a client, derived rather than stored.
 *
 * A real backend owns the NIT; the mock has to make one up. It lives here — and
 * not inline in whichever service needed it first — because two screens now
 * bill the same client: the order form and the agency counter. Deriving it
 * twice would let the two disagree about who the client is, which is the one
 * thing a tax id exists to prevent.
 */

/** NIT derived from the client's ERP code. Same client, same number, always. */
export const clientNit = (code: string): string => `${code}00${code.length}`;
