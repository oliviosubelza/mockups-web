// LA BANDEJA DE DEVOLUCIONES — `RefundOrder`, una fila por documento.
//
// Una sola lista, para quien sea que esté mirando. No hay pestañas ni una pantalla aparte de "mis
// aprobaciones": el rol y un filtro deciden qué muestra la misma tabla. Un vendedor ve su propia
// cartera; un aprobador entra con «Esperando mi firma» encendido, que es su cola, y lo puede apagar
// para leer la operación entera.
//
// POR QUÉ ESTA PANTALLA CAMBIÓ. Venía del mockup del otro equipo con su propia copia del DataTable,
// su propio Select, su propio Combobox, su propia paginación y su propia barra de fechas — cinco
// componentes que este repo ya tenía. Ahora usa los compartidos (`@/components/data-table`), que es
// lo que le da gratis lo que antes no tenía: columnas redimensionables y ocultables, densidad,
// export a CSV y el estado de la tabla persistido por `tableId`.
//
// LAS COLUMNAS SON VALORES, NO WIDGETS. La columna «Nivel» dibujaba una barra de puntos con tooltips
// por nivel. En una tabla eso es un gráfico dentro de una celda: no se ordena, no se exporta y no se
// lee de un vistazo sobre veinte filas. Ahora dice «2 de 3 · Gerencia», que es el mismo dato en la
// forma que una tabla sabe manejar.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Coins } from "lucide-react";
import type { Return, ReturnStatus } from "../../../types";
import { ALL_RETURN_STATUSES, RETURN_STATUS_LABELS } from "../../../types";
import {
  DataTable,
  FilterBar,
  defineColumns,
  defineFilters,
} from "@/components/data-table";
import { cn } from "../../../lib/utils";
import { amount, formatDay } from "../../../lib/format";
import { dateKeyOffset } from "../../../lib/frequency";
import { pendingLevelOf } from "../../../lib/return-workflow";
import {
  amountBandLabel,
  ceilingOf,
  isOverdue,
  levelPositionOf,
  progressLevelsOf,
  signaturesMissing,
} from "../../../lib/workflow";
import { SlaBadge } from "../../../components/common/sla-badge";
import { useAllSellers } from "../../../hooks/use-sellers";
import { useReturnsPaged } from "../../../hooks/use-returns";
import { canApproveReturns, seesOwnDocumentsOnly, useCurrentUser } from "../../../stores/session-store";
import { ReturnStatusBadge } from "../components/return-status-badge";

/**
 * El modelo de filtros de la pantalla. `desde`/`hasta` los escribe el `daterange` de la `FilterBar`
 * en ISO completo; el servicio los quiere como `YYYY-MM-DD`, y ese recorte se hace al armar la query.
 */
interface FiltrosDevoluciones extends Record<string, unknown> {
  desde?: string;
  hasta?: string;
  vendedor?: string;
  estado?: string;
  esperandoMiFirma?: boolean;
}

/** Ventana por defecto: las últimas dos semanas. Una devolución tarda días en decidirse. */
const DESDE_POR_DEFECTO = `${dateKeyOffset(-13)}T00:00:00.000Z`;
const HASTA_POR_DEFECTO = `${dateKeyOffset(0)}T23:59:59.999Z`;

const columns = defineColumns<Return>([
  {
    id: "id",
    header: "Código",
    accessorKey: "id",
    size: 90,
    pin: "left",
    cell: (ret) => <span className="font-mono text-xs font-medium tabular-nums">{ret.id}</span>,
  },
  {
    id: "createdAt",
    header: "Registrada",
    accessorKey: "createdAt",
    size: 110,
    cell: (ret) => (
      <span className="whitespace-nowrap tabular-nums">{formatDay(ret.createdAt.slice(0, 10))}</span>
    ),
  },
  {
    id: "clientName",
    header: "Cliente",
    accessorKey: "clientName",
    size: 240,
    cell: (ret) => <span className="truncate font-medium uppercase">{ret.clientName}</span>,
  },
  {
    id: "sellerName",
    header: "Vendedor",
    accessorKey: "sellerName",
    size: 180,
    cell: (ret) => <span className="truncate uppercase text-muted-foreground">{ret.sellerName}</span>,
  },
  {
    id: "total",
    header: "Total",
    accessorKey: "total",
    size: 110,
    meta: { align: "right" },
    cell: (ret) => <span className="whitespace-nowrap font-semibold tabular-nums">{amount(ret.total)}</span>,
  },
  {
    // Lo APROBADO, cuando ya se decidió. Es la columna que justifica el estado «APROBACIÓN PARCIAL»:
    // sin ella ese estado obliga a abrir el documento para saber cuánto quedó en pie.
    id: "approvedTotal",
    header: "Aprobado",
    accessorKey: "approvedTotal",
    size: 110,
    meta: { align: "right" },
    cell: (ret) =>
      ret.approvedTotal === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span
          className={cn(
            "whitespace-nowrap font-semibold tabular-nums",
            ret.approvedTotal < ret.total
              ? "text-amber-700 dark:text-amber-400"
              : "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {amount(ret.approvedTotal)}
        </span>
      ),
  },
  {
    id: "status",
    header: "Estado",
    accessorKey: "status",
    size: 150,
    cell: (ret) => <ReturnStatusBadge status={ret.status} />,
  },
  {
    // `RefundOrder.current_level_order` sobre el total de niveles que la devolución cruza, más el rol
    // que tiene la firma. Cerrada, la posición es el total: recorrió la escalera entera.
    id: "nivel",
    header: "Nivel",
    size: 190,
    enableSorting: false,
    cell: (ret) => {
      if (!ret.workflow) return <span className="text-muted-foreground">Sin enviar</span>;
      const { level, position, total } = levelPositionOf(ret.workflow);
      if (!level) return <span className="text-muted-foreground">{total} de {total} · cerrada</span>;
      const banda = amountBandLabel(
        level.activationMinAmount,
        ceilingOf(progressLevelsOf(ret.workflow), level.order),
      );
      return (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">
            <span className="tabular-nums text-muted-foreground">
              {position} de {total}
            </span>{" "}
            · <span className="font-medium">{level.name}</span>
          </span>
          {banda && (
            <span className="inline-flex items-center gap-0.5 truncate text-[10px] tabular-nums text-violet-600 dark:text-violet-400">
              <Coins className="h-2.5 w-2.5 shrink-0" /> {banda}
            </span>
          )}
        </span>
      );
    },
  },
  {
    // Cuántas firmas de las que el nivel pide ya entraron (`approvals_received` /
    // `required_approvals`). Con política ANY una sola cierra el nivel y el contador es ruido: ahí
    // dice quién falta, que es la pregunta real.
    id: "firmas",
    header: "Firmas",
    size: 110,
    enableSorting: false,
    meta: { align: "center" },
    cell: (ret) => {
      const level = pendingLevelOf(ret);
      if (!level) return <span className="text-muted-foreground">—</span>;
      const faltan = signaturesMissing(level);
      if (level.approvalPolicy === "ANY") {
        return <span className="text-muted-foreground">cualquiera</span>;
      }
      const pedidas =
        level.approvalPolicy === "ALL" ? level.assignees.length : level.requiredApprovals;
      return (
        <span className={cn("tabular-nums", faltan > 0 && "font-medium")}>
          {level.approvalsReceived} de {pedidas}
        </span>
      );
    },
  },
  {
    id: "sla",
    header: "Plazo",
    size: 140,
    enableSorting: false,
    cell: (ret) => {
      const level = pendingLevelOf(ret);
      if (!level) return <span className="text-muted-foreground">—</span>;
      return <SlaBadge level={level} />;
    },
  },
]);

export function ReturnsPage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const soloPropias = seesOwnDocumentsOnly(user.role);
  const puedeFirmar = canApproveReturns(user.role) && !!user.employeeCode;

  const [filtros, setFiltros] = useState<Partial<FiltrosDevoluciones>>(() => ({
    desde: DESDE_POR_DEFECTO,
    hasta: HASTA_POR_DEFECTO,
    // El aprobador entra viendo su cola. Es un filtro y no un modo: se apaga desde la misma barra,
    // que es lo que la versión anterior no permitía —ahí la cola se elegía sola y escondía las
    // fechas, así que un supervisor no tenía forma de leer la operación entera.
    esperandoMiFirma: puedeFirmar || undefined,
  }));
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamanoPagina, setTamanoPagina] = useState(20);

  const { data: vendedores = [] } = useAllSellers();
  const opcionesVendedor = useMemo(
    () => vendedores.map((s) => ({ label: s.name, value: String(s.code) })),
    [vendedores],
  );

  const filterDefs = useMemo(
    () =>
      defineFilters<FiltrosDevoluciones>([
        { type: "daterange", id: "fechas", label: "Registrada", fromKey: "desde", toKey: "hasta" },
        // Un vendedor solo ve lo suyo: ofrecerle elegir vendedor sería ofrecerle un filtro que no
        // cambia nada.
        ...(soloPropias
          ? []
          : [
              {
                type: "select" as const,
                id: "vendedor" as const,
                label: "Vendedor",
                options: opcionesVendedor,
              },
            ]),
        {
          type: "select",
          id: "estado",
          label: "Estado",
          options: ALL_RETURN_STATUSES.map((s) => ({ label: RETURN_STATUS_LABELS[s], value: s })),
        },
        ...(puedeFirmar
          ? [
              {
                type: "boolean" as const,
                id: "esperandoMiFirma" as const,
                label: "Esperando mi firma",
              },
            ]
          : []),
      ]),
    [soloPropias, puedeFirmar, opcionesVendedor],
  );

  // Filtrado del lado del servicio: cualquier cambio de filtro o de búsqueda vuelve a la página 1.
  useEffect(() => setPagina(1), [filtros, busqueda, tamanoPagina]);

  // El código del propio vendedor no es un filtro que el usuario eligió, así que pisa lo que sea que
  // tenga el control (que además está oculto para ese rol).
  const vendedorEfectivo: number | "all" = soloPropias
    ? (user.sellerCode ?? "all")
    : filtros.vendedor
      ? Number(filtros.vendedor)
      : "all";

  const { data, isLoading, isFetching } = useReturnsPaged({
    from: filtros.desde?.slice(0, 10),
    to: filtros.hasta?.slice(0, 10),
    search: busqueda,
    sellerCode: vendedorEfectivo,
    status: (filtros.estado as ReturnStatus | undefined) ?? "all",
    awaitingEmployeeCode: filtros.esperandoMiFirma ? user.employeeCode : undefined,
    page: pagina,
    limit: tamanoPagina,
  });

  const filas = data?.data ?? [];
  const totalItems = data?.pagination?.totalItems ?? 0;
  const totalPages = data?.pagination?.totalPages ?? 1;

  // Si un filtro achicó el resultado por debajo de la página en la que estabas, la tabla mostraría
  // un vacío que no es vacío.
  useEffect(() => {
    if (pagina > totalPages) setPagina(Math.max(1, totalPages));
  }, [totalPages, pagina]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {soloPropias
            ? "Las devoluciones que registraste, con su evidencia y en qué escritorio está parada cada una."
            : "Mercadería que vuelve del cliente. El alta la registra Ventas contra nuestro servicio; de acá en adelante es el flujo de aprobación."}
        </span>
      </div>

      <DataTable
        tableId="mockup-devoluciones"
        columns={columns}
        data={filas}
        getRowId={(ret) => String(ret.id)}
        isLoading={isLoading}
        initialSort={{ id: "createdAt", desc: true }}
        searchable
        searchPlaceholder="Buscar por cliente…"
        onSearchChange={setBusqueda}
        exportable
        exportFilename="devoluciones"
        bodyMinHeight={560}
        pagination={{
          page: pagina,
          limit: tamanoPagina,
          total: totalItems,
          onPageChange: setPagina,
          onLimitChange: setTamanoPagina,
        }}
        onRowClick={(ret) => navigate(`/devoluciones/${ret.id}`)}
        rowClassName={(ret) => {
          const level = pendingLevelOf(ret);
          const base = isFetching && !isLoading ? "cursor-pointer opacity-70" : "cursor-pointer";
          if (level && isOverdue(level)) return `${base} bg-red-500/[0.04]`;
          if (ret.status === "REJECTED" || ret.status === "ANNULLED") return `${base} opacity-60`;
          return base;
        }}
        emptyTitle="Sin devoluciones"
        emptyMessage={
          filtros.esperandoMiFirma
            ? "No hay nada esperando tu firma en este período. Apagá «Esperando mi firma» para ver el resto."
            : "Ninguna devolución coincide con estos filtros."
        }
        filterBar={
          <FilterBar
            defs={filterDefs}
            values={filtros}
            onChange={(u) => setFiltros((prev) => ({ ...prev, ...u }))}
          />
        }
      />
    </div>
  );
}
