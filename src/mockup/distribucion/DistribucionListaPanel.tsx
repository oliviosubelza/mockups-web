// Listado del maestro de CENTROS DE DISTRIBUCIÓN. Buscar, filtrar y elegir son sus únicas
// responsabilidades: operar sobre el elegido es trabajo de la ficha y de la barra de acciones.
//
// SE ALINEÓ CON `zonas/ZonasListaPanel`, que es el mismo panel para el otro corte del territorio.
// Antes tenía pastillas de filtro hechas con `<button>` crudos —una verde, una ámbar y una gris—, un
// botón de alta con un ícono de chispas, cabeceras en `font-bold` y un cartel «ON/OFF» al lado de
// cada switch. Nada de eso decía algo que el estado del control no dijera solo, y cuatro familias de
// color en un panel de 260 px hacen que ninguna signifique nada.
//
// LO QUE QUEDA EN COLOR es lo único que es una ADVERTENCIA: que la ciudad no tenga centro
// PREDETERMINADO, porque entonces un pedido fuera de todo contorno no tiene despachante. El resto
// —activo, inactivo, superficie— se lee de la tabla.
//
// EL CARTEL DE «UN SOLO CENTRO» SE FUE: decía que con una sola distribuidora todo le llega por
// descarte, que es exactamente lo que ahora dice —y con más precisión, porque depende de la bandera y
// no de la cantidad— la franja del predeterminado.
import { useState, useMemo } from 'react'
import { Building2, CircleDot, Plus, Search, Settings2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { areaKm2, formatearArea } from '../map/geo/medidas'
import type { LatLngTuple } from '../map/geo/polyline'

export interface DistribuidoraFila {
  id: number
  nombre: string
  /** Recibe los pedidos que no caen en ningún contorno de la ciudad (`distributors.is_default`). */
  esPorDefecto: boolean
  /**
   * Los CONTORNOS de esta distribuidora, uno por zona viva. Vacío = todavía no dibujó ninguno.
   *
   * Pasó de un anillo a una lista cuando `distribution_zones` dejó de ser 1 a 1: un territorio de
   * reparto no siempre es una mancha conexa —un cuadrante más dos barrios del otro lado del río— y con
   * un polígono único hay que estirar el contorno por el medio de la zona del vecino para llegar.
   */
  anillos: LatLngTuple[][]
  /** `false` = tiene contornos pero TODOS están fuera de circulación. `null` = no tiene ninguno. */
  zonaActiva: boolean | null
  /** La DISTRIBUIDORA está en circulación (`distributors.is_active`), aparte de su zona. */
  activa: boolean
}

type TabFiltro = 'ALL' | 'ACTIVAS' | 'INACTIVAS' | 'SIN_ZONA'

/** Los filtros como DATO y no como cuatro bloques de JSX repetidos, igual que `ESTADOS` en zonas. */
const FILTROS: { value: TabFiltro; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ACTIVAS', label: 'Activos' },
  { value: 'INACTIVAS', label: 'Inactivos' },
  { value: 'SIN_ZONA', label: 'Sin contorno' },
]

export function DistribucionListaPanel({
  distribuidoras,
  texto,
  onTexto,
  seleccionadaId,
  onSeleccionar,
  onEditarZona,
  onNueva,
  onConfigurar,
  totalEnCiudad,
}: {
  distribuidoras: DistribuidoraFila[]
  texto: string
  onTexto: (texto: string) => void
  seleccionadaId: number | null
  onSeleccionar: (id: number | null) => void
  onEditarZona: (id: number) => void
  onNueva: () => void
  /**
   * Abre el diálogo de configuración del centro.
   *
   * UNA sola prop y no seis. El panel dejó de saber qué se puede hacer con un centro —cobertura,
   * predeterminado, contorno, datos, borrado—: eso lo sabe el diálogo, que es donde se hace. Acá solo
   * queda el gesto que lo abre.
   */
  onConfigurar: (id: number) => void
  totalEnCiudad: number
}) {
  const [tab, setTab] = useState<TabFiltro>('ALL')

  const conZona = distribuidoras.filter((d) => d.anillos.length > 0)
  const activas = conZona.filter((d) => d.zonaActiva === true && d.activa)
  const inactivas = conZona.filter((d) => d.zonaActiva === false || !d.activa)
  const sinZona = distribuidoras.filter((d) => d.anillos.length === 0)
  // La superficie de una distribuidora es la SUMA de sus contornos: son territorios distintos, no
  // versiones del mismo.
  const areaDe = (fila: DistribuidoraFila) =>
    fila.anillos.reduce((suma, anillo) => suma + areaKm2(anillo), 0)
  const areaCubierta = activas.reduce((suma, d) => suma + areaDe(d), 0)
  const porDefecto = distribuidoras.find((d) => d.esPorDefecto)

  const conteos: Record<TabFiltro, number> = {
    ALL: distribuidoras.length,
    ACTIVAS: activas.length,
    INACTIVAS: inactivas.length,
    SIN_ZONA: sinZona.length,
  }

  const itemsFiltrados = useMemo(() => {
    return distribuidoras.filter((d) => {
      const tieneZona = d.anillos.length > 0
      if (tab === 'ACTIVAS' && (!tieneZona || d.zonaActiva !== true || !d.activa)) return false
      if (tab === 'INACTIVAS' && (!tieneZona || (d.zonaActiva === true && d.activa))) return false
      if (tab === 'SIN_ZONA' && tieneZona) return false

      if (!texto.trim()) return true
      return d.nombre.toLowerCase().includes(texto.toLowerCase())
    })
  }, [distribuidoras, tab, texto])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Resumen: tres cifras en una línea, sin tarjetas ni íconos de colores. Es contexto para
             leer la lista de abajo, no un tablero. ────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-x-3 gap-y-0.5 border-b border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
        <span>
          <span className="font-medium tabular-nums text-foreground">{totalEnCiudad}</span> centros
        </span>
        <span aria-hidden>·</span>
        <span>
          <span className="font-medium tabular-nums text-foreground">{activas.length}</span> en reparto
        </span>
        <span aria-hidden>·</span>
        <span title="Superficie que cubren los contornos activos">
          <span className="font-medium tabular-nums text-foreground">
            {areaCubierta > 0 ? formatearArea(areaCubierta) : '—'}
          </span>{' '}
          cubiertos
        </span>
      </div>

      {/* EL PREDETERMINADO ES UN DATO DE LA CIUDAD, NO DE UNA FILA: es quien se queda con todo lo que
          los contornos no cubren, así que se dice acá arriba y no hay que ir fila por fila a buscar
          la estrella. Sin ninguno, un pedido que cae en un hueco no tiene despachante — y eso es una
          advertencia, no un dato más. */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-1.5 border-b border-border px-2.5 py-1.5 text-[11px]',
          porDefecto ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400',
        )}
      >
        {/* `CircleDot` y no una estrella. Una estrella dice "favorito" —una preferencia, algo que se
            marca porque gusta—, y esto no lo es: de los centros de la ciudad hay EXACTAMENTE uno que
            recibe lo que nadie cubre, que es literalmente un radio button. El ícono lo dice así. */}
        <CircleDot size={11} className="shrink-0" />
        {porDefecto ? (
          <span className="min-w-0 truncate">
            Sin contorno van a <span className="font-medium text-foreground">{porDefecto.nombre}</span>
          </span>
        ) : (
          <span className="min-w-0 truncate">
            Sin centro predeterminado: los pedidos fuera de todo contorno quedan sin despachante.
          </span>
        )}
      </div>

      <div className="shrink-0 space-y-2 border-b border-border p-2.5">
        <Button size="sm" className="h-7 w-full gap-1.5 text-xs" onClick={onNueva}>
          <Plus size={13} />
          Nuevo centro
        </Button>

        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={(event) => onTexto(event.target.value)}
            placeholder="Buscar centro…"
            className="h-7 pl-7 text-xs"
          />
        </div>

        {/* Filtros con el `Button` compartido en `secondary`/`ghost` — el mismo par que usa el panel de
            zonas logísticas. Un filtro apagado no necesita color propio: necesita no parecer apretado. */}
        <div className="flex flex-wrap items-center gap-1">
          {FILTROS.map(({ value, label }) => {
            const activo = tab === value
            return (
              <Button
                key={value}
                variant={activo ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={() => setTab(value)}
              >
                {label}
                <span className="tabular-nums text-muted-foreground">{conteos[value]}</span>
              </Button>
            )
          })}
        </div>
      </div>

      {/* ── CABECERA DE COLUMNAS. Antes la fila mostraba un número —«12,4 km²»— y un switch, los dos
             sin decir qué eran: había que deducir que el número era superficie y adivinar qué prendía
             el interruptor. Con la cabecera, la lista se lee como cualquier tabla del sistema. ─── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="min-w-0 flex-1">Centro</span>
        <span className="w-20 shrink-0 text-right">Superficie</span>
        <span className="w-16 shrink-0 text-center">Cobertura</span>
        <span className="w-6 shrink-0" aria-hidden />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {itemsFiltrados.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {texto ? 'Ningún centro coincide con la búsqueda.' : 'No hay centros en esta categoría.'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {itemsFiltrados.map((distribuidora) => {
              const seleccionada = distribuidora.id === seleccionadaId
              const tieneZona = distribuidora.anillos.length > 0
              const esActiva = tieneZona && distribuidora.zonaActiva === true && distribuidora.activa

              return (
                <li
                  key={distribuidora.id}
                  className={cn(
                    'flex items-center gap-2 rounded-md pr-1 transition-colors',
                    seleccionada ? 'bg-primary/10' : 'hover:bg-muted/60',
                  )}
                >
                  {/* El doble click abre el editor de contorno: el mismo gesto que la lista de zonas
                      logísticas, y el que evita gastar una columna de botones en la acción que se hace
                      casi siempre. */}
                  <button
                    type="button"
                    onClick={() => onSeleccionar(seleccionada ? null : distribuidora.id)}
                    onDoubleClick={() => onEditarZona(distribuidora.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pl-2 text-left text-xs"
                  >
                    <Building2
                      size={13}
                      className={cn('shrink-0', esActiva ? 'text-primary' : 'text-muted-foreground')}
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate font-medium',
                        !distribuidora.activa && 'line-through decoration-muted-foreground/50',
                      )}
                    >
                      {distribuidora.nombre}
                    </span>
                    {/* La marca repite en la fila lo que dice la franja de arriba, porque desde una
                        fila cualquiera no se ve la franja sin subir la vista. Sin texto: la franja ya
                        lo explicó una vez, y en 260 px un badge no entra al lado del nombre. */}
                    {distribuidora.esPorDefecto && (
                      <CircleDot
                        size={11}
                        className="shrink-0 text-muted-foreground"
                        aria-label="Centro predeterminado"
                      />
                    )}

                    {/* La superficie es la SUMA de sus contornos, y el «·N» dice cuántos son: sin eso,
                        una distribuidora con tres territorios se lee igual que una con uno grande. */}
                    <span
                      className="w-20 shrink-0 text-right tabular-nums text-muted-foreground"
                      title={
                        distribuidora.anillos.length > 1
                          ? `${distribuidora.anillos.length} contornos, superficie sumada`
                          : undefined
                      }
                    >
                      {tieneZona ? formatearArea(areaDe(distribuidora)) : '—'}
                      {distribuidora.anillos.length > 1 && (
                        <span className="ml-1">·{distribuidora.anillos.length}</span>
                      )}
                    </span>

                    <span className="flex w-16 shrink-0 justify-center">
                      {!tieneZona ? (
                        // Lo ÚNICO que sigue destacado, porque es lo único que hay que arreglar: sin
                        // contorno el centro no recibe pedidos por polígono.
                        <Badge
                          variant="outline"
                          className="h-4 border-dashed px-1 text-[10px] text-amber-600 dark:text-amber-400"
                        >
                          Sin trazar
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="h-4 px-1 text-[10px]">
                          {esActiva ? 'Activa' : 'Inactiva'}
                        </Badge>
                      )}
                    </span>
                  </button>

                  {/* Abre el diálogo de configuración. Antes acá colgaba un `DropdownMenu` con seis
                      ítems: dos de ellos eran interruptores disfrazados de botones —había que abrir el
                      menú para saber si la cobertura estaba prendida— y la decisión de predeterminado
                      no entraba en una línea sin decir a quién se la estaba sacando. */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0 text-muted-foreground"
                    aria-label={`Configurar ${distribuidora.nombre}`}
                    title="Configurar"
                    onClick={() => onConfigurar(distribuidora.id)}
                  >
                    <Settings2 size={13} />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
