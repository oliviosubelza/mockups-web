// Alta y edición de un MOTIVO DE DEVOLUCIÓN (fila de `refund_reasons`).
//
// UNA PANTALLA Y NO UN DIÁLOGO. La URL es real (`/motivos-devolucion/nuevo`), así que sobrevive un F5,
// entra en el historial del browser y se puede pasar por chat; un diálogo se cierra con un click al
// costado y no se puede compartir.
//
// UN FORMULARIO PLANO, no tarjetas ni panel de vista previa. Son CUATRO campos —nombre, descripción,
// centro de costo y tipo de proceso—: etiqueta a la izquierda, campo a la derecha, «Volver» y
// «Guardar» abajo a la derecha — el mismo esqueleto del sistema que esta pantalla reemplaza, que es
// donde el usuario ya sabe mirar.
//
// EL TIPO DE PROCESO ES EL ÚNICO CAMPO CON CONSECUENCIA CONTABLE, y por eso es el que lleva la nota
// bajo el campo: REGULAR emite la nota de crédito o débito, REPOSICIÓN es un intercambio —entran 10,
// salen 10, no sale ningún documento de plata— y SAP se procesa del otro lado. Desde el depósito los
// dos primeros se ven igual, así que la diferencia hay que decirla en la pantalla y no suponerla.
//
// LA DESCRIPCIÓN ES EL ÚNICO CAMPO OPCIONAL. Los otros tres son obligatorios.
//
// LO QUE SE FUE Y POR QUÉ. El código, el requisito de vencimiento, las banderas de foto y observación
// y el orden del selector dejaron de ser columnas de `refund_reasons`, así que dejaron de ser campos.
// El «Centro de Costo» y el «Tipo de Proceso» del sistema viejo SÍ VOLVIERON: se les agregó columna
// (`cost_center` y `process_type`) porque el negocio los necesita.
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
import { FormRow } from '../../../components/common/form-row'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  PROCESO_META,
  TIPOS_PROCESO,
  useRefundReasonsStore,
  type MotivoDevolucion,
  type TipoProceso,
} from '../../../stores/refund-reasons-store'

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
  const [costCenter, setCostCenter] = useState(enEdicion?.costCenter ?? '')
  // Un alta arranca SIN tipo elegido y no en REGULAR: el tipo decide si sale una nota de crédito o
  // sale producto, y un valor puesto por el formulario se firma sin haberlo mirado.
  const [processType, setProcessType] = useState<TipoProceso | ''>(enEdicion?.processType ?? '')

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

  // La descripción NO bloquea: es el único campo opcional del formulario.
  const motivoBloqueo: string | null = !name.trim()
    ? 'Poné el nombre del motivo'
    : !costCenter.trim()
      ? 'Poné el centro de costo'
      : !processType
        ? 'Elegí el tipo de proceso'
        : null

  const guardar = () => {
    if (motivoBloqueo) return
    if (!processType) return
    const input = {
      name,
      description,
      costCenter,
      processType,
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
        <FormRow label="Nombre" htmlFor="motivo-name" requerido>
          <Input
            id="motivo-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            maxLength={150}
            className="h-9"
            autoFocus
          />
        </FormRow>

        {/* SIN ASTERISCO: es el único campo opcional del formulario, como en la pantalla vieja. La
            columna hoy es `VARCHAR(300) NOT NULL`, así que una descripción vacía se guarda como ''
            y el DDL tiene que dejar de exigirla (o admitir la cadena vacía) antes de que esto suba.
            Va en un `Textarea` y no en un `Input`: 300 caracteres es una frase larga, y en una línea
            de 9 px de alto el final queda fuera de la vista mientras se escribe. Crece con el
            contenido (`field-sizing-content`), así que un motivo de media línea no ocupa un párrafo. */}
        <FormRow
          label="Descripción"
          htmlFor="motivo-description"
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
        </FormRow>

        <FormRow
          label="Centro de costo"
          htmlFor="motivo-cost-center"
          requerido
          ayuda="Contra qué centro se imputa la devolución. Es texto libre: el maestro de centros de costo es de contabilidad y no vive en esta base."
        >
          <Input
            id="motivo-cost-center"
            value={costCenter}
            onChange={(e) => setCostCenter(e.target.value)}
            placeholder="Centro de costo"
            maxLength={50}
            className="h-9"
          />
        </FormRow>

        {/* La nota cambia con lo elegido y no lista los tres casos de una: lo que hay que entender es
            qué va a pasar con ESTE motivo, y un párrafo con las tres opciones se lee como relleno. */}
        <FormRow
          label="Tipo de proceso"
          htmlFor="motivo-process-type"
          requerido
          ayuda={processType ? PROCESO_META[processType].nota : undefined}
        >
          <Select
            value={processType}
            onValueChange={(v) => setProcessType(v as TipoProceso)}
          >
            {/* `SelectValue` con children: Base UI, sin render explícito, escribe el valor crudo
                («REPLACEMENT») en vez de la etiqueta. */}
            <SelectTrigger id="motivo-process-type" className="h-9 w-full">
              <SelectValue>
                {() =>
                  processType ? (
                    PROCESO_META[processType].label
                  ) : (
                    <span className="text-muted-foreground">Elegí el tipo de proceso</span>
                  )
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TIPOS_PROCESO.map((t) => (
                <SelectItem key={t} value={t}>
                  {PROCESO_META[t].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>

        {enEdicion && (
          <FormRow label="Estado" ayuda="Apagado deja de ofrecerse en devoluciones nuevas; el histórico lo sigue mostrando.">
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
          </FormRow>
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
