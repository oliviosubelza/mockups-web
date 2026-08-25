import type { Return } from "../../../types";
import { amountsOf, itemCountsOf, pendingLevelOf } from "../../../lib/return-workflow";
import { cn } from "../../../lib/utils";
import { bs } from "../../../lib/format";

/**
 * What was granted — the one figure this whole machinery exists to produce.
 *
 * It used to be three tiles across: solicitado, aprobado, rechazado. Two of them
 * had to go, for the same reason from opposite ends. The claim is already on the
 * page as "Total a devolver" and again at the foot of every line, so a third
 * copy of it in a coloured box said nothing new. And the refused amount is not a
 * figure anybody acts on: what an approver does about a rejection is read *which*
 * items were cut and why, which is the count on the right and the grid itself —
 * a red total only puts a number on a disappointment.
 *
 * What is left is deliberately not centred in a row of its own. It sits at the
 * end of the same line as the item count, the way the cart's total does: one
 * figure, one sentence explaining it, no empty columns holding space for the two
 * that left.
 *
 * It reads "pendiente" until somebody rules on the quantities, and the sentence
 * beside it names the desk that will. A return's amount is a *claim* until then,
 * and "pendiente" is never a dead end when it says who you are waiting for.
 */
export function ReturnAmounts({ ret }: { ret: Return }) {
  const amounts = amountsOf(ret.lines);
  const counts = itemCountsOf(ret.lines);
  const level = pendingLevelOf(ret);

  // Nothing has been ruled on yet: the split is not provisional, it does not
  // exist. Showing Bs 0,00 approved would read as "everything was refused".
  const undecided = counts.approved === 0 && counts.rejected === 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="min-w-40 flex-1 text-xs text-muted-foreground">
        {undecided ? (
          level ? (
            <>
              Los ítems se deciden en{" "}
              <span className="font-medium text-foreground">{level.name}</span>, el nivel que la
              está esperando: ahí queda definido el monto.
            </>
          ) : (
            <>La devolución se cerró sin resolver los ítems.</>
          )
        ) : (
          <>
            {counts.approved} de {counts.total} ítems aprobados
            {counts.partial > 0 && ` · ${counts.partial} con cantidad recortada`}
            {counts.rejected > 0 &&
              ` · ${counts.rejected} rechazado${counts.rejected === 1 ? "" : "s"}`}
            {counts.pending > 0 && ` · ${counts.pending} sin decidir`}
          </>
        )}
      </p>

      {/* Próximamente: el monto solicitado, para leer el aprobado contra lo que
          se pidió sin salir de esta línea. Hoy es la misma cifra que "Total a
          devolver" en la tarjeta de arriba, así que repetirla acá sólo gastaría
          ancho.
          <Figure label="Monto solicitado" value={bs(amounts.claimed)} tone="neutral" /> */}
      <Figure
        label="Monto aprobado"
        value={undecided ? "pendiente" : bs(amounts.approved)}
        tone={undecided ? "muted" : "approved"}
      />
    </div>
  );
}

const TONES = {
  approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  muted: "bg-muted text-muted-foreground",
} as const;

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: keyof typeof TONES;
}) {
  return (
    <div className={cn("shrink-0 rounded-md px-3 py-1.5", TONES[tone])}>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
