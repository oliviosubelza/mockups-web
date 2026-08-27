// UNA DEVOLUCIÓN: leerla y —si te toca— decidirla.
//
// Una sola pantalla en vez de dos. El detalle de solo lectura y la ruta `/aprobar` del mismo
// documento eran dos pantallas para el mismo papel: cada decisión empezaba navegando afuera de la
// cosa que se estaba decidiendo. `canDecide` es la única bifurcación que tiene esta página.
//
// SE FUERON LAS TARJETAS DE «PROGRESO DEL WORKFLOW». Eran una fila de cards —una por nivel— arriba
// de los ítems, y repetían, en media pantalla, lo que la franja de datos dice en una línea y el
// histórico cuenta completo. Lo único que no estaba en ningún otro lado era el plazo del nivel
// abierto: eso quedó, como un badge en la franja.
//
// LO QUE MUESTRA, EN EL ORDEN EN QUE SE PREGUNTA:
//   1. Quién y cuánto — la franja de datos, con el nivel abierto y su plazo.
//   2. Qué volvió — la tabla de ítems, que es donde se decide.
//   3. Qué pasó hasta acá — el histórico, cerrado, porque es la pregunta que se hace después.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
// `useRouteParams` y no `useParams`: el shell de este mockup renderiza la pantalla a mano, fuera de
// un <Route element>, así que `useParams()` devolvería {} y la página se quedaría sin su id.
import { useRouteParams } from "@/core/routing/active-route";
import { ArrowLeft, Check, ChevronDown, Coins, PackageX, X } from "lucide-react";
import type { ReturnLine } from "../../../types";
import { RETURN_SETTLEMENT_LABELS } from "../../../types";
import type { ItemDecisionInput } from "../../../lib/return-workflow";
import {
  canDecide,
  decisionBlockedReason,
  itemDecisionBlockedReason,
  pendingLevelOf,
} from "../../../lib/return-workflow";
import {
  amountBandLabel,
  ceilingOf,
  levelPositionOf,
  progressLevelsOf,
  signaturesMissing,
} from "../../../lib/workflow";
import { lineMinUnits, round2 } from "../../../lib/order-math";
import { useApproveReturn, useReturn, useRejectReturn } from "../../../hooks/use-returns";
import { useOrderClientDetails } from "../../../hooks/use-orders";
import { seesOwnDocumentsOnly, canApproveReturns, useCurrentUser } from "../../../stores/session-store";
import { EmptyState } from "../../../components/common/empty-state";
import { SlaBadge } from "../../../components/common/sla-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { bs, formatDay } from "../../../lib/format";
import { ReturnStatusBadge } from "../components/return-status-badge";
import { ReturnItemsTable, type ItemDraft } from "../components/return-items-table";
import { DecisionImpactDialog } from "../components/decision-impact-dialog";
import { ReturnTimeline } from "../components/return-timeline";

/** Un par `etiqueta — valor` de la franja de datos. */
function Dato({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}

/**
 * Toda fila arranca aprobada por completo: el caso común es "este reclamo está bien", así que la
 * pantalla existe para RECORTAR lo que está mal, no para volver a tipear lo que está bien.
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
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState<"aprobado" | "rechazado" | null>(null);
  const [historicoAbierto, setHistoricoAbierto] = useState(false);

  const puedeFirmar = canApproveReturns(user.role) && !!user.employeeCode;
  const decidiendo = !!ret && puedeFirmar && canDecide(ret, user.employeeCode as number);

  // Se recargan las respuestas en curso cuando cambia la devolución o cuando pasa a ser decidible.
  // Va por id para que un refetch en segundo plano no descarte una decisión a medio escribir.
  useEffect(() => {
    if (ret && decidiendo) setDrafts(initialDrafts(ret.lines));
  }, [ret?.id, decidiendo]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // La devolución de otro, leída por un rol que solo ve las suyas, se contesta igual que un código
  // equivocado: no con "no puede verla" —eso confirmaría que existe— sino con el no-encontrada.
  const fueraDeAlcance = !!ret && seesOwnDocumentsOnly(user.role) && ret.sellerCode !== user.sellerCode;

  if (!ret || fueraDeAlcance) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">La devolución que buscás no existe.</span>
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

  /** Por qué la decisión todavía no se puede confirmar, o `null`. */
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
  const bloqueoConfirmar = decidiendo ? confirmBlocked() : null;

  const patchDraft = (productId: string, patch: Partial<ItemDraft>) =>
    setDrafts((current) => {
      const next = new Map(current);
      const held = next.get(productId);
      if (held) next.set(productId, { ...held, ...patch });
      return next;
    });

  const aplicarASeleccion = (status: "APPROVED" | "REJECTED") => {
    setDrafts((current) => {
      const next = new Map(current);
      for (const productId of seleccionados) {
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
  };

  const enviarDecision = (comment: string) => {
    if (!user.employeeCode) return;
    const actor = { employeeCode: user.employeeCode, employeeName: user.name };
    const done = { onSuccess: () => setConfirmando(null) };

    if (confirmando === "rechazado") {
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
  const posicion = ret.workflow ? levelPositionOf(ret.workflow) : null;
  const banda =
    ret.workflow && level
      ? amountBandLabel(level.activationMinAmount, ceilingOf(progressLevelsOf(ret.workflow), level.order))
      : null;
  const faltanFirmas = level ? signaturesMissing(level) : 0;
  const pedidas = level
    ? level.approvalPolicy === "ALL"
      ? level.assignees.length
      : level.requiredApprovals
    : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* ── Cabecera de la vista: la misma forma que el resto del mockup — una línea de contexto a la
             izquierda y las acciones a la derecha. El título de la pantalla ya lo pone la top bar. ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Devolución <span className="font-mono font-medium text-foreground">{ret.id}</span> ·{" "}
          {ret.clientName}
        </span>
        <ReturnStatusBadge status={ret.status} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => navigate("/devoluciones")}>
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </div>
      </div>

      {/* ── Franja de datos: lo que hace falta para decidir, y nada más. ── */}
      <Card>
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <Dato label="Cliente" value={ret.clientName} />
            <Dato label="Vendedor" value={ret.sellerName} />
            <Dato label="Distribuidora" value={ret.distributorName} />
            <Dato label="Total" value={bs(ret.total)} />
            {ret.approvedTotal !== null && (
              <Dato
                label="Aprobado"
                value={
                  <span className="text-emerald-700 dark:text-emerald-400">{bs(ret.approvedTotal)}</span>
                }
              />
            )}
            <Dato label="Repone" value={formatDay(ret.replacementDate)} />
          </div>

          <Separator />

          {/* Dónde está parada, en una línea: es lo que las tarjetas de progreso decían en media
              pantalla. Nivel, banda de monto, firmas y plazo — la escalera completa está en el
              histórico, que es donde se pregunta por ella. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {level && posicion ? (
              <>
                <Dato
                  label="Nivel"
                  value={
                    <>
                      <span className="tabular-nums">
                        {posicion.position} de {posicion.total}
                      </span>{" "}
                      · {level.name}
                    </>
                  }
                />
                {banda && (
                  <span className="inline-flex items-center gap-1 text-xs tabular-nums text-violet-600 dark:text-violet-400">
                    <Coins className="h-3 w-3" /> {banda}
                  </span>
                )}
                {level.approvalPolicy !== "ANY" && (
                  <Dato
                    label="Firmas"
                    value={
                      <span className="tabular-nums">
                        {level.approvalsReceived} de {pedidas}
                        {faltanFirmas > 0 && ` · falta${faltanFirmas === 1 ? "" : "n"} ${faltanFirmas}`}
                      </span>
                    }
                  />
                )}
                <SlaBadge level={level} />
                {level.assignees.length > 0 && (
                  <span className="truncate text-xs text-muted-foreground">
                    {level.assignees
                      .map((a) => (a.hasActed ? `${a.employeeName} ✓` : a.employeeName))
                      .join(" · ")}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {ret.workflow ? "Devolución cerrada: ya no espera firmas." : "Todavía no fue enviada a aprobación."}
              </span>
            )}
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <Dato
              label="Tipo"
              value={ret.settlement ? RETURN_SETTLEMENT_LABELS[ret.settlement] : "Sin definir"}
            />
            <Dato label="Correcciones" value={ret.editCount === 0 ? "Ninguna" : "1 de 1 usada"} />
            <Dato label="Razón social" value={details?.razonSocial ?? "—"} />
            <Dato label="NIT" value={details?.nit ?? "—"} />
            <Dato label="Titular" value={ret.clientOwnerName} />
          </div>

          <p className="text-sm text-muted-foreground">{ret.justification || "Sin justificación."}</p>
        </CardContent>
      </Card>

      {/* ── Ítems: la misma tabla, con o sin las columnas que se escriben. ── */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <PackageX className="h-4 w-4 text-muted-foreground" />
          {ret.lines.length} {ret.lines.length === 1 ? "producto" : "productos"}
        </h2>
        {decidiendo ? (
          <span className="text-xs text-muted-foreground">
            Podés recortar cantidades y rechazar productos. Escribir 0 rechaza la línea.
          </span>
        ) : (
          puedeFirmar &&
          ret.workflow && (
            <span className="text-xs text-muted-foreground">
              {decisionBlockedReason(ret, user.employeeCode as number)}
            </span>
          )
        )}
        {decidiendo && (
          <div className="ml-auto flex shrink-0 flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={seleccionados.size === 0}
              onClick={() => aplicarASeleccion("APPROVED")}
            >
              <Check className="h-3.5 w-3.5" /> Aprobar selección
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              disabled={seleccionados.size === 0}
              onClick={() => aplicarASeleccion("REJECTED")}
            >
              <X className="h-3.5 w-3.5" /> Rechazar selección
            </Button>
          </div>
        )}
      </div>

      <ReturnItemsTable
        lines={ret.lines}
        decidiendo={decidiendo}
        drafts={drafts}
        seleccionados={seleccionados}
        onDraftChange={patchDraft}
        onSelectionChange={setSeleccionados}
      />

      {/* ── La decisión. Va abajo de los ítems porque es lo que se hace DESPUÉS de leerlos. ── */}
      {decidiendo && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3">
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
              <Button variant="outline" onClick={() => setConfirmando("rechazado")}>
                <X className="h-4 w-4" /> Rechazar
              </Button>
              <Button
                disabled={!!bloqueoConfirmar}
                title={bloqueoConfirmar ?? undefined}
                onClick={() => setConfirmando("aprobado")}
              >
                <Check className="h-4 w-4" /> Aprobar
              </Button>
            </div>
            {bloqueoConfirmar && <p className="w-full text-xs text-destructive">{bloqueoConfirmar}</p>}
          </CardContent>
        </Card>
      )}

      {/* ── Histórico: el trail de `RefundWorkflowAction` con las decisiones por ítem colgadas.
             Cerrado por defecto: es la pregunta que se hace después de decidir, no antes. ── */}
      {ret.workflow && (
        <Card className="py-0">
          <button
            type="button"
            onClick={() => setHistoricoAbierto((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between px-3 py-2.5 text-sm font-medium"
          >
            Histórico
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                historicoAbierto ? "rotate-180" : ""
              }`}
            />
          </button>
          {historicoAbierto && (
            <div className="border-t p-3">
              <ReturnTimeline ret={ret} />
            </div>
          )}
        </Card>
      )}

      {confirmando && (
        <DecisionImpactDialog
          open
          onOpenChange={(open) => !open && setConfirmando(null)}
          ret={ret}
          decision={confirmando}
          claimed={totals.claimed}
          approved={totals.approved}
          counts={totals.counts}
          loading={approve.isPending || reject.isPending}
          onConfirm={enviarDecision}
        />
      )}
    </div>
  );
}
