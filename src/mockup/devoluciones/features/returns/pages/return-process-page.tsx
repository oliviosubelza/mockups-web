import { useMemo } from "react";
import { useNavigate } from "react-router";
import { useRouteParams } from "@/core/routing/active-route";
import { ArrowLeft, CheckCircle2, FileText, PackageX, ReceiptText } from "lucide-react";
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

export function ReturnProcessPage() {
  const { id } = useRouteParams();
  const navigate = useNavigate();
  const returnId = Number(id);
  const { data: ret, isLoading } = useReturn(Number.isFinite(returnId) ? returnId : undefined);
  const { data: details } = useOrderClientDetails(ret?.clientId);

  const columns = useMemo(
    () =>
      defineColumns<ReturnLine>([
        {
          id: "code",
          header: "Código SAP",
          accessorKey: "code",
          size: 90,
          minSize: 70,
          cell: (line) => (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{line.code}</span>
          ),
        },
        {
          id: "productName",
          header: "Producto",
          accessorKey: "productName",
          size: 260,
          minSize: 160,
          cell: (line) => <span className="truncate font-medium">{line.productName}</span>,
        },
        {
          id: "lote",
          header: "Lote / Vencimiento",
          size: 135,
          minSize: 100,
          cell: (line) => <LoteCell line={line} />,
        },
        {
          id: "reason",
          header: "Motivo",
          accessorKey: "reason",
          size: 145,
          minSize: 100,
          cell: (line) => (
            <span className="truncate text-xs text-muted-foreground">
              {RETURN_REASON_LABELS[line.reason] ?? line.reason}
            </span>
          ),
        },
        {
          id: "priceUnit",
          header: "P. Unitario",
          size: 90,
          minSize: 70,
          meta: { align: "right" },
          cell: (line) => <span className="tabular-nums text-xs">{amount(line.priceUnit)}</span>,
        },
        {
          id: "subtotal",
          header: "Total (Bs.)",
          size: 100,
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
            <ReturnLineActionsCell line={line} returnCreatedAt={ret?.createdAt} />
          ),
        },
      ]),
    [ret?.createdAt],
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
          <Badge variant="outline" className="border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 gap-1 font-medium">
            <CheckCircle2 className="size-3.5" /> Listo para procesar
          </Badge>
          <Badge variant="secondary" className="font-normal text-xs">
            {RETURN_SETTLEMENT_LABELS[ret.settlement ?? "NOTA_CREDITO"]}
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
          <InfoField label="Fecha de Reposición" value={formatDay(ret.replacementDate)} />
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

        <InfoCard title="Facturación & Emisión Contable" className="border-emerald-600/20 bg-emerald-500/[0.02]">
          <InfoField label="Tipo de Documento" value="Nota de Crédito / Débito No Fiscal" />
          <InfoField label="Destino Contable" value="Ajuste comercial de cuenta cliente" />
          <InfoField label="Estado Contable" value="Aprobada · Lista para emisión" />
          <InfoField label="Monto a Emitir" value={<span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{bs(ret.approvedTotal ?? ret.total)}</span>} />
          <InfoField label="Responsable" value="Facturador Central" />
          <InfoField label="Distribuidor Responsable" value={ret.distributorName} />
        </InfoCard>
      </div>

      {/* Lista de ítems */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-emerald-600" />
            Ítems a facturar ({ret.lines.length} {ret.lines.length === 1 ? "producto" : "productos"})
          </h2>
          <span className="text-xs text-muted-foreground">
            Monto total de ítems aprobados: <strong className="font-semibold text-foreground">{bs(ret.approvedTotal ?? ret.total)}</strong>
          </span>
        </div>

        {/* Banner informativo de imputación de facturas */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-900 dark:text-emerald-200">
          <ReceiptText className="size-4 text-emerald-600 shrink-0" />
          <div className="leading-snug">
            <span className="font-semibold">Opciones por ítem:</span> Haz clic en el botón de opciones (<strong className="font-mono text-foreground font-semibold">⋮</strong>) al final de cada fila para ver la evidencia fotográfica en carrusel con la ficha del producto o consultar el respaldo de facturas asociadas.
          </div>
        </div>

        <DataTable
          tableId="devolucion-procesar-items"
          columns={columns}
          data={ret.lines}
          getRowId={(line) => line.productId}
          defaultDensity="normal"
          bodyMinHeight={260}
          emptyTitle="Sin ítems"
          emptyMessage="Esta devolución no contiene ítems registrados."
        />
      </div>

      {/* Resumen inferior de facturación */}
      <Card className="border-border/60 bg-muted/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-sm">Resumen de liquidación</span>
            <span className="text-muted-foreground">
              Esta devolución fue aprobada para liquidación vía nota de crédito/débito no fiscal.
            </span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">Reclamado</span>
              <span className="font-mono text-sm">{bs(ret.total)}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">Aprobado a Facturar</span>
              <span className="font-mono text-base font-bold text-emerald-700 dark:text-emerald-400">
                {bs(ret.approvedTotal ?? ret.total)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
