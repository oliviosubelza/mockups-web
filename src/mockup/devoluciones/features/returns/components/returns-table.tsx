import { useMemo } from "react";
import type { Return } from "../../../types";
import { RETURN_SETTLEMENT_LABELS } from "../../../types";
import { DataTable, defineColumns, type TableSearchProps } from "../../../components/data-table";
import { amount, formatDateTime } from "../../../lib/format";
import { ReturnActions } from "./return-actions";
import { ReturnStatusBadge } from "./return-status-badge";

interface ReturnsTableProps extends TableSearchProps {
  returns: Return[];
  loading?: boolean;
}

/**
 * Devoluciones, as one list.
 *
 * One list and not two readings: a return is never split by legal entity the
 * way an order is — it is a single claim against a single client, and whichever
 * companies its products belong to is a detail of the lines, not a second
 * document to issue.
 *
 * The columns are the ones the old system's list had, because that is the list
 * this replaces and its readers know it by its shape. Two of them are worth
 * naming:
 *
 * - **Cliente y Propietario are two columns, not one stacked cell.** They are
 *   different names for different people — the store and whoever answers for it
 *   — and a supervisor searching for one is not searching for the other.
 * - **Estado is the badge and nothing else.** It used to carry a second line of
 *   workflow dots under it, saying which desk the paper was sitting on. Accurate,
 *   and still nobody reads a queue that way: a list answers "¿en qué quedó?", and
 *   "¿dónde está parada?" is a question you ask of one document, on the document,
 *   where the flow is drawn full size. Here it cost every row a second line.
 *
 * ICE is deliberately absent: it is a per-line tax figure that belongs to the
 * detail, and on a queue screen the only amount that decides anything is the
 * total — it is what chose the workflow, and the whole reason a row is waiting.
 */
export function ReturnsTable({
  returns,
  loading,
  search,
  onSearchChange,
  searchPlaceholder,
}: ReturnsTableProps) {
  const columns = useMemo(
    () =>
      defineColumns<Return>([
        {
          id: "id",
          header: "Nro. Nota",
          accessorKey: "id",
          size: 110,
          cell: (ret) => <span className="font-medium tabular-nums">{ret.id}</span>,
        },
        {
          id: "createdAt",
          header: "Fecha",
          accessorKey: "createdAt",
          size: 120,
          cell: (ret) => (
            <span className="whitespace-nowrap tabular-nums">{formatDateTime(ret.createdAt)}</span>
          ),
        },
        {
          id: "distributorName",
          header: "Distribuidora",
          accessorKey: "distributorName",
          size: 180,
          cell: (ret) => (
            <span className="whitespace-nowrap uppercase text-muted-foreground">
              {ret.distributorName}
            </span>
          ),
        },
        {
          id: "clientName",
          header: "Cliente",
          accessorKey: "clientName",
          size: 200,
          cell: (ret) => <div className="min-w-0 truncate font-medium uppercase">{ret.clientName}</div>,
        },
        {
          id: "clientOwnerName",
          header: "Propietario",
          accessorKey: "clientOwnerName",
          size: 200,
          cell: (ret) => (
            <div className="min-w-0 truncate uppercase text-muted-foreground">{ret.clientOwnerName}</div>
          ),
        },
        {
          id: "sellerName",
          header: "Registrado por",
          accessorKey: "sellerName",
          size: 170,
          cell: (ret) => <span className="uppercase text-muted-foreground">{ret.sellerName}</span>,
        },
        {
          id: "settlement",
          header: "Tipo de devolución",
          accessorKey: "settlement",
          size: 160,
          // Empty until the claim is settled, and honestly so: nobody has decided yet whether this
          // comes back as stock or as a credit note.
          cell: (ret) => (
            <span className="text-muted-foreground">
              {ret.settlement ? (
                <span className="whitespace-nowrap uppercase">
                  {RETURN_SETTLEMENT_LABELS[ret.settlement]}
                </span>
              ) : (
                "—"
              )}
            </span>
          ),
        },
        {
          id: "total",
          header: "Total (Bs.)",
          accessorKey: "total",
          size: 130,
          meta: { align: "right" },
          cell: (ret) => (
            <span className="whitespace-nowrap font-semibold">{amount(ret.total)}</span>
          ),
        },
        {
          id: "status",
          header: "Estado",
          accessorKey: "status",
          size: 140,
          // The badge alone. A row of workflow dots used to sit under it, saying which desk the
          // paper was on — true, but nobody reads a queue that way: the question a list answers is
          // "¿en qué quedó?", and "¿dónde está parada?" is asked of one document at a time, on the
          // document. It cost every row a second line to say it.
          cell: (ret) => <ReturnStatusBadge status={ret.status} />,
        },
        {
          id: "actions",
          header: "",
          size: 56,
          enableSorting: false,
          enableResizing: false,
          enableHiding: false,
          pin: "right",
          meta: { align: "center" },
          cell: (ret) => <ReturnActions ret={ret} />,
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
      rowClassName={(ret) =>
        ret.status === "REJECTED" || ret.status === "ANNULLED" ? "opacity-60" : ""
      }
      emptyTitle="Sin devoluciones"
      emptyMessage="No hay devoluciones que coincidan con los filtros actuales."
    />
  );
}
