import { useMemo } from "react";
import { Link } from "react-router";
import { AlertTriangle, Coins } from "lucide-react";
import type { Return } from "../../../types";
import { pendingLevelOf } from "../../../lib/return-workflow";
import {
  amountBandLabel,
  ceilingOf,
  isOverdue,
  progressLevelsOf,
  signaturesMissing,
} from "../../../lib/workflow";
import { WorkflowProgress } from "../../../components/common/workflow-progress";
import { SlaNote } from "../../../components/common/workflow-progress";
import { DataTable, defineColumns, type TableSearchProps } from "../../../components/data-table";
import { amount, formatDay } from "../../../lib/format";

/**
 * The approver's queue: only what is waiting on their signature.
 *
 * Three things appear here that the general list has no reason to carry, and
 * each answers a question that costs real time when it goes unanswered: how late
 * the level is, which band of amounts this desk answers for — which is what says
 * whether a recorte would end the flow here — and, on a quorum level, who has
 * already signed. Without that last one, three people open the same return to
 * discover it was signed an hour ago.
 */
export function ApprovalsTable({
  returns,
  loading,
  search,
  onSearchChange,
  searchPlaceholder,
}: TableSearchProps & {
  returns: Return[];
  loading: boolean;
}) {
  const columns = useMemo(
    () =>
      defineColumns<Return>([
        {
          id: "id",
          header: "Código",
          accessorKey: "id",
          size: 110,
          cell: (ret) => (
            <span className="whitespace-nowrap font-medium tabular-nums">
              <Link to={`/devoluciones/${ret.id}`} className="hover:underline">
                {ret.id}
              </Link>
            </span>
          ),
        },
        {
          id: "clientName",
          header: "Cliente",
          accessorKey: "clientName",
          size: 220,
          cell: (ret) => (
            <div className="min-w-0 py-1">
              <div className="truncate font-medium uppercase">{ret.clientName}</div>
              <div className="truncate text-[10px] uppercase text-muted-foreground">
                {ret.sellerName} · repone {formatDay(ret.replacementDate)}
              </div>
            </div>
          ),
        },
        {
          id: "total",
          header: "Monto",
          accessorKey: "total",
          size: 120,
          meta: { align: "right" },
          cell: (ret) => <span className="whitespace-nowrap font-semibold">{amount(ret.total)}</span>,
        },
        {
          id: "items",
          header: "Ítems",
          size: 80,
          meta: { align: "right" },
          cell: (ret) => <span className="text-muted-foreground">{ret.lines.length}</span>,
        },
        {
          id: "level",
          header: "Nivel",
          size: 230,
          enableSorting: false,
          cell: (ret) => {
            const level = pendingLevelOf(ret);
            const missing = level ? signaturesMissing(level) : 0;
            const signed = level?.assignees.filter((a) => a.hasActed) ?? [];
            const levels = ret.workflow ? progressLevelsOf(ret.workflow) : [];
            const band = level
              ? amountBandLabel(level.activationMinAmount, ceilingOf(levels, level.order))
              : null;
            return (
              <div className="min-w-0 py-1">
                <div className="flex items-center gap-1.5">
                  <span className="whitespace-nowrap font-medium">{level?.name ?? "—"}</span>
                  {band && (
                    <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded bg-violet-500/15 px-1 py-px text-[9px] font-medium tabular-nums text-violet-600 dark:text-violet-400">
                      <Coins className="h-2.5 w-2.5" /> {band}
                    </span>
                  )}
                </div>
                <div className="mt-0.5">
                  {ret.workflow && <WorkflowProgress instance={ret.workflow} size="xs" />}
                </div>
                {/* Quorum state: who already signed, and how many are still needed. This is what
                    stops three approvers opening the same return in parallel. */}
                {signed.length > 0 && missing > 0 && (
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    ya firmó {signed.map((a) => a.employeeName).join(", ")} · falta
                    {missing === 1 ? "" : "n"} {missing}
                  </div>
                )}
              </div>
            );
          },
        },
        {
          id: "due",
          header: "Vence",
          size: 150,
          enableSorting: false,
          cell: (ret) => {
            const level = pendingLevelOf(ret);
            const late = level ? isOverdue(level) : false;
            return (
              <span className="whitespace-nowrap">
                {level ? (
                  late ? (
                    <span className="flex items-center gap-1 font-medium text-red-600">
                      <AlertTriangle className="h-3 w-3" />
                      <SlaNote level={level} />
                    </span>
                  ) : (
                    <SlaNote level={level} />
                  )
                ) : null}
                {level && level.slaHours === null && (
                  <span className="text-muted-foreground">sin plazo</span>
                )}
              </span>
            );
          },
        },
      ]),
    [],
  );

  return (
    <DataTable
      tableId="approvals"
      columns={columns}
      data={returns}
      getRowId={(ret) => String(ret.id)}
      isLoading={loading}
      searchable={!!onSearchChange}
      searchValue={search}
      onSearchChange={onSearchChange}
      searchPlaceholder={searchPlaceholder}
      rowClassName={(ret) => {
        const level = pendingLevelOf(ret);
        return level && isOverdue(level) ? "bg-red-500/[0.04]" : "";
      }}
      emptyTitle="Nada pendiente"
      emptyMessage="No hay devoluciones esperando tu firma."
    />
  );
}
