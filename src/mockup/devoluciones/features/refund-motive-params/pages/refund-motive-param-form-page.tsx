// Alta y edición de un PARÁMETRO DE MOTIVO DE DEVOLUCIÓN.
//
// LA PANTALLA SE LEE EN TRES BLOQUES, y no como una lista de catorce campos:
//   1. QUÉ Y CUÁNDO — el motivo, cómo se procesa, contra qué centro se imputa y la ventana de
//      vigencia. Es lo obligatorio, y es lo que la lista muestra.
//   2. ALCANCE — los siete filtros. Todos opcionales, y todos vacíos significa «aplica a todo».
//   3. ESTADO — solo al editar.
// El sistema viejo los pone en una sola columna corrida, donde «Desde» y «Familias» pesan lo mismo
// aunque uno sea obligatorio y el otro no. Separar los bloques es lo que dice, sin un párrafo de
// ayuda, que abajo no hay nada que completar si no se quiere acotar.
//
// EL ALCANCE VACÍO ES «TODO» Y LA PANTALLA LO DICE EN VOZ ALTA. Un formulario con siete controles
// vacíos y ningún asterisco no distingue «no completé» de «no hace falta»: el resumen arriba del
// bloque afirma a qué va a aplicar la fila tal como está, y cambia a medida que se elige.
//
// EL MOTIVO PRECARGA EL CENTRO DE COSTO Y EL TIPO DE PROCESO. En el sistema viejo el select de centro
// de costo se recarga por AJAX al cambiar el motivo. Acá el motivo ya guarda los dos datos, así que
// elegirlo los propone; quedan editables porque el sistema viejo los deja editar, y se guardan
// copiados en la fila para que editar el motivo más adelante no reescriba una ventana ya cerrada.
//
// UNA PANTALLA Y NO UN DIÁLOGO, y un solo componente para crear y editar: las mismas razones que en
// el formulario de motivos, que es el hermano de esta pantalla.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ArrowLeft,
  Boxes,
  Building2,
  ChevronRight,
  Package,
  Plus,
  Save,
  Store,
  Tag,
  Truck,
  X,
} from 'lucide-react'
import { useRouteParams } from '@/core/routing/active-route'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { FiltroPopover } from '../../../../FiltroPopover'
import { FormRow } from '../../../components/common/form-row'
import {
  ESTADO_PARAMETRO_LABELS,
  OPCIONES_CANAL,
  OPCIONES_CLIENTE,
  OPCIONES_DISTRIBUIDORA,
  OPCIONES_FAMILIA,
  OPCIONES_MARCA,
  OPCIONES_PRODUCTO,
  TIPOS_LOTE,
  TIPO_LOTE_LABELS,
  dayKey,
  useRefundMotiveParamsStore,
  type EstadoParametro,
  type LoteParam,
  type ParametroMotivo,
  type TipoLote,
} from '../../../stores/refund-motive-params-store'
import {
  PROCESO_META,
  TIPOS_PROCESO,
  useRefundReasonsStore,
  type TipoProceso,
} from '../../../stores/refund-reasons-store'

/** Un multiselect del bloque de alcance. Todos se ven y se comportan igual. */
function FilaAlcance({
  label,
  icon,
  opciones,
  valores,
  onToggle,
  buscar,
  vacio,
}: {
  label: string
  icon: typeof Store
  opciones: { value: string; label: string }[]
  valores: string[]
  onToggle: (value: string) => void
  buscar: string
  vacio: string
}) {
  return (
    <FormRow label={label}>
      <FiltroPopover
        label={label}
        icon={icon}
        options={opciones}
        active={valores}
        onToggle={onToggle}
        searchPlaceholder={buscar}
        emptyText={vacio}
        ancho="w-72"
        triggerClassName="w-full justify-between"
      />
    </FormRow>
  )
}

export function RefundMotiveParamFormPage() {
  const navigate = useNavigate()
  const { id: idParam } = useRouteParams()

  const parametros = useRefundMotiveParamsStore((s) => s.parametros)
  const addParametro = useRefundMotiveParamsStore((s) => s.addParametro)
  const updateParametro = useRefundMotiveParamsStore((s) => s.updateParametro)
  const setEstado = useRefundMotiveParamsStore((s) => s.setEstado)

  // Solo los motivos VIVOS y ACTIVOS se pueden parametrizar: apagar un motivo es dejar de ofrecerlo,
  // y ofrecerlo acá lo volvería a poner en circulación por la puerta de al lado.
  const motivos = useRefundReasonsStore((s) => s.motivos)
  const motivosElegibles = useMemo(
    () => motivos.filter((m) => !m.deletedAt && m.isActive),
    [motivos],
  )

  const idBuscado = idParam !== undefined ? Number(idParam) : undefined
  const enEdicion: ParametroMotivo | undefined =
    idBuscado !== undefined && Number.isInteger(idBuscado)
      ? parametros.find((p) => p.id === idBuscado && p.status !== 'DELETED')
      : undefined

  const [refundReasonId, setRefundReasonId] = useState<number | null>(
    enEdicion?.refundReasonId ?? null,
  )
  const [processType, setProcessType] = useState<TipoProceso | ''>(enEdicion?.processType ?? '')
  const [costCenter, setCostCenter] = useState(enEdicion?.costCenter ?? '')
  const [startDate, setStartDate] = useState(enEdicion?.startDate ?? dayKey())
  const [endDate, setEndDate] = useState(enEdicion?.endDate ?? dayKey(30))

  const [clientIds, setClientIds] = useState<string[]>(enEdicion?.clientIds ?? [])
  const [productIds, setProductIds] = useState<string[]>(enEdicion?.productIds ?? [])
  const [families, setFamilies] = useState<string[]>(enEdicion?.families ?? [])
  const [brands, setBrands] = useState<string[]>(enEdicion?.brands ?? [])
  const [channelIds, setChannelIds] = useState<string[]>(enEdicion?.channelIds ?? [])
  const [distributorNames, setDistributorNames] = useState<string[]>(
    enEdicion?.distributorNames ?? [],
  )
  const [lotes, setLotes] = useState<LoteParam[]>(enEdicion?.lotes ?? [])
  // El lote se escribe y se AGREGA, no se elige: no hay maestro de lotes, así que el control es un
  // tipo + un número + un botón, igual que en el sistema viejo.
  const [loteTipo, setLoteTipo] = useState<TipoLote>('SC')
  const [loteNumero, setLoteNumero] = useState('')

  const volver = () => navigate('/parametros-motivo-devolucion')

  const alternar = (
    valores: string[],
    set: (v: string[]) => void,
    value: string,
  ) => set(valores.includes(value) ? valores.filter((v) => v !== value) : [...valores, value])

  /** Elegir el motivo propone su centro de costo y su tipo de proceso. Ver la cabecera. */
  const elegirMotivo = (valor: string | null) => {
    if (valor === null) return
    const id = Number(valor)
    setRefundReasonId(id)
    const motivo = motivosElegibles.find((m) => m.id === id)
    if (motivo) {
      setProcessType(motivo.processType)
      setCostCenter(motivo.costCenter)
    }
  }

  const agregarLote = () => {
    const numero = loteNumero.trim()
    if (!numero) return
    // Mismo tipo y mismo número es la misma fila: agregarla dos veces no acota nada y ensucia el
    // resumen.
    if (lotes.some((l) => l.tipo === loteTipo && l.numero === numero)) {
      toast.info('Ese lote ya está en la lista')
      setLoteNumero('')
      return
    }
    setLotes([...lotes, { tipo: loteTipo, numero }])
    setLoteNumero('')
  }

  if (idParam !== undefined && !enEdicion) {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Parámetro no disponible</CardTitle>
          <CardDescription>
            No hay ningún parámetro con el identificador{' '}
            <span className="font-mono">{idParam}</span>, o fue eliminado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={volver}>
            <ArrowLeft size={14} className="mr-1.5" />
            Volver a la lista
          </Button>
        </CardContent>
      </Card>
    )
  }

  const filtrosPuestos =
    clientIds.length +
    productIds.length +
    lotes.length +
    families.length +
    brands.length +
    channelIds.length +
    distributorNames.length

  const motivoBloqueo: string | null =
    refundReasonId === null
      ? 'Elegí el motivo'
      : !processType
        ? 'Elegí el tipo de proceso'
        : !startDate || !endDate
          ? 'Poné la vigencia'
          : // Una ventana al revés no se puede cumplir nunca: es la única validación cruzada que
            // esta pantalla tiene, y es la que el sistema viejo deja pasar.
            endDate < startDate
            ? 'La fecha «Hasta» no puede ser anterior a «Desde»'
            : null

  const guardar = () => {
    if (motivoBloqueo || refundReasonId === null || !processType) return
    const motivo = motivosElegibles.find((m) => m.id === refundReasonId)
    if (!motivo) return
    const input = {
      refundReasonId,
      // El nombre se COPIA: renombrar el motivo no reescribe los parámetros ya guardados.
      refundReasonName: motivo.name,
      processType,
      costCenter,
      startDate,
      endDate,
      clientIds,
      productIds,
      lotes,
      families,
      brands,
      channelIds,
      distributorNames,
    }
    if (enEdicion) {
      updateParametro(enEdicion.id, input)
      toast.success(`Parámetro de «${motivo.name}» actualizado`)
    } else {
      addParametro(input)
      toast.success(`Parámetro de «${motivo.name}» agregado`)
    }
    volver()
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-8">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <button type="button" onClick={volver} className="hover:text-foreground hover:underline">
          Parámetros de motivo de devolución
        </button>
        <ChevronRight size={12} className="shrink-0" />
        <span className="truncate text-foreground">
          {enEdicion ? enEdicion.refundReasonName : 'Nuevo parámetro'}
        </span>
      </nav>

      <div className="flex items-center gap-2">
        <Boxes size={18} className="shrink-0 text-primary" />
        <h2 className="min-w-0 truncate text-xl font-semibold tracking-tight">
          {enEdicion ? `Parámetro de ${enEdicion.refundReasonName}` : 'Nuevo parámetro'}
        </h2>
      </div>

      <Separator />

      {/* ── 1. Qué y cuándo ─────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3.5">
        <FormRow label="Registrado por" ayuda="Sale de la sesión, no es un campo del formulario.">
          <Input value="Juan Pérez" disabled className="h-9" />
        </FormRow>

        <FormRow label="Motivo" htmlFor="param-motivo" requerido>
          <Select
            value={refundReasonId === null ? '' : String(refundReasonId)}
            onValueChange={elegirMotivo}
          >
            <SelectTrigger id="param-motivo" className="h-9 w-full">
              <SelectValue>
                {() => {
                  const motivo = motivosElegibles.find((m) => m.id === refundReasonId)
                  return motivo ? (
                    motivo.name
                  ) : (
                    <span className="text-muted-foreground">Seleccionar</span>
                  )
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {motivosElegibles.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormRow>

        <FormRow
          label="Tipo de proceso"
          htmlFor="param-proceso"
          requerido
          ayuda={processType ? PROCESO_META[processType].nota : undefined}
        >
          <Select value={processType} onValueChange={(v) => setProcessType(v as TipoProceso)}>
            <SelectTrigger id="param-proceso" className="h-9 w-full">
              <SelectValue>
                {() =>
                  processType ? (
                    PROCESO_META[processType].label
                  ) : (
                    <span className="text-muted-foreground">Seleccionar</span>
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

        <FormRow
          label="Centro de costo"
          htmlFor="param-centro"
          ayuda="Se propone el del motivo elegido. Queda guardado en esta fila, así que cambiar el motivo más adelante no reescribe este parámetro."
        >
          <Input
            id="param-centro"
            value={costCenter}
            onChange={(e) => setCostCenter(e.target.value)}
            placeholder="Centro de costo"
            maxLength={50}
            className="h-9"
          />
        </FormRow>

        {/* Las dos fechas en UNA fila: son un rango, no dos datos sueltos, y separadas obligan a
            comparar de arriba abajo lo que se lee de izquierda a derecha. */}
        <FormRow label="Vigencia" htmlFor="param-desde" requerido>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="param-desde"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 w-40"
            />
            <span className="text-xs text-muted-foreground">hasta</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              // Un calendario que no ofrece los días imposibles evita la mitad de los errores; la
              // validación de arriba cubre la otra mitad (alguien que tipea la fecha).
              min={startDate || undefined}
              className="h-9 w-40"
            />
          </div>
        </FormRow>
      </div>

      <Separator />

      {/* ── 2. Alcance ──────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-3.5">
        <div className="grid gap-1.5 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)] sm:gap-x-4">
          <span className="text-xs font-semibold sm:text-right">Alcance</span>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {filtrosPuestos === 0 ? (
              <>
                Sin ningún filtro, este parámetro{' '}
                <span className="font-medium text-foreground">aplica a todo</span>: todos los
                clientes, productos, lotes, canales y distribuidoras.
              </>
            ) : (
              <>
                Aplica solo a lo que coincida con{' '}
                <span className="font-medium text-foreground">
                  {filtrosPuestos === 1 ? 'el filtro puesto' : `los ${filtrosPuestos} filtros puestos`}
                </span>
                . Vaciarlos todos lo vuelve a abrir a todo.
              </>
            )}
          </p>
        </div>

        <FilaAlcance
          label="Clientes"
          icon={Store}
          opciones={OPCIONES_CLIENTE}
          valores={clientIds}
          onToggle={(v) => alternar(clientIds, setClientIds, v)}
          buscar="Buscar cliente…"
          vacio="Sin clientes"
        />
        <FilaAlcance
          label="Productos"
          icon={Package}
          opciones={OPCIONES_PRODUCTO}
          valores={productIds}
          onToggle={(v) => alternar(productIds, setProductIds, v)}
          buscar="Buscar producto…"
          vacio="Sin productos"
        />

        {/* El lote no tiene maestro: se escribe y se agrega. Las agregadas se muestran como chips
            porque son pocas y hay que poder sacarlas de a una. */}
        <FormRow label="N° de lote" htmlFor="param-lote">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={loteTipo} onValueChange={(v) => setLoteTipo(v as TipoLote)}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue>{() => TIPO_LOTE_LABELS[loteTipo]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TIPOS_LOTE.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_LOTE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id="param-lote"
              value={loteNumero}
              onChange={(e) => setLoteNumero(e.target.value)}
              onKeyDown={(e) => {
                // Enter agrega el lote y NO envía el formulario: quien carga cinco lotes seguidos no
                // debería tener que ir al botón entre uno y otro.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  agregarLote()
                }
              }}
              placeholder="N° de lote"
              maxLength={20}
              className="h-9 w-44"
            />
            <Button type="button" variant="outline" size="sm" onClick={agregarLote}>
              <Plus size={14} className="mr-1" />
              Adicionar
            </Button>
          </div>
          {lotes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {lotes.map((l) => (
                <span
                  key={`${l.tipo}-${l.numero}`}
                  className="inline-flex items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5 text-[11px]"
                >
                  <span className="font-medium">{TIPO_LOTE_LABELS[l.tipo]}</span>
                  <span className="font-mono">{l.numero}</span>
                  <button
                    type="button"
                    aria-label={`Quitar el lote ${l.numero}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setLotes(lotes.filter((x) => !(x.tipo === l.tipo && x.numero === l.numero)))
                    }
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </FormRow>

        <FilaAlcance
          label="Familias"
          icon={Boxes}
          opciones={OPCIONES_FAMILIA}
          valores={families}
          onToggle={(v) => alternar(families, setFamilies, v)}
          buscar="Buscar familia…"
          vacio="Sin familias"
        />
        <FilaAlcance
          label="Marcas"
          icon={Tag}
          opciones={OPCIONES_MARCA}
          valores={brands}
          onToggle={(v) => alternar(brands, setBrands, v)}
          buscar="Buscar marca…"
          vacio="Sin marcas"
        />
        <FilaAlcance
          label="Canal de ventas"
          icon={Building2}
          opciones={OPCIONES_CANAL}
          valores={channelIds}
          onToggle={(v) => alternar(channelIds, setChannelIds, v)}
          buscar="Buscar canal…"
          vacio="Sin canales"
        />
        <FilaAlcance
          label="Distribuidora"
          icon={Truck}
          opciones={OPCIONES_DISTRIBUIDORA}
          valores={distributorNames}
          onToggle={(v) => alternar(distributorNames, setDistributorNames, v)}
          buscar="Buscar distribuidora…"
          vacio="Sin distribuidoras"
        />
      </div>

      {/* ── 3. Estado. Solo al editar: un alta nace activa, igual que en el sistema viejo, donde el
             select existe pero está deshabilitado. ──────────────────────────────────────────── */}
      {enEdicion && (
        <>
          <Separator />
          <div className="space-y-3.5">
            <FormRow
              label="Estado"
              htmlFor="param-estado"
              ayuda="Inactivo deja de aplicar sin borrar la fila: las devoluciones que se aprobaron bajo esta ventana siguen explicadas."
            >
              <Select
                value={enEdicion.status}
                onValueChange={(v) => {
                  setEstado(enEdicion.id, v as EstadoParametro)
                  toast.success(`Parámetro ${ESTADO_PARAMETRO_LABELS[v as EstadoParametro].toLowerCase()}`)
                }}
              >
                <SelectTrigger id="param-estado" className="h-9 w-48">
                  <SelectValue>{() => ESTADO_PARAMETRO_LABELS[enEdicion.status]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {/* `DELETED` no se ofrece: eliminar es la acción de la lista, no un valor que se
                      elige de un desplegable al pasar. */}
                  {(['ENABLE', 'DISABLED'] as EstadoParametro[]).map((e) => (
                    <SelectItem key={e} value={e}>
                      {ESTADO_PARAMETRO_LABELS[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormRow>
          </div>
        </>
      )}

      <Separator />

      <div className="flex items-center justify-end gap-2">
        {motivoBloqueo && (
          <span className="mr-auto text-xs text-muted-foreground">{motivoBloqueo}</span>
        )}
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
