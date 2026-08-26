import { useMemo } from "react";
import { useNavigate } from "react-router";
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
import { amount } from "../../../lib/format";
import { ReturnStatusBadge } from "./return-status-badge";

interface ReturnsTableProps extends TableSearchProps {
  returns: Return[];
  loading?: boolean;
}

/**
 * Devoluciones, as one list, for whoever is looking.
 *
 * One column set for both readings the old two screens split apart: a vendedor
 * checking their own claim and an approver working their queue both want the
 * same thing from a row — cliente, monto, dónde está parada, y si urge. The row
 * itself is the only action; there is nothing left to put behind a menu once
 * "ver" is the only thing a menu ever had in it.
 */
export function ReturnsTable({
  returns,
  loading,
  search,
  onSearchChange,
  searchPlaceholder,
}: ReturnsTableProps) {
  const navigate = useNavigate();

  const columns = useMemo(
    () =>
      defineColumns<Return>([
        {
          id: "id",
          header: "Código",
          accessorKey: "id",
          size: 90,
          cell: (ret) => <span className="font-medium tabular-nums">{ret.id}</span>,
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
                {ret.sellerName}
              </div>
            </div>
          ),
        },
        {
          id: "total",
          header: "Monto",
          accessorKey: "total",
          size: 110,
          meta: { align: "right" },
          cell: (ret) => <span className="whitespace-nowrap font-semibold">{amount(ret.total)}</span>,
        },
        {
          id: "level",
          header: "Nivel",
          size: 230,
          enableSorting: false,
          cell: (ret) => {
            const level = pendingLevelOf(ret);
            if (!level) return <ReturnStatusBadge status={ret.status} />;
            const missing = signaturesMissing(level);
            const signed = level.assignees.filter((a) => a.hasActed);
            const levels = ret.workflow ? progressLevelsOf(ret.workflow) : [];
            const band = amountBandLabel(level.activationMinAmount, ceilingOf(levels, level.order));
            const late = isOverdue(level);
            return (
              <div className="min-w-0 py-1">
                <div className="flex items-center gap-1.5">
                  <span className="whitespace-nowrap font-medium">{level.name}</span>
                  {band && (
                    <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded bg-violet-500/15 px-1 py-px text-[9px] font-medium tabular-nums text-violet-600 dark:text-violet-400">
                      <Coins className="h-2.5 w-2.5" /> {band}
                    </span>
                  )}
                </div>
                <div className="mt-0.5">
                  {ret.workflow && <WorkflowProgress instance={ret.workflow} size="xs" />}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px]">
                  {late ? (
                    <span className="flex items-center gap-1 font-medium text-red-600">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      <SlaNote level={level} />
                    </span>
                  ) : (
                    <SlaNote level={level} />
                  )}
                  {signed.length > 0 && missing > 0 && (
                    <span className="truncate text-muted-foreground">
                      · falta{missing === 1 ? "" : "n"} {missing}
                    </span>
                  )}
                </div>
              </div>
            );
          },
        },
      ]),
    [],
  );

  return (
    <DataTable
      tableId="returns"
      columns={columns}
      data={returns}
      getRowId={(ret) => String(ret.id)}
      isLoading={loading}
      searchable={!!onSearchChange}
      searchValue={search}
      onSearchChange={onSearchChange}
      searchPlaceholder={searchPlaceholder}
      onRowClick={(ret) => navigate(`/devoluciones/${ret.id}`)}
      rowClassName={(ret) => {
        const level = pendingLevelOf(ret);
        if (level && isOverdue(level)) return "bg-red-500/[0.04] cursor-pointer";
        return ret.status === "REJECTED" || ret.status === "ANNULLED"
          ? "opacity-60 cursor-pointer"
          : "cursor-pointer";
      }}
      emptyTitle="Sin devoluciones"
      emptyMessage="No hay devoluciones que coincidan con los filtros actuales."
    />
  );
}
