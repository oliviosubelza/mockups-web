// Alta y edición de un ACTIVO LOGÍSTICO (fila de `logistic_assets`).
//
// UN SOLO DIÁLOGO PARA CREAR Y EDITAR, y no dos: los campos son los mismos y las reglas también. Dos
// componentes serían dos lugares donde arreglar la misma validación, y el día que se agregue una columna
// alguien se acuerda de uno solo. Lo único que cambia es el título y el botón, así que sale del `activo`
// que llega por props: `null` = alta.
//
// LA DECISIÓN DEL FORMULARIO ES `isSerialized`, no el nombre. Determina cómo se controla la unidad el
// resto de su vida —por cantidad o por número de serie— y eso no se puede cambiar sin reinterpretar los
// viajes ya registrados. Por eso no es un switch suelto entre los demás campos: son dos opciones
// explicadas, con el tipo proponiendo la que corresponde y el usuario pudiendo pisarla.
//
// EL CÓDIGO ES EL IDENTIFICADOR OPERATIVO (es lo que se dicta por radio y lo que se escanea), así que se
// normaliza a mayúsculas y se valida único contra el catálogo vivo. La unicidad se avisa MIENTRAS se
// escribe y no al guardar: enterarte de que el código está tomado después de llenar seis campos es la
// forma más cara de decirlo.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Boxes, Hash, ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { DISTRIBUIDORAS } from '../mock-data'
import {
  codigoEnUso,
  normalizarCodigo,
  TIPO_ACTIVO_META,
  TIPOS_ACTIVO,
  type ActivoLogistico,
  type ActivoLogisticoInput,
  type TipoActivo,
} from '../logistic-assets-store'

/** Valor del `<Select>` para "sin distribuidora". Un `<SelectItem value="">` no es seleccionable. */
const GLOBAL = 'global'

/**
 * Tipos que por naturaleza se controlan por serie.
 *
 * Es una SUGERENCIA, no una regla: al elegir el tipo se propone el control que corresponde, y el usuario
 * lo puede pisar. Una distribuidora puede llevar sus jabas numeradas, y al revés, una que no controla sus
 * refrigeradores de a uno no debería tener que inventar seriales para poder guardar.
 */
const SERIE_POR_DEFECTO: TipoActivo[] = ['REFRIGERATOR', 'THERMO_LOGGER']

/** Campo con etiqueta. Repetido siete veces, así que vale el componente de cuatro líneas. */
function Campo({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-xs">
          {label}
        </Label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** Las dos formas de contar, como opciones explicadas y no como un switch sin contexto. */
function ControlUnidad({
  serializado,
  onChange,
}: {
  serializado: boolean
  onChange: (v: boolean) => void
}) {
  const opciones = [
    {
      valor: false,
      icono: Boxes,
      titulo: 'Por cantidad',
      detalle: 'Son intercambiables. Salió con 12, volvió con 10: faltan 2 y no importa cuáles.',
    },
    {
      valor: true,
      icono: ListOrdered,
      titulo: 'Por número de serie',
      detalle: 'Cada unidad es un activo fijo con código propio. Se sabe exactamente cuál no volvió.',
    },
  ]
  return (
    <div role="radiogroup" aria-label="Control de la unidad" className="grid grid-cols-2 gap-2">
      {opciones.map(({ valor, icono: Icono, titulo, detalle }) => {
        const elegido = serializado === valor
        return (
          <button
            key={titulo}
            type="button"
            role="radio"
            aria-checked={elegido}
            onClick={() => onChange(valor)}
            className={cn(
              'flex flex-col gap-1 rounded-md border p-2 text-left transition-colors',
              elegido ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/60',
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Icono size={13} className={elegido ? 'text-primary' : 'text-muted-foreground'} />
              {titulo}
            </span>
            <span className="text-[11px] leading-snug text-muted-foreground">{detalle}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Texto → número con dos decimales, como `DECIMAL(12,2)`. Lo que no es número es 0, no `NaN`. */
const aDecimal = (texto: string): number => {
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}

export function ActivoLogisticoDialog({
  abierto,
  onOpenChange,
  /** `null` = alta. Con activo = edición de esa fila. */
  activo,
  /** Catálogo vivo, para validar que el código no esté tomado. */
  catalogo,
  onGuardar,
}: {
  abierto: boolean
  onOpenChange: (v: boolean) => void
  activo: ActivoLogistico | null
  catalogo: ActivoLogistico[]
  onGuardar: (input: ActivoLogisticoInput) => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [assetType, setAssetType] = useState<TipoActivo>('PALLET')
  const [isSerialized, setIsSerialized] = useState(false)
  const [pesoTexto, setPesoTexto] = useState('0')
  const [volumenTexto, setVolumenTexto] = useState('0')
  const [distribuidora, setDistribuidora] = useState<string>(GLOBAL)

  // Cada apertura arranca desde la fila que se va a editar (o limpia, en un alta). Va en un efecto y no
  // en el `useState` inicial porque el diálogo NO se desmonta al cerrarse: sin esto, abrir el alta
  // después de editar mostraría los datos de la fila anterior.
  useEffect(() => {
    if (!abierto) return
    setCode(activo?.code ?? '')
    setName(activo?.name ?? '')
    setAssetType(activo?.assetType ?? 'PALLET')
    setIsSerialized(activo?.isSerialized ?? false)
    setPesoTexto(String(activo?.tareWeightKg ?? 0))
    setVolumenTexto(String(activo?.tareVolumeM3 ?? 0))
    setDistribuidora(activo?.distributorId ? String(activo.distributorId) : GLOBAL)
  }, [abierto, activo])

  const codigoDuplicado = useMemo(
    () => code.trim().length > 0 && codigoEnUso(catalogo, code, activo?.id),
    [catalogo, code, activo?.id],
  )

  const motivoBloqueo: string | null = !code.trim()
    ? 'Poné el código del activo'
    : codigoDuplicado
      ? `El código ${normalizarCodigo(code)} ya está en uso`
      : !name.trim()
        ? 'Poné el nombre del activo'
        : null

  const guardar = () => {
    if (motivoBloqueo) return
    onGuardar({
      code,
      name,
      assetType,
      isSerialized,
      tareWeightKg: aDecimal(pesoTexto),
      tareVolumeM3: aDecimal(volumenTexto),
      distributorId: distribuidora === GLOBAL ? null : Number(distribuidora),
    })
  }

  const notaTipo = TIPO_ACTIVO_META[assetType].nota

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Boxes size={16} className="text-primary" />
            {activo ? `Editar ${activo.code}` : 'Nuevo activo logístico'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            El bandeo es lo que el camión se lleva y no es mercadería. Lo que se define acá es cómo se
            cuenta al salir y al volver.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-2">
            <Campo label="Código" htmlFor="activo-code">
              <Input
                id="activo-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="PALLET-STD"
                maxLength={50}
                // Se muestra en mayúsculas mientras se escribe porque así se va a guardar: ver el valor
                // final desde el principio evita la sorpresa de que la fila no diga lo que tipeaste.
                className={cn('h-8 font-mono text-xs uppercase', codigoDuplicado && 'border-destructive')}
                aria-invalid={codigoDuplicado}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !motivoBloqueo) guardar()
                }}
              />
            </Campo>
            <Campo label="Nombre" htmlFor="activo-name">
              <Input
                id="activo-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Pallet madera estándar (1,20 × 1,00 m)"
                maxLength={100}
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !motivoBloqueo) guardar()
                }}
              />
            </Campo>
          </div>

          {codigoDuplicado && (
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
              <AlertTriangle size={12} className="shrink-0" />
              Ya hay un activo con el código {normalizarCodigo(code)}. Es lo que se dicta por radio y lo
              que se escanea: dos iguales no se pueden distinguir.
            </p>
          )}

          <Campo label="Tipo">
            <Select
              value={assetType}
              onValueChange={(v) => {
                // Sin `if (!v) return`, deseleccionar en el Select dejaría `assetType` en `null` y la
                // fila se guardaría con un tipo que no está en el enumerado.
                if (!v) return
                const tipo = v as TipoActivo
                setAssetType(tipo)
                // El tipo PROPONE el control (un refrigerador va por serie, un pallet por cantidad) y se
                // puede pisar después. Sin esto, el caso normal exige dos decisiones donde una alcanza.
                setIsSerialized(SERIE_POR_DEFECTO.includes(tipo))
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_ACTIVO.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_ACTIVO_META[t].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {notaTipo && <p className="text-[11px] leading-snug text-muted-foreground">{notaTipo}</p>}
          </Campo>

          <Campo label="Control de la unidad">
            <ControlUnidad serializado={isSerialized} onChange={setIsSerialized} />
          </Campo>

          <div className="grid grid-cols-2 gap-2">
            <Campo label="Tara" htmlFor="activo-peso" hint="kg">
              <Input
                id="activo-peso"
                value={pesoTexto}
                onChange={(e) => setPesoTexto(e.target.value)}
                inputMode="decimal"
                className="h-8 text-xs tabular-nums"
              />
            </Campo>
            <Campo label="Volumen" htmlFor="activo-volumen" hint="m³">
              <Input
                id="activo-volumen"
                value={volumenTexto}
                onChange={(e) => setVolumenTexto(e.target.value)}
                inputMode="decimal"
                className="h-8 text-xs tabular-nums"
              />
            </Campo>
          </div>
          {/* La tara se declara pero todavía NO descuenta de la capacidad del camión: encenderlo cambia
              el número que decide si una ruta sale o no, y esa decisión no está tomada. Decirlo acá evita
              que alguien cargue pesos esperando ver moverse la ocupación de la ruta. */}
          <p className="text-[11px] leading-snug text-muted-foreground">
            La tara se guarda para el día que el bandeo descuente capacidad del camión. Hoy no afecta la
            ocupación de las rutas.
          </p>

          <Campo label="Distribuidora" hint="vacío = flota global">
            {/* `?? GLOBAL`: el Select de base-ui puede emitir `null` al deseleccionar, y acá "ninguna
                distribuidora" ya tiene su propio valor — no es la ausencia de valor. */}
            <Select value={distribuidora} onValueChange={(v) => setDistribuidora(v ?? GLOBAL)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GLOBAL}>Flota global (todas)</SelectItem>
                {DISTRIBUIDORAS.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" disabled={motivoBloqueo !== null} title={motivoBloqueo ?? undefined} onClick={guardar}>
            {activo ? 'Guardar cambios' : 'Crear activo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
