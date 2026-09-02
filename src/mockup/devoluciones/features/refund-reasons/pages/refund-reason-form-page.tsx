// Alta y edición de un MOTIVO DE DEVOLUCIÓN (fila de `refund_reasons`).
//
// UNA PANTALLA Y NO UN DIÁLOGO. La URL es real (`/motivos-devolucion/nuevo`), así que sobrevive un F5,
// entra en el historial del browser y se puede pasar por chat; un diálogo se cierra con un click al
// costado y no se puede compartir.
//
// UN FORMULARIO PLANO, no tarjetas ni panel de vista previa. Son siete campos: etiqueta a la
// izquierda, campo a la derecha, «Volver» y «Guardar» abajo a la derecha — el mismo esqueleto del
// sistema que esta pantalla reemplaza, que es donde el usuario ya sabe mirar. Antes esto tenía tres
// cards y una vista previa en vivo: explicaba bien el modelo y hacía parecer difícil algo que es
// llenar un nombre y elegir dos opciones.
//
// LO QUE SÍ SE QUEDA ES LA AYUDA DE UNA LÍNEA debajo de los dos requisitos. No es decoración: es lo
// único que distingue «No aplica» de «Opcional», y esa confusión es el error que este catálogo puede
// meter en el formulario del vendedor.
//
// UN SOLO COMPONENTE PARA CREAR Y EDITAR: los campos y las reglas son los mismos, y dos componentes
// serían dos lugares donde arreglar la misma validación. Lo que decide el modo es el `code` del path.
//
// EL CÓDIGO NO SE EDITA. Es la PK y quedó escrito en `refund_order_detail.reason` de cada línea ya
// registrada: cambiarlo dejaría al histórico apuntando a un motivo que no existe. En un alta se
// propone solo desde el nombre y se puede corregir; en una edición va deshabilitado.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertTriangle, ArrowLeft, ChevronRight, Save, Tags } from 'lucide-react'
import { useRouteParams } from '@/core/routing/active-route'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  codigoDeMotivo,
  codigoDeMotivoEnUso,
  REQUISITO_META,
  REQUISITOS,
  siguienteOrden,
  useRefundReasonsStore,
  type MotivoDevolucion,
  type RequisitoCampo,
} from '../../../stores/refund-reasons-store'

/**
 * Una fila del formulario: etiqueta a la izquierda, campo a la derecha.
 *
 * La etiqueta va alineada a la derecha y pegada al campo, como en el sistema viejo: con siete filas,
 * el ojo baja por el borde de los campos y las etiquetas quedan del lado de lo que nombran. En una
 * pantalla angosta la grilla se cae a una sola columna sola (`sm:`), así que la etiqueta se pone
 * arriba y nada se aprieta.
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

/** Los tres valores del requisito en un desplegable, como el «Tipo de Proceso» del sistema viejo. */
function SelectRequisito({
  id,
  valor,
  onChange,
}: {
  id: string
  valor: RequisitoCampo
  onChange: (v: RequisitoCampo) => void
}) {
  return (
    <Select value={valor} onValueChange={(v) => onChange(v as RequisitoCampo)}>
      <SelectTrigger id={id} className="h-9 w-full">
        {/* Base UI muestra el VALOR CRUDO si no se le da un render explícito: sin esto el trigger
            diría «REQUIRED». Mismo tropiezo que ya tuvieron `MockupShell` y las restricciones. */}
        <SelectValue>{(v) => REQUISITO_META[v as RequisitoCampo]?.label ?? String(v)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {REQUISITOS.map((opcion) => (
          <SelectItem key={opcion} value={opcion}>
            {REQUISITO_META[opcion].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function RefundReasonFormPage() {
  const navigate = useNavigate()
  // `useRouteParams` y no `useParams`: el shell de este mockup renderiza la pantalla a mano, fuera de
  // un <Route element>, así que `useParams()` devolvería {} y la pantalla no sabría a quién edita.
  const { code: codeParam } = useRouteParams()

  const motivos = useRefundReasonsStore((s) => s.motivos)
  const addMotivo = useRefundReasonsStore((s) => s.addMotivo)
  const updateMotivo = useRefundReasonsStore((s) => s.updateMotivo)
  const setMotivoActivo = useRefundReasonsStore((s) => s.setMotivoActivo)

  const vivos = useMemo(() => motivos.filter((m) => !m.deletedAt), [motivos])
  const enEdicion: MotivoDevolucion | undefined = codeParam
    ? vivos.find((m) => m.code === codeParam)
    : undefined

  // El estado arranca DESDE la fila (o vacío en un alta) y no se sincroniza con un efecto: esta
  // pantalla se monta de nuevo en cada navegación, así que el valor inicial ya es el correcto. Es la
  // diferencia con un diálogo, que sobrevive cerrado y necesita el efecto para no mostrar lo anterior.
  const [name, setName] = useState(enEdicion?.name ?? '')
  const [code, setCode] = useState(enEdicion?.code ?? '')
  /** Mientras nadie toque el código a mano, en un alta lo propone el nombre. */
  const [codeManual, setCodeManual] = useState(false)
  const [lotRequirement, setLotRequirement] = useState<RequisitoCampo>(enEdicion?.lotRequirement ?? 'REQUIRED')
  const [dueDateRequirement, setDueDateRequirement] = useState<RequisitoCampo>(
    enEdicion?.dueDateRequirement ?? 'REQUIRED',
  )
  const [requiresPhoto, setRequiresPhoto] = useState(enEdicion?.requiresPhoto ?? true)
  const [requiresNotes, setRequiresNotes] = useState(enEdicion?.requiresNotes ?? true)
  const [ordenTexto, setOrdenTexto] = useState(String(enEdicion?.sortOrder ?? siguienteOrden(vivos)))

  const volver = () => navigate('/motivos-devolucion')

  // El path trae un código que no existe (link viejo, o el motivo se eliminó). Cartel y salida, no un
  // formulario vacío que al guardar crearía una fila nueva sin que nadie lo haya pedido.
  if (codeParam && !enEdicion) {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Motivo no disponible</CardTitle>
          <CardDescription>
            No hay ningún motivo con el código <span className="font-mono">{codeParam}</span> en el
            catálogo, o fue eliminado.
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

  const codigoFinal = codigoDeMotivo(enEdicion ? enEdicion.code : codeManual ? code : name)
  const codigoDuplicado = !enEdicion && codigoFinal.length > 0 && codigoDeMotivoEnUso(vivos, codigoFinal)

  const motivoBloqueo: string | null = !name.trim()
    ? 'Poné el nombre del motivo'
    : !codigoFinal
      ? 'Poné el código del motivo'
      : codigoDuplicado
        ? `El código ${codigoFinal} ya está en uso`
        : null

  const guardar = () => {
    if (motivoBloqueo) return
    const input = {
      code: codigoFinal,
      name,
      lotRequirement,
      dueDateRequirement,
      requiresPhoto,
      requiresNotes,
      // `sort_order` es SMALLINT: lo que no es número es el final de la lista, no `NaN`.
      sortOrder: Number.isFinite(Number(ordenTexto))
        ? Math.max(0, Math.trunc(Number(ordenTexto)))
        : siguienteOrden(vivos),
    }
    if (enEdicion) {
      updateMotivo(enEdicion.code, input)
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

        <Fila
          label="Código"
          htmlFor="motivo-code"
          requerido
          ayuda={
            enEdicion
              ? 'No se puede cambiar: las devoluciones ya registradas apuntan a este código.'
              : 'Se propone desde el nombre.'
          }
        >
          <Input
            id="motivo-code"
            value={codigoFinal}
            onChange={(e) => {
              setCodeManual(true)
              setCode(e.target.value)
            }}
            disabled={Boolean(enEdicion)}
            placeholder="CONTAMINACION_FISICA"
            maxLength={100}
            className={cn('h-9 font-mono text-xs uppercase', codigoDuplicado && 'border-destructive')}
            aria-invalid={codigoDuplicado}
          />
          {codigoDuplicado && (
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
              <AlertTriangle size={12} className="shrink-0" />
              Ya hay un motivo con el código {codigoFinal}.
            </p>
          )}
        </Fila>

        <Fila
          label="Número de lote"
          htmlFor="motivo-lote"
          requerido
          ayuda={REQUISITO_META[lotRequirement].nota}
        >
          <SelectRequisito id="motivo-lote" valor={lotRequirement} onChange={setLotRequirement} />
        </Fila>

        <Fila
          label="Vencimiento"
          htmlFor="motivo-vencimiento"
          requerido
          ayuda={REQUISITO_META[dueDateRequirement].nota}
        >
          <SelectRequisito
            id="motivo-vencimiento"
            valor={dueDateRequirement}
            onChange={setDueDateRequirement}
          />
        </Fila>

        {/* Foto y observación son dos banderas y van en UNA fila: son la misma pregunta —qué evidencia
            se le exige— y separarlas en dos filas haría el formulario más largo sin decir más. */}
        <Fila label="Evidencia">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1.5">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={requiresPhoto} onCheckedChange={setRequiresPhoto} />
              Foto obligatoria
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={requiresNotes} onCheckedChange={setRequiresNotes} />
              Observación obligatoria
            </label>
          </div>
        </Fila>

        <Fila label="Orden" htmlFor="motivo-orden" ayuda="Menor primero, en la lista del vendedor.">
          <Input
            id="motivo-orden"
            value={ordenTexto}
            onChange={(e) => setOrdenTexto(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            className="h-9 w-24 tabular-nums"
          />
        </Fila>

        {enEdicion && (
          <Fila label="Estado" ayuda="Apagado deja de ofrecerse en devoluciones nuevas; el histórico lo sigue mostrando.">
            <label className="flex items-center gap-2 pt-1.5 text-xs">
              <Switch
                checked={enEdicion.isActive}
                onCheckedChange={(v) => {
                  setMotivoActivo(enEdicion.code, v)
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
