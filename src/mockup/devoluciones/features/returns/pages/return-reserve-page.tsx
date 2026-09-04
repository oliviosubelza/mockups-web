import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useRouteParams } from "@/core/routing/active-route";
import {
  ArrowLeft,
  CheckCircle2,
  Package,
  PackageCheck,
  PackageX,
} from "lucide-react";
import { toast } from "sonner";
import { ReturnLineActionsCell } from "../components/return-line-actions";
import type { ReturnLine } from "../../../types";
import {
  CLIENT_TYPE_LABELS,
  RETURN_LOT_LABELS,
  RETURN_REASON_LABELS,
  RETURN_SETTLEMENT_LABELS,
  RETURN_STATUS_LABELS,
  RETURN_WORKFLOW_STATE_LABELS,
} from "../../../types";
import { lineAmount, lineMinUnits } from "../../../lib/order-math";
import { primarySourceOf, workflowStateOf } from "../../../lib/return-workflow";
import { useReturn } from "../../../hooks/use-returns";
import { useOrderClientDetails } from "../../../hooks/use-orders";
import { EmptyState } from "../../../components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, defineColumns } from "@/components/data-table";
import { amount, bs, formatDay } from "../../../lib/format";
import { InfoCard, InfoField } from "../components/info-grid";
import { cn } from "../../../lib/utils";

function LoteCell({ line }: { line: ReturnLine }) {
  const source = primarySourceOf(line);
  if (
    !source?.batchNumber?.trim() ||
    source.batch === "IMPORTADO" ||
    source.batchNumber.toUpperCase().includes("IMPORTADO")
  ) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      {source.batch && (
        <span title={RETURN_LOT_LABELS[source.batch]} className="text-muted-foreground">
          {source.batch} ·
        </span>
      )}
      <span className="truncate font-mono tabular-nums">{source.batchNumber}</span>
    </span>
  );
}

interface ItemReservation {
  reserved: number;
  required: number;
  isComplete: boolean;
}

export function ReturnReservePage() {
  const { id } = useRouteParams();
  const navigate = useNavigate();
  const returnId = Number(id);
  const { data: ret, isLoading } = useReturn(Number.isFinite(returnId) ? returnId : undefined);
  const { data: details } = useOrderClientDetails(ret?.clientId);

  // Estado de reserva: inicia en false (columna en 0) y cambia al pulsar "Reservar"
  const [isReserved, setIsReserved] = useState(false);
  const [reservations, setReservations] = useState<Record<string, ItemReservation>>({});

  // Simulación de reserva al azar: completa (verde) o faltante (rojo)
  const handleReservar = () => {
    if (!ret?.lines) return;
    const newRes: Record<string, ItemReservation> = {};
    let completados = 0;
    let conFaltante = 0;

    ret.lines.forEach((line, index) => {
      const req = line.approvedMinUnits ?? lineMinUnits(line);

      // Determinamos si tiene faltante o completo garantizando ejemplos variados
      // Si el código es múltiplo de 3 o alternado según posición
      const isMissing = (line.code % 3 === 0 || index % 3 === 1) && req > 1;

      if (isMissing) {
        // Stock parcial (faltante)
        const partial = Math.max(0, Math.floor(req * 0.6));
        newRes[line.productId] = {
          reserved: partial,
          required: req,
          isComplete: false,
        };
        conFaltante++;
      } else {
        // Stock completo satisfecho
        newRes[line.productId] = {
          reserved: req,
          required: req,
          isComplete: true,
        };
        completados++;
      }
    });

    setReservations(newRes);
    setIsReserved(true);

    if (conFaltante > 0) {
      toast.warning(
        `Reserva ejecutada: ${completados} ítems cubiertos al 100% y ${conFaltante} con faltante de stock en depósito.`,
      );
    } else {
      toast.success("Reserva de almacén ejecutada exitosamente. Todo el stock fue cubierto al 100%.");
    }
  };

  const columns = useMemo(
    () =>
      defineColumns<ReturnLine>([
        {
          id: "code",
          header: "Código SAP",
          accessorKey: "code",
          size: 85,
          minSize: 70,
          cell: (line) => (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{line.code}</span>
          ),
        },
        {
          id: "productName",
          header: "Producto",
          accessorKey: "productName",
          size: 240,
          minSize: 150,
          cell: (line) => <span className="truncate font-medium">{line.productName}</span>,
        },
        {
          id: "lote",
          header: "Lote / Vencimiento",
          size: 130,
          minSize: 95,
          cell: (line) => <LoteCell line={line} />,
        },
        {
          id: "reason",
          header: "Motivo",
          accessorKey: "reason",
          size: 135,
          minSize: 95,
          cell: (line) => (
            <span className="truncate text-xs text-muted-foreground">
              {RETURN_REASON_LABELS[line.reason] ?? line.reason}
            </span>
          ),
        },
        {
          id: "approved",
          header: "Requerido",
          size: 85,
          minSize: 70,
          meta: { align: "right" },
          cell: (line) => {
            const req = line.approvedMinUnits ?? lineMinUnits(line);
            return <span className="tabular-nums text-xs font-medium text-foreground">{req}</span>;
          },
        },
        {
          id: "reserved",
          header: "Reservado",
          size: 130,
          minSize: 100,
          meta: { align: "center" },
          cell: (line) => {
            // Inicialmente antes de reservar la columna debe estar en CERO (0)
            if (!isReserved) {
              return <span className="tabular-nums text-xs text-muted-foreground">0</span>;
            }

            const res = reservations[line.productId];
            if (!res) {
              return <span className="tabular-nums text-xs text-muted-foreground">0</span>;
            }

            // Si está completo: verde
            if (res.isComplete) {
              return (
                <span
                  className="tabular-nums text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                  title="Stock completo"
                >
                  {res.reserved}
                </span>
              );
            }

            // Si hay faltante: rojo
            const missing = res.required - res.reserved;
            return (
              <span
                className="tabular-nums text-xs font-semibold text-rose-600 dark:text-rose-400"
                title={`Faltante: ${missing}`}
              >
                {res.reserved}{" "}
                <span className="text-[11px] font-normal">
                  ({missing === 1 ? "falta 1" : `faltan ${missing}`})
                </span>
              </span>
            );
          },
        },
        {
          id: "priceUnit",
          header: "P. Unitario",
          size: 85,
          minSize: 70,
          meta: { align: "right" },
          cell: (line) => <span className="tabular-nums text-xs">{amount(line.priceUnit)}</span>,
        },
        {
          id: "subtotal",
          header: "Total (Bs.)",
          size: 95,
          minSize: 80,
          meta: { align: "right" },
          cell: (line) => (
            <span className="tabular-nums font-semibold text-xs">{amount(lineAmount(line))}</span>
          ),
        },
        {
          id: "actions",
          header: "",
          size: 45,
          minSize: 40,
          meta: { align: "center" },
          cell: (line) => (
            <ReturnLineActionsCell line={line} returnCreatedAt={ret?.createdAt} mode="almacen" />
          ),
        },
      ]),
    [ret?.createdAt, isReserved, reservations],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!ret) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">La devolución no fue encontrada.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => navigate("/devoluciones")}
          >
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </div>
        <EmptyState
          icon={PackageX}
          title="Devolución no encontrada"
          description="Puede que se haya eliminado o que el código no sea correcto."
        />
      </div>
    );
  }

  const workflowState = workflowStateOf(ret);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Cabecera superior con contexto y badges */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => navigate("/devoluciones")}
          >
            <ArrowLeft className="h-4 w-4" /> Volver a devoluciones
          </Button>
          <span className="text-sm font-semibold">
            Devolución <span className="font-mono">{ret.id}</span>
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Botón de acción a nivel de cabecera */}
          <Button
            type="button"
            onClick={handleReservar}
            disabled={isReserved}
            className={cn(
              "h-8 gap-1.5 font-medium shadow-sm transition-all text-xs",
              isReserved
                ? "bg-muted text-muted-foreground cursor-not-allowed border border-border opacity-80"
                : "bg-blue-600 hover:bg-blue-700 text-white",
            )}
          >
            <PackageCheck className="size-3.5" />
            Reservar
          </Button>

          <Badge
            variant="outline"
            className={cn(
              "gap-1 font-medium text-xs py-1",
              isReserved
                ? "border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "border-blue-600/30 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300",
            )}
          >
            <PackageCheck className="size-3.5" /> {isReserved ? "Reserva ejecutada" : "Listo para reservar"}
          </Badge>
          <Badge variant="secondary" className="font-normal text-xs">
            {RETURN_SETTLEMENT_LABELS[ret.settlement ?? "CAMBIO_STOCK"]}
          </Badge>
        </div>
      </div>

      {/* Tarjetas de cabecera en paneles lado a lado */}
      <div className="flex flex-wrap gap-3">
        <InfoCard title="Cliente">
          <InfoField label="Distribuidora" value={ret.distributorName} />
          <InfoField label="Cliente" value={ret.clientName} />
          <InfoField label="Propietario" value={ret.clientOwnerName} />
          <InfoField label="Teléfono" value={details?.phone} />
          <InfoField label="Tipo de Cliente" value={details && CLIENT_TYPE_LABELS[details.clientType]} />
          <InfoField label="Canal de Venta" value={details?.channelName} />
          <InfoField label="Sector" value={details?.sector} />
          <InfoField label="NIT" value={details?.nit} />
          <InfoField label="Dirección" value={details?.address} full />
        </InfoCard>

        <InfoCard title="Devolución">
          <InfoField label="Fecha de Registro" value={formatDay(ret.createdAt.slice(0, 10))} />
          <InfoField label="Registrado Por" value={ret.sellerName} />
          <InfoField label="Fecha Pactada de Entrega" value={formatDay(ret.replacementDate)} />
          <InfoField label="Total Reclamado" value={bs(ret.total)} />
          <InfoField label="Monto Aprobado" value={ret.approvedTotal !== null ? bs(ret.approvedTotal) : bs(ret.total)} />
          <InfoField
            label="Tipo de Devolución"
            value={ret.settlement && RETURN_SETTLEMENT_LABELS[ret.settlement]}
          />
          <InfoField label="Estado Logístico" value={RETURN_STATUS_LABELS[ret.status]} />
          <InfoField
            label="Estado Workflow"
            value={workflowState && RETURN_WORKFLOW_STATE_LABELS[workflowState]}
          />
          <InfoField label="Justificación" value={ret.justification} full />
        </InfoCard>

        <InfoCard title="Gestión de Almacén & Stock" className="border-blue-600/20 bg-blue-500/[0.02]">
          <InfoField label="Modalidad" value="Cambio físico por stock disponible" />
          <InfoField label="Almacén de Despacho" value="Almacén Central Santa Cruz" />
          <InfoField
            label="Estado de Reserva"
            value={
              isReserved ? (
                <Badge className="bg-emerald-600 text-white text-[11px] gap-1 py-0.5">
                  <CheckCircle2 className="size-3" /> Stock Reservado
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] py-0.5">
                  Pendiente de reserva
                </Badge>
              )
            }
          />
          <InfoField label="Fecha Límite de Reposición" value={formatDay(ret.replacementDate)} />
          <InfoField label="Responsable Operativo" value="Encargado de Depósito" />
          <InfoField label="Distribuidor Asignado" value={ret.distributorName} />

          {/* Botón integrado directamente dentro de la tarjeta de cabecera */}
          <div className="col-span-full pt-2.5 mt-1 border-t border-border/50 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {isReserved
                ? "Flujo completado: reserva de existencias registrada en depósito."
                : "Haz clic para consultar existencias y reservar."}
            </span>
            <Button
              type="button"
              onClick={handleReservar}
              disabled={isReserved}
              className={cn(
                "h-8 gap-1.5 text-xs font-semibold shadow-sm transition-all",
                isReserved
                  ? "bg-muted text-muted-foreground cursor-not-allowed border border-border opacity-80"
                  : "bg-blue-600 hover:bg-blue-700 text-white",
              )}
            >
              <PackageCheck className="size-3.5" />
              Reservar
            </Button>
          </div>
        </InfoCard>
      </div>

      {/* Lista de ítems */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Package className="h-4 w-4 text-blue-600" />
            Ítems a reservar y reponer ({ret.lines.length} {ret.lines.length === 1 ? "producto" : "productos"})
          </h2>
          <span className="text-xs text-muted-foreground">
            Valor de mercadería en cambio: <strong className="font-semibold text-foreground">{bs(ret.approvedTotal ?? ret.total)}</strong>
          </span>
        </div>

        {/* Banner informativo de opciones para almacén */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-900 dark:text-blue-200">
          <PackageCheck className="size-4 text-blue-600 shrink-0" />
          <div className="leading-snug">
            <span className="font-semibold">Control de Stock:</span> Presiona el botón <strong className="text-foreground">Reservar</strong> en la cabecera para asignar las unidades en depósito. Los ítems con stock completo se marcarán en verde y aquellos con faltantes en rojo.
          </div>
        </div>

        <DataTable
          tableId="devolucion-reservar-items"
          columns={columns}
          data={ret.lines}
          getRowId={(line) => line.productId}
          defaultDensity="normal"
          bodyMinHeight={260}
          emptyTitle="Sin ítems"
          emptyMessage="Esta devolución no contiene ítems registrados."
        />
      </div>

      {/* Resumen inferior de almacén */}
      <Card className="border-border/60 bg-muted/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-sm">Resumen de reposición de almacén</span>
            <span className="text-muted-foreground">
              {isReserved
                ? "Las unidades fueron reservadas físicamente en el depósito para el cambio al cliente."
                : "Esta devolución fue aprobada para cambio físico. Se requiere separar y reservar las unidades aprobadas."}
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">Estado de Stock</span>
              <span className="font-bold text-sm text-foreground">
                {isReserved ? "Reserva Simulada" : "Pendiente de Reserva"}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">Monto Aprobado</span>
              <span className="text-base font-bold text-blue-700 dark:text-blue-400">
                {bs(ret.approvedTotal ?? ret.total)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
