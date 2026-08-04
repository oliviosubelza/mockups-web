// Panel izquierdo del detalle: las paradas del viaje en orden de visita, espejo exacto del mapa.
//
// Regla que sostiene toda la pantalla: la fila lleva EL MISMO marcador que su pin — mismo número,
// mismo color, mismo relleno. Lista y mapa tienen que ser el mismo lenguaje visual, o el usuario paga
// el costo de traducir entre los dos cada vez que mira.
//
// La tarjeta es DELIBERADAMENTE corta: quién, dónde, cuándo y cómo salió. Nada más. El receptor, el
// motivo del fallo, las cantidades y las incidencias viven en el panel de detalle, que se abre al
// hacer click. Una lista de 20 paradas con seis datos cada una no se escanea — se lee, y para eso ya
// está el detalle.
import { useEffect, useRef } from 'react'
import { AlertTriangle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { atencionMin, duracionTexto, type EntregaMonitoreo } from './monitoreo-data'
import { ESTADO_ENTREGA } from './monitoreo-estado'

/**
 * Marcador de la fila: círculo con el número de secuencia, del color del estado.
 *
 * SIN la insignia ✓/✕/↩ que sí lleva el pin del mapa, y no es una inconsistencia: en el mapa la
 * insignia es el único canal que no depende del color, porque ahí no hay texto. Acá la fila ya dice
 * "Entregado" / "No entregado" con palabras, así que la insignia era pura redundancia — y a 20px de
 * círculo quedaba amontonada encima del número.
 */
function MarcadorFila({ entrega }: { entrega: EntregaMonitoreo }) {
  return (
    <span
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold text-white"
      style={{ background: ESTADO_ENTREGA[entrega.estado].color }}
      aria-hidden
    >
      {entrega.secuencia}
    </span>
  )
}

export function ParadasPanel({
  entregas,
  paradaFoco,
  onSeleccionar,
  /** Mensaje cuando no hay nada que listar. Lo decide el llamador: "sin paradas" y "sin resultados de
   *  búsqueda" se ven igual acá pero significan cosas muy distintas para el usuario. */
  vacio = 'Este viaje todavía no tiene paradas cargadas.',
}: {
  entregas: EntregaMonitoreo[]
  paradaFoco: string | null
  onSeleccionar: (paradaId: string) => void
  vacio?: string
}) {
  const activaRef = useRef<HTMLButtonElement>(null)

  // Auto-scroll a la parada activa: en un viaje de 20 paradas, lo que importa está siempre en el
  // medio de la lista, nunca arriba.
  useEffect(() => {
    activaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [paradaFoco])

  if (entregas.length === 0) {
    return <p className="p-4 text-center text-xs text-muted-foreground">{vacio}</p>
  }

  return (
    // Sin `divide-y`: el riel vertical ya separa las filas y una línea horizontal por medio lo
    // cortaría. La lista se lee como UN recorrido, no como filas independientes.
    <ul className="flex flex-col">
      {entregas.map((entrega, i) => {
        const meta = ESTADO_ENTREGA[entrega.estado]
        const enFoco = paradaFoco === entrega.paradaId
        const activa = entrega.estado === 'en_camino' || entrega.estado === 'en_sitio'

        // El riel espeja el trazo del mapa: SÓLIDO en el tramo ya recorrido, PUNTEADO en el que falta.
        // El tramo de arriba pertenece al viaje entre la parada anterior y esta, así que su estado lo
        // define la ANTERIOR; el de abajo, esta misma.
        const anteriorCerrada = i > 0 && ESTADO_ENTREGA[entregas[i - 1].estado].cerrada
        const rail = (hecho: boolean) => cn('w-0 border-l', hecho ? 'border-solid' : 'border-dashed', 'border-border')

        // Cuánto duró la entrega en ESTA parada. Es la única cuenta que la tarjeta corta hace por el
        // usuario, y se justifica: "10:25 → 10:37" obliga a restar de cabeza en cada fila, y con 20
        // paradas la pregunta "¿en cuál se colgó?" no se contesta escaneando pares de horas.
        const atencion = atencionMin(entrega)

        return (
          <li key={entrega.id}>
            <button
              ref={enFoco || activa ? activaRef : undefined}
              type="button"
              onClick={() => onSeleccionar(entrega.paradaId)}
              aria-current={enFoco}
              className={cn(
                'flex w-full items-stretch gap-2.5 pr-3 text-left transition-colors hover:bg-muted/60',
                // La parada abierta lleva una guía de color a la izquierda: en foco es la que el
                // usuario eligió, así que tiene que distinguirse del hover sin depender del fondo.
                enFoco && 'bg-muted',
              )}
              style={enFoco ? { boxShadow: `inset 2px 0 0 ${meta.color}` } : undefined}
            >
              {/* Columna del riel: tramo, marcador, tramo. Los extremos del recorrido van
                  transparentes para que la línea no quede colgando arriba de la primera parada ni
                  debajo de la última. */}
              <span className="flex w-11 shrink-0 flex-col items-center">
                <span className={cn('h-3', i === 0 ? 'border-transparent' : rail(anteriorCerrada))} />
                <MarcadorFila entrega={entrega} />
                <span
                  className={cn(
                    'flex-1',
                    i === entregas.length - 1 ? 'border-transparent' : rail(meta.cerrada),
                  )}
                />
              </span>

              <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-2.5">
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{entrega.cliente}</span>
                  {entrega.incidencias.length > 0 && (
                    <AlertTriangle className="size-3.5 shrink-0 text-destructive" aria-label="Con incidencia" />
                  )}
                  {entrega.fueraDeVentana && (
                    <Clock className="size-3.5 shrink-0 text-amber-500" aria-label="Fuera de ventana horaria" />
                  )}
                </span>

                <span className="truncate text-xs text-muted-foreground">{entrega.puntoEntrega}</span>

                <span className="flex items-center gap-1.5 text-[11px] tabular-nums">
                  <span style={{ color: meta.color }} className="font-medium">
                    {meta.label}
                  </span>
                  {/* Llegada → cierre. Es la lectura de "cuánto tardó" sin hacer ninguna cuenta. */}
                  {entrega.llegadaAt && (
                    <span className="text-muted-foreground">
                      {entrega.llegadaAt}
                      {entrega.entregaAt ? ` → ${entrega.entregaAt}` : ''}
                    </span>
                  )}
                  {/* La duración va con peso propio y no en gris como las horas: las horas ubican en
                      el día, esto mide desempeño. Es el dato que se compara entre filas. */}
                  {atencion !== null && (
                    <span className="shrink-0 font-medium text-foreground" title="Tiempo de atención en el punto">
                      {duracionTexto(atencion)}
                    </span>
                  )}
                  {!entrega.llegadaAt && <span className="text-muted-foreground">Ventana {entrega.ventana}</span>}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
