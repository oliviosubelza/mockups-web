// Las distribuidoras de la ciudad elegida, sobre el borde izquierdo del mapa.
//
// LO QUE SE LISTA ACÁ SON DISTRIBUIDORAS, NO ZONAS, y es la diferencia de fondo con
// `zonas/ZonasListaPanel`. Allá cada fila es una zona que alguien creó; acá la fila es la distribuidora y
// lo que falta o no es su POLÍGONO. Por eso el estado de cada fila —«con zona» / «sin zona»— es lo primero
// que se lee: es lo único que dice si el mapa de esa ciudad está terminado o a medias.
//
// SOLO LAS DE ESTA CIUDAD. El filtro lo hace el workspace (`distribuidorasVivasDeCiudad`) y no es una
// comodidad: dos ciudades vecinas entran en el mismo cuadro de mapa —Warnes está a 29 km de Santa Cruz—,
// así que sin filtrar se verían depósitos y polígonos que no están en juego y no se podría saber cuáles sí.
//
// EL RESUMEN DE ARRIBA existe porque la pantalla abría muy vacía y porque la pregunta que se le hace de un
// vistazo no es «cuántas distribuidoras hay» sino «¿está terminado esto?». Tres números que se leen juntos:
// cuántas hay, cuántas tienen zona, y cuánto territorio cubren entre todas. El tercero es el que atrapa el
// error silencioso: dos zonas dibujadas pero una de 40 km² y la otra de 0,3 km² es un reparto que nadie
// quiso, y en el mapa a ojo no se nota porque depende del zoom.
import { Building2, CheckCircle2, LandPlot, Plus, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { areaKm2, formatearArea } from '../map/geo/medidas'
import type { LatLngTuple } from '../map/geo/polyline'

export interface DistribuidoraFila {
  id: number
  nombre: string
  /** Vértices de su zona. Vacío = todavía no tiene polígono dibujado. */
  puntos: LatLngTuple[]
  /** `false` = tiene zona pero está fuera de circulación. `null` = no tiene zona. */
  zonaActiva: boolean | null
  /** La DISTRIBUIDORA está en circulación (`distributors.is_active`), aparte de su zona. */
  activa: boolean
}

/** Un número del resumen. Nada de tarjetas: son tres datos de la misma pregunta, no tres secciones. */
function Dato({
  icono: Icono,
  valor,
  etiqueta,
  title,
}: {
  icono: typeof Building2
  valor: string
  etiqueta: string
  title: string
}) {
  return (
    <div className="min-w-0 flex-1" title={title}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icono size={10} className="shrink-0" />
        <span className="min-w-0 truncate">{etiqueta}</span>
      </div>
      <div className="truncate text-sm font-semibold tabular-nums">{valor}</div>
    </div>
  )
}

export function DistribucionListaPanel({
  distribuidoras,
  texto,
  onTexto,
  seleccionadaId,
  onSeleccionar,
  onEditarZona,
  onNueva,
  /** Cuántas distribuidoras tiene la ciudad ANTES del filtro de texto. Decide el aviso de «una sola». */
  totalEnCiudad,
}: {
  distribuidoras: DistribuidoraFila[]
  texto: string
  onTexto: (texto: string) => void
  seleccionadaId: number | null
  onSeleccionar: (id: number | null) => void
  onEditarZona: (id: number) => void
  onNueva: () => void
  totalEnCiudad: number
}) {
  const conZona = distribuidoras.filter((d) => d.puntos.length >= 3)
  const areaCubierta = conZona.reduce((suma, d) => suma + areaKm2(d.puntos), 0)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Resumen ─────────────────────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-start gap-2 border-b border-border px-2.5 py-2">
        <Dato
          icono={Building2}
          valor={String(totalEnCiudad)}
          etiqueta="Distrib."
          title="Distribuidoras asignadas a esta ciudad"
        />
        <Dato
          icono={CheckCircle2}
          valor={`${conZona.length}/${totalEnCiudad}`}
          etiqueta="Con zona"
          title="Cuántas tienen ya su polígono dibujado"
        />
        <Dato
          icono={LandPlot}
          valor={areaCubierta > 0 ? formatearArea(areaCubierta) : '—'}
          etiqueta="Cubierto"
          title="Superficie sumada de las zonas dibujadas. Sirve para ver si el reparto quedó parejo."
        />
      </div>

      <div className="shrink-0 space-y-2 border-b border-border p-2.5">
        {/* EL ALTA VIVE ACÁ, en el panel de lo que lista, y no en la barra de arriba: la barra de arriba
            contesta "¿dónde estoy?" (la ciudad) y "¿con qué confirmo?", y esto es una acción sobre el
            listado. Es el mismo lugar donde `ZonasListaPanel` no lo necesita porque allá el alta ES el
            botón principal de la pantalla. */}
        <Button size="sm" className="h-7 w-full gap-1.5 text-xs" onClick={onNueva}>
          <Plus size={13} />
          Nueva distribuidora
        </Button>
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={(event) => onTexto(event.target.value)}
            placeholder="Buscar distribuidora…"
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {/* EL CASO DE UNA SOLA DISTRIBUIDORA SE DICE CON PALABRAS. Con una sola no hay nada que partir: todo
          lo de esa ciudad es suyo por descarte, y dibujarle un polígono solo lograría que los pedidos de
          afuera no le lleguen a nadie. Sin este aviso, «sin zona» se leería como tarea pendiente cuando es
          el estado correcto. */}
      {totalEnCiudad === 1 && (
        <p className="flex shrink-0 items-start gap-1.5 border-b border-border bg-muted/30 px-2.5 py-2 text-[11px] leading-snug text-muted-foreground">
          <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-500" />
          <span>
            Una sola distribuidora en esta ciudad: todos los pedidos van a ella por descarte y no hace
            falta dibujar nada. La zona recién sirve cuando hay dos o más.
          </span>
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {distribuidoras.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {texto
              ? 'Ninguna distribuidora con ese nombre.'
              : 'Esta ciudad no tiene distribuidoras. Creá la primera con «Nueva distribuidora».'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {distribuidoras.map((distribuidora) => {
              const seleccionada = distribuidora.id === seleccionadaId
              const tieneZona = distribuidora.puntos.length >= 3
              return (
                <li key={distribuidora.id}>
                  <button
                    type="button"
                    onClick={() => onSeleccionar(seleccionada ? null : distribuidora.id)}
                    onDoubleClick={() => onEditarZona(distribuidora.id)}
                    className={cn(
                      'w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      seleccionada ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Building2
                        size={13}
                        className={cn(
                          'shrink-0',
                          tieneZona && distribuidora.zonaActiva && distribuidora.activa
                            ? 'text-primary'
                            : 'text-muted-foreground',
                        )}
                      />
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate font-medium',
                          !distribuidora.activa && 'line-through decoration-muted-foreground/50',
                        )}
                      >
                        {distribuidora.nombre}
                      </span>
                      {/* DOS BADGES DISTINTOS PARA DOS ESTADOS DISTINTOS: la DISTRIBUIDORA fuera de
                          circulación no despacha nada; su ZONA desactivada significa que sigue
                          despachando pero sin asignación por polígono. Un solo badge «Inactiva» las
                          confundiría. */}
                      {!distribuidora.activa ? (
                        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
                          Baja
                        </Badge>
                      ) : (
                        tieneZona &&
                        distribuidora.zonaActiva === false && (
                          <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
                            Zona off
                          </Badge>
                        )
                      )}
                    </span>
                    {/* EL ÁREA VA JUNTO AL ESTADO, no en un tooltip: es lo que distingue una zona
                        terminada de un cuadradito de prueba que alguien dejó dibujado, y a ojo no se
                        puede saber porque depende del zoom. */}
                    <span className="mt-0.5 flex items-center gap-1.5 pl-[21px] text-[11px] text-muted-foreground">
                      {tieneZona ? (
                        <>
                          <span className="tabular-nums">
                            {formatearArea(areaKm2(distribuidora.puntos))}
                          </span>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums">{distribuidora.puntos.length} vért.</span>
                        </>
                      ) : (
                        <span className="italic">sin zona dibujada</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
