// LA BANDEJA DE DEVOLUCIONES — `RefundOrder`, una fila por documento.
//
// Una sola lista, para quien sea que esté mirando. No hay pestañas ni una pantalla aparte de "mis
// aprobaciones": el rol decide qué puede firmar, y la barra de filtros de arriba es exactamente
// seis controles — Distribuidora, Registrado por, Fecha inicial, Fecha final, Estado y Estado
// Workflow — y nada más. `Estado` es el eje logístico/de negocio del documento; `Estado Workflow`
// es en qué escritorio de la aprobación está parado. Son ejes distintos a propósito: ver
// `statusOf`/`workflowStateOf` en `lib/return-workflow.ts`.
//
// POR QUÉ ESTA PANTALLA CAMBIÓ. Venía del mockup del otro equipo con su propia copia del DataTable,
// su propio Select, su propio Combobox, su propia paginación y su propia barra de fechas — cinco
// componentes que este repo ya tenía. Ahora usa los compartidos (`@/components/data-table`), que es
// lo que le da gratis lo que antes no tenía: columnas redimensionables y ocultables, densidad,
// export a CSV y el estado de la tabla persistido por `tableId`. El control de fecha compartido es
// un solo popover de rango (no dos cajas «Fecha inicial»/«Fecha final» separadas): un control nuevo
// solo para esta pantalla habría sido otro componente de fecha en un repo que ya dejó cinco atrás.
//
// LAS COLUMNAS SON VALORES, NO WIDGETS. La columna «Nivel» dibujaba una barra de puntos con tooltips
// por nivel. En una tabla eso es un gráfico dentro de una celda: no se ordena, no se exporta y no se
// lee de un vistazo sobre veinte filas. Ahora dice «2 de 3 · Gerencia», que es el mismo dato en la
// forma que una tabla sabe manejar.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Eye } from "lucide-react";
import type { Return, ReturnStatus, ReturnWorkflowState } from "../../../types";
import {
  ALL_RETURN_STATUSES,
  ALL_RETURN_WORKFLOW_STATES,
  RETURN_SETTLEMENT_LABELS,
  RETURN_STATUS_LABELS,
  RETURN_WORKFLOW_STATE_LABELS,
} from "../../../types";
import {
  DataTable,
  FilterBar,
  defineColumns,
  defineFilters,
} from "@/components/data-table";
import { amount, formatDay } from "../../../lib/format";
import { dateKeyOffset } from "../../../lib/frequency";
import { RETURN_DISTRIBUTOR_NAMES } from "../../../data/distributors-data";
import { isOverdue } from "../../../lib/workflow";
import { pendingLevelOf, workflowStateOf } from "../../../lib/return-workflow";
import { useAllSellers } from "../../../hooks/use-sellers";
import { useReturnsPaged } from "../../../hooks/use-returns";
import { seesOwnDocumentsOnly, useCurrentUser } from "../../../stores/session-store";
import { ReturnStatusBadge } from "../components/return-status-badge";

/** Días corridos desde el registro — lo que la columna «Tiempo Logístico» lee. */
function diasTranscurridos(createdAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
}

/**
 * El modelo de filtros de la pantalla — exactamente los seis campos de la barra.
 * `desde`/`hasta` los escribe el `daterange` de la `FilterBar` en ISO completo; el servicio los
 * quiere como `YYYY-MM-DD`, y ese recorte se hace al armar la query.
 */
interface FiltrosDevoluciones extends Record<string, unknown> {
  distribuidora?: string;
  registradoPor?: string;
  desde?: string;
  hasta?: string;
  estado?: string;
  estadoWorkflow?: string;
}

/** Ventana por defecto: las últimas dos semanas. Una devolución tarda días en decidirse. */
const DESDE_POR_DEFECTO = `${dateKeyOffset(-13)}T00:00:00.000Z`;
const HASTA_POR_DEFECTO = `${dateKeyOffset(0)}T23:59:59.999Z`;

const opcionesDistribuidora = RETURN_DISTRIBUTOR_NAMES.map((name) => ({ label: name, value: name }));

export function ReturnsPage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const soloPropias = seesOwnDocumentsOnly(user.role);

  const columns = useMemo(
    () =>
      defineColumns<Return>([
        {
          id: "createdAt",
          header: "Fecha",
          accessorKey: "createdAt",
          size: 76,
          minSize: 60,
          cell: (ret) => (
            <span className="whitespace-nowrap tabular-nums">{formatDay(ret.createdAt.slice(0, 10))}</span>
          ),
        },
        {
          id: "distributorName",
          header: "Distribuidora",
          accessorKey: "distributorName",
          size: 104,
          minSize: 80,
          cell: (ret) => <span className="truncate uppercase text-muted-foreground">{ret.distributorName}</span>,
        },
        {
          id: "clientName",
          header: "Cliente",
          accessorKey: "clientName",
          size: 130,
          minSize: 90,
          cell: (ret) => <span className="truncate font-medium uppercase">{ret.clientName}</span>,
        },
        {
          id: "clientOwnerName",
          header: "Propietario",
          accessorKey: "clientOwnerName",
          size: 120,
          minSize: 90,
          cell: (ret) => <span className="truncate uppercase text-muted-foreground">{ret.clientOwnerName}</span>,
        },
        {
          id: "sellerName",
          header: "Registrado Por",
          accessorKey: "sellerName",
          size: 105,
          minSize: 80,
          cell: (ret) => <span className="truncate uppercase text-muted-foreground">{ret.sellerName}</span>,
        },
        {
          id: "id",
          header: "Nro. Nota",
          accessorKey: "id",
          size: 76,
          minSize: 64,
          // Una nota disociada muestra el número de la nota de la que salió, no su propio id — dos
          // filas del mismo número es justamente la señal de que una devolución se partió en dos.
          cell: (ret) => (
            <span className="font-mono text-xs font-medium tabular-nums">
              {ret.originReturnId ?? ret.id}
            </span>
          ),
        },
        {
          id: "total",
          header: "Total (Bs.)",
          accessorKey: "total",
          size: 88,
          minSize: 72,
          meta: { align: "right" },
          cell: (ret) => <span className="whitespace-nowrap font-semibold tabular-nums">{amount(ret.total)}</span>,
        },
        {
          id: "tiempoLogistico",
          header: "Tiempo Logístico (días)",
          size: 84,
          minSize: 64,
          enableSorting: false,
          meta: { align: "center" },
          cell: (ret) => <span className="tabular-nums">{diasTranscurridos(ret.createdAt)}</span>,
        },
        {
          id: "settlement",
          header: "Tipo de devolución",
          accessorKey: "settlement",
          size: 105,
          minSize: 80,
          cell: (ret) =>
            ret.settlement ? (
              <span className="truncate">{RETURN_SETTLEMENT_LABELS[ret.settlement]}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          id: "status",
          header: "Estado",
          accessorKey: "status",
          size: 96,
          minSize: 80,
          cell: (ret) => <ReturnStatusBadge status={ret.status} />,
        },
        {
          id: "workflowState",
          header: "Estado Workflow",
          size: 115,
          minSize: 90,
          enableSorting: false,
          cell: (ret) => {
            const state = workflowStateOf(ret);
            return state ? (
              <span className="truncate">{RETURN_WORKFLOW_STATE_LABELS[state]}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            );
          },
        },
        {
          id: "acciones",
          header: "Acciones",
          size: 56,
          minSize: 48,
          enableSorting: false,
          meta: { align: "center" },
          cell: (ret) => (
            <button
              type="button"
              aria-label="Ver devolución"
              className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/devoluciones/${ret.id}`);
              }}
            >
              <Eye className="size-4" />
            </button>
          ),
        },
      ]),
    [navigate],
  );

  const [filtros, setFiltros] = useState<Partial<FiltrosDevoluciones>>(() => ({
    desde: DESDE_POR_DEFECTO,
    hasta: HASTA_POR_DEFECTO,
  }));
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamanoPagina, setTamanoPagina] = useState(20);

  const { data: vendedores = [] } = useAllSellers();
  const opcionesRegistradoPor = useMemo(
    () => vendedores.map((s) => ({ label: s.name, value: String(s.code) })),
    [vendedores],
  );

  const filterDefs = useMemo(
    () =>
      defineFilters<FiltrosDevoluciones>([
        {
          type: "select",
          id: "distribuidora",
          label: "Distribuidora",
          options: opcionesDistribuidora,
        },
        // Un vendedor solo ve lo suyo: ofrecerle elegir quién registró sería ofrecerle un filtro que
        // no cambia nada.
        ...(soloPropias
          ? []
          : [
              {
                type: "select" as const,
                id: "registradoPor" as const,
                label: "Registrado Por",
                options: opcionesRegistradoPor,
              },
            ]),
        { type: "daterange", id: "fechas", label: "Fecha", fromKey: "desde", toKey: "hasta" },
        {
          type: "select",
          id: "estado",
          label: "Estado",
          options: ALL_RETURN_STATUSES.map((s) => ({ label: RETURN_STATUS_LABELS[s], value: s })),
        },
        {
          type: "select",
          id: "estadoWorkflow",
          label: "Estado Workflow",
          options: ALL_RETURN_WORKFLOW_STATES.map((s) => ({
            label: RETURN_WORKFLOW_STATE_LABELS[s],
            value: s,
          })),
        },
      ]),
    [soloPropias, opcionesRegistradoPor],
  );

  // Filtrado del lado del servicio: cualquier cambio de filtro o de búsqueda vuelve a la página 1.
  useEffect(() => setPagina(1), [filtros, busqueda, tamanoPagina]);

  // El código del propio vendedor no es un filtro que el usuario eligió, así que pisa lo que sea que
  // tenga el control (que además está oculto para ese rol).
  const registradoPorEfectivo: number | "all" = soloPropias
    ? (user.sellerCode ?? "all")
    : filtros.registradoPor
      ? Number(filtros.registradoPor)
      : "all";

  const { data, isLoading, isFetching } = useReturnsPaged({
    from: filtros.desde?.slice(0, 10),
    to: filtros.hasta?.slice(0, 10),
    search: busqueda,
    sellerCode: registradoPorEfectivo,
    status: (filtros.estado as ReturnStatus | undefined) ?? "all",
    distributorName: filtros.distribuidora ?? "all",
    workflowState: (filtros.estadoWorkflow as ReturnWorkflowState | undefined) ?? "all",
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
        // exportable
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
          if (ret.status === "CERRADO" || ret.status === "ANULADA") return `${base} opacity-60`;
          return base;
        }}
        emptyTitle="Sin devoluciones"
        emptyMessage="Ninguna devolución coincide con estos filtros."
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
