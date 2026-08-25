// `useState` vuelve con el estado de la decisión, comentado más abajo.
import { useMemo } from "react";
import { useNavigate } from "react-router";
// `useRouteParams` y no `useParams`: el shell de este mockup renderiza la pantalla a mano, fuera de
// un <Route element>, así que `useParams()` devolvería {} y la página se quedaría sin su id.
import { useRouteParams } from "@/core/routing/active-route";
import { ArrowLeft, PackageX, Store } from "lucide-react";
import type { ReturnLine } from "../../../types";
import { RETURN_LOT_LABELS, RETURN_REASON_LABELS, RETURN_SETTLEMENT_LABELS } from "../../../types";
import { primarySourceOf } from "../../../lib/return-workflow";
import { lineAmount } from "../../../lib/order-math";
import { useReturn } from "../../../hooks/use-returns";
import { useOrderClientDetails } from "../../../hooks/use-orders";
import { seesOwnDocumentsOnly, useCurrentUser } from "../../../stores/session-store";
import { PageHeader } from "../../../components/common/page-header";
import { EmptyState } from "../../../components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, defineColumns } from "../../../components/data-table";
/* Comentado a pedido, junto con los tres botones del header:
import { Link } from "react-router";
import { Check, Pencil, X } from "lucide-react";
import { decisionBlockedReason, editBlockedReason } from "../../../services/returns-service";
import { pendingLevelOf } from "../../../lib/return-workflow";
import { useRejectReturn } from "../../../hooks/use-returns";
import { canApproveReturns } from "../../../stores/session-store";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ReturnDecisionDialog } from "../components/return-decision-dialog";
*/
import { amount, bs, formatDateTime, formatDay, formatTime } from "../../../lib/format";
import { PhotoStack } from "../../../components/common/photo-viewer";
import { ReturnStatusBadge } from "../components/return-status-badge";
import { ReturnFlow } from "../components/return-flow";
import { ReturnAmounts } from "../components/return-amounts";
import { ReturnTimeline } from "../components/return-timeline";

/** Label over value — the read-only twin of the form's field. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="flex h-5 items-center text-sm font-medium">{label}</p>
      <div className="truncate text-sm text-muted-foreground">{value || "—"}</div>
    </div>
  );
}

/** The billing box that closes the client card, mirroring the form's. */
function BillingFact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-xs font-medium">{value ?? "—"}</p>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Store; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <Icon className="h-4 w-4 text-muted-foreground" />
      {children}
    </h2>
  );
}

/* Comentado a pedido: su único uso eran los tres botones del header.
 *
 * A header action that may be blocked, with the reason on hover. Disabled
 * controls emit no pointer events, so the tooltip listens on the wrapper.
 *
function HeaderAction({ reason, children }: { reason: string | null; children: React.ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="[&>*]:pointer-events-none">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-56">{reason}</TooltipContent>
    </Tooltip>
  );
}
*/

/**
 * The returned goods, read-only, in the same shape as the editor the seller
 * filled in.
 *
 * One row per product, and the row is the whole claim. The observation and the
 * evidence used to live in a `renderSubRow` under every line, which doubled the
 * height of the list — on a return of eight products the approver was scrolling
 * before he had seen half of it, and a detail that has to be scrolled to be read
 * is a detail whose total nobody checks. They are columns now.
 *
 * What is *not* here is as deliberate as what is. No unit price: the tariff is
 * the sale's and the line's amount is what anyone reads. No case quantity:
 * returns are counted in minimum units, which is what the eligibility rule
 * speaks in. No ICE: a return gives back what was charged, and the tax is
 * settled on the note, not argued line by line by the person approving it.
 */
function ReturnLinesTable({ lines }: { lines: ReturnLine[] }) {
  const columns = useMemo(
    () =>
      defineColumns<ReturnLine>([
        {
          id: "code",
          header: "Cod",
          accessorKey: "code",
          size: 58,
          cell: (line) => (
            <span className="font-mono tabular-nums text-muted-foreground">{line.code}</span>
          ),
        },
        {
          id: "productName",
          header: "Producto",
          accessorKey: "productName",
          size: 200,
          cell: (line) => <span className="font-medium leading-tight">{line.productName}</span>,
        },
        {
          id: "company",
          header: "Empresa",
          accessorKey: "company",
          size: 108,
          cell: (line) => <span className="text-muted-foreground">{line.company}</span>,
        },
        {
          // Stacked: the unit qualifies the number rather than sitting beside it, and the digits
          // keep their own line where they align with the rows above.
          id: "qtyUnit",
          header: "Cantidad",
          accessorKey: "qtyUnit",
          size: 78,
          cell: (line) => (
            <span className="flex flex-col leading-tight">
              <span className="font-medium tabular-nums">{line.qtyUnit}</span>
              <span className="truncate text-[10px] lowercase text-muted-foreground">
                {line.unitLabel}
              </span>
            </span>
          ),
        },
        {
          id: "reason",
          header: "Motivo",
          accessorKey: "reason",
          size: 140,
          // The classification the business counts these by — the same tint the form gives it, so
          // the two screens read as one document.
          cell: (line) => (
            <span className="inline-flex max-w-full items-center rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium leading-tight text-sky-700 dark:text-sky-300">
              <span className="truncate">{RETURN_REASON_LABELS[line.reason]}</span>
            </span>
          ),
        },
        {
          // Origin and number in one cell: apart they were two columns saying one thing, and
          // "SC" alone answers nothing anybody asks of this table.
          id: "batch",
          header: "Lote",
          size: 128,
          enableSorting: false,
          cell: (line) => {
            const source = primarySourceOf(line);
            // Same rule as the editor's own cell: the printed number is what makes a
            // lot a lot. `batch` is the plant and always has a value, so a line whose
            // reason carries no lot showed "SC · —" — a lot from Santa Cruz with a
            // number somebody forgot, which is not what happened.
            if (!source?.batchNumber?.trim()) {
              return <span className="text-muted-foreground">—</span>;
            }
            return (
              <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
                {source?.batch && (
                  <span
                    title={RETURN_LOT_LABELS[source.batch]}
                    className="rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground"
                  >
                    {source.batch}
                  </span>
                )}
                <span className="truncate font-mono tabular-nums">{source?.batchNumber || "—"}</span>
                {line.sources.length > 1 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{line.sources.length - 1}
                  </span>
                )}
              </span>
            );
          },
        },
        {
          id: "dueDate",
          header: "Vencimiento",
          size: 104,
          enableSorting: false,
          cell: (line) => (
            <span className="whitespace-nowrap tabular-nums text-muted-foreground">
              {primarySourceOf(line)?.dueDate ? formatDay(primarySourceOf(line)!.dueDate!) : "—"}
            </span>
          ),
        },
        {
          // The defect in the seller's own words — the sentence the approver is here to read.
          id: "notes",
          header: "Observación",
          accessorKey: "notes",
          size: 190,
          cell: (line) => (
            <span className="block truncate text-muted-foreground" title={line.notes}>
              {line.notes || "—"}
            </span>
          ),
        },
        {
          id: "photos",
          header: "Evidencia",
          size: 96,
          enableSorting: false,
          // The stack opens the same carousel the seller loaded them with, and it matters most
          // here: the number that decides the return is a batch code stamped on a bottle,
          // photographed at arm's length. Judging it means zooming in.
          cell: (line) => <PhotoStack photos={line.photos} />,
        },
        {
          id: "importe",
          header: "Importe",
          size: 84,
          meta: { align: "right" },
          cell: (line) => <span className="font-semibold">{amount(lineAmount(line))}</span>,
        },
      ]),
    [],
  );

  if (lines.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Esta devolución no tiene productos cargados.
      </p>
    );
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

/**
 * One return, read — and decided.
 *
 * Deliberately the same shape as the form that produced it: two cards across
 * the top, the client on one third and the return on two, the detail below
 * taking the rest and closing on a band of totals. A user who just filled that
 * form finds every value where they left it.
 *
 * What it adds is the part a form has no reason to show: the approval flow, and
 * the two buttons that move it. Those buttons are only ever enabled for the
 * role sitting at the desk the return is on — and the reason they are not is on
 * the button itself, taken from the same service function that would refuse the
 * call.
 */
export function ReturnViewPage() {
  const { id } = useRouteParams();
  const navigate = useNavigate();
  const returnId = Number(id);
  const { data: ret, isLoading } = useReturn(Number.isFinite(returnId) ? returnId : undefined);
  const { data: details } = useOrderClientDetails(ret?.clientId);
  const user = useCurrentUser();
  /* Comentado a pedido, junto con el botón "Rechazar":
  const reject = useRejectReturn();
  const [decision, setDecision] = useState<"rechazado" | null>(null);
  */

  if (isLoading) {
    return (
      <>
        <PageHeader title="Devolución" description="Cargando el detalle…" />
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-52 w-full rounded-xl" />
            <Skeleton className="col-span-2 h-52 w-full rounded-xl" />
          </div>
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

  /* Comentado a pedido, junto con los botones que alimentaba.

  const editBlocked = editBlockedReason(ret);
  // Shown or not shown, never shown-and-dead: a role that signs nothing gets no
  // approval buttons on the header at all.
  const canDecideHere = canApproveReturns(user.role) && !!user.employeeCode;
  const decisionBlocked = user.employeeCode
    ? decisionBlockedReason(ret, user.employeeCode)
    : "Tu usuario no firma aprobaciones.";
  const level = pendingLevelOf(ret);
  */

  return (
    <>
      <PageHeader
        title={`Devolución ${ret.id}`}
        description={`Registrada el ${formatDateTime(ret.createdAt)} a las ${formatTime(ret.createdAt)} por ${ret.sellerName}.`}
      >
        <ReturnStatusBadge status={ret.status} />

        {/* Comentado a pedido: "Revisar y decidir", "Rechazar" y "Corregir"
            salieron del header para todos los roles. Se restaura quitando estos
            comentarios y los del bloque de imports y de `HeaderAction` arriba.

        {canDecideHere && (
          <>
            <HeaderAction reason={decisionBlocked}>
              <Button
                type="button"
                variant="outline"
                disabled={!!decisionBlocked}
                className="text-emerald-700 hover:text-emerald-700 dark:text-emerald-400"
                // Every level decides quantities now, so an approval always carries
                // them: there is nothing to confirm from a dialog here, and sending
                // the approver straight to the grid beats a call the service would
                // refuse for having items still pending.
                onClick={() => navigate(`/devoluciones/${ret.id}/aprobar`)}
              >
                <Check className="h-4 w-4" /> Revisar y decidir
              </Button>
            </HeaderAction>
            <HeaderAction reason={decisionBlocked}>
              <Button
                type="button"
                variant="outline"
                disabled={!!decisionBlocked}
                className="text-destructive hover:text-destructive"
                onClick={() => setDecision("rechazado")}
              >
                <X className="h-4 w-4" /> Rechazar
              </Button>
            </HeaderAction>
          </>
        )}

        // A blocked action is a disabled button, not a disabled link: `disabled`
        // means nothing on an anchor, and a link that still navigates is worse
        // than no button at all.
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
        */}

        <Button type="button" variant="outline" onClick={() => navigate("/devoluciones")}>
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
      </PageHeader>

      <div className="space-y-3">
        {/* ---- La misma fila de tarjetas que el formulario ---- */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="flex min-w-0 flex-col">
            <CardContent className="flex flex-1 flex-col gap-2 p-3">
              <SectionTitle icon={Store}>Cliente</SectionTitle>
              <Fact label="Cliente" value={ret.clientName} />
              <Fact label="Titular" value={ret.clientOwnerName} />
              <Fact label="Vendedor" value={`${ret.sellerName} · código ${ret.sellerCode}`} />

              <div className="mt-auto space-y-1.5">
                <p className="flex h-5 items-center text-sm font-medium">Datos de facturación</p>
                <div className="grid h-16 grid-cols-3 content-center gap-x-3 rounded-lg border bg-muted/40 px-2.5">
                  <BillingFact label="Razón social" value={details?.razonSocial ?? null} />
                  <BillingFact label="NIT" value={details?.nit ?? null} />
                  <BillingFact label="Titular" value={ret.clientOwnerName} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-2 flex min-w-0 flex-col">
            <CardContent className="flex flex-1 flex-col gap-2 p-3">
              <SectionTitle icon={PackageX}>Devolución</SectionTitle>

              <div className="grid grid-cols-3 gap-2">
                <Fact label="Distribuidora" value={ret.distributorName} />
                <Fact label="Fecha probable de reposición" value={formatDay(ret.replacementDate)} />
                {/* Blank until the last desk signs: how the claim is liquidated
                    is a decision, and showing a guess for it would be worse than
                    showing nothing. */}
                <Fact
                  label="Tipo de devolución"
                  value={ret.settlement ? RETURN_SETTLEMENT_LABELS[ret.settlement] : "Sin definir"}
                />
                <Fact label="Productos" value={`${ret.lines.length}`} />
                <Fact label="Total a devolver" value={bs(ret.total)} />
                <Fact
                  label="Correcciones"
                  value={ret.editCount === 0 ? "Sin correcciones" : "1 de 1 usada"}
                />
              </div>

              <div className="mt-auto space-y-1.5">
                <p className="flex h-5 items-center text-sm font-medium">Justificación</p>
                <p className="h-16 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                  {ret.justification || "Sin justificación."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ---- El flujo, antes del detalle ----
             Above the products on purpose: whoever opens this page opens it to
             answer "¿en qué quedó?", and making them scroll past twenty lines
             to find out is answering the wrong question first. */}
        <Card>
          <CardContent className="p-3">
            <ReturnFlow ret={ret} />
          </CardContent>
        </Card>

        {/* ---- El detalle ---- */}
        {/* `gap-0 py-0`: header bar, lines table and totals band are all
            full-bleed, so the primitive's `py-4`/`gap-4` opened a strip above
            the header and a seam between every band. */}
        <Card className="flex flex-col gap-0 overflow-hidden py-0">
          <div className="flex shrink-0 items-center gap-3 border-b p-2.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <PackageX className="h-4 w-4 text-muted-foreground" />
              Detalle de la devolución
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {ret.lines.length} {ret.lines.length === 1 ? "producto" : "productos"}
            </span>
          </div>

          <ReturnLinesTable lines={ret.lines} />

          {/* One band, one line. The subtotal and the ICE used to sit above this
              on a row of their own: the ICE because a return gives back what was
              charged and the tax is settled on the note rather than argued here,
              and the subtotal because without the ICE beside it it was just the
              claim again — which the card above already calls "Total a
              devolver". What the foot of the detail owes the reader is what was
              granted, and that is what is left. */}
          <div className="border-t bg-muted/30 px-2.5 py-2.5">
            <ReturnAmounts ret={ret} />
          </div>
        </Card>

        {/* ---- El histórico, al final ----
             Last on purpose: it answers "cómo llegamos acá", which is the
             question people ask after the ones above, not before. */}
        {ret.workflow && (
          <Card>
            <CardContent className="p-3">
              <ReturnTimeline ret={ret} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Comentado a pedido, junto con el botón "Rechazar" que lo abría.

          Only mounted while a rejection is being written: the level and the
          approver identity are guaranteed non-null then, by the same rule that
          enables the button. Refusing the whole claim needs no per-item work,
          which is why this one path stays here instead of on the grid.

      {decision && level && user.employeeCode && (
        <ReturnDecisionDialog
          open
          onOpenChange={(open) => !open && setDecision(null)}
          decision={decision}
          levelName={level.name}
          nextLevelName={null}
          // Only the supervisor hands a devolución back, and only while the one
          // correction the seller is allowed is still unspent. Above that level
          // a refusal closes the document.
          rejectSendsBack={level.order === 1 && ret.editCount < 1}
          loading={reject.isPending}
          onConfirm={(comment) => {
            const actor = { employeeCode: user.employeeCode as number, employeeName: user.name };
            reject.mutate(
              { id: ret.id, actor, reason: comment },
              { onSuccess: () => setDecision(null) },
            );
          }}
        />
      )}
      */}
    </>
  );
}
