// Alta y edición de una DISTRIBUIDORA, en el panel izquierdo.
//
// ═══ POR QUÉ UN PANEL Y NO UN DIÁLOGO ═══
//
// El otro CRUD de dato maestro del mockup (`ActivosLogisticosView`) usa un `Dialog`, y ahí está bien: un
// pallet se describe con texto y números, así que un modal centrado no tapa nada que haga falta ver.
//
// Acá la mitad del formulario ES EL MAPA. La ubicación del depósito se pone clickeando o arrastrando el
// marcador, y hay que ver dónde cae respecto de la ciudad, de la otra distribuidora y de las zonas ya
// dibujadas. Un modal taparía justamente eso, y un modal que se puede clickear "por atrás" es peor: no se
// entiende si el click va al formulario o al mapa.
//
// Así que va donde ya va todo lo demás de esta pantalla: el panel izquierdo, reemplazando el listado
// mientras se edita. Es el mismo mecanismo que usa `RestriccionesReglasPanel`, y el mismo criterio —el
// borde izquierdo contesta "¿qué hay?" explorando y "¿qué dice esto?" editando—.
//
// ═══ DOS FORMAS DE PONER LA UBICACIÓN, Y NINGUNA SOBRA ═══
//
// El mapa (click o arrastre) es la forma natural: se ve el barrio, la avenida, el galpón. Los inputs de
// latitud y longitud son para cuando alguien YA tiene la coordenada exacta —de un GPS, de una planilla, de
// SAP— y buscarla a ojo en el mapa sería perder precisión a propósito.
//
// Los dos escriben el MISMO estado y se reflejan entre sí: mover el marcador actualiza los números, y
// escribir un número mueve el marcador. Sin eso serían dos campos que se contradicen y no habría forma de
// saber cuál se va a guardar.
import { Crosshair, Info, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface DistribuidoraDraft {
  name: string
  /** Texto crudo, no `number`: ver la nota de `onLatitud`. */
  latitud: string
  longitud: string
}

/** Rangos de Santa Cruz con margen. No es validación de negocio: atrapa el dedazo de signo o de coma. */
const LAT_MIN = -25
const LAT_MAX = -9
const LNG_MIN = -70
const LNG_MAX = -57

/** `null` si el texto no es una coordenada usable. Es lo que decide si el marcador se puede dibujar. */
export function coordenadaValida(texto: string, min: number, max: number): number | null {
  const valor = Number(texto.replace(',', '.'))
  if (texto.trim() === '' || !Number.isFinite(valor)) return null
  return valor >= min && valor <= max ? valor : null
}

export const latitudDe = (draft: DistribuidoraDraft) => coordenadaValida(draft.latitud, LAT_MIN, LAT_MAX)
export const longitudDe = (draft: DistribuidoraDraft) => coordenadaValida(draft.longitud, LNG_MIN, LNG_MAX)

export function DistribuidoraFormPanel({
  draft,
  onDraft,
  ciudad,
  esNueva,
  /** Encuadra el marcador. Sirve cuando se pegó una coordenada de otra parte del mapa. */
  onEncuadrar,
}: {
  draft: DistribuidoraDraft
  onDraft: (siguiente: DistribuidoraDraft) => void
  ciudad: string
  esNueva: boolean
  onEncuadrar: () => void
}) {
  const lat = latitudDe(draft)
  const lng = longitudDe(draft)
  const ubicada = lat !== null && lng !== null

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5">
      <div className="space-y-1">
        <Label htmlFor="distribuidora-nombre" className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Nombre comercial
        </Label>
        <Input
          id="distribuidora-nombre"
          value={draft.name}
          onChange={(e) => onDraft({ ...draft, name: e.target.value })}
          placeholder="Ej. Distribuidora Discruz"
          maxLength={50}
          className="h-8 text-xs"
          // `autoFocus` solo en el alta: editando, el foco tiene que quedar en el mapa, que es lo que se
          // vino a tocar. Robarlo al campo obligaría a un click extra antes de mover el marcador.
          autoFocus={esNueva}
        />
        {/* El tope de 50 es el de la columna (`distributors.name VARCHAR(50)`), no un número elegido acá. */}
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Ciudad</Label>
        {/* LA CIUDAD NO SE ELIGE ACÁ: es la del filtro de arriba. Un select en el formulario permitiría
            crear una distribuidora en Montero mientras la pantalla muestra Santa Cruz, y desaparecería
            del listado en el mismo momento de guardarla. Se muestra como texto para que quede claro
            dónde va a quedar. */}
        <div className="flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-xs text-muted-foreground">
          <MapPin size={12} className="shrink-0" />
          <span className="min-w-0 truncate">{ciudad}</span>
        </div>
      </div>

      <div className="space-y-1.5 rounded-md border border-border bg-muted/20 p-2">
        <div className="flex items-center gap-1.5">
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ubicación del depósito
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px]"
            onClick={onEncuadrar}
            disabled={!ubicada}
            title={ubicada ? 'Centrar el mapa en el depósito' : 'Todavía no hay coordenada'}
          >
            <Crosshair size={11} />
            Ver
          </Button>
        </div>

        <p className="flex items-start gap-1.5 text-[10px] leading-snug text-muted-foreground">
          <Info size={10} className="mt-0.5 shrink-0" />
          {ubicada
            ? 'Arrastrá el marcador en el mapa, o clickeá en otro punto para moverlo. Los números se actualizan solos.'
            : 'Clickeá en el mapa para plantar el marcador, o escribí la coordenada si ya la tenés.'}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="distribuidora-lat" className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Latitud
            </Label>
            {/*
              `type="text"` Y NO `type="number"`, a propósito y por dos motivos concretos:
                · un `number` con `step` por defecto rechaza los seis decimales que necesita una coordenada
                  en algunos navegadores, y la rueda del mouse encima del campo cambia el valor sin querer
                  —justo lo que no querés en un dato que estás midiendo—;
                · escribir "-17." es un estado intermedio VÁLIDO mientras tipeás, y un input numérico lo
                  reporta como vacío, así que el marcador saltaría al origen en medio de la escritura.
              El texto se valida en `coordenadaValida`, que también acepta coma decimal (es-BO).
            */}
            <Input
              id="distribuidora-lat"
              value={draft.latitud}
              onChange={(e) => onDraft({ ...draft, latitud: e.target.value })}
              placeholder="-17.783000"
              inputMode="decimal"
              className="h-7 text-xs tabular-nums"
              aria-invalid={draft.latitud.trim() !== '' && lat === null}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="distribuidora-lng" className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Longitud
            </Label>
            <Input
              id="distribuidora-lng"
              value={draft.longitud}
              onChange={(e) => onDraft({ ...draft, longitud: e.target.value })}
              placeholder="-63.182000"
              inputMode="decimal"
              className="h-7 text-xs tabular-nums"
              aria-invalid={draft.longitud.trim() !== '' && lng === null}
            />
          </div>
        </div>

        {/* El aviso de rango dice el RANGO, no "inválido": un signo olvidado es el error real y frecuente
            (Santa Cruz está en latitud y longitud NEGATIVAS), y "coordenada inválida" no lo señala. */}
        {(draft.latitud.trim() !== '' && lat === null) ||
        (draft.longitud.trim() !== '' && lng === null) ? (
          <p className="text-[10px] leading-snug text-destructive">
            Fuera de rango. Bolivia está en latitud {LAT_MIN} a {LAT_MAX} y longitud {LNG_MIN} a {LNG_MAX}:
            las dos negativas.
          </p>
        ) : null}
      </div>
    </div>
  )
}
