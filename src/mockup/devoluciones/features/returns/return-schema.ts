import { z } from "zod";

/**
 * The return's header — only what the user actually decides.
 *
 * The seller is the signed-in user and every amount is the server's to compute,
 * so neither is a field here. The lines are not in here either: "cada producto
 * con su lote, su vencimiento y su foto" is not a field error, it is a rule over
 * a collection, and it is checked where that collection is edited.
 */
export const returnSchema = z.object({
  /** The account the goods were billed to. */
  ownerCode: z.string().min(1, "Selecciona el cliente propietario"),
  /** The store the goods come back from — one of the owner's. */
  clientId: z.string().min(1, "Selecciona un cliente"),
  /**
   * When the client expects the replacement. In the future by definition: a
   * reposition already in the past is not a commitment, it is a typo.
   */
  replacementDate: z.string().min(1, "Elegí la fecha probable de reposición"),
  /**
   * Why the whole return exists. Required and with a floor on its length: it is
   * the first thing the approver reads, and "daño" is not a justification.
   */
  justification: z
    .string()
    .min(15, "Explicá el motivo de la devolución (mínimo 15 caracteres)")
    .max(400, "Máximo 400 caracteres"),
});

export type ReturnFormValues = z.infer<typeof returnSchema>;
