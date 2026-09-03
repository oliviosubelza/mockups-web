import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  FileText,
  GripVertical,
  Layers,
  ReceiptText,
} from "lucide-react";
import type { ReturnLine } from "../../../types";
import { lineAmount, lineMinUnits } from "../../../lib/order-math";
import { amount, bs, formatDay } from "../../../lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "../../../lib/utils";

export interface InvoiceAllocation {
  id: string;
  index: number;
  invoiceNumber: string;
  invoiceSapDoc: string;
  issueDate: string;
  daysAgo: number;
  originalUnits: number;
  allocatedUnits: number;
  remainingUnits: number;
  unitPrice: number;
  subtotal: number;
  isDepleted: boolean;
  batchNumber?: string | null;
}

/**
 * Resuelve la imputación en cascada de facturas para un producto devuelto.
 */
export function getAllocatedInvoices(line: ReturnLine, returnCreatedAt?: string): InvoiceAllocation[] {
  const totalNeeded = line.approvedMinUnits ?? lineMinUnits(line);
  const baseDate = returnCreatedAt ? new Date(returnCreatedAt) : new Date();

  // Semilla determinista basada en el código de producto y la cantidad
  const seedNum = Math.abs((line.code * 37 + totalNeeded * 13)) % 1000;

  // Variedad de ejemplos: 1, 2, 3 y 4 facturas (> 3 facturas)
  let targetCount = 1;
  if (line.code % 4 === 0 || totalNeeded >= 28) {
    targetCount = 4;
  } else if (line.code % 4 === 1 || totalNeeded >= 18) {
    targetCount = 3;
  } else if (line.code % 4 === 2 || totalNeeded >= 9) {
    targetCount = 2;
  } else {
    targetCount = 1;
  }

  if (totalNeeded <= 2) targetCount = 1;
  else if (totalNeeded <= 4 && targetCount > 2) targetCount = 2;
  else if (totalNeeded <= 6 && targetCount > 3) targetCount = 3;

  const allocations: InvoiceAllocation[] = [];
  let remaining = totalNeeded;
  let runningDays = 2 + (seedNum % 4);

  for (let i = 0; i < targetCount; i++) {
    const isLast = i === targetCount - 1;
    let slice = 0;
    if (isLast) {
      slice = remaining;
    } else {
      const idealPortion = Math.max(1, Math.floor(remaining / (targetCount - i)));
      slice = Math.min(remaining - (targetCount - i - 1), idealPortion);
    }

    const isDepleted = !isLast;
    const orig = isDepleted ? slice : slice + (seedNum % 10) + 5;
    const daysAgo = runningDays;
    const invDate = new Date(baseDate.getTime() - daysAgo * 86400000);

    const invIdNum = 89000 + (seedNum + i * 47) % 900;
    const sapDocNum = 4500000 + (seedNum + i * 83) % 900;

    allocations.push({
      id: `${line.productId}_inv_${i + 1}`,
      index: i + 1,
      invoiceNumber: `F-${invIdNum}`,
      invoiceSapDoc: `${sapDocNum}`,
      issueDate: invDate.toISOString().slice(0, 10),
      daysAgo,
      originalUnits: orig,
      allocatedUnits: slice,
      remainingUnits: orig - slice,
      unitPrice: line.priceUnit,
      subtotal: slice * line.priceUnit,
      isDepleted,
      batchNumber: line.sources[i]?.batchNumber || (i === 0 ? line.sources[0]?.batchNumber : null),
    });

    remaining -= slice;
    runningDays += 7 + ((seedNum + i * 5) % 6);
  }

  return allocations;
}

export interface AvailableInvoice {
  id: string;
  invoiceNumber: string;
  invoiceSapDoc: string;
  issueDate: string;
  daysAgo: number;
  originalUnits: number;
  availableUnits: number;
  unitPrice: number;
  batchNumber?: string | null;
}

/**
 * Retorna la lista histórica de compras/facturas del cliente para este producto,
 * permitiendo al facturador seleccionar y distribuir manualmente las cantidades.
 */
export function getAvailableClientInvoices(
  line: ReturnLine,
  returnCreatedAt?: string,
): AvailableInvoice[] {
  const baseDate = returnCreatedAt ? new Date(returnCreatedAt) : new Date();
  const seedNum = Math.abs(line.code * 41 + 17) % 1000;

  const count = 5 + (seedNum % 2); // 5 o 6 facturas históricas disponibles
  const invoices: AvailableInvoice[] = [];
  let runningDays = 2 + (seedNum % 3);

  for (let i = 0; i < count; i++) {
    const orig = 15 + ((seedNum + i * 19) % 35);
    const available = Math.max(6, Math.floor(orig * 0.75));
    const invDate = new Date(baseDate.getTime() - runningDays * 86400000);
    const invIdNum = 89000 + (seedNum + i * 47) % 950;
    const sapDocNum = 4500000 + (seedNum + i * 83) % 950;

    invoices.push({
      id: `${line.productId}_avail_${i + 1}`,
      invoiceNumber: `F-${invIdNum}`,
      invoiceSapDoc: `${sapDocNum}`,
      issueDate: invDate.toISOString().slice(0, 10),
      daysAgo: runningDays,
      originalUnits: orig,
      availableUnits: available,
      unitPrice: line.priceUnit,
      batchNumber: line.sources[i]?.batchNumber || null,
    });

    runningDays += 7 + ((seedNum + i * 7) % 6);
  }

  return invoices;
}

const INVOICE_COLORS = [
  "bg-emerald-600 dark:bg-emerald-500",
  "bg-blue-600 dark:bg-blue-500",
  "bg-purple-600 dark:bg-purple-500",
  "bg-amber-600 dark:bg-amber-500",
  "bg-indigo-600 dark:bg-indigo-500",
];

type SortKey =
  | "index"
  | "invoiceNumber"
  | "issueDate"
  | "originalUnits"
  | "subtotal";

/**
 * Celda de la columna de Facturas que abre un Modal optimizado:
 * - Sin desbordes ni scroll horizontal en el diálogo.
 * - Botón de cerrar (X) en la esquina superior derecha sin colisionar con badges.
 * - Header nativo esbelto (h-7) con soporte de ordenamiento interactivo.
 */
export function FacturasModalCell({
  line,
  returnCreatedAt,
}: {
  line: ReturnLine;
  returnCreatedAt?: string;
}) {
  const [open, setOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const allocations = useMemo(() => getAllocatedInvoices(line, returnCreatedAt), [line, returnCreatedAt]);
  const totalDevolver = line.approvedMinUnits ?? lineMinUnits(line);
  const totalSubtotal = lineAmount(line);

  const sortedAllocations = useMemo(() => {
    const list = [...allocations];
    list.sort((a, b) => {
      let valA: any = a[sortKey];
      let valB: any = b[sortKey];

      if (sortKey === "index") {
        valA = a.index;
        valB = b.index;
      }

      if (typeof valA === "string") {
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === "asc" ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    });
    return list;
  }, [allocations, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="size-2.5 text-muted-foreground/40 shrink-0" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="size-2.5 text-foreground shrink-0" />
    ) : (
      <ArrowDown className="size-2.5 text-foreground shrink-0" />
    );
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-7 px-2.5 text-xs font-normal gap-1.5 max-w-full justify-start shadow-none",
          allocations.length === 1
            ? "border-emerald-600/30 text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
            : allocations.length === 2
              ? "border-blue-600/30 text-blue-800 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40"
              : "border-purple-600/30 text-purple-800 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950/40",
        )}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <ReceiptText className="size-3.5 shrink-0" />
        {allocations.length === 1 ? (
          <span className="font-mono truncate font-medium">
            {allocations[0].invoiceNumber} ({allocations[0].allocatedUnits} u)
          </span>
        ) : (
          <span className="truncate">
            <strong className="font-semibold">{allocations.length} facturas</strong>
            <span className="font-mono text-[11px] opacity-80 ml-1">
              ({allocations[0].invoiceNumber}, {allocations[1].invoiceNumber}
              {allocations.length > 2 ? ` +${allocations.length - 2}` : ""})
            </span>
          </span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="w-[95vw] max-w-3xl sm:max-w-3xl max-h-[88vh] overflow-y-auto overflow-x-hidden p-5 gap-3.5"
          aria-describedby="dialog-desc"
        >
          {/* Header del modal con espacio reservado a la derecha (pr-9) para el botón de cerrar X */}
          <DialogHeader className="gap-1 pr-9">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shrink-0">
                  <Layers className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-sm font-semibold text-foreground truncate">
                    Facturas Asociadas — {line.productName}
                  </DialogTitle>
                  <DialogDescription id="dialog-desc" className="text-xs text-muted-foreground mt-0.5">
                    Código SAP <span className="font-mono font-medium text-foreground">{line.code}</span> · Cantidad devuelta: <strong className="text-foreground">{totalDevolver} u</strong>
                  </DialogDescription>
                </div>
              </div>

              <Badge
                variant="outline"
                className="border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 gap-1 py-0.5 px-2 text-[11px] font-medium shrink-0"
              >
                <Check className="size-3" /> {allocations.length} {allocations.length === 1 ? "factura aplicada" : "facturas aplicadas"}
              </Badge>
            </div>
          </DialogHeader>

          {/* Barra de distribución proporcional para múltiples facturas */}
          {allocations.length > 1 && (
            <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-muted/30 border border-border/40">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-foreground">
                  Distribución en cascada ({allocations.length} facturas aplicadas):
                </span>
                <span className="text-muted-foreground">
                  Imputado secuencialmente desde las compras más recientes
                </span>
              </div>
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                {allocations.map((fac, idx) => {
                  const widthPct = totalDevolver > 0 ? (fac.allocatedUnits / totalDevolver) * 100 : 100;
                  const color = INVOICE_COLORS[idx % INVOICE_COLORS.length];
                  return (
                    <div
                      key={fac.id}
                      style={{ width: `${widthPct}%` }}
                      title={`${fac.invoiceNumber}: ${fac.allocatedUnits} u (${Math.round(widthPct)}%)`}
                      className={cn("h-full transition-all", color)}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                {allocations.map((fac, idx) => {
                  const color = INVOICE_COLORS[idx % INVOICE_COLORS.length];
                  const pct = totalDevolver > 0 ? Math.round((fac.allocatedUnits / totalDevolver) * 100) : 100;
                  return (
                    <div key={fac.id} className="flex items-center gap-1">
                      <span className={cn("size-1.5 rounded-full shrink-0", color)} />
                      <span className="font-mono font-medium text-foreground">{fac.invoiceNumber}</span>: {fac.allocatedUnits} u ({pct}%)
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabla nativa ajustada al 100% del ancho con header de baja altura (h-7 / 28px) */}
          <div className="rounded-md border border-border/70 overflow-hidden bg-card">
            <table className="w-full border-collapse text-xs table-fixed">
              <thead>
                <tr className="border-b border-border/70 bg-muted/50 h-7 text-[11px] text-muted-foreground select-none">
                  <th
                    style={{ width: "36px" }}
                    className="border-r border-border/60 px-1 text-center font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => handleSort("index")}
                    title="Ordenar por secuencia"
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      <span>#</span>
                      {renderSortIcon("index")}
                    </div>
                  </th>

                  <th
                    style={{ width: "135px" }}
                    className="border-r border-border/60 px-2 text-left font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => handleSort("invoiceNumber")}
                    title="Ordenar por factura"
                  >
                    <div className="flex items-center gap-1">
                      <GripVertical className="size-3 opacity-30 shrink-0" />
                      <span className="truncate">Factura / SAP</span>
                      {renderSortIcon("invoiceNumber")}
                    </div>
                  </th>

                  <th
                    style={{ width: "95px" }}
                    className="border-r border-border/60 px-2 text-left font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => handleSort("issueDate")}
                    title="Ordenar por fecha"
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate">Fecha</span>
                      {renderSortIcon("issueDate")}
                    </div>
                  </th>

                  <th
                    style={{ width: "95px" }}
                    className="border-r border-border/60 px-2 text-right font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => handleSort("originalUnits")}
                    title="Ordenar por cantidad facturada"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className="truncate">Facturado</span>
                      {renderSortIcon("originalUnits")}
                    </div>
                  </th>

                  <th
                    style={{ width: "90px" }}
                    className="border-r border-border/60 px-2 text-right font-medium text-muted-foreground"
                  >
                    P. Unit.
                  </th>

                  <th
                    style={{ width: "105px" }}
                    className="px-2 text-right font-medium cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => handleSort("subtotal")}
                    title="Ordenar por subtotal"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span className="truncate">Subtotal</span>
                      {renderSortIcon("subtotal")}
                    </div>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/40">
                {sortedAllocations.map((fac) => (
                  <tr key={fac.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-1 py-2 text-center font-mono text-[11px] text-muted-foreground border-r border-border/40">
                      {fac.index}°
                    </td>

                    <td className="px-2 py-2 border-r border-border/40 overflow-hidden">
                      <div className="flex flex-col leading-tight min-w-0">
                        <div className="flex items-center gap-1 font-mono font-semibold text-foreground text-xs truncate">
                          <FileText className="size-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{fac.invoiceNumber}</span>
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground pl-4 truncate">
                          SAP {fac.invoiceSapDoc}
                        </span>
                      </div>
                    </td>

                    <td className="px-2 py-2 border-r border-border/40 text-muted-foreground">
                      <div className="flex flex-col leading-tight text-xs">
                        <span>{formatDay(fac.issueDate)}</span>
                        <span className="text-[10px] opacity-75">hace {fac.daysAgo}d</span>
                      </div>
                    </td>

                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground border-r border-border/40">
                      {fac.originalUnits} u
                    </td>

                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground border-r border-border/40">
                      {amount(fac.unitPrice)}
                    </td>

                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-foreground">
                      {bs(fac.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="border-t border-border/70 bg-muted/30 font-semibold text-xs">
                  <td colSpan={5} className="px-2.5 py-2 text-right text-muted-foreground border-r border-border/40">
                    Total a liquidar ({allocations.length} {allocations.length === 1 ? "factura" : "facturas"} · {totalDevolver} u devueltas):
                  </td>
                  <td className="px-2 py-2 text-right font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {bs(totalSubtotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <span className="text-[11px] text-muted-foreground">
              Las unidades fueron imputadas secuencialmente desde las compras más recientes.
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
