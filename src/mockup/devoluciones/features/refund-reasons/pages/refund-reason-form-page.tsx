// Alta y edición de un MOTIVO DE DEVOLUCIÓN (fila de `refund_reasons`).
//
// UNA PANTALLA Y NO UN DIÁLOGO. La URL es real (`/motivos-devolucion/nuevo`), así que sobrevive un F5,
// entra en el historial del browser y se puede pasar por chat; un diálogo se cierra con un click al
// costado y no se puede compartir.
//
// UN FORMULARIO PLANO, no tarjetas ni panel de vista previa. Son DOS campos —nombre y descripción—:
// etiqueta a la izquierda, campo a la derecha, «Volver» y «Guardar» abajo a la derecha — el mismo
// esqueleto del sistema que esta pantalla reemplaza, que es donde el usuario ya sabe mirar.
//
// LO QUE SE FUE Y POR QUÉ. El código, el requisito de vencimiento, las banderas de foto y observación
// y el orden del selector dejaron de ser columnas de `refund_reasons`, así que dejaron de ser campos.
// El «Centro de Costo» y el «Tipo de Proceso» del sistema viejo tampoco se agregaron: no tienen
// columna adonde ir.
//
// UN SOLO COMPONENTE PARA CREAR Y EDITAR: los campos y las reglas son los mismos, y dos componentes
// serían dos lugares donde arreglar la misma validación. Lo que decide el modo es el `id` del path.
//
// EL ID NO SE MUESTRA. Es un `BIGSERIAL` que pone la base y queda escrito en
// `refund_order_details.reason_id`: no es un dato que alguien elija ni corrija, a diferencia del
// código que este formulario pedía cuando la PK era el código.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, ChevronRight, Save, Tags } from 'lucide-react'
import { useRouteParams } from '@/core/routing/active-route'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useRefundReasonsStore, type MotivoDevolucion } from '../../../stores/refund-reasons-store'

/**
 * Una fila del formulario: etiqueta a la izquierda, campo a la derecha.
 *
 * La etiqueta va alineada a la derecha y pegada al campo, como en el sistema viejo: el ojo baja por
 * el borde de los campos y las etiquetas quedan del lado de lo que nombran. En una pantalla angosta
 * la grilla se cae a una sola columna sola (`sm:`), así que la etiqueta se pone arriba y nada se
 * aprieta.
 */
function Fila({
  label,
  htmlFor,
  requerido,
  ayuda,
  children,
}: {
  label: string
  htmlFor?: string
  requerido?: boolean
  ayuda?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)] sm:items-baseline sm:gap-x-4">
      <Label htmlFor={htmlFor} className="pt-1.5 text-xs font-semibold sm:justify-end sm:text-right">
        {label}
        {requerido && <span className="text-destructive">*</span>}
      </Label>
      <div className="min-w-0 space-y-1">
        {children}
        {ayuda && <p className="text-[11px] leading-snug text-muted-foreground">{ayuda}</p>}
      </div>
    </div>
  )
}

export function RefundReasonFormPage() {
  const navigate = useNavigate()
  // `useRouteParams` y no `useParams`: el shell de este mockup renderiza la pantalla a mano, fuera de
  // un <Route element>, así que `useParams()` devolvería {} y la pantalla no sabría a quién edita.
  const { id: idParam } = useRouteParams()

  const motivos = useRefundReasonsStore((s) => s.motivos)
  const addMotivo = useRefundReasonsStore((s) => s.addMotivo)
  const updateMotivo = useRefundReasonsStore((s) => s.updateMotivo)
  const setMotivoActivo = useRefundReasonsStore((s) => s.setMotivoActivo)

  const vivos = useMemo(() => motivos.filter((m) => !m.deletedAt), [motivos])
  // El path trae texto: un id que no es número (link roto, alguien escribiendo en la barra) tiene que
  // caer en el mismo cartel que un id inexistente y no en un `NaN` que no matchea nada en silencio.
  const idBuscado = idParam !== undefined ? Number(idParam) : undefined
  const enEdicion: MotivoDevolucion | undefined =
    idBuscado !== undefined && Number.isInteger(idBuscado)
      ? vivos.find((m) => m.id === idBuscado)
      : undefined

  // El estado arranca DESDE la fila (o vacío en un alta) y no se sincroniza con un efecto: esta
  // pantalla se monta de nuevo en cada navegación, así que el valor inicial ya es el correcto. Es la
  // diferencia con un diálogo, que sobrevive cerrado y necesita el efecto para no mostrar lo anterior.
  const [name, setName] = useState(enEdicion?.name ?? '')
  const [description, setDescription] = useState(enEdicion?.description ?? '')

  const volver = () => navigate('/motivos-devolucion')

  // El path trae un id que no existe o que no es un número (link viejo, o el motivo se eliminó).
  // Cartel y salida, no un formulario vacío que al guardar crearía una fila nueva sin que nadie lo
  // haya pedido.
  if (idParam !== undefined && !enEdicion) {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Motivo no disponible</CardTitle>
          <CardDescription>
            No hay ningún motivo con el identificador <span className="font-mono">{idParam}</span> en
            el catálogo, o fue eliminado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={volver}>
            <ArrowLeft size={14} className="mr-1.5" />
            Volver al catálogo
          </Button>
        </CardContent>
      </Card>
    )
  }

  const motivoBloqueo: string | null = !name.trim()
    ? 'Poné el nombre del motivo'
    : !description.trim()
      ? 'Poné la descripción del motivo'
      : null

  const guardar = () => {
    if (motivoBloqueo) return
    const input = {
      name,
      description,
      // OPEN QUESTION: `lot_requirement` is not on this form — the request was name + description
      // only — so a brand-new motivo always takes the DDL default 'OPTIONAL'. Nobody can currently
      // create a motivo that REQUIRES a lot (a RECALL) or one where the lot does not apply (HIDDEN);
      // only the seeded rows carry those values. Needs a product decision before this ships.
      lotRequirement: enEdicion ? enEdicion.lotRequirement : ('OPTIONAL' as const),
    }
    if (enEdicion) {
      updateMotivo(enEdicion.id, input)
      toast.success(`«${input.name.trim()}» actualizado`)
    } else {
      addMotivo(input)
      toast.success(`«${input.name.trim()}» agregado al catálogo`)
    }
    volver()
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-8">
      {/* Rastro de miga con dos saltos: dónde estoy y de dónde vengo. El nombre de la pantalla se
          repite abajo como título porque el rastro se lee de reojo y el título es lo que se lee. */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <button type="button" onClick={volver} className="hover:text-foreground hover:underline">
          Motivos de devolución
        </button>
        <ChevronRight size={12} className="shrink-0" />
        <span className="truncate text-foreground">
          {enEdicion ? enEdicion.name : 'Nuevo motivo de devolución'}
        </span>
      </nav>

      <div className="flex items-center gap-2">
        <Tags size={18} className="shrink-0 text-primary" />
        <h2 className="min-w-0 truncate text-xl font-semibold tracking-tight">
          {enEdicion ? enEdicion.name : 'Nuevo motivo de devolución'}
        </h2>
      </div>

      <Separator />

      <div className="space-y-3.5">
        <Fila label="Nombre" htmlFor="motivo-name" requerido>
          <Input
            id="motivo-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            maxLength={150}
            className="h-9"
            autoFocus
          />
        </Fila>

        {/* LLEVA ASTERISCO aunque la pantalla vieja mostrara la descripción como opcional: la columna
            es `VARCHAR(300) NOT NULL`, así que una fila sin descripción no entra en la tabla.
            Va en un `Textarea` y no en un `Input`: 300 caracteres es una frase larga, y en una línea
            de 9 px de alto el final queda fuera de la vista mientras se escribe. Crece con el
            contenido (`field-sizing-content`), así que un motivo de media línea no ocupa un párrafo. */}
        <Fila
          label="Descripción"
          htmlFor="motivo-description"
          requerido
          ayuda="Para qué es el motivo, en una frase. Es lo que lee quien tiene que decidir la devolución."
        >
          <Textarea
            id="motivo-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="En qué caso se usa este motivo"
            maxLength={300}
            rows={2}
            className="text-sm"
          />
        </Fila>

        {enEdicion && (
          <Fila label="Estado" ayuda="Apagado deja de ofrecerse en devoluciones nuevas; el histórico lo sigue mostrando.">
            <label className="flex items-center gap-2 pt-1.5 text-xs">
              <Switch
                checked={enEdicion.isActive}
                onCheckedChange={(v) => {
                  setMotivoActivo(enEdicion.id, v)
                  toast.success(v ? 'El motivo vuelve a ofrecerse' : 'El motivo ya no se ofrece')
                }}
              />
              Se ofrece en la lista del vendedor
            </label>
          </Fila>
        )}
      </div>

      <Separator />

      {/* «Volver» y «Guardar» abajo a la derecha, como en el sistema que esta pantalla reemplaza: es
          donde el usuario ya los busca. `Guardar` dice por qué está bloqueado en vez de estar apagado
          sin explicación. */}
      <div className="flex items-center justify-end gap-2">
        {motivoBloqueo && <span className="mr-auto text-xs text-muted-foreground">{motivoBloqueo}</span>}
        <Button variant="outline" onClick={volver}>
          <ArrowLeft size={14} className="mr-1.5" />
          Volver
        </Button>
        <Button onClick={guardar} disabled={motivoBloqueo !== null}>
          <Save size={14} className="mr-1.5" />
          Guardar
        </Button>
      </div>
    </div>
  )
}
