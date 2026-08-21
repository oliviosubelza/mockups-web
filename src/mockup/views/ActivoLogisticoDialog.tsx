// Alta y edición de un ACTIVO LOGÍSTICO (fila de `logistic_assets`).
//
// UN SOLO DIÁLOGO PARA CREAR Y EDITAR, y no dos: los campos son los mismos y las reglas también. Dos
// componentes serían dos lugares donde arreglar la misma validación, y el día que se agregue una columna
// alguien se acuerda de uno solo. Lo único que cambia es el título y el botón, así que sale del `activo`
// que llega por props: `null` = alta.
//
// EL FORMULARIO PIDE CUATRO COSAS: código, nombre, tipo y las dos medidas. `isSerialized` NO se pregunta
// —lo propone el tipo— y la distribuidora tampoco: el catálogo se da de alta global y el día que haya que
// acotarlo a una distribuidora se agrega el campo. Preguntar de entrada algo que hoy siempre se responde
// igual es pedirle al usuario que confirme un default.
//
// EL CÓDIGO ES EL IDENTIFICADOR OPERATIVO (es lo que se dicta por radio y lo que se escanea), así que se
// normaliza a mayúsculas y se valida único contra el catálogo vivo. La unicidad se avisa MIENTRAS se
// escribe y no al guardar: enterarte de que el código está tomado después de llenar seis campos es la
// forma más cara de decirlo.
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Boxes } from 'lucide-react'
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
import {
  codigoEnUso,
  normalizarCodigo,
  TIPO_ACTIVO_META,
  TIPOS_ACTIVO,
  type ActivoLogistico,
  type ActivoLogisticoInput,
  type TipoActivo,
} from '../logistic-assets-store'

/**
 * Tipos que por naturaleza se controlan por serie.
 *
 * `isSerialized` sigue siendo el corazón del modelo (define cómo se cuenta la unidad el resto de su vida),
 * pero ya no se pregunta: lo decide el TIPO, que es un enumerado cerrado y siempre acierta —un refrigerador
 * es un activo fijo con código propio, un pallet es intercambiable—. En una edición se respeta lo que ya
 * tenía la fila mientras no se cambie el tipo, para no reinterpretar los viajes ya registrados.
 */
const SERIE_POR_DEFECTO: TipoActivo[] = ['REFRIGERATOR', 'THERMO_LOGGER']

/** Campo con etiqueta. Repetido cinco veces, así que vale el componente de cuatro líneas. */
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
      // El catálogo se da de alta para la flota global: la columna es NULLABLE y hoy nadie acota un
      // activo a una distribuidora sola.
      distributorId: null,
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
                // El tipo DECIDE el control (un refrigerador va por serie, un pallet por cantidad). Es
                // lo único que se pregunta: el formulario ya no tiene el selector de control de unidad.
                setIsSerialized(SERIE_POR_DEFECTO.includes(tipo))
              }}
            >
              {/* `w-full` y no el `w-fit` por defecto del trigger: el popup se dimensiona con el ancho del
                  trigger (`w-(--anchor-width)`), así que un trigger angosto deja "Registrador de
                  temperatura" apretado contra el check. */}
              <SelectTrigger className="h-8 w-full text-xs">
                {/* La etiqueta se renderiza ACÁ y no se deja al `SelectValue` vacío: los `SelectItem`
                    viven en el popup, que se monta recién al abrirlo, así que hasta entonces el value no
                    encuentra su ítem y el trigger mostraba el valor crudo del enumerado
                    ("REFRIGERATOR") en vez de "Refrigerador". */}
                <SelectValue>{TIPO_ACTIVO_META[assetType].label}</SelectValue>
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

          <div className="grid grid-cols-2 gap-2">
            <Campo label="Peso" htmlFor="activo-peso" hint="kg">
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
          {/* El peso se declara pero todavía NO descuenta de la capacidad del camión: encenderlo cambia
              el número que decide si una ruta sale o no, y esa decisión no está tomada. Decirlo acá evita
              que alguien cargue pesos esperando ver moverse la ocupación de la ruta. */}
          <p className="text-[11px] leading-snug text-muted-foreground">
            El peso se guarda para el día que el bandeo descuente capacidad del camión. Hoy no afecta la
            ocupación de las rutas.
          </p>
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
