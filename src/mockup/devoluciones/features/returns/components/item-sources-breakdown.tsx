import { AlertTriangle, Check, FileText } from "lucide-react";
import type { ReturnLine } from "../../../types";
import { RETURN_LOT_LABELS } from "../../../types";
import { sourcesMinUnits } from "../../../lib/return-workflow";
import { lineMinUnits } from "../../../lib/order-math";
import { cn } from "../../../lib/utils";
import { formatDay } from "../../../lib/format";

/**
 * Where the returned quantity actually came from, invoice by invoice.
 *
 * Read-only here: this is the approver's screen, and an approver who can rewrite
 * the invoice they are checking the claim against is not checking anything. The
 * seller owns these rows; this is where they get audited.
 *
 * The running total is the point. The database only requires each row to name an
 * invoice or a batch — that they add up to the quantity being claimed is the
 * application's rule, so this is where an approver sees it hold or fail.
 */
export function ItemSourcesBreakdown({ line }: { line: ReturnLine }) {
  const claimed = lineMinUnits(line);
  const covered = sourcesMinUnits(line.sources);
  const balanced = covered === claimed;

  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <FileText className="h-3 w-3" />
        Desglose de orígenes
      </p>

      <ul className="space-y-1">
        {line.sources.map((source) => (
          <li
            key={source.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded bg-background px-2 py-1 text-[11px]"
          >
            <span className="font-mono tabular-nums">{source.invoiceNumber ?? "sin factura"}</span>
            {source.invoiceSapDoc && (
              <span className="text-muted-foreground">doc SAP {source.invoiceSapDoc}</span>
            )}
            <span className="text-muted-foreground">
              {source.batch ? RETURN_LOT_LABELS[source.batch] : "sin lote"}
            </span>
            <span className="font-mono tabular-nums">{source.batchNumber ?? "—"}</span>
            {source.dueDate && (
              <span className="text-muted-foreground">vence {formatDay(source.dueDate)}</span>
            )}
            <span className="ml-auto whitespace-nowrap font-medium tabular-nums">
              {source.minUnits} {line.unitLabel}
            </span>
          </li>
        ))}
      </ul>

      <p
        className={cn(
          "mt-1.5 flex items-center justify-end gap-1 text-[11px] tabular-nums",
          balanced ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
        )}
      >
        {balanced ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        suma {covered} de {claimed} {line.unitLabel}
        {!balanced && " — el desglose no cuadra con la cantidad reclamada"}
      </p>
    </div>
  );
}
