// LOS ÍTEMS DE UNA DEVOLUCIÓN — `RefundOrderDetail`, una fila por producto.
//
// UNA SOLA TABLA PARA LAS DOS LECTURAS. Antes eran dos componentes distintos: un `<table>` escrito a
// mano para el aprobador y un DataTable de solo lectura para todos los demás. Mismos datos, mismas
// preguntas, dos implementaciones que se desincronizaban solas — la editable no ordenaba, no
// exportaba y no tenía estado persistido, porque nada de eso venía gratis escribiendo el `<table>`.
//
// SE SELECCIONA, NO SE EDITA LA CANTIDAD. «Aprobar» es un checkbox: el ítem entra completo o no
// entra. Recortar cuánto se aprueba de un producto es trabajo del VENDEDOR (en su corrección), nunca
// del aprobador — por eso ya no hay un input de cantidad en esta tabla, ni un motivo de rechazo por
// ítem: el POR QUÉ de lo que se destildó va en el comentario general de la decisión, no acá.
//
// LA EVIDENCIA es un botón que abre un diálogo con la galería del ítem — no una columna con
// miniaturas. Adentro, cada foto es un `FotoAmpliable` (`src/mockup/VisorFoto.tsx`), la misma
// miniatura-que-abre-un-visor que ya usa Monitoreo para las fotos de incidencia y comprobante: el
// botón abre la galería, la miniatura abre el visor de esa foto en grande.
//
// LO QUE TODAVÍA NO ESTÁ ACÁ: «Factura», «Tipo de Proceso» y «Opción» son de la etapa de PROCESAR
// —después de que la devolución quedó aprobada en todos los niveles—, donde según el tipo de
// liquidación (cambio de stock o nota de crédito/débito) se elige la reposición o la factura que
// respalda cada ítem. Esa pantalla es otra, todavía no existe.
import { useState, useMemo } from "react";
import { Camera } from "lucide-react";
import type { ReturnLine } from "../../../types";
import { RETURN_LOT_LABELS, RETURN_REASON_LABELS } from "../../../types";
import { lineAmount, lineMinUnits } from "../../../lib/order-math";
import { primarySourceOf } from "../../../lib/return-workflow";
import { DataTable, defineColumns } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { amount, formatDay } from "../../../lib/format";
import { FotoAmpliable } from "../../../../VisorFoto";

/** El motivo que se guarda cuando el aprobador destilda un ítem: no hay campo por ítem para escribirlo. */
const NO_SELECCIONADO = "Ítem no seleccionado por el aprobador.";

/** La respuesta que el aprobador está escribiendo para un producto, antes de confirmarla. */
export interface ItemDraft {
  status: "APPROVED" | "REJECTED";
  /** Siempre la cantidad reclamada completa: el checkbox no tiene un valor intermedio. */
  approvedMinUnits: number;
  rejectReason: string;
}

/** El lote y su vencimiento, o un guion. Se lee del primer origen — el único la mayoría de las veces. */
function LoteCell({ line }: { line: ReturnLine }) {
  const source = primarySourceOf(line);
  if (!source?.batchNumber?.trim()) return <span className="text-muted-foreground">—</span>;
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

/**
 * La evidencia: un botón, no una columna con miniaturas — es lo que deja la tabla angosta. Adentro
 * del diálogo, la misma grilla de miniaturas-que-abren-un-visor que usa Monitoreo (`FotoAmpliable`):
 * el botón abre la galería del ítem, cada miniatura abre esa foto en grande.
 */
function EvidenceButton({ line }: { line: ReturnLine }) {
  const [open, setOpen] = useState(false);
  if (line.photos.length === 0) {
    return <span className="text-[11px] text-muted-foreground">Sin fotos</span>;
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Camera className="size-3.5" />
        {line.photos.length}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="text-sm">{line.productName}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {line.photos.map((url, index) => (
              <FotoAmpliable
                key={`${url}_${index}`}
                src={url}
                titulo={line.productName}
                epigrafe={`Foto ${index + 1} de ${line.photos.length}`}
                alto="h-24"
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ReturnItemsTable({
  lines,
  clientId,
  decidiendo,
  drafts,
  onDraftChange,
}: {
  lines: ReturnLine[];
  /** `Código de Cliente» — un dato del documento, no de la línea, repetido en cada fila. */
  clientId: string;
  /** Con `false` la tabla es la misma, sin la columna que se escribe. */
  decidiendo: boolean;
  drafts: Map<string, ItemDraft>;
  onDraftChange: (productId: string, patch: Partial<ItemDraft>) => void;
}) {
  const columns = useMemo(
    () =>
      defineColumns<ReturnLine>([
        // El checkbox ES la decisión — se tilda o no se tilda, sin cantidad intermedia.
        ...(decidiendo
          ? [
              {
                id: "aprobar" as const,
                header: "Aprobar",
                size: 60,
                enableSorting: false,
                meta: { align: "center" as const },
                cell: (line: ReturnLine) => {
                  const draft = drafts.get(line.productId);
                  const checked = draft?.status === "APPROVED";
                  return (
                    <Checkbox
                      checked={checked}
                      aria-label={`Aprobar ${line.productName}`}
                      onCheckedChange={(value) => {
                        const next = value === true;
                        onDraftChange(
                          line.productId,
                          next
                            ? { status: "APPROVED", approvedMinUnits: lineMinUnits(line), rejectReason: "" }
                            : { status: "REJECTED", approvedMinUnits: 0, rejectReason: NO_SELECCIONADO },
                        );
                      }}
                    />
                  );
                },
              },
            ]
          : [
              {
                id: "aprobado" as const,
                header: "Aprobado",
                size: 76,
                enableSorting: false,
                meta: { align: "center" as const },
                cell: (line: ReturnLine) =>
                  line.itemStatus === "PENDING" ? (
                    <span className="text-muted-foreground">pendiente</span>
                  ) : line.itemStatus === "REJECTED" ? (
                    <span>rechazado</span>
                  ) : (
                    <span>aprobado</span>
                  ),
              },
            ]),
        {
          id: "codigo",
          header: "Código",
          accessorKey: "code",
          size: 70,
          cell: (line) => <span className="font-mono tabular-nums">{line.code}</span>,
        },
        {
          id: "nombre",
          header: "Nombre",
          accessorKey: "productName",
          size: 190,
          pin: "left",
          cell: (line) => (
            <div className="min-w-0 py-0.5">
              <div className="truncate font-medium leading-tight">{line.productName}</div>
              <div className="truncate text-[10px] tabular-nums text-muted-foreground">
                {amount(line.priceUnit)} × {line.unitLabel}
              </div>
            </div>
          ),
        },
        {
          id: "cantidad",
          header: "Cantidad",
          accessorKey: "qtyCase",
          size: 75,
          meta: { align: "right" },
          cell: (line) => <span className="tabular-nums">{line.qtyCase}</span>,
        },
        {
          id: "unidadMedida",
          header: "Unidad de medida",
          accessorKey: "caseLabel",
          size: 100,
          cell: (line) => <span className="truncate">{line.caseLabel}</span>,
        },
        {
          id: "cantidadMinima",
          header: "Cantidad mínima",
          size: 90,
          enableSorting: false,
          meta: { align: "right" },
          cell: (line) => <span className="tabular-nums">{lineMinUnits(line)}</span>,
        },
        {
          id: "unidadMedidaMinima",
          header: "Unidad de medida mínima",
          size: 110,
          enableSorting: false,
          cell: (line) => <span className="truncate">{line.unitLabel}</span>,
        },
        {
          id: "total",
          header: "Total (Bs.)",
          size: 95,
          enableSorting: false,
          meta: { align: "right" },
          cell: (line) => (
            <span className="font-semibold tabular-nums">{amount(lineAmount(line))}</span>
          ),
        },
        {
          id: "motivo",
          header: "Motivo",
          accessorKey: "reason",
          size: 130,
          cell: (line) => (
            <span className="line-clamp-2 whitespace-normal leading-tight">
              {RETURN_REASON_LABELS[line.reason]}
            </span>
          ),
        },
        {
          id: "observacion",
          header: "Observación",
          accessorKey: "notes",
          size: 150,
          enableSorting: false,
          cell: (line) =>
            line.notes ? (
              <span className="line-clamp-2 whitespace-normal leading-tight">{line.notes}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          id: "lote",
          header: "Nº Lote",
          size: 100,
          enableSorting: false,
          cell: (line) => <LoteCell line={line} />,
        },
        {
          id: "vencimiento",
          header: "Fecha de vencimiento",
          size: 100,
          enableSorting: false,
          cell: (line) => {
            const dueDate = primarySourceOf(line)?.dueDate;
            return dueDate ? (
              <span className="whitespace-nowrap tabular-nums">{formatDay(dueDate)}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            );
          },
        },
        {
          id: "codigoCliente",
          header: "Código de Cliente",
          size: 90,
          enableSorting: false,
          cell: () => <span className="font-mono tabular-nums">{clientId}</span>,
        },
        {
          id: "fotos",
          header: "Evidencia",
          size: 76,
          enableSorting: false,
          meta: { align: "center" },
          cell: (line) => <EvidenceButton line={line} />,
        },
      ]),
    [decidiendo, drafts, onDraftChange, clientId],
  );

  return (
    <DataTable
      // `tableId` distinto por modo: las columnas no son las mismas, y compartir el id haría que el
      // ancho guardado de «Aprobar» se le aplicara a «Aprobado» y al revés.
      tableId={decidiendo ? "mockup-devolucion-items-decision" : "mockup-devolucion-items"}
      columns={columns}
      data={lines}
      getRowId={(line) => line.productId}
      bodyMinHeight={0}
      defaultDensity="compact"
      searchable
      searchPlaceholder="Buscar producto…"
      searchKeys={["productName", "code"]}
      exportable
      exportFilename="devolucion-items"
      emptyTitle="Sin productos"
      emptyMessage="Esta devolución no tiene líneas cargadas."
    />
  );
}
