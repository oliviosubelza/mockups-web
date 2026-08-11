// Control de CAPAS del mapa: qué se dibuja encima de los tiles.
//
// Es un ACORDEÓN de dos niveles, y los dos niveles existen por la misma razón: el mapa es la pantalla,
// y cada píxel que le tapa una herramienta es geografía que el planificador no ve.
//
//   1. El panel arranca CERRADO — un solo botón. Se abre cuando alguien quiere tocar las capas, que es
//      algo que se hace cada tanto, no todo el tiempo.
//   2. Las opciones de una capa aparecen al TILDARLA. "Mostrar nombres" no tiene sentido con la capa
//      de mercados apagada: sería una casilla que no hace nada, ocupando lugar y pidiendo que la leas.
//      Tildar la capa despliega lo suyo; destildarla se lo lleva.
//
// El lenguaje visual es el de las herramientas del monitoreo (tarjeta `rounded-xl`, `bg-card/95`,
// sombra y blur, botones `size-8 rounded-lg`): los dos mapas del producto se manejan igual.
//
// NO es el `LayersControl` de Leaflet a propósito. Ese controla la capa BASE y su estado vive adentro de
// Leaflet; para encuadrar el mapa "incluyendo los mercados visibles" hace falta saberlo desde React.
//
// Va como HERMANO del MapContainer (no como capa): sus clicks no llegan al mapa, así que tildar una
// casilla no arrastra el mapa ni dispara la selección espacial.
import { useState } from 'react'
import { ChevronDown, Layers, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

/** Opción de una capa. Solo se ve mientras su capa está tildada. */
export interface SubcapaMapa {
  id: string
  label: string
  activa: boolean
  onToggle: (activa: boolean) => void
}

export interface CapaMapa {
  id: string
  label: string
  activa: boolean
  onToggle: (activa: boolean) => void
  /** Muestra el indicador de carga al lado del nombre. Discreto: la capa no bloquea el mapa. */
  cargando?: boolean
  /** Aclaración chica al lado del nombre (ej. "sin mercados"). */
  nota?: string
  disabled?: boolean
  /** Opciones propias de la capa (ej. "Nombres"). Se despliegan al tildarla. */
  subcapas?: SubcapaMapa[]
}

/** Fila con casilla + etiqueta. La misma para capas y para sus opciones, con la escala cambiada. */
function FilaCapa({
  label,
  activa,
  onToggle,
  disabled,
  cargando,
  nota,
  sub = false,
}: {
  label: string
  activa: boolean
  onToggle: (activa: boolean) => void
  disabled?: boolean
  cargando?: boolean
  nota?: string
  sub?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent/60',
        sub ? 'text-[11px] font-normal text-muted-foreground' : 'text-xs font-medium',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
      )}
    >
      <Checkbox
        checked={activa}
        disabled={disabled}
        onCheckedChange={(checked) => onToggle(checked === true)}
        className={sub ? 'size-3.5' : undefined}
      />
      <span className="whitespace-nowrap">{label}</span>
      {/* El indicador va en la FILA de la capa que está cargando: es lo que está esperando, y ahí no
          tapa nada del mapa. Un spinner centrado haría parecer que la pantalla entera está bloqueada
          cuando en realidad los pedidos ya se ven. */}
      {cargando && <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" />}
      {nota && !cargando && (
        <span className="whitespace-nowrap text-[10px] font-normal text-muted-foreground">{nota}</span>
      )}
    </label>
  )
}

export function CapasControl({ capas, className }: { capas: CapaMapa[]; className?: string }) {
  const [abierto, setAbierto] = useState(false)

  // Con el panel cerrado, el botón tiene que decir si hay algo prendido: si no, apagar una capa y
  // cerrar el panel deja el mapa cambiado sin ninguna marca de por qué.
  const activas = capas.filter((c) => c.activa).length
  const cargandoAlgo = capas.some((c) => c.cargando)

  return (
    <div
      // `z-[1000]` para quedar sobre los panes de Leaflet; queda contenido por el `isolate` del
      // contenedor del mapa, así que no compite con los popovers de la app.
      className={cn(
        'absolute bottom-3 left-3 z-[1000] overflow-hidden rounded-xl border border-border',
        'bg-card/95 shadow-lg backdrop-blur-sm',
        className,
      )}
    >
      {/* Cabecera = disparador del acordeón. Cerrada es solo el ícono con su contador; abierta agrega el
          título, porque recién ahí hay una lista que nombrar. */}
      <Button
        variant="ghost"
        size={abierto ? 'sm' : 'icon'}
        className={cn('gap-1.5 rounded-lg', abierto ? 'h-8 w-full justify-start px-2' : 'size-8')}
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        title={abierto ? 'Ocultar las capas' : 'Capas del mapa'}
        aria-label={abierto ? 'Ocultar las capas' : 'Capas del mapa'}
      >
        {cargandoAlgo && !abierto ? (
          <Loader2 size={15} className="animate-spin text-muted-foreground" />
        ) : (
          <Layers size={15} className={cn(activas > 0 && 'text-primary')} />
        )}
        {abierto && (
          <>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Capas
            </span>
            <ChevronDown size={13} className="ml-auto text-muted-foreground" />
          </>
        )}
      </Button>

      {/* Despliegue con `grid-template-rows: 0fr → 1fr`: anima la altura REAL del contenido, sin
          max-height a ojo que después se queda corto cuando se agrega una capa.
          El `w-0` NO es redundante: `0fr` colapsa el ALTO, pero el contenido sigue aportando su ancho
          intrínseco a la tarjeta (que es shrink-to-fit), y cerrada quedaba de 32 px de alto por 140 de
          ancho. El ancho salta junto con la cabecera —que también cambia de ícono a ícono+título— así
          que los dos saltos son el mismo gesto: la tarjeta se ensancha y desenrolla. */}
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          abierto ? 'grid-rows-[1fr]' : 'w-0 grid-rows-[0fr]',
        )}
        aria-hidden={!abierto}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-0.5 px-1.5 pb-1.5">
            {capas.map((capa) => (
              <div key={capa.id} className="flex flex-col">
                <FilaCapa
                  label={capa.label}
                  activa={capa.activa}
                  onToggle={capa.onToggle}
                  disabled={capa.disabled}
                  cargando={capa.cargando}
                  nota={capa.nota}
                />

                {/* Segundo nivel: las opciones de la capa, indentadas y colgadas de una guía vertical
                    para que se lea que PERTENECEN a ella y no que son otra capa más. */}
                {capa.subcapas && capa.subcapas.length > 0 && (
                  <div
                    className={cn(
                      'grid transition-[grid-template-rows] duration-200 ease-out',
                      capa.activa ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                    )}
                    aria-hidden={!capa.activa}
                  >
                    <div className="overflow-hidden">
                      <div className="ml-[13px] flex flex-col gap-0.5 border-l border-border pl-2 pt-0.5">
                        {capa.subcapas.map((sub) => (
                          <FilaCapa
                            key={sub.id}
                            label={sub.label}
                            activa={sub.activa}
                            onToggle={sub.onToggle}
                            disabled={!capa.activa}
                            sub
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
