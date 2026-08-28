// UNA DEVOLUCIÓN: leerla y —si te toca— decidirla.
//
// Una sola pantalla en vez de dos. El detalle de solo lectura y la ruta `/aprobar` del mismo
// documento eran dos pantallas para el mismo papel: cada decisión empezaba navegando afuera de la
// cosa que se estaba decidiendo. `canDecide` es la única bifurcación que tiene esta página.
//
// LA INFO DE ARRIBA VA EN PANELES LADO A LADO (Cliente / Devolución / En curso), no apilados — ver
// `InfoCard`/`InfoField` en `../components/info-grid`. Sin badges ni color: el estado es texto, una
// sola vez. Los campos que el sistema legacy muestra y este mockup no modela (deuda del cliente,
// grupo de cliente, cargo de quien registró, centro de costo por producto) quedan fuera: no hay
// datos reales detrás para mostrarlos.
//
// PESTAÑAS EN VEZ DE TABLA+ACORDEÓN. Productos (donde se decide) e Historial (el trail completo,
// incluidas las devoluciones que cruzan un nivel dos veces porque las revirtieron y se volvieron a
// aprobar — `WorkflowTimeline` ya agrupa esto por ronda) son las dos preguntas que se hacen sobre una
// devolución, y cada una se lee mejor sin competir por el mismo espacio. El panel de decisión
// (Aprobar/Rechazar) queda FUERA de las pestañas: rechazar no depende de qué pestaña esté abierta.
//
// SE FUERON LAS TARJETAS DE «PROGRESO DEL WORKFLOW». Eran una fila de cards —una por nivel— arriba
// de los ítems, y repetían, en media pantalla, lo que la franja "en curso" dice en una línea y el
// histórico cuenta completo. Lo único que no estaba en ningún otro lado era el plazo del nivel
// abierto: eso quedó, como un badge en la franja.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
// `useRouteParams` y no `useParams`: el shell de este mockup renderiza la pantalla a mano, fuera de
// un <Route element>, así que `useParams()` devolvería {} y la página se quedaría sin su id.
import { useRouteParams } from "@/core/routing/active-route";
import { ArrowLeft, Check, PackageX, X } from "lucide-react";
import type { ReturnLine, WorkflowInstanceLevel } from "../../../types";
import {
  CLIENT_TYPE_LABELS,
  RETURN_SETTLEMENT_LABELS,
  RETURN_STATUS_LABELS,
  RETURN_WORKFLOW_STATE_LABELS,
} from "../../../types";
import type { ItemDecisionInput } from "../../../lib/return-workflow";
import {
  canDecide,
  decisionBlockedReason,
  itemDecisionBlockedReason,
  pendingLevelOf,
  workflowStateOf,
} from "../../../lib/return-workflow";
import {
  amountBandLabel,
  ceilingOf,
  hoursToDeadline,
  levelPositionOf,
  progressLevelsOf,
  signaturesMissing,
} from "../../../lib/workflow";
import { lineMinUnits, round2 } from "../../../lib/order-math";
import { useApproveReturn, useReturn, useRejectReturn } from "../../../hooks/use-returns";
import { useOrderClientDetails } from "../../../hooks/use-orders";
import { seesOwnDocumentsOnly, canApproveReturns, useCurrentUser } from "../../../stores/session-store";
import { EmptyState } from "../../../components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bs, formatDay } from "../../../lib/format";
import { ReturnItemsTable, type ItemDraft } from "../components/return-items-table";
import { DecisionImpactDialog } from "../components/decision-impact-dialog";
import { ReturnTimeline } from "../components/return-timeline";
import { InfoCard, InfoField } from "../components/info-grid";

/** El plazo del nivel, en texto llano — sin badge, sin color salvo vencida. */
function plazoTexto(level: WorkflowInstanceLevel): string | null {
  const hours = hoursToDeadline(level);
  if (hours === null) return null;
  const late = hours < 0;
  const abs = Math.abs(hours);
  if (abs < 1) {
    const min = Math.max(1, Math.round(abs * 60));
    return late ? `Vencida hace ${min} min` : `Vence en ${min} min`;
  }
  const h = Math.round(abs);
  return late ? `Vencida hace ${h} h` : `Vence en ${h} h`;
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
  const [confirmando, setConfirmando] = useState<"aprobado" | "rechazado" | null>(null);
  const [tab, setTab] = useState<"productos" | "historial">("productos");

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
  const workflowState = workflowStateOf(ret);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* ── Cabecera de la vista: la misma forma que el resto del mockup — una línea de contexto a la
             izquierda y las acciones a la derecha. El título de la pantalla ya lo pone la top bar. ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Devolución <span className="font-mono font-medium text-foreground">{ret.id}</span> ·{" "}
          {ret.clientName}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => navigate("/devoluciones")}>
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </div>
      </div>

      {/* ── Panel de datos: paneles lado a lado, uno por categoría, en vez de apilados — así el alto
             total es el del panel más alto, no la suma de los tres. ── */}
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
          <InfoField label="Monto Prom. Mensual" value={details && bs(details.ticketPromedio)} />
          <InfoField label="Dirección" value={details?.address} full />
        </InfoCard>

        <InfoCard title="Devolución">
          <InfoField label="Fecha" value={formatDay(ret.createdAt.slice(0, 10))} />
          {ret.originReturnId !== null && (
            <InfoField
              label="Nota Origen #"
              value={
                <button
                  type="button"
                  className="font-mono text-primary underline-offset-2 hover:underline"
                  onClick={() => navigate(`/devoluciones/${ret.originReturnId}`)}
                >
                  {ret.originReturnId}
                </button>
              }
            />
          )}
          <InfoField label="Registrado Por" value={ret.sellerName} />
          <InfoField label="Repone" value={formatDay(ret.replacementDate)} />
          <InfoField label="Total" value={bs(ret.total)} />
          <InfoField label="Aprobado" value={ret.approvedTotal !== null ? bs(ret.approvedTotal) : null} />
          <InfoField
            label="Tipo de devolución"
            value={ret.settlement && RETURN_SETTLEMENT_LABELS[ret.settlement]}
          />
          <InfoField label="Correcciones" value={ret.editCount === 0 ? "Ninguna" : "1 de 1 usada"} />
          <InfoField label="Estado" value={RETURN_STATUS_LABELS[ret.status]} />
          <InfoField
            label="Estado Workflow"
            value={workflowState && RETURN_WORKFLOW_STATE_LABELS[workflowState]}
          />
          <InfoField label="Justificación" value={ret.justification} full />
        </InfoCard>

        {/* ── "En curso": dónde está parada. Es información operativa —cambia con el reloj— y por eso
               es su propio panel y no un dato fijo del documento. ── */}
        {level && posicion && (
          <InfoCard title="En curso">
            <InfoField
              label="Nivel"
              value={
                <>
                  {posicion.position} de {posicion.total} · {level.name}
                </>
              }
            />
            <InfoField label="Banda de monto" value={banda} />
            {level.approvalPolicy !== "ANY" && (
              <InfoField
                label="Firmas"
                value={
                  <>
                    {level.approvalsReceived} de {pedidas}
                    {faltanFirmas > 0 && ` · falta${faltanFirmas === 1 ? "" : "n"} ${faltanFirmas}`}
                  </>
                }
              />
            )}
            <InfoField label="Plazo" value={plazoTexto(level)} />
            <InfoField
              label="Asignados"
              value={
                level.assignees.length > 0
                  ? level.assignees
                      .map((a) => (a.hasActed ? `${a.employeeName} ✓` : a.employeeName))
                      .join(" · ")
                  : null
              }
              full
            />
          </InfoCard>
        )}
      </div>

      {/* ── Productos / Historial. ── */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "productos" | "historial")} className="min-h-0 flex-1">
        <TabsList>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <PackageX className="h-4 w-4 text-muted-foreground" />
              {ret.lines.length} {ret.lines.length === 1 ? "producto" : "productos"}
            </h2>
            {decidiendo ? (
              <span className="text-xs text-muted-foreground">
                Tildá los productos que se aprueban. El resto queda rechazado.
              </span>
            ) : (
              puedeFirmar &&
              ret.workflow && (
                <span className="text-xs text-muted-foreground">
                  {decisionBlockedReason(ret, user.employeeCode as number)}
                </span>
              )
            )}
          </div>

          <ReturnItemsTable
            lines={ret.lines}
            clientId={ret.clientId}
            decidiendo={decidiendo}
            drafts={drafts}
            onDraftChange={patchDraft}
          />
        </TabsContent>

        <TabsContent value="historial">
          {ret.workflow ? (
            <ReturnTimeline ret={ret} />
          ) : (
            <p className="text-xs text-muted-foreground">Todavía no fue enviada a aprobación.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* ── La decisión. Fija fuera de las pestañas: rechazar no depende de estar mirando Productos. ── */}
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
