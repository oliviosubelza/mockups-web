// Herramientas del mapa de monitoreo: zoom, encuadre y capa base.
//
// POR QUÉ NO USAMOS LOS CONTROLES DE LEAFLET.
// `ZoomControl` y `LayersControl` se anclan a las ESQUINAS del mapa con CSS propio, y esas esquinas
// son exactamente donde viven nuestros paneles flotantes: el de paradas ocupa todo el borde izquierdo
// y el de detalle el derecho. El control quedaba tapado, y como vive dentro del contexto de apilado
// aislado del mapa, no hay z-index que lo saque de ahí.
//
// Una herramienta propia resuelve las dos cosas: se posiciona donde queremos y REACCIONA al estado de
// los paneles — se corre sola cuando el detalle entra. Además queda con el mismo lenguaje visual que
// el resto (tarjeta redondeada, sombra, fondo translúcido) en vez del gris de Leaflet.
//
// Vive DENTRO del MapContainer para poder usar `useMap()`. No compite con los paneles porque nunca se
// superpone con ellos: su posición se calcula desde el mismo margen que usa `fitBounds`.
import {
  Bell,
  BellOff,
  Layers,
  Loader2,
  LocateFixed,
  Maximize2,
  Minus,
  Navigation,
  Plus,
  Truck,
} from 'lucide-react'
import { useMap } from 'react-leaflet'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { encuadrar } from '../map/encuadrar'
// El tipo y los nombres de las capas son de TODO el mockup, no de esta barra: viven en `map/tiles`.
export type { CapaBase } from '../map/tiles'
import { CAPAS_BASE, CAPA_POR_DEFECTO, type CapaBase } from '../map/tiles'
import { IconoConFlecha, useMenuHover } from '../map/menu-mapa'
import { CLAVES_TRAZO, TRAZO, TRAZO_LABEL, type ClaveTrazo } from './trazo-estilo'
import type { LatLngTuple } from '../map/geo/polyline'

/**
 * Botón de la barra. Chico y cuadrado: es una herramienta, no una acción de la pantalla.
 *
 * `activo` es para las que son INTERRUPTOR y no disparador (seguir al camión, ver solo el tramo). Un
 * interruptor tiene que decir en qué estado está sin que haya que probarlo: se marca con fondo y
 * color, no solo con el ícono, porque a 15px la diferencia entre dos íconos parecidos no se ve.
 */
function Herramienta({
  etiqueta,
  onClick,
  disabled,
  activo,
  children,
}: {
  etiqueta: string
  onClick: () => void
  disabled?: boolean
  activo?: boolean
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('size-8 rounded-lg', activo && 'bg-primary/10 text-primary hover:bg-primary/15')}
      onClick={onClick}
      disabled={disabled}
      title={etiqueta}
      aria-label={etiqueta}
      aria-pressed={activo}
    >
      {children}
    </Button>
  )
}

export function HerramientasMapa({
  recorrido,
  /** Dónde está el camión ahora. `null` = no salió o ya volvió: el botón de centrar se deshabilita. */
  posicionCamion,
  capa,
  onCapa,
  /**
   * Dónde apoyar la barra. Lo decide la VISTA y no este componente: es la que sabe dónde están sus
   * paneles y cuánto miden. El mapa no tiene por qué enterarse del layout que lo rodea.
   */
  ancla,
  /** Seguimiento automático encendido. Lo apaga el propio mapa cuando el usuario arrastra. */
  seguir,
  onSeguir,
  /** Vista de tramo: solo el trecho del camión a su próxima parada. */
  soloTramo,
  onSoloTramo,
  /** `false` cuando no hay camión o no queda parada por delante: la vista de tramo no aplica. */
  hayTramo,
  /** Capa de mercados (polígonos de zona de venta). Arranca APAGADA en esta pantalla. */
  verMercados,
  onVerMercados,
  /** Nombres de parada fijos sobre el mapa en vez de solo al pasar el mouse. */
  verEtiquetas,
  onVerEtiquetas,
  /** Trazos apagados. El estilo y el nombre de cada uno salen de `trazo-estilo`, no de props. */
  trazosOcultos,
  onAlternarTrazo,
  /**
   * Hay algo que el mapa DIBUJA viajando por red: los mercados, el recorrido por calles, o los dos. El
   * botón de capas muestra el spinner en lugar de su ícono. Es un solo indicador para las dos cosas a
   * propósito: al usuario no le sirve saber CUÁL falta, le sirve saber que el mapa todavía no está entero.
   */
  cargandoCapas = false,
  /** Avisos (toasts) de los eventos del viaje. Preferencia persistida; arranca apagada. */
  notificaciones,
  onNotificaciones,
  /** Mismos márgenes que usa `fitBounds`, para que "Encuadrar" no meta paradas debajo de un panel. */
  margenDer,
  margenIzq,
}: {
  recorrido: LatLngTuple[]
  posicionCamion: LatLngTuple | null
  capa: CapaBase
  onCapa: (capa: CapaBase) => void
  ancla: { top: number; left: number }
  seguir: boolean
  onSeguir: (seguir: boolean) => void
  soloTramo: boolean
  onSoloTramo: (solo: boolean) => void
  hayTramo: boolean
  verMercados: boolean
  onVerMercados: (ver: boolean) => void
  verEtiquetas: boolean
  onVerEtiquetas: (ver: boolean) => void
  trazosOcultos: ClaveTrazo[]
  onAlternarTrazo: (clave: ClaveTrazo) => void
  cargandoCapas?: boolean
  notificaciones: boolean
  onNotificaciones: (activas: boolean) => void
  margenDer: number
  margenIzq: number
}) {
  const map = useMap()
  const margenes = { margenIzq, margenDer }

  // Apertura por hover + flecha: el patrón compartido de las barras de mapa. Ver `map/menu-mapa`.
  const menu = useMenuHover()
  // El botón se pinta cuando el mapa NO está en su estado por defecto: otro fondo, una capa extra o algún
  // trazo apagado. Sin esto, un mapa al que le falta media información se ve igual que uno completo y se
  // pierde tiempo buscando una línea que alguien apagó hace media hora.
  const hayAlgoCambiado =
    capa !== CAPA_POR_DEFECTO || verMercados || verEtiquetas || trazosOcultos.length > 0

  return (
    <div
      // `z-[1000]` supera los panes internos de Leaflet (400-700). Queda contenido por el `isolate`
      // del contenedor del mapa, así que no compite con los overlays de la app.
      className={cn(
        'absolute z-[1000] flex flex-col overflow-hidden rounded-xl border border-border',
        // La transición dura lo mismo que la del panel: la barra viaja PEGADA a su borde en vez de
        // saltar cuando el panel termina de moverse.
        'bg-card/95 shadow-lg backdrop-blur-sm transition-[top,left] duration-300 ease-out',
      )}
      style={{ top: ancla.top, left: ancla.left }}
    >
      <Herramienta etiqueta="Acercar" onClick={() => map.zoomIn()}>
        <Plus size={15} />
      </Herramienta>
      <Herramienta etiqueta="Alejar" onClick={() => map.zoomOut()}>
        <Minus size={15} />
      </Herramienta>

      <span className="mx-1.5 h-px bg-border" aria-hidden />

      {/* Volver AL CAMIÓN. Es la herramienta más usada de una pantalla de vigilancia. Además vuelve a
          ENCENDER el seguimiento: pedir el camión es decir "quiero mirarlo a él", y obligar a apretar
          dos botones para eso sería trámite. */}
      <Herramienta
        etiqueta={posicionCamion ? 'Centrar en el camión' : 'El camión no está en ruta'}
        onClick={() => {
          if (!posicionCamion) return
          encuadrar(map, [posicionCamion], { ...margenes, zoomMax: 15 })
          onSeguir(true)
        }}
        disabled={!posicionCamion}
      >
        <Truck size={15} />
      </Herramienta>

      {/* SEGUIR. Es un interruptor y no una acción: dice si el mapa se va a mover solo cuando el
          camión se salga de cuadro. Se apaga solo en cuanto el usuario arrastra el mapa —el mapa
          nunca le pelea la vista a quien la está manejando—, y este botón es cómo se vuelve a
          encender. Sin él, el apagado automático sería una función invisible que no se puede deshacer. */}
      <Herramienta
        etiqueta={seguir ? 'Dejar de seguir al camión' : 'Seguir al camión automáticamente'}
        onClick={() => onSeguir(!seguir)}
        disabled={!posicionCamion}
        activo={seguir && !!posicionCamion}
      >
        <LocateFixed size={15} />
      </Herramienta>

      {/* Volver al recorrido completo: la vista de conjunto, para saber cuánto le falta. */}
      <Herramienta etiqueta="Encuadrar el recorrido" onClick={() => encuadrar(map, recorrido, margenes)}>
        <Maximize2 size={14} />
      </Herramienta>

      {/* TRAMO SIGUIENTE. El recorrido completo contesta "¿cuánto le falta?"; el tramo contesta "¿qué
          está haciendo ahora?". Con quince paradas dibujadas, la segunda pregunta se pierde entre las
          líneas de las otras trece. */}
      <Herramienta
        etiqueta={
          !hayTramo
            ? 'No hay próxima parada que resaltar'
            : soloTramo
              ? 'Ver el recorrido completo'
              : 'Ver solo el tramo a la próxima parada'
        }
        onClick={() => onSoloTramo(!soloTramo)}
        disabled={!hayTramo}
        activo={soloTramo && hayTramo}
      >
        <Navigation size={14} />
      </Herramienta>

      <span className="mx-1.5 h-px bg-border" aria-hidden />

      {/* CAPAS: un menú, no un botón por capa.
          Con dos fondos alcanzaba un toggle —el botón anunciaba a dónde iba— pero con tres deja de
          funcionar: un ciclo de tres estados obliga a pasar por el que no se quiere para llegar al que
          sí, y el ícono ya no puede decir dónde estás. Es el mismo menú que el editor de planificación,
          por el mismo motivo, y además se lleva adentro los interruptores que antes eran botones mudos
          en esta misma barra. */}
      <DropdownMenu open={menu.abierto} onOpenChange={menu.setAbierto}>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            'relative size-8 gap-px rounded-lg',
            hayAlgoCambiado && 'text-primary',
          )}
          title="Capas y trazos del mapa"
          aria-label="Capas y trazos del mapa"
          {...menu.trigger}
        >
          {/* El menú de esta barra sale hacia la DERECHA (`side="right"`): está pegada al borde izquierdo
              del mapa y el panel se despliega hacia adentro. `IconoConFlecha` pone la flecha de ese lado y
              apuntando para allá.

              EL TAMAÑO DEL ÍCONO VA COMO CLASE `size-*` y no como prop de Lucide: `buttonVariants` trae
              `[&_svg:not([class*='size-'])]:size-4`, y ese CSS le gana a los atributos width/height que
              Lucide escribe con su prop `size`. Sin la clase, ícono y flecha se dibujan los dos a 16 px
              —33 px de contenido en un botón de 32— y la flecha deja de leerse como una flecha chica. */}
          <IconoConFlecha side="right">
            {cargandoCapas ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Layers className="size-3.5" />
            )}
          </IconoConFlecha>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          side="right"
          className="w-48"
          {...menu.contenido}
        >
          <DropdownMenuRadioGroup value={capa} onValueChange={(v) => onCapa(v as CapaBase)}>
            {/* El label va DENTRO del grupo: es `Menu.GroupLabel` de Base UI y revienta sin un
                `Menu.Group` o `Menu.RadioGroup` de ancestro. */}
            <DropdownMenuLabel className="text-xs">Fondo</DropdownMenuLabel>
            {CAPAS_BASE.map((fondo) => (
              <DropdownMenuRadioItem key={fondo.valor} value={fondo.valor} className="text-xs">
                {fondo.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs">Capas</DropdownMenuLabel>
            {/* MERCADOS. Arranca APAGADO: esta pantalla ya tiene el recorrido, las paradas con su estado
                y el camión moviéndose; sumarle once polígonos de fondo por defecto convierte la
                vigilancia en un mapa temático. Queda a mano para cuando sí importa — "¿esta entrega
                fallida es del mercado que venimos teniendo problemas?". */}
            <DropdownMenuCheckboxItem
              checked={verMercados}
              onCheckedChange={onVerMercados}
              className="text-xs"
            >
              Mercados
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={verEtiquetas}
              onCheckedChange={onVerEtiquetas}
              className="text-xs"
            >
              Nombres de parada
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {/* TRAZOS. Cada línea contesta una pregunta distinta —qué pasó, qué falta, qué está pasando— y
                a veces las otras dos estorban: para mirar la maniobra de ahora, el recorrido de las siete
                paradas anteriores es ruido. La muestra de color al lado del nombre es la que hace que la
                lista sea usable sin haber memorizado la leyenda. */}
            <DropdownMenuLabel className="text-xs">Trazos</DropdownMenuLabel>
            {CLAVES_TRAZO.map((clave) => (
              <DropdownMenuCheckboxItem
                key={clave}
                checked={!trazosOcultos.includes(clave)}
                onCheckedChange={() => onAlternarTrazo(clave)}
                className="gap-2 text-xs"
              >
                <span
                  className="shrink-0 rounded-full"
                  style={{
                    width: 14,
                    height: TRAZO[clave].weight,
                    background: TRAZO[clave].color,
                    opacity: TRAZO[clave].opacity,
                  }}
                  aria-hidden
                />
                {TRAZO_LABEL[clave]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="mx-1.5 h-px bg-border" aria-hidden />

      {/* AVISOS. Arranca apagado y es opt-in: una pantalla de vigilancia que empieza a tirar toasts sin
          que nadie los pidiera es ruido, y el operador que la dejó abierta en otro monitor no quiere que
          le salte nada. Apagarlos no detiene la simulación ni el stream — solo el aviso.
          El ícono es campana / campana tachada y no una campana con color: acá el estado APAGADO es una
          decisión activa del usuario, y merece verse como tal y no como "nada". */}
      <Herramienta
        etiqueta={notificaciones ? 'Desactivar los avisos de eventos' : 'Activar los avisos de eventos'}
        onClick={() => onNotificaciones(!notificaciones)}
        activo={notificaciones}
      >
        {notificaciones ? <Bell size={15} /> : <BellOff size={15} />}
      </Herramienta>
    </div>
  )
}
