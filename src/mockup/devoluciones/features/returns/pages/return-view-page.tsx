import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
// `useRouteParams` y no `useParams`: el shell de este mockup renderiza la pantalla a mano, fuera de
// un <Route element>, así que `useParams()` devolvería {} y la página se quedaría sin su id.
import { useRouteParams } from "@/core/routing/active-route";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  PackageX,
  Pencil,
  X,
} from "lucide-react";
import type { ReturnLine } from "../../../types";
import { RETURN_LOT_LABELS, RETURN_REASON_LABELS, RETURN_SETTLEMENT_LABELS } from "../../../types";
import type { ItemDecisionInput } from "../../../lib/return-workflow";
import {
  canDecide,
  decisionBlockedReason,
  itemDecisionBlockedReason,
  pendingLevelOf,
  primarySourceOf,
} from "../../../lib/return-workflow";
import { lineAmount, lineMinUnits, round2 } from "../../../lib/order-math";
import { useApproveReturn, useReturn, useRejectReturn } from "../../../hooks/use-returns";
import { useOrderClientDetails } from "../../../hooks/use-orders";
import { canApproveReturns, seesOwnDocumentsOnly, useCurrentUser } from "../../../stores/session-store";
import { editBlockedReason } from "../../../services/returns-service";
import { PageHeader } from "../../../components/common/page-header";
import { EmptyState } from "../../../components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable, defineColumns } from "../../../components/data-table";
import { amount, bs, formatDay } from "../../../lib/format";
import { PhotoStack } from "../../../components/common/photo-viewer";
import { ReturnStatusBadge } from "../components/return-status-badge";
import { ReturnFlow } from "../components/return-flow";
import { ItemDecisionTable, type ItemDraft } from "../components/item-decision-table";
import { DecisionImpactDialog } from "../components/decision-impact-dialog";
import { ReturnTimeline } from "../components/return-timeline";

/**
 * The returned goods, read-only — for whoever isn't the one deciding right now.
 *
 * Same row shape as `ItemDecisionTable`'s read side, minus the controls: cod,
 * producto, cantidad, motivo, lote, importe. Vencimiento y evidencia viven
 * detrás del ícono de foto y del tooltip del lote — el dato sigue disponible,
 * no ocupa una columna fija.
 */
function ReturnLinesTable({ lines }: { lines: ReturnLine[] }) {
  const columns = useMemo(
    () =>
      defineColumns<ReturnLine>([
        {
          id: "productName",
          header: "Producto",
          accessorKey: "productName",
          size: 220,
          cell: (line) => (
            <div>
              <div className="font-medium leading-tight">{line.productName}</div>
              <div className="text-[10px] text-muted-foreground">{line.code}</div>
            </div>
          ),
        },
        {
          id: "qtyUnit",
          header: "Cantidad",
          accessorKey: "qtyUnit",
          size: 90,
          cell: (line) => (
            <span className="flex flex-col leading-tight">
              <span className="font-medium tabular-nums">{line.qtyUnit}</span>
              <span className="truncate text-[10px] lowercase text-muted-foreground">{line.unitLabel}</span>
            </span>
          ),
        },
        {
          id: "reason",
          header: "Motivo",
          accessorKey: "reason",
          size: 170,
          cell: (line) => (
            <span className="inline-flex max-w-full items-center rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-sky-700 dark:text-sky-300">
              <span className="truncate">{RETURN_REASON_LABELS[line.reason]}</span>
            </span>
          ),
        },
        {
          id: "batch",
          header: "Lote",
          size: 130,
          enableSorting: false,
          cell: (line) => {
            const source = primarySourceOf(line);
            if (!source?.batchNumber?.trim()) return <span className="text-muted-foreground">—</span>;
            return (
              <span
                className="flex min-w-0 items-center gap-1.5 whitespace-nowrap"
                title={source.dueDate ? `Vence ${formatDay(source.dueDate)}` : undefined}
              >
                {source.batch && (
                  <span
                    title={RETURN_LOT_LABELS[source.batch]}
                    className="rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground"
                  >
                    {source.batch}
                  </span>
                )}
                <span className="truncate font-mono tabular-nums">{source.batchNumber}</span>
              </span>
            );
          },
        },
        {
          id: "photos",
          header: "",
          size: 44,
          enableSorting: false,
          meta: { align: "center" },
          cell: (line) => <PhotoStack photos={line.photos} />,
        },
        {
          id: "importe",
          header: "Importe",
          size: 90,
          meta: { align: "right" },
          cell: (line) => <span className="font-semibold">{amount(lineAmount(line))}</span>,
        },
      ]),
    [],
  );

  if (lines.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Sin productos cargados.</p>;
  }

  return (
    <DataTable
      tableId="return-view-lines"
      columns={columns}
      data={lines}
      getRowId={(line) => line.productId}
      hideToolbar
      bodyMinHeight={0}
    />
  );
}

/** One `label — value` chip, for the compact facts strip. */
function Chip({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

/**
 * A header action that may be blocked, with the reason on hover. Disabled
 * controls emit no pointer events, so the tooltip listens on the wrapper.
 *
 * `render` and not `asChild`: this kit is Base UI, not Radix — same reason
 * `SelectorRol` uses `render` on its own dropdown trigger.
 */
function HeaderAction({ reason, children }: { reason: string | null; children: React.ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} className="[&>*]:pointer-events-none" />}>
        <>{children}</>
      </TooltipTrigger>
      <TooltipContent className="max-w-56">{reason}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Start every product approved in full — the common case is "this claim is
 * fine", so the screen exists for cutting what's wrong, not retyping what's
 * right.
 */
function initialDrafts(lines: ReturnLine[]): Map<string, ItemDraft> {
  return new Map(
    lines.map((line) => [
      line.productId,
      {
        status: line.itemStatus === "REJECTED" ? ("REJECTED" as const) : ("APPROVED" as const),
        approvedMinUnits: line.approvedMinUnits ?? lineMinUnits(line),
        rejectReason: line.rejectReason ?? "",
      },
    ]),
  );
}

/**
 * One devolución: read, and — if it's your turn — decided.
 *
 * A single screen instead of two. The old split (a read-only detail, and a
 * separate `/aprobar` route for the same document) meant every decision was a
 * navigation away from the thing being decided. Whether `canDecide` is true is
 * the only fork this page has: the item grid is either the editable one an
 * approver acts on, or the plain read-only one everyone else sees — same data,
 * same table shape, one fewer screen to maintain.
 */
export function ReturnViewPage() {
  const { id } = useRouteParams();
  const navigate = useNavigate();
  const returnId = Number(id);
  const { data: ret, isLoading } = useReturn(Number.isFinite(returnId) ? returnId : undefined);
  const { data: details } = useOrderClientDetails(ret?.clientId);
  const user = useCurrentUser();
  const approve = useApproveReturn();
  const reject = useRejectReturn();

  const [drafts, setDrafts] = useState<Map<string, ItemDraft>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<"aprobado" | "rechazado" | null>(null);
  const [showMore, setShowMore] = useState(false);

  const canDecideHere = canApproveReturns(user.role) && !!user.employeeCode;
  const deciding = !!ret && canDecideHere && canDecide(ret, user.employeeCode as number);

  // Reload the working answers whenever the return itself changes, or the
  // moment it becomes decidable. Keyed by id so a background refetch never
  // discards a decision in progress.
  useEffect(() => {
    if (ret && deciding) setDrafts(initialDrafts(ret.lines));
  }, [ret?.id, deciding]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    if (!ret) return { claimed: 0, approved: 0, counts: { total: 0, approved: 0, partial: 0, rejected: 0 } };
    let claimed = 0;
    let approved = 0;
    let approvedCount = 0;
    let partial = 0;
    let rejected = 0;
    for (const line of ret.lines) {
      const lineClaimed = lineMinUnits(line);
      claimed += lineClaimed * line.priceUnit;
      const draft = drafts.get(line.productId);
      if (!draft || draft.status === "REJECTED") {
        rejected += 1;
        continue;
      }
      approved += draft.approvedMinUnits * line.priceUnit;
      approvedCount += 1;
      if (draft.approvedMinUnits < lineClaimed) partial += 1;
    }
    return {
      claimed: round2(claimed),
      approved: round2(approved),
      counts: { total: ret.lines.length, approved: approvedCount, partial, rejected },
    };
  }, [ret, drafts]);

  if (isLoading) {
    return (
      <>
        <PageHeader title="Devolución" description="Cargando…" />
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </>
    );
  }

  // Somebody else's note, read by a role that only sees its own, is answered the
  // same way a wrong code is: not "no puede verla" — that would confirm it
  // exists — but the plain not-found screen.
  const outOfReach = !!ret && seesOwnDocumentsOnly(user.role) && ret.sellerCode !== user.sellerCode;

  if (!ret || outOfReach) {
    return (
      <>
        <PageHeader title="Devolución" description="La devolución que buscás no existe.">
          <Button type="button" variant="outline" onClick={() => navigate("/devoluciones")}>
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </PageHeader>
        <EmptyState
          icon={PackageX}
          title="Devolución no encontrada"
          description="Puede que se haya eliminado o que el código no sea correcto."
        />
      </>
    );
  }

  const editBlocked = editBlockedReason(ret);

  /** Why the decision cannot be confirmed yet, or `null`. */
  const confirmBlocked = (): string | null => {
    for (const line of ret.lines) {
      const draft = drafts.get(line.productId);
      if (!draft) return "Falta decidir un producto.";
      const decision: ItemDecisionInput =
        draft.status === "REJECTED"
          ? { productId: line.productId, status: "REJECTED", rejectReason: draft.rejectReason }
          : { productId: line.productId, status: "APPROVED", approvedMinUnits: draft.approvedMinUnits };
      const invalid = itemDecisionBlockedReason(line, decision);
      if (invalid) return invalid;
    }
    return null;
  };
  const blockedConfirm = deciding ? confirmBlocked() : null;

  const patchDraft = (productId: string, patch: Partial<ItemDraft>) =>
    setDrafts((current) => {
      const next = new Map(current);
      const held = next.get(productId);
      if (held) next.set(productId, { ...held, ...patch });
      return next;
    });

  const applyToSelected = (status: "APPROVED" | "REJECTED") => {
    setDrafts((current) => {
      const next = new Map(current);
      for (const productId of selected) {
        const line = ret.lines.find((l) => l.productId === productId);
        const held = next.get(productId);
        if (!line || !held) continue;
        next.set(productId, {
          ...held,
          status,
          approvedMinUnits: status === "APPROVED" ? lineMinUnits(line) : 0,
        });
      }
      return next;
    });
    setSelected(new Set());
  };

  const submitDecision = (comment: string) => {
    if (!user.employeeCode) return;
    const actor = { employeeCode: user.employeeCode, employeeName: user.name };
    const done = { onSuccess: () => setConfirming(null) };

    if (confirming === "rechazado") {
      reject.mutate({ id: ret.id, actor, reason: comment }, done);
      return;
    }
    const itemDecisions: ItemDecisionInput[] = ret.lines.map((line) => {
      const draft = drafts.get(line.productId)!;
      return draft.status === "REJECTED"
        ? { productId: line.productId, status: "REJECTED" as const, rejectReason: draft.rejectReason }
        : { productId: line.productId, status: "APPROVED" as const, approvedMinUnits: draft.approvedMinUnits };
    });
    approve.mutate({ id: ret.id, actor, comment, itemDecisions }, done);
  };

  const level = pendingLevelOf(ret);

  return (
    <>
      <PageHeader
        title={`Devolución ${ret.id}`}
        description={`${ret.clientName} · ${ret.sellerName}`}
      >
        <ReturnStatusBadge status={ret.status} />

        <HeaderAction reason={editBlocked}>
          {editBlocked ? (
            <Button type="button" variant="outline" disabled>
              <Pencil className="h-4 w-4" /> Corregir
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to={`/devoluciones/${ret.id}/editar`}>
                <Pencil className="h-4 w-4" /> Corregir
              </Link>
            </Button>
          )}
        </HeaderAction>

        <Button type="button" variant="outline" onClick={() => navigate("/devoluciones")}>
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
      </PageHeader>

      <div className="space-y-3">
        {/* ---- Franja compacta: lo que hace falta para decidir, nada más ---- */}
        <Card>
          <CardContent className="space-y-2 p-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              <Chip label="Cliente" value={ret.clientName} />
              <Chip label="Vendedor" value={ret.sellerName} />
              <Chip label="Total" value={bs(ret.total)} />
              <Chip label="Repone" value={formatDay(ret.replacementDate)} />
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="ml-auto flex items-center gap-1 text-xs font-medium text-primary"
              >
                {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showMore ? "Ocultar detalle" : "Más detalle"}
              </button>
            </div>

            <p className="text-sm text-muted-foreground">{ret.justification || "Sin justificación."}</p>

            {showMore && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-2 text-xs sm:grid-cols-4">
                <Chip label="Distribuidora" value={ret.distributorName} />
                <Chip
                  label="Tipo de devolución"
                  value={ret.settlement ? RETURN_SETTLEMENT_LABELS[ret.settlement] : "Sin definir"}
                />
                <Chip label="Correcciones" value={ret.editCount === 0 ? "Ninguna" : "1 de 1 usada"} />
                <Chip label="Razón social" value={details?.razonSocial ?? "—"} />
                <Chip label="NIT" value={details?.nit ?? "—"} />
                <Chip label="Titular" value={ret.clientOwnerName} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <ReturnFlow ret={ret} />
          </CardContent>
        </Card>

        {/* ---- Ítems: editable si te toca decidir, de solo lectura si no ---- */}
        <Card className="flex flex-col gap-0 overflow-hidden py-0">
          <div className="flex flex-wrap items-center gap-2 border-b p-2.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <PackageX className="h-4 w-4 text-muted-foreground" />
              {ret.lines.length} {ret.lines.length === 1 ? "producto" : "productos"}
            </h2>
            {deciding && (
              <span className="text-xs text-muted-foreground">
                Podés recortar cantidades y rechazar productos.
              </span>
            )}
            {!deciding && ret.workflow && canDecideHere && (
              <span className="text-xs text-muted-foreground">
                {decisionBlockedReason(ret, user.employeeCode as number)}
              </span>
            )}
            {deciding && (
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selected.size === 0}
                  onClick={() => applyToSelected("APPROVED")}
                >
                  <Check className="h-3.5 w-3.5" /> Aprobar selección
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  disabled={selected.size === 0}
                  onClick={() => applyToSelected("REJECTED")}
                >
                  <X className="h-3.5 w-3.5" /> Rechazar selección
                </Button>
              </div>
            )}
          </div>

          {deciding ? (
            <ItemDecisionTable
              lines={ret.lines}
              drafts={drafts}
              selected={selected}
              expanded={expanded}
              onDraftChange={patchDraft}
              onToggleSelect={(productId) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(productId)) next.delete(productId);
                  else next.add(productId);
                  return next;
                })
              }
              onToggleSelectAll={() =>
                setSelected((current) =>
                  current.size === ret.lines.length ? new Set() : new Set(ret.lines.map((l) => l.productId)),
                )
              }
              onToggleExpand={(productId) =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(productId)) next.delete(productId);
                  else next.add(productId);
                  return next;
                })
              }
            />
          ) : (
            <ReturnLinesTable lines={ret.lines} />
          )}

          {deciding ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t bg-muted/30 px-3 py-2.5">
              <span className="text-xs">
                <span className="text-muted-foreground">Solicitado </span>
                <span className="font-medium tabular-nums">{bs(totals.claimed)}</span>
              </span>
              <span className="text-xs">
                <span className="text-muted-foreground">Aprobado </span>
                <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {bs(totals.approved)}
                </span>
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setConfirming("rechazado")}>
                  <X className="h-4 w-4" /> Rechazar
                </Button>
                <Button
                  disabled={!!blockedConfirm}
                  title={blockedConfirm ?? undefined}
                  onClick={() => setConfirming("aprobado")}
                >
                  <Check className="h-4 w-4" /> Aprobar
                </Button>
              </div>
              {blockedConfirm && (
                <p className="w-full text-xs text-destructive">{blockedConfirm}</p>
              )}
            </div>
          ) : (
            <div className="border-t bg-muted/30 px-2.5 py-2.5 text-xs text-muted-foreground">
              {level ? (
                <>
                  Esperando la firma de <span className="font-medium text-foreground">{level.name}</span>.
                </>
              ) : (
                <>Devolución cerrada.</>
              )}
            </div>
          )}
        </Card>

        {/* ---- Histórico: colapsado por defecto ---- */}
        {ret.workflow && (
          <details className="group rounded-xl border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium">
              Histórico
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t p-3">
              <ReturnTimeline ret={ret} />
            </div>
          </details>
        )}
      </div>

      {confirming && (
        <DecisionImpactDialog
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          ret={ret}
          decision={confirming}
          claimed={totals.claimed}
          approved={totals.approved}
          counts={totals.counts}
          loading={approve.isPending || reject.isPending}
          onConfirm={submitDecision}
        />
      )}
    </>
  );
}
