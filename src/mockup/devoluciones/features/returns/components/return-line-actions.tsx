import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  GripVertical,
  ImageIcon,
  Layers,
  MoreVertical,
  ReceiptText,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { ReturnLine } from "../../../types";
import {
  RETURN_REASON_LABELS,
} from "../../../types";
import { lineAmount, lineMinUnits } from "../../../lib/order-math";
import { primarySourceOf } from "../../../lib/return-workflow";
import { amount, bs, formatDay } from "../../../lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "../../../lib/utils";
import {
  getAllocatedInvoices,
  getAvailableClientInvoices,
  type AvailableInvoice,
  type InvoiceAllocation,
} from "./facturas-asociadas-cell";

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
 * Celda de Acciones con menú desplegable de 3 puntos verticales (MoreVertical):
 * - Opción 1: Evidencia (Detalles de producto + Carrusel de Fotos)
 * - Opción 2: Ver facturas (Automáticas o Manuales)
 * - Opción 3: Asignar facturas manualmente (Lista de facturas seleccionables hasta satisfacer cantidad)
 * - Opción 4: Copiar código SAP
 */
export function ReturnLineActionsCell({
  line,
  returnCreatedAt,
  mode = "facturador",
}: {
  line: ReturnLine;
  returnCreatedAt?: string;
  mode?: "facturador" | "almacen";
}) {
  const [openEvidencia, setOpenEvidencia] = useState(false);
  const [openFacturas, setOpenFacturas] = useState(false);
  const [openManual, setOpenManual] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);

  // Sorting para la tabla de facturas
  const [sortKey, setSortKey] = useState<SortKey>("index");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Asignación manual personalizada por el usuario
  const [customAllocations, setCustomAllocations] = useState<InvoiceAllocation[] | null>(null);

  // Lista de facturas históricas disponibles para asignación manual
  const availableInvoices = useMemo(
    () => getAvailableClientInvoices(line, returnCreatedAt),
    [line, returnCreatedAt],
  );

  const defaultAllocations = useMemo(
    () => getAllocatedInvoices(line, returnCreatedAt),
    [line, returnCreatedAt],
  );

  // Allocations activas: manuales si existen, o automáticas por defecto
  const allocations = customAllocations ?? defaultAllocations;
  const isManualMode = customAllocations !== null;

  const totalDevolver = line.approvedMinUnits ?? lineMinUnits(line);
  const totalSubtotal = isManualMode
    ? allocations.reduce((acc, a) => acc + a.subtotal, 0)
    : lineAmount(line);

  const source = primarySourceOf(line);

  // Estado del formulario de asignación manual
  const [manualUnits, setManualUnits] = useState<Record<string, number>>({});

  // Fotos para el carrusel de evidencia
  const photos = useMemo(() => {
    if (line.photos && line.photos.length > 0) return line.photos;
    return [
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80",
    ];
  }, [line.photos]);

  // Abre el modal manual precargando las cantidades actuales
  const handleOpenManualDialog = () => {
    const initial: Record<string, number> = {};
    if (customAllocations) {
      customAllocations.forEach((a) => {
        initial[a.id] = a.allocatedUnits;
      });
    } else {
      defaultAllocations.forEach((a) => {
        const found = availableInvoices.find((avail) => avail.invoiceNumber === a.invoiceNumber);
        if (found) {
          initial[found.id] = a.allocatedUnits;
        }
      });
    }
    setManualUnits(initial);
    setOpenManual(true);
  };

  // Cálculos reactivos de la asignación manual
  const manualAssignedTotal = useMemo(() => {
    return Object.values(manualUnits).reduce((acc, qty) => acc + (qty || 0), 0);
  }, [manualUnits]);

  const manualPendingUnits = totalDevolver - manualAssignedTotal;
  const isManualSatisfied = manualAssignedTotal === totalDevolver;
  const isManualExceeded = manualAssignedTotal > totalDevolver;

  // Modificar cantidad de una factura en la asignación manual
  const handleSetInvoiceAmount = (invoiceId: string, val: number, maxAllowed: number) => {
    const sanitized = Math.max(0, Math.min(val, maxAllowed));
    setManualUnits((prev) => ({
      ...prev,
      [invoiceId]: sanitized,
    }));
  };

  // Toggle checkbox de factura: asignar lo que falte o desmarcar
  const handleToggleInvoice = (inv: AvailableInvoice) => {
    const current = manualUnits[inv.id] || 0;
    if (current > 0) {
      // Desmarcar
      setManualUnits((prev) => {
        const copy = { ...prev };
        delete copy[inv.id];
        return copy;
      });
    } else {
      // Marcar asignando lo faltante hasta su disponibilidad
      const toAssign = Math.min(inv.availableUnits, Math.max(1, manualPendingUnits));
      setManualUnits((prev) => ({
        ...prev,
        [inv.id]: toAssign,
      }));
    }
  };

  // Asignar el máximo posible para una factura dada
  const handleAssignMaxForInvoice = (inv: AvailableInvoice) => {
    const current = manualUnits[inv.id] || 0;
    const room = manualPendingUnits + current;
    const toAssign = Math.min(inv.availableUnits, room > 0 ? room : inv.availableUnits);
    handleSetInvoiceAmount(inv.id, toAssign, inv.availableUnits);
  };

  // Auto-completar FIFO sugerido
  const handleAutoFifo = () => {
    const result: Record<string, number> = {};
    let rem = totalDevolver;
    for (const inv of availableInvoices) {
      if (rem <= 0) break;
      const take = Math.min(inv.availableUnits, rem);
      result[inv.id] = take;
      rem -= take;
    }
    setManualUnits(result);
  };

  // Limpiar todas las asignaciones
  const handleClearManual = () => {
    setManualUnits({});
  };

  // Guardar asignación manual
  const handleSaveManualAllocations = () => {
    if (!isManualSatisfied) {
      toast.error(`La cantidad asignada (${manualAssignedTotal} u) debe ser exactamente igual a ${totalDevolver} u.`);
      return;
    }

    const newAllocations: InvoiceAllocation[] = [];
    let idx = 1;

    for (const inv of availableInvoices) {
      const units = manualUnits[inv.id] || 0;
      if (units > 0) {
        newAllocations.push({
          id: inv.id,
          index: idx++,
          invoiceNumber: inv.invoiceNumber,
          invoiceSapDoc: inv.invoiceSapDoc,
          issueDate: inv.issueDate,
          daysAgo: inv.daysAgo,
          originalUnits: inv.originalUnits,
          allocatedUnits: units,
          remainingUnits: inv.originalUnits - units,
          unitPrice: inv.unitPrice,
          subtotal: units * inv.unitPrice,
          isDepleted: units >= inv.availableUnits,
          batchNumber: inv.batchNumber,
        });
      }
    }

    setCustomAllocations(newAllocations);
    setOpenManual(false);
    toast.success(`Asignación manual de facturas guardada para ${line.productName}.`);
  };

  // Restablecer a modo automático
  const handleResetToAuto = () => {
    setCustomAllocations(null);
    setOpenManual(false);
    toast.info("Se restableció la asignación automática en cascada.");
  };

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

  const handleCopyCode = () => {
    navigator.clipboard.writeText(String(line.code));
    toast.success(`Código SAP ${line.code} copiado al portapapeles`);
  };

  const handlePrevPhoto = () => {
    setActivePhoto((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const handleNextPhoto = () => {
    setActivePhoto((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="size-7 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="size-4" />
          <span className="sr-only">Acciones de ítem</span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className={cn(mode === "almacen" ? "w-44" : "w-56")}>
          {/* Opción Evidencia: común a ambos roles */}
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onClick={(e) => {
              e.stopPropagation();
              setActivePhoto(0);
              setOpenEvidencia(true);
            }}
          >
            <Camera className="size-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="flex-1">Evidencia</span>
            {photos.length > 0 && (
              <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal">
                {photos.length}
              </Badge>
            )}
          </DropdownMenuItem>

          {/* Opciones exclusivas de Facturación (modo facturador) */}
          {mode === "facturador" && (
            <>
              {/* Opción 2: Ver facturas */}
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenFacturas(true);
                }}
              >
                <ReceiptText className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="flex-1 truncate">
                  {allocations.length === 1
                    ? "Ver factura"
                    : `Ver facturas (+${allocations.length - 1})`}
                </span>
                {isManualMode ? (
                  <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal border-blue-500/30 text-blue-700 dark:text-blue-300">
                    Manual
                  </Badge>
                ) : (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {allocations[0].invoiceNumber}
                  </span>
                )}
              </DropdownMenuItem>

              {/* Opción 3: Asignar facturas manualmente */}
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenManualDialog();
                }}
              >
                <SlidersHorizontal className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="flex-1">Asignar facturas manualmente</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              {/* Opción 4: Copiar código SAP */}
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyCode();
                }}
              >
                <Copy className="size-4 text-muted-foreground shrink-0" />
                <span>Copiar código SAP</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── MODAL 1: EVIDENCIA (Detalles del producto + Carrusel de Fotos) ── */}
      <Dialog open={openEvidencia} onOpenChange={setOpenEvidencia}>
        <DialogContent
          className="w-[95vw] max-w-2xl sm:max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-5 gap-4"
          aria-describedby="dialog-evidencia-desc"
        >
          <DialogHeader className="gap-1 pr-9">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                <Camera className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base font-semibold text-foreground truncate">
                  Evidencia y Detalles del Producto
                </DialogTitle>
                <DialogDescription id="dialog-evidencia-desc" className="text-xs text-muted-foreground mt-0.5 truncate">
                  {line.productName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Ficha técnica con los detalles solicitados */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/50 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground font-medium">Código SAP</span>
              <span className="font-mono font-semibold text-foreground">{line.code}</span>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground font-medium">Lote de Fábrica</span>
              <span className="font-mono font-semibold text-foreground">
                {!source?.batchNumber ||
                source.batch === "IMPORTADO" ||
                source.batchNumber.toUpperCase().includes("IMPORTADO")
                  ? "—"
                  : source.batchNumber}
              </span>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground font-medium">Vencimiento</span>
              <span className="text-foreground font-medium">
                {!source?.dueDate ||
                source.batch === "IMPORTADO" ||
                (source.batchNumber && source.batchNumber.toUpperCase().includes("IMPORTADO"))
                  ? "—"
                  : formatDay(source.dueDate)}
              </span>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground font-medium">Motivo Devolución</span>
              <span className="text-foreground font-medium truncate">
                {RETURN_REASON_LABELS[line.reason] ?? line.reason}
              </span>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground font-medium">Cantidad Devuelta</span>
              <span className="font-semibold text-foreground">{totalDevolver} u</span>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground font-medium">Monto Aprobado</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                {bs(totalSubtotal)}
              </span>
            </div>
          </div>

          {/* Carrusel de Fotografías */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <ImageIcon className="size-3.5 text-muted-foreground" />
                Fotografías adjuntas ({photos.length})
              </span>
              <span className="text-muted-foreground text-[11px]">
                Foto {activePhoto + 1} de {photos.length}
              </span>
            </div>

            {photos.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="relative h-64 sm:h-72 rounded-lg bg-black/95 overflow-hidden flex items-center justify-center border border-border/60 select-none">
                  <img
                    src={photos[activePhoto]}
                    alt={`Evidencia ${activePhoto + 1}`}
                    className="max-h-full max-w-full object-contain transition-all duration-200"
                  />

                  {photos.length > 1 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 size-8 rounded-full bg-background/80 shadow-md backdrop-blur hover:bg-background transition-all"
                      onClick={handlePrevPhoto}
                    >
                      <ChevronLeft className="size-4" />
                      <span className="sr-only">Anterior</span>
                    </Button>
                  )}

                  {photos.length > 1 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 size-8 rounded-full bg-background/80 shadow-md backdrop-blur hover:bg-background transition-all"
                      onClick={handleNextPhoto}
                    >
                      <ChevronRight className="size-4" />
                      <span className="sr-only">Siguiente</span>
                    </Button>
                  )}

                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-background/85 backdrop-blur text-[10px] font-medium text-foreground shadow-sm">
                    {activePhoto + 1} / {photos.length}
                  </div>
                </div>

                {photos.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto py-1 justify-center">
                    {photos.map((url, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActivePhoto(idx)}
                        className={cn(
                          "size-14 rounded-md overflow-hidden border-2 transition-all shrink-0 bg-black/50 cursor-pointer",
                          activePhoto === idx
                            ? "border-blue-600 ring-2 ring-blue-600/30 scale-105"
                            : "border-border/60 opacity-65 hover:opacity-100",
                        )}
                      >
                        <img src={url} alt={`Miniatura ${idx + 1}`} className="size-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-40 rounded-lg border border-dashed border-border/80 flex flex-col items-center justify-center text-muted-foreground gap-1.5 text-xs">
                <Camera className="size-6 opacity-40" />
                <span>Sin fotografías de evidencia adjuntas para este producto</span>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-end pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpenEvidencia(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL 2: FACTURAS ASOCIADAS ── */}
      <Dialog open={openFacturas} onOpenChange={setOpenFacturas}>
        <DialogContent
          className="w-[95vw] max-w-3xl sm:max-w-3xl max-h-[88vh] overflow-y-auto overflow-x-hidden p-5 gap-3.5"
          aria-describedby="dialog-facturas-desc"
        >
          <DialogHeader className="gap-1 pr-9">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shrink-0">
                  <Layers className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-sm font-semibold text-foreground truncate">
                      Facturas Asociadas — {line.productName}
                    </DialogTitle>
                    {isManualMode && (
                      <Badge variant="outline" className="border-purple-600/30 bg-purple-500/10 text-purple-700 dark:text-purple-300 text-[10px] py-0 px-1.5">
                        Selección manual
                      </Badge>
                    )}
                  </div>
                  <DialogDescription id="dialog-facturas-desc" className="text-xs text-muted-foreground mt-0.5">
                    Código SAP <span className="font-mono font-medium text-foreground">{line.code}</span> · Cantidad devuelta: <strong className="text-foreground">{totalDevolver} u</strong>
                  </DialogDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 gap-1 py-0.5 px-2 text-[11px] font-medium shrink-0"
                >
                  <Check className="size-3" /> {allocations.length} {allocations.length === 1 ? "factura aplicada" : "facturas aplicadas"}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => {
                    setOpenFacturas(false);
                    handleOpenManualDialog();
                  }}
                  title="Abrir la asignación manual de facturas"
                >
                  <SlidersHorizontal className="size-3 text-purple-600" />
                  <span>Modificar</span>
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Barra proporcional si hay más de 1 factura */}
          {allocations.length > 1 && (
            <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-muted/30 border border-border/40">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-foreground">
                  Distribución de facturas ({allocations.length} aplicadas):
                </span>
                <span className="text-muted-foreground">
                  {isManualMode ? "Asignación manual del facturador" : "Imputado secuencialmente desde las compras más recientes"}
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

          {/* Tabla nativa sin scroll horizontal */}
          <div className="rounded-md border border-border/70 overflow-hidden bg-card">
            <table className="w-full border-collapse text-xs table-fixed">
              <thead>
                <tr className="border-b border-border/70 bg-muted/50 h-7 text-[11px] text-muted-foreground select-none">
                  <th
                    style={{ width: "38px" }}
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
                    style={{ width: "160px" }}
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
                    style={{ width: "110px" }}
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
              {isManualMode
                ? "Asignación manual activa por el facturador."
                : "Las unidades fueron imputadas secuencialmente desde las compras más recientes."}
            </span>
            <div className="flex items-center gap-2">
              {isManualMode && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleResetToAuto}
                >
                  <RotateCcw className="size-3.5 mr-1" /> Restablecer automático
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => setOpenFacturas(false)}>
                Cerrar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL 3: ASIGNACIÓN MANUAL DE FACTURAS ── */}
      <Dialog open={openManual} onOpenChange={setOpenManual}>
        <DialogContent
          className="w-[95vw] max-w-3xl sm:max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden p-5 gap-4"
          aria-describedby="dialog-manual-desc"
        >
          <DialogHeader className="gap-1 pr-9">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="flex size-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-300 shrink-0">
                  <SlidersHorizontal className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-base font-semibold text-foreground truncate">
                    Asignación Manual de Facturas
                  </DialogTitle>
                  <DialogDescription id="dialog-manual-desc" className="text-xs text-muted-foreground mt-0.5">
                    {line.productName} · Requerido a satisfacer: <strong className="text-foreground">{totalDevolver} u</strong>
                  </DialogDescription>
                </div>
              </div>

              {/* Botones de acción rápida en cabecera */}
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px] gap-1"
                  onClick={handleAutoFifo}
                  title="Auto-completar con las compras más recientes"
                >
                  <Sparkles className="size-3 text-purple-600" />
                  Auto FIFO
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={handleClearManual}
                >
                  Limpiar
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Medidor visual de satisfacción en tiempo real */}
          <div
            className={cn(
              "flex flex-col gap-2 p-3 rounded-lg border transition-all text-xs",
              isManualSatisfied
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
                : isManualExceeded
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-200",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isManualSatisfied ? (
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="size-4 shrink-0 opacity-80" />
                )}
                <span className="font-semibold">
                  {isManualSatisfied
                    ? "¡Cantidad requerida satisfecha al 100%!"
                    : isManualExceeded
                      ? `Excediste la cantidad en ${Math.abs(manualPendingUnits)} u`
                      : `Faltan ${manualPendingUnits} u por asignar para completar el total`}
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono font-medium text-xs">
                <span>Asignado:</span>
                <strong className="text-sm font-bold">
                  {manualAssignedTotal} / {totalDevolver} u
                </strong>
              </div>
            </div>

            {/* Barra de progreso interactiva */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                style={{
                  width: `${Math.min(100, Math.max(0, (manualAssignedTotal / totalDevolver) * 100))}%`,
                }}
                className={cn(
                  "h-full transition-all duration-300 rounded-full",
                  isManualSatisfied
                    ? "bg-emerald-600"
                    : isManualExceeded
                      ? "bg-rose-600"
                      : "bg-amber-500",
                )}
              />
            </div>
          </div>

          {/* Tabla interactiva de selección de facturas disponibles */}
          <div className="rounded-md border border-border/70 overflow-hidden bg-card">
            <table className="w-full border-collapse text-xs table-fixed">
              <thead>
                <tr className="border-b border-border/70 bg-muted/50 h-7 text-[11px] text-muted-foreground select-none">
                  <th style={{ width: "38px" }} className="border-r border-border/60 px-1 text-center font-medium">
                    Sel.
                  </th>
                  <th style={{ width: "155px" }} className="border-r border-border/60 px-2 text-left font-medium">
                    Factura / SAP
                  </th>
                  <th style={{ width: "105px" }} className="border-r border-border/60 px-2 text-left font-medium">
                    Fecha Emisión
                  </th>
                  <th style={{ width: "85px" }} className="border-r border-border/60 px-2 text-right font-medium">
                    Facturado
                  </th>
                  <th style={{ width: "95px" }} className="border-r border-border/60 px-2 text-right font-medium">
                    Disponible
                  </th>
                  <th style={{ width: "135px" }} className="border-r border-border/60 px-2 text-center font-medium">
                    Asignar (u)
                  </th>
                  <th style={{ width: "95px" }} className="px-2 text-right font-medium">
                    Subtotal
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/40">
                {availableInvoices.map((inv) => {
                  const assigned = manualUnits[inv.id] || 0;
                  const isChecked = assigned > 0;
                  const rowSubtotal = assigned * inv.unitPrice;

                  return (
                    <tr
                      key={inv.id}
                      className={cn(
                        "transition-colors",
                        isChecked ? "bg-purple-500/[0.04] dark:bg-purple-500/[0.08]" : "hover:bg-muted/20",
                      )}
                    >
                      {/* Checkbox de fila */}
                      <td className="px-1 py-2 text-center border-r border-border/40">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => handleToggleInvoice(inv)}
                          />
                        </div>
                      </td>

                      {/* Factura / SAP */}
                      <td className="px-2 py-2 border-r border-border/40 overflow-hidden">
                        <div className="flex flex-col leading-tight min-w-0">
                          <div className="flex items-center gap-1 font-mono font-semibold text-foreground text-xs truncate">
                            <FileText className="size-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{inv.invoiceNumber}</span>
                          </div>
                          <span className="font-mono text-[10px] text-muted-foreground pl-4 truncate">
                            SAP {inv.invoiceSapDoc}
                          </span>
                        </div>
                      </td>

                      {/* Fecha de Emisión */}
                      <td className="px-2 py-2 border-r border-border/40 text-muted-foreground">
                        <div className="flex flex-col leading-tight text-xs">
                          <span>{formatDay(inv.issueDate)}</span>
                          <span className="text-[10px] opacity-75">hace {inv.daysAgo}d</span>
                        </div>
                      </td>

                      {/* Cantidad Facturada Original */}
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground border-r border-border/40">
                        {inv.originalUnits} u
                      </td>

                      {/* Cantidad Disponible */}
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-foreground border-r border-border/40">
                        {inv.availableUnits} u
                      </td>

                      {/* Campo interactivo para asignar unidades */}
                      <td className="px-2 py-1.5 border-r border-border/40">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={inv.availableUnits}
                            value={assigned || ""}
                            placeholder="0"
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              handleSetInvoiceAmount(inv.id, val, inv.availableUnits);
                            }}
                            className={cn(
                              "h-7 text-center font-mono font-semibold text-xs tabular-nums",
                              assigned > 0
                                ? "border-purple-600 bg-purple-500/10 text-purple-900 dark:text-purple-200"
                                : "text-muted-foreground",
                            )}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-1.5 text-[10px] shrink-0 hover:border-purple-500"
                            onClick={() => handleAssignMaxForInvoice(inv)}
                            title="Asignar el remanente disponible de esta factura"
                          >
                            Máx
                          </Button>
                        </div>
                      </td>

                      {/* Subtotal en Bs. */}
                      <td className="px-2 py-2 text-right tabular-nums font-semibold text-foreground">
                        {assigned > 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400">{bs(rowSubtotal)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t border-border/70 bg-muted/30 font-semibold text-xs">
                  <td colSpan={5} className="px-2.5 py-2 text-right text-muted-foreground border-r border-border/40">
                    Total asignado ({manualAssignedTotal} de {totalDevolver} u requeridas):
                  </td>
                  <td className="px-2 py-2 text-center font-bold font-mono text-xs border-r border-border/40">
                    <span
                      className={
                        isManualSatisfied
                          ? "text-emerald-700 dark:text-emerald-400"
                          : isManualExceeded
                            ? "text-rose-600"
                            : "text-amber-600"
                      }
                    >
                      {manualAssignedTotal} u
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {bs(manualAssignedTotal * line.priceUnit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <DialogFooter className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2 text-xs">
              {isManualMode ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={handleResetToAuto}
                >
                  <RotateCcw className="size-3.5 mr-1" /> Restablecer a modo automático
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Al guardar, se respaldará la devolución con las facturas que hayas seleccionado.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpenManual(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                className={cn(
                  "gap-1.5",
                  isManualSatisfied
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-primary/50 cursor-not-allowed",
                )}
                disabled={!isManualSatisfied}
                onClick={handleSaveManualAllocations}
              >
                <Check className="size-3.5" /> Guardar asignación
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
