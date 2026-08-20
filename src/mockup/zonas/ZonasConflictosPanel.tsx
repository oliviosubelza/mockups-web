// Los dos paneles que informan CONFLICTOS, abajo a la derecha del mapa de zonas.
//
// POR QUÉ UN PANEL Y NO UN TOAST NI UN CARTEL FLOTANTE. Antes el único aviso era una píldora roja sobre
// la pista de abajo: "se pisa con 2 zonas". Decía QUE algo estaba mal y nada más — ni con cuáles, ni por
// cuánto, ni si ya se había arreglado. Un dato que cambia en cada cuadro del arrastre necesita un lugar
// FIJO donde mirarlo, no una notificación: la corrección es un lazo cerrado (movés el vértice → mirás el
// número → volvés a mover), y para eso el número tiene que estar siempre en el mismo píxel.
//
// POR QUÉ ABAJO A LA DERECHA. Es la única esquina libre: el listado ocupa toda la izquierda, la barra de
// acciones el borde de arriba, la pista el centro de abajo, y el dock de herramientas la derecha alta.
// Además es la esquina que el mouse NO cruza mientras dibuja hacia el norte de la ciudad.
//
// LA MÉTRICA CENTRAL ES LA HOLGURA MÍNIMA, no la lista de conflictos, y va en grande: es un solo número
// que contesta la única pregunta que importa mientras dibujás ("¿estoy pisando a alguien?") y, a
// diferencia de la lista, existe también cuando todo está bien. Un panel que solo aparece con errores no
// se puede usar para confirmar que ya no hay ninguno.
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Crosshair, Ruler } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  METROS_HOLGURA,
  formatearMetros,
  type Conflicto,
  type Evaluacion,
  type ParConflicto,
} from '../map/geo/holgura'

/** Caja común de los dos paneles: mismo ancho, mismo cristal, mismo lugar. */
function Caja({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-auto w-64 overflow-hidden rounded-xl border border-border bg-card/95 shadow-xl backdrop-blur-sm">
      {children}
    </div>
  )
}

function Encabezado({ titulo, extra }: { titulo: string; extra?: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center gap-1.5 border-b border-border px-2.5">
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </span>
      {extra}
    </div>
  )
}

/** Una fila de conflicto: a quién le pega y por qué. Clickeable, porque saber cuál es no alcanza si
 *  después hay que ir a buscarla a mano por el mapa. */
function FilaConflicto({
  etiqueta,
  detalle,
  tipo,
  onIr,
}: {
  etiqueta: React.ReactNode
  detalle: string
  tipo: 'solapa' | 'holgura'
  onIr: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onIr}
        title="Encuadrar en el mapa"
        className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-muted/60"
      >
        {/* Rojo = comparten territorio (grave: un cliente cae en dos zonas). Ámbar = no se pisan pero
            los bordes quedaron más cerca del mínimo. Dos problemas distintos, dos colores distintos. */}
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            tipo === 'solapa' ? 'bg-destructive' : 'bg-amber-500',
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
        <span
          className={cn(
            'shrink-0 tabular-nums',
            tipo === 'solapa' ? 'font-medium text-destructive' : 'text-amber-600 dark:text-amber-500',
          )}
        >
          {detalle}
        </span>
        <Crosshair size={11} className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </button>
    </li>
  )
}

const detalleDe = (c: { tipo: 'solapa' | 'holgura'; metros: number | null }) =>
  c.tipo === 'solapa' ? 'se pisan' : formatearMetros(c.metros ?? 0)

/**
 * Panel del contorno EN CURSO (modos dibujar/editar).
 *
 * `holguraMinima` es `null` cuando no hay ninguna vecina con la que medir —una zona sola en su ciudad—
 * y eso se dice con palabras ("sin vecinas") en vez de con un guión: "—" se lee como "todavía no se
 * calculó", y acá el cálculo ya se hizo y el resultado es que no hay nada que medir.
 */
export function PanelValidacionContorno({
  vertices,
  evaluacion,
  nombreDe,
  onIrAZona,
}: {
  vertices: number
  evaluacion: Evaluacion
  nombreDe: (id: number) => string
  onIrAZona: (id: number) => void
}) {
  const { conflictos, holguraMinima, autoCruce } = evaluacion
  const cumple = conflictos.length === 0 && !autoCruce && vertices >= 3
  const holguraMal = holguraMinima !== null && holguraMinima < METROS_HOLGURA

  return (
    <Caja>
      <Encabezado
        titulo="Validación"
        extra={
          cumple ? (
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-500">
              <CheckCircle2 size={12} />
              En regla
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-destructive">
              <AlertTriangle size={12} />
              {conflictos.length + (autoCruce ? 1 : 0) || 'incompleto'}
            </span>
          )
        }
      />

      <div className="flex items-end gap-2 px-2.5 pb-2 pt-2">
        <Ruler size={14} className="mb-1 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Holgura mínima</div>
          <div
            className={cn(
              'truncate text-lg font-semibold leading-tight tabular-nums',
              holguraMinima === null
                ? 'text-muted-foreground'
                : holguraMal
                  ? 'text-destructive'
                  : 'text-emerald-600 dark:text-emerald-500',
            )}
          >
            {holguraMinima === null ? 'Sin vecinas' : formatearMetros(holguraMinima)}
          </div>
        </div>
        <div className="shrink-0 pb-0.5 text-right text-[10px] leading-tight text-muted-foreground">
          mínimo
          <br />
          <span className="tabular-nums">{formatearMetros(METROS_HOLGURA)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border px-2.5 py-1 text-[11px] text-muted-foreground">
        <span>
          <span className="font-medium tabular-nums text-foreground">{vertices}</span> vértice
          {vertices !== 1 ? 's' : ''}
        </span>
        {autoCruce ? (
          <span className="font-medium text-destructive">El contorno se cruza a sí mismo</span>
        ) : (
          <span>Contorno simple</span>
        )}
      </div>

      {conflictos.length > 0 && (
        <div className="border-t border-border p-1">
          <ul className="max-h-32 space-y-0.5 overflow-y-auto">
            {conflictos.map((c: Conflicto) => (
              <FilaConflicto
                key={c.id}
                etiqueta={nombreDe(c.id)}
                detalle={detalleDe(c)}
                tipo={c.tipo}
                onIr={() => onIrAZona(c.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </Caja>
  )
}

/**
 * Panel de AUDITORÍA de las zonas ya guardadas (modo explorar).
 *
 * Es el que contesta "¿el mapa que ya tenemos está sano?", una pregunta distinta a la del panel de
 * arriba: acá no hay nada en curso, y cada fila es un par de zonas existentes que hay que ir a corregir.
 */
export function PanelAuditoria({
  pares,
  total,
  nombreDe,
  onIrAlPar,
}: {
  pares: ParConflicto[]
  /** Cuántas zonas se auditaron. Sin esto, "0 conflictos" no distingue un mapa sano de un mapa vacío. */
  total: number
  nombreDe: (id: number) => string
  onIrAlPar: (par: ParConflicto) => void
}) {
  return (
    <Caja>
      <Encabezado
        titulo="Auditoría de zonas"
        extra={
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {total} zona{total !== 1 ? 's' : ''}
          </span>
        }
      />
      {pares.length === 0 ? (
        <p className="flex items-center gap-1.5 px-2.5 py-2.5 text-xs text-emerald-600 dark:text-emerald-500">
          <CheckCircle2 size={13} className="shrink-0" />
          Todas separadas al menos {formatearMetros(METROS_HOLGURA)}
        </p>
      ) : (
        <div className="p-1">
          <ul className="max-h-48 space-y-0.5 overflow-y-auto">
            {pares.map((par) => (
              <FilaConflicto
                key={`${par.a}-${par.b}-${par.tipo}`}
                etiqueta={
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 truncate">{nombreDe(par.a)}</span>
                    <ArrowLeftRight size={10} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{nombreDe(par.b)}</span>
                  </span>
                }
                detalle={detalleDe(par)}
                tipo={par.tipo}
                onIr={() => onIrAlPar(par)}
              />
            ))}
          </ul>
        </div>
      )}
    </Caja>
  )
}
