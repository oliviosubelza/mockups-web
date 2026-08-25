import { History, ShieldCheck } from "lucide-react";
import type { Return } from "../../../types";
import { WorkflowProgress } from "../../../components/common/workflow-progress";
import { bs } from "../../../lib/format";

/**
 * The approval running over a return, plus the ones it replaced.
 *
 * A thin wrapper over `WorkflowProgress`: the bar itself is entity-agnostic and
 * shared, and what belongs here is only what is specific to a devolución — the
 * lineage of approvals a correction superseded.
 *
 * The bar carries no caption. Which template and version caught the return, and
 * the figure the ladder was read against, are how the flow was *built*; the
 * person reading a devolución is asking who has it and what is missing.
 */
export function ReturnFlow({ ret }: { ret: Return }) {
  if (!ret.workflow) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
        Todavía no fue enviada a aprobación.
      </div>
    );
  }

  const instance = ret.workflow;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Progreso del workflow</h2>
      </div>

      <WorkflowProgress instance={instance} />

      {/* Approvals given before a correction re-routed the return. Not history
          to be tidied away: signatures over a different set of products are
          exactly what an audit comes looking for. */}
      {ret.pastWorkflows.length > 0 && (
        <div className="space-y-2 rounded-lg border border-dashed px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <History className="h-3.5 w-3.5" />
            Flujos anteriores a la corrección
          </p>
          {ret.pastWorkflows.map((past) => (
            <div key={past.id} className="space-y-1">
              {/* The figure is not the template's business here: it is what the
                  devolución was worth when these signatures were given, and that
                  is exactly what a correction changed. */}
              <p className="text-xs text-muted-foreground">
                Total de entonces: {bs(past.selectionContext.amount)}
              </p>
              <WorkflowProgress instance={past} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
