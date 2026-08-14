// Panel "Flota" del dock: qué camiones entran a esta corrida.
//
// Es una LISTA y no la tabla del paso 1. Sobre un mapa no hay ancho para ocho columnas, y de las ocho
// las únicas que deciden son placa, tipo/clase y capacidad. Lo demás (almacén, turno, utilización
// previa) no cambia la respuesta a "¿lo meto o no?" y acá sería scroll horizontal puro.
//
// La selección va al `dispatch-plan-store`, el mismo que usa el flujo actual: esta pantalla no abre
// una segunda verdad sobre qué camiones tiene el plan.
import { useMemo, useState } from 'react'
import { Search, Truck, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useDispatchPlanStore } from '../dispatch-plan-store'
import { CAMIONES, type Camion } from '../mock-data'
import { Paginador, usePagina } from './Paginador'

const fmt = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/** Mismo criterio que los otros paneles: se pagina antes de que la lista obligue a un scroll largo. */
const POR_PAGINA = 12

const DISPONIBLES = CAMIONES.filter((c) => c.estado === 'disponible')
const EN_MANTENIMIENTO = CAMIONES.filter((c) => c.estado === 'mantenimiento').length

/**
 * Fila de camión en UNA sola línea (h-7).
 *
 * Antes eran dos líneas por lado —placa sobre tipo·clase, toneladas sobre m³— y cada camión medía 44
 * px: en un panel de 300 px de ancho entraban ocho de treinta, y la lista se leía como un formulario.
 * Nada de esos cuatro datos necesita una línea propia: la placa identifica, el resto es una fila de
 * atributos cortos que se lee de corrido.
 */
function FilaCamion({
  camion,
  elegido,
  onToggle,
}: {
  camion: Camion
  elegido: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={elegido}
      title={`${camion.placa} · ${camion.tipo} · ${camion.clase} · ${camion.capacidadPeso} t / ${camion.capacidadVolumen} m³`}
      className={cn(
        'flex h-7 w-full items-center gap-2 px-2 text-left text-xs transition-colors',
        elegido ? 'bg-primary/10' : 'hover:bg-muted/70',
      )}
    >
      {/* El color del camión es el que va a tener su ruta en el mapa: mostrarlo acá hace que elegir un
          camión y reconocer su trazo sean el mismo gesto, sin pasar por una leyenda. */}
      <span
        className={cn(
          'flex size-3.5 shrink-0 items-center justify-center rounded-sm border text-[8px] font-bold text-white',
          elegido ? 'border-transparent' : 'border-border bg-background',
        )}
        style={elegido ? { background: camion.color } : undefined}
        aria-hidden
      >
        {elegido && '✓'}
      </span>

      <span className="w-[68px] shrink-0 truncate font-mono font-medium">{camion.placa}</span>

      {/* Tipo abreviado a una letra en un cuadradito: "Frío/Seco" en texto se comía un tercio de la
          fila para una distinción binaria. El título de la fila lo dice completo. */}
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold',
          camion.tipo === 'Frío'
            ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
            : 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        )}
        aria-hidden
      >
        {camion.tipo === 'Frío' ? 'F' : 'S'}
      </span>

      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {camion.clase}
      </span>

      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {camion.capacidadPeso}t · {camion.capacidadVolumen}m³
      </span>
    </button>
  )
}

export function FlotaPanel() {
  const selectedTruckIds = useDispatchPlanStore((s) => s.selectedTruckIds)
  const toggleTruck = useDispatchPlanStore((s) => s.toggleTruck)
  const setSelectedTrucks = useDispatchPlanStore((s) => s.setSelectedTrucks)
  const [busqueda, setBusqueda] = useState('')

  const elegidos = useMemo(() => new Set(selectedTruckIds), [selectedTruckIds])

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return DISPONIBLES
    return DISPONIBLES.filter(
      (c) =>
        c.placa.toLowerCase().includes(texto) ||
        c.tipo.toLowerCase().includes(texto) ||
        c.clase.toLowerCase().includes(texto),
    )
  }, [busqueda])

  const capacidad = useMemo(() => {
    const elegidosList = DISPONIBLES.filter((c) => elegidos.has(c.id))
    return {
      pesoTon: elegidosList.reduce((acc, c) => acc + c.capacidadPeso, 0),
      volumenM3: elegidosList.reduce((acc, c) => acc + c.capacidadVolumen, 0),
    }
  }, [elegidos])

  const pagina = usePagina(visibles, POR_PAGINA, busqueda)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-border px-2.5 py-2">
        {/* Mantenimiento es informativo y NO seleccionable: se muestra el número para que nadie se
            pregunte dónde están los camiones que faltan, pero no hay nada que hacer con él acá. */}
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="gap-1 border-primary bg-primary/10 py-0.5 font-normal">
            <Truck size={11} className="text-primary" />
            Disponibles
            <span className="font-semibold tabular-nums">{DISPONIBLES.length}</span>
          </Badge>
          <Badge
            variant="outline"
            title="Solo informativo — no se puede seleccionar"
            className="gap-1 border-border/60 bg-muted/30 py-0.5 font-normal text-muted-foreground"
          >
            <Wrench size={11} />
            Mantenimiento
            <span className="font-semibold tabular-nums">{EN_MANTENIMIENTO}</span>
          </Badge>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por placa o tipo"
            className="h-7 pl-7 text-xs"
            aria-label="Buscar camión"
          />
        </div>
      </div>

      {/* Sin `space-y` y sin padding: las filas van pegadas como en un explorador de archivos. El
          hover y el fondo del elegido alcanzan para separarlas, y así entran 12 en vez de 7. */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {pagina.items.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Ningún camión coincide con la búsqueda.
          </p>
        ) : (
          pagina.items.map((camion) => (
            <FilaCamion
              key={camion.id}
              camion={camion}
              elegido={elegidos.has(camion.id)}
              onToggle={() => toggleTruck(camion.id)}
            />
          ))
        )}
      </div>

      <Paginador pagina={pagina} />

      {/* Pie con la capacidad ELEGIDA. Es el número que el HUD compara contra lo necesario, y tenerlo
          acá evita mirar arriba para saber si sumar otro camión alcanzó. */}
      <div className="shrink-0 border-t border-border px-2.5 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">{selectedTruckIds.length}</span>{' '}
            de {DISPONIBLES.length} elegidos
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {fmt.format(capacidad.pesoTon)} t · {fmt.format(capacidad.volumenM3)} m³
          </span>
        </div>
        {selectedTruckIds.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 w-full text-[11px]"
            onClick={() => setSelectedTrucks([])}
          >
            Quitar todos
          </Button>
        )}
      </div>
    </div>
  )
}
