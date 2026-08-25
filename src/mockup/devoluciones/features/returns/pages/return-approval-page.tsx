import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
// `useRouteParams` y no `useParams`: el shell de este mockup renderiza la pantalla a mano, fuera de
// un <Route element>, así que `useParams()` devolvería {} y la página se quedaría sin su id.
import { useRouteParams } from "@/core/routing/active-route";
import { ArrowLeft, Check, Coins, PackageX, X } from "lucide-react";
import type { Return } from "../../../types";
import type { ItemDecisionInput } from "../../../lib/return-workflow";
import {
  decisionBlockedReason,
  itemDecisionBlockedReason,
  pendingLevelOf,
} from "../../../lib/return-workflow";
import { lineMinUnits, round2 } from "../../../lib/order-math";
import { useApproveReturn, useRejectReturn, useReturn } from "../../../hooks/use-returns";
import { canApproveReturns, useCurrentUser } from "../../../stores/session-store";
import { PageHeader } from "../../../components/common/page-header";
import { EmptyState } from "../../../components/common/empty-state";
import { WorkflowProgress } from "../../../components/common/workflow-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { bs } from "../../../lib/format";
import { ceilingOf, progressLevelsOf } from "../../../lib/workflow";
import { ItemDecisionTable, type ItemDraft } from "../components/item-decision-table";
import { DecisionImpactDialog } from "../components/decision-impact-dialog";

/**
 * Start every product approved in full.
 *
 * The common case by a wide margin is "this claim is fine" — the screen exists
 * so an approver can *cut* what is wrong, not so they can re-type what is right.
 * Starting blank would tax every legitimate return to serve the disputed ones.
 */
function initialDrafts(ret: Return): Map<string, ItemDraft> {
  return new Map(
    ret.lines.map((line) => [
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
 * Where an approver actually decides.
 *
 * One screen, at every level of the ladder: each desk can cut quantities and
 * refuse products, so each one gets the same editable grid. That is not a
 * convenience — it is the mechanism. What a desk leaves standing is the figure
 * the next rung is measured against, and a level that could only answer yes or
 * no would have no way to end the flow early.
 */
export function ReturnApprovalPage() {
  const { id } = useRouteParams();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const numericId = id ? Number(id) : undefined;

  const { data: ret, isLoading } = useReturn(numericId);
  const approve = useApproveReturn();
  const reject = useRejectReturn();

  const [drafts, setDrafts] = useState<Map<string, ItemDraft>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<"aprobado" | "rechazado" | null>(null);

  // Reload the working answers whenever the return itself changes. Keyed by id
  // so a background refetch never discards a decision in progress.
  useEffect(() => {
    if (ret) setDrafts(initialDrafts(ret));
  }, [ret?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <PageHeader title="Revisar devolución" description="Cargando…" />
        <Skeleton className="h-96 w-full" />
      </>
    );
  }

  if (!ret) {
    return (
      <>
        <PageHeader title="Revisar devolución" description="No encontrada." />
        <EmptyState
          icon={PackageX}
          title="Devolución no encontrada"
          description="Puede que se haya eliminado o que el código no sea correcto."
          action={
            <Button variant="outline" asChild>
              <Link to="/devoluciones/aprobaciones">Volver a mis aprobaciones</Link>
            </Button>
          }
        />
      </>
    );
  }

  // A role that never signs does not get a "no podés" screen for a desk it was
  // never sent to — it gets sent back to its own list.
  if (!canApproveReturns(user.role) || !user.employeeCode) {
    return <Navigate to={`/devoluciones/${ret.id}`} replace />;
  }

  const blocked = decisionBlockedReason(ret, user.employeeCode);

  if (blocked) {
    return (
      <>
        <PageHeader title={`Devolución ${ret.id}`} description="No podés decidir sobre esta devolución." />
        <EmptyState
          icon={PackageX}
          title="Sin acción pendiente"
          description={blocked}
          action={
            <Button variant="outline" asChild>
              <Link to={`/devoluciones/${ret.id}`}>Ver el detalle</Link>
            </Button>
          }
        />
      </>
    );
  }

  const level = pendingLevelOf(ret);
  /** Where this desk stops deciding — the next level's threshold, or nowhere. */
  const ceiling =
    ret.workflow && level ? ceilingOf(progressLevelsOf(ret.workflow), level.order) : null;

  /** Why the decision cannot be confirmed yet, or `null`. */
  const confirmBlocked = (): string | null => {
    for (const line of ret.lines) {
      const draft = drafts.get(line.productId);
      if (!draft) return "Falta decidir un producto.";
      const decision: ItemDecisionInput =
        draft.status === "REJECTED"
          ? { productId: line.productId, status: "REJECTED", rejectReason: draft.rejectReason }
          : {
              productId: line.productId,
              status: "APPROVED",
              approvedMinUnits: draft.approvedMinUnits,
            };
      const invalid = itemDecisionBlockedReason(line, decision);
      if (invalid) return invalid;
    }
    return null;
  };

  const blockedConfirm = confirmBlocked();

  const patchDraft = (productId: string, patch: Partial<ItemDraft>) =>
    setDrafts((current) => {
      const next = new Map(current);
      const held = next.get(productId);
      if (held) next.set(productId, { ...held, ...patch });
      return next;
    });

  /** Apply one answer to every selected row — the reason bulk selection exists. */
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

  const submit = (comment: string) => {
    if (!user.employeeCode) return;
    const actor = { employeeCode: user.employeeCode, employeeName: user.name };
    const done = {
      onSuccess: () => {
        setConfirming(null);
        navigate(`/devoluciones/${ret.id}`);
      },
    };

    if (confirming === "rechazado") {
      reject.mutate({ id: ret.id, actor, reason: comment }, done);
      return;
    }

    const itemDecisions: ItemDecisionInput[] = ret.lines.map((line) => {
      const draft = drafts.get(line.productId)!;
      return draft.status === "REJECTED"
        ? { productId: line.productId, status: "REJECTED" as const, rejectReason: draft.rejectReason }
        : {
            productId: line.productId,
            status: "APPROVED" as const,
            approvedMinUnits: draft.approvedMinUnits,
          };
    });

    approve.mutate({ id: ret.id, actor, comment, itemDecisions }, done);
  };

  return (
    <>
      <PageHeader
        title={`Devolución ${ret.id}`}
        description={`${ret.clientName} · ${level?.name ?? ""}`}
      >
        <Button variant="outline" asChild>
          <Link to={`/devoluciones/${ret.id}`}>
            <ArrowLeft className="h-4 w-4" /> Detalle
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-3">
        <Card>
          <CardContent className="space-y-2 p-3">
            {ret.workflow && <WorkflowProgress instance={ret.workflow} />}
          </CardContent>
        </Card>

        {/* `gap-0 py-0`: four stacked full-bleed children — the tinted header,
            the bulk-action toolbar, the table and the totals band — so the
            primitive's padding showed above the tint and its gap between each. */}
        <Card className="gap-0 overflow-hidden py-0">
          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Coins className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              Decisión por ítem
            </h2>
            <span className="text-xs text-muted-foreground">
              {/* The band is the whole point of this screen: it tells the approver
                  in advance what a recorte would do to the flow. */}
              {ceiling === null
                ? "Podés recortar cantidades y rechazar productos. Es el último nivel del flujo: acá queda definido el monto final."
                : `Podés recortar cantidades y rechazar productos. Si el aprobado queda en ${bs(ceiling)} o menos, la devolución cierra en tu nivel.`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {selected.size > 0
                ? `${selected.size} seleccionado${selected.size === 1 ? "" : "s"}`
                : "Seleccioná filas para decidir en bloque"}
            </span>
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
          </div>

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
                current.size === ret.lines.length
                  ? new Set()
                  : new Set(ret.lines.map((l) => l.productId)),
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
            <span className="text-xs">
              <span className="text-muted-foreground">Rechazado </span>
              <span className="font-medium tabular-nums text-destructive">
                {bs(round2(totals.claimed - totals.approved))}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {totals.counts.approved} de {totals.counts.total} ítems
              {totals.counts.partial > 0 && ` · ${totals.counts.partial} parcial${totals.counts.partial === 1 ? "" : "es"}`}
              {totals.counts.rejected > 0 && ` · ${totals.counts.rejected} rechazado${totals.counts.rejected === 1 ? "" : "s"}`}
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
          </div>

          {blockedConfirm && (
            <p className="border-t bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {blockedConfirm}
            </p>
          )}
        </Card>
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
          onConfirm={submit}
        />
      )}
    </>
  );
}
