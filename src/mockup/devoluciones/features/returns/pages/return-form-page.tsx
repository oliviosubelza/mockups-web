import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Navigate, useNavigate } from "react-router";
// `useRouteParams` y no `useParams`: el shell de este mockup renderiza la pantalla a mano, fuera de
// un <Route element>, así que `useParams()` devolvería {} y la página se quedaría sin su id.
import { useRouteParams } from "@/core/routing/active-route";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, PackageX, Store } from "lucide-react";
import { toast } from "sonner";
import type { ReturnLine } from "../../../types";
import { CLIENT_TYPE_LABELS } from "../../../types";
import { getChannel } from "../../../data/channels";
import { dateKeyOffset } from "../../../lib/frequency";
import { useClients } from "../../../hooks/use-clients";
import { useOrderClientDetails } from "../../../hooks/use-orders";
import { useCreateReturn, useReturn, useUpdateReturn } from "../../../hooks/use-returns";
import { editBlockedReason } from "../../../services/returns-service";
import { seesOwnDocumentsOnly, useCurrentUser } from "../../../stores/session-store";
import { PageHeader } from "../../../components/common/page-header";
import { EmptyState } from "../../../components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "../../../components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, numId } from "../../../lib/utils";
import { formatDay } from "../../../lib/format";
import { returnSchema, type ReturnFormValues } from "../return-schema";
import { ReturnCartPanel } from "../components/return-cart-panel";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

/**
 * A read-only value, shaped exactly like the controls beside it.
 *
 * Everything rendered through this is registration data: it belongs to the
 * client or to the session, the return only quotes it, and no screen in this app
 * gets to edit it. It borrows the control's silhouette — a `Label` over an `h-9`
 * box — for one structural reason: that is what lets a read-only value occupy a
 * row of the same height as an input, which is what makes the two cards of this
 * form fill to the same height without anything being pushed around.
 *
 * Muted rather than bordered-and-white, so it still reads as *given* and not as
 * a field somebody forgot to enable. `title` carries the full value because an
 * address is the one entry here that will not fit its column.
 */
function ReadOnlyField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label>{label}</Label>
      <div
        className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground"
        title={value ?? undefined}
      >
        <span className="truncate">{value ?? "—"}</span>
      </div>
    </div>
  );
}

/** One answer of the collapsed form's strip. */
function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
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

/**
 * Register a return, or correct one — once.
 *
 * The same screen for both, exactly as pedidos does it: registering a claim and
 * fixing it are the same act under the same rules, and a second copy of this
 * form would be a second place to forget a field. The route decides —
 * `/devoluciones/nueva` creates, `/devoluciones/:id/editar` loads that return in
 * and saves over it.
 *
 * The page never scrolls. The form sits on top at exactly the height its fields
 * need and the detail takes every pixel left over: the list of returned products
 * grows, the paperwork does not, so the split is a consequence rather than a
 * ratio to pick. Once answered, the form collapses to a one-line strip and the
 * table inherits its height.
 *
 * What this form does that the order's does not is warn. A correction is the
 * only one the return will ever get, and it restarts an approval flow somebody
 * may already have signed — so the page says so before a single field is
 * touched, not in a toast after the fact.
 */
export function ReturnFormPage() {
  const navigate = useNavigate();
  const { id } = useRouteParams();
  const editingId = id ? Number(id) : null;
  const editing = editingId !== null && Number.isFinite(editingId);
  const { data: existing, isLoading: loadingExisting } = useReturn(editing ? editingId : undefined);
  /** A reopened return only lets quantities go down — see `ReturnReopenEditor`. */
  const reopening = editing && (existing?.status === "RETURNED" || existing?.status === "REJECTED");

  const [lines, setLines] = useState<ReturnLine[]>([]);
  /** What the lines looked like when this screen opened — the ceiling a reopen edit cannot cross. */
  const [originalLines, setOriginalLines] = useState<ReturnLine[]>([]);
  /**
   * Whether the paperwork is on screen. Collapsing rather than a draggable
   * divider: the form has one natural "answered" state, so the useful gesture
   * is binary, not a ratio to keep adjusting.
   */
  const [formOpen, setFormOpen] = useState(true);

  const user = useCurrentUser();
  const { data: clients = [], isLoading: loadingClients } = useClients();
  const createReturn = useCreateReturn();
  const updateReturn = useUpdateReturn();

  const {
    handleSubmit,
    register,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ReturnFormValues>({
    resolver: zodResolver(returnSchema),
    defaultValues: {
      ownerCode: "",
      clientId: "",
      replacementDate: dateKeyOffset(3),
      justification: "",
    },
  });

  const ownerCode = watch("ownerCode");
  const clientId = watch("clientId");
  const replacementDate = watch("replacementDate");
  const justification = watch("justification");

  // The client's invoicing data is the same resource the order form reads: same
  // client, one endpoint.
  const { data: details, isFetching: loadingDetails } = useOrderClientDetails(clientId || undefined);
  const client = clients.find((c) => c.id === clientId);

  /**
   * True once the return being edited has been poured into the form. It gates
   * the client-change effect below, which empties the detail when the user
   * switches client — right when they pick one, wrong when the client is simply
   * being restored.
   */
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!editing || !existing || prefilled) return;
    const owner = clients.find((c) => c.id === existing.clientId);
    reset({
      ownerCode: owner?.ownerCode ?? "",
      clientId: existing.clientId,
      replacementDate: existing.replacementDate,
      justification: existing.justification,
    });
    const loaded = existing.lines.map((line) => ({ ...line, photos: [...line.photos] }));
    setLines(loaded);
    setOriginalLines(loaded.map((line) => ({ ...line })));
    setPrefilled(true);
  }, [editing, existing, prefilled, clients, reset]);

  /**
   * Changing the client empties the detail, and it has to.
   *
   * Every line on the table was accepted against *that* client's invoices. Under
   * a different client the same rows are claims nobody can back — so they go,
   * and the user is told why rather than left to notice the table is empty.
   */
  const [lastClientId, setLastClientId] = useState("");
  useEffect(() => {
    if (editing && !prefilled) return;
    if (clientId === lastClientId) return;
    setLastClientId(clientId);
    if (!lastClientId || lines.length === 0) return;
    setLines([]);
    toast.info("Se vació el detalle", {
      description: "Los productos que se pueden devolver dependen de las facturas del cliente.",
    });
  }, [clientId, lastClientId, lines.length, editing, prefilled]);

  /** The accounts, deduplicated — several stores may hang from the same one. */
  const ownerOptions = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const c of clients) if (!byCode.has(c.ownerCode)) byCode.set(c.ownerCode, c.ownerName);
    return [...byCode]
      .map(([code, name]) => ({ value: code, label: `${code} · ${name}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [clients]);

  /** Only the chosen owner's stores: the child list is what "cliente" means. */
  const clientOptions = useMemo(
    () =>
      clients
        .filter((c) => c.ownerCode === ownerCode)
        .map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
    [clients, ownerCode],
  );

  const selectOwner = (code: string) => {
    setValue("ownerCode", code, { shouldValidate: true });
    const stores = clients.filter((c) => c.ownerCode === code);
    setValue("clientId", stores.length === 1 ? stores[0].id : "", { shouldValidate: true });
  };

  /**
   * Why the header is not answered yet, phrased for the button in the panel
   * below — which is the only place the user will read it. The lines have their
   * own reasons and are checked there; this one only speaks for the form.
   */
  const headerBlockedReason =
    editing && loadingExisting
      ? "Esperá a que termine de cargar la devolución."
      : !clientId
        ? "Elegí el cliente que devuelve la mercadería."
        : justification.trim().length < 15
          ? "Escribí la justificación de la devolución (mínimo 15 caracteres)."
          : null;

  const onSubmit = async (values: ReturnFormValues) => {
    const input = {
      clientId: values.clientId,
      // The seller is whoever is signed in, exactly as in the order form. The
      // distributor rides along for the same reason: it is who they are, not
      // something the form asks.
      sellerCode: user.sellerCode ?? 0,
      sellerName: user.name,
      distributorName: user.distributor,
      replacementDate: values.replacementDate,
      justification: values.justification,
      lines,
    };

    if (editing && editingId !== null) {
      await updateReturn.mutateAsync({ id: editingId, input });
      // Back to the return, not to the list: the user came here to fix that one
      // and the natural next thing is to check where it stands now.
      navigate(`/devoluciones/${editingId}`);
      return;
    }
    await createReturn.mutateAsync(input);
    navigate("/devoluciones");
  };

  // Correcting somebody else's note is not a blocked action with a reason, it is
  // an address the role should never have reached: back to the list.
  if (
    editing &&
    existing &&
    seesOwnDocumentsOnly(user.role) &&
    existing.sellerCode !== user.sellerCode
  ) {
    return <Navigate to="/devoluciones" replace />;
  }

  // A return that can no longer be corrected must not open in an editor that
  // would only fail on save. The rule is the service's; this only obeys it.
  const blockedForEditing = editing && existing ? editBlockedReason(existing) : null;
  if (blockedForEditing) {
    return (
      <>
        <PageHeader title={`Devolución ${existing?.id}`} description="No se puede corregir.">
          <Button type="button" variant="outline" onClick={() => navigate(`/devoluciones/${id}`)}>
            <ArrowLeft className="h-4 w-4" /> Volver
          </Button>
        </PageHeader>
        <EmptyState icon={PackageX} title="Esta devolución ya no se puede corregir" description={blockedForEditing} />
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={editing ? `Corregir devolución ${id}` : "Nueva devolución"}
        description={
          editing
            ? "Al guardar, la devolución vuelve al inicio del flujo de aprobación."
            : "Registra la mercadería que vuelve del cliente, con su lote y su evidencia."
        }
      >
        <Button type="button" variant="outline" onClick={() => setFormOpen((open) => !open)}>
          {formOpen ? (
            <>
              <ChevronUp className="h-4 w-4" /> Ocultar formulario
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" /> Mostrar formulario
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(editing ? `/devoluciones/${id}` : "/devoluciones")}
        >
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {/* The single most important thing on the screen while correcting, and
            it is not a field: this edit is the last one, and it undoes every
            signature already on the return. */}
        {editing && (
          <div className="flex shrink-0 items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
            <p>
              <span className="font-semibold">Esta es la única corrección permitida.</span>{" "}
              {reopening
                ? "Solo se puede reducir la cantidad de cada producto — no se pueden agregar ni quitar productos."
                : null}{" "}
              Al guardar, la devolución vuelve a quedar pendiente del supervisor y las aprobaciones
              anteriores dejan de contar — quedan asentadas en el historial.
            </p>
          </div>
        )}

        {formOpen ? (
          /* Two cards of equal width, each three rows of a label over one `h-9`
             control, so the two close on the same line because they are the
             same shape and not because something was shoved down to look like
             it.

             The rows are auto-sized, and that is the point: `grid-rows-3` made
             every row an equal share of whatever height the taller card
             happened to need, so the shorter one padded its fields out to fill
             the difference and the whole block ate half the screen. Now the
             paperwork is exactly as tall as the paperwork, and the only card
             with anything to distribute — `content-between` spreads the leftover
             into the gaps, never into a control. */
          <div className="grid shrink-0 grid-cols-2 gap-3">
            {/* ---- Cliente: who the goods come back from, and who he is ---- */}
            <Card className="flex min-w-0 flex-col">
              <CardContent className="flex min-h-0 flex-1 flex-col gap-1.5 p-2.5">
                <SectionTitle icon={Store}>Cliente</SectionTitle>
                <div className="grid flex-1 grid-cols-2 content-between gap-x-2 gap-y-1.5">
                  {/* Two steps because they are two different things: the account
                      the goods were billed to, and which of its stores they come
                      back from. */}
                  <div className="space-y-1.5">
                    <Label htmlFor="ownerCode">Cliente propietario</Label>
                    <Combobox
                      id="ownerCode"
                      options={ownerOptions}
                      value={ownerCode}
                      onChange={selectOwner}
                      placeholder={loadingClients ? "Cargando…" : "Selecciona el propietario"}
                      searchPlaceholder="Buscar por código o nombre…"
                      invalid={!!errors.ownerCode}
                      disabled={loadingClients}
                    />
                    <FieldError message={errors.ownerCode?.message} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="clientId">Cliente</Label>
                    <Combobox
                      id="clientId"
                      options={clientOptions}
                      value={clientId}
                      onChange={(v) => setValue("clientId", v, { shouldValidate: true })}
                      placeholder={
                        ownerCode ? "Selecciona un cliente" : "Elegí primero el propietario"
                      }
                      searchPlaceholder="Buscar por código o nombre…"
                      emptyText="Este propietario no tiene clientes."
                      invalid={!!errors.clientId}
                      disabled={!ownerCode}
                    />
                    <FieldError message={errors.clientId?.message} />
                  </div>

                  {/* Registration data: shown, never edited — it belongs to the
                      client. `Titular` is deliberately absent: it is the owner
                      already chosen in the select above, and repeating it would
                      spend a slot on an answer the user just gave. Sector and
                      dirección moved to the other card — see there for why. */}
                  <ReadOnlyField
                    label="Razón social"
                    value={
                      loadingDetails ? "…" : client ? (details?.razonSocial ?? client.name) : null
                    }
                  />
                  <ReadOnlyField
                    label="NIT"
                    value={loadingDetails ? "…" : client ? (details?.nit ?? null) : null}
                  />
                  <ReadOnlyField
                    label="Tipo de cliente"
                    value={client ? CLIENT_TYPE_LABELS[client.clientType] : null}
                  />
                  <ReadOnlyField
                    label="Canal de venta"
                    value={client ? (getChannel(client.channelId)?.name ?? null) : null}
                  />
                </div>
              </CardContent>
            </Card>

            {/* ---- Devolución: what is being committed to ---- */}
            <Card className="flex min-w-0 flex-col">
              <CardContent className="flex min-h-0 flex-1 flex-col gap-1.5 p-2.5">
                <SectionTitle icon={PackageX}>Devolución</SectionTitle>
                <div className="grid flex-1 grid-cols-2 content-between gap-x-2 gap-y-1.5">
                  {/* A fact of the session, not a choice: a seller registers
                      returns for his own distributor and for no other. The
                      seller's own name is not a field either — it travels on the
                      record from the session, and printing it back would only
                      tell the user who they are logged in as. */}
                  <ReadOnlyField label="Distribuidora" value={user.distributor} />

                  <div className="space-y-1.5">
                    <Label htmlFor="replacementDate">Fecha probable de reposición</Label>
                    {/* Never in the past: a reposition already behind us is not
                        a commitment to the client, it is a typo. */}
                    <Input
                      id="replacementDate"
                      type="date"
                      min={dateKeyOffset(0)}
                      value={replacementDate}
                      onChange={(e) =>
                        setValue("replacementDate", e.target.value, { shouldValidate: true })
                      }
                    />
                    <FieldError message={errors.replacementDate?.message} />
                  </div>

                  {/* Where the goods physically are, and it belongs on this card
                      rather than with the client's paperwork: it is what the
                      removed "punto de entrega" was really asking. The truck
                      goes to the client's address — there was never a second
                      answer to pick off a list. */}
                  <ReadOnlyField label="Sector" value={client?.sector ?? null} />
                  <ReadOnlyField label="Dirección de retiro" value={client?.address ?? null} />

                  {/* The justification takes the last row whole — it is the
                      first thing the approver reads, and the only field here
                      that gets better with room. */}
                  <div className="col-span-2 flex min-h-0 flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="justification">Justificación de la devolución</Label>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {justification?.length ?? 0}/400
                      </span>
                    </div>
                    <textarea
                      id="justification"
                      rows={2}
                      maxLength={400}
                      placeholder="Por qué el cliente devuelve esta mercadería"
                      {...register("justification")}
                      className={cn(
                        // `block` is load-bearing: a textarea is inline-block by
                        // default and the browser leaves a descender gap under
                        // it, which is enough to push this card off the other's
                        // line.
                        //
                        // Two rows, and a fixed height rather than `flex-1`:
                        // this is the field that decides how tall the whole
                        // block is, and a justification is a couple of lines —
                        // letting it stretch turned every screen it appears on
                        // into a half-empty box.
                        "block h-16 w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        errors.justification ? "border-destructive" : "border-input",
                      )}
                    />
                    <FieldError message={errors.justification?.message} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* Collapsed: the form's answers as one strip, and the whole strip is
             the way back into it. Nothing is hidden that the user cannot see is
             there. */
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="flex w-full shrink-0 flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
              {client ? `${numId(client.code)} - ${client.name}` : "Sin cliente seleccionado"}
            </span>
            <SummaryFact label="Reposición" value={formatDay(replacementDate)} />
            <SummaryFact label="Distribuidora" value={user.distributor} />
            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-primary">
              <ChevronDown className="h-3.5 w-3.5" /> Editar datos
            </span>
          </button>
        )}

        {/* ---- Detalle: everything the form did not need ---- */}
        <div className="flex min-h-0 flex-1 flex-col">
          <ReturnCartPanel
            lines={lines}
            onLinesChange={setLines}
            clientId={clientId}
            // While correcting, this return's own lines must not count against
            // the quantity it is allowed to claim.
            excludeReturnId={editing && editingId !== null ? editingId : undefined}
            mode={reopening ? "reopen" : "full"}
            originalLines={originalLines}
            confirming={createReturn.isPending || updateReturn.isPending}
            confirmLabel={editing ? "Guardar y reenviar" : "Enviar a aprobación"}
            headerBlockedReason={headerBlockedReason}
            // A field error the user cannot see is a dead end: if submitting
            // fails validation while the form is collapsed, it comes back.
            onConfirm={handleSubmit(onSubmit, () => setFormOpen(true))}
          />
        </div>
      </div>
    </div>
  );
}
