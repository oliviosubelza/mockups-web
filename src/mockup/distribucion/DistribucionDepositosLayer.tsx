// Los DEPÓSITOS de las distribuidoras de la ciudad, dibujados en el mapa.
//
// ═══ POR QUÉ ESTA CAPA ES OBLIGATORIA Y NO UN ADORNO ═══
//
// Sin ella la pantalla no se puede usar. La consigna es "recortá el territorio de esta distribuidora", y
// sin ver dónde está su depósito eso es una consigna sobre un mapa vacío: no hay forma de saber de qué
// lado de la ciudad empezar a dibujar, ni por qué esta distribuidora debería quedarse con el norte y no
// con el sur. El depósito es el ancla física de la que cuelga toda la decisión — un pedido se le asigna a
// quien lo puede despachar, y eso depende de qué tan lejos está.
//
// Se dibuja SIEMPRE, en los tres modos. Explorando es lo que se clickea para elegir; dibujando la zona es
// la referencia; y editando la distribuidora ES el objeto que se está moviendo.
//
// ═══ EL DETALLE QUE ROMPERÍA EL DIBUJO: `interactive` ═══
//
// Un `Marker` de Leaflet se COME el click. Si los depósitos quedaran interactivos mientras se traza un
// polígono, cada click que cayera encima de uno no pondría un vértice — y como el depósito de la
// distribuidora que estás dibujando está, por definición, en el medio de la zona que querés recortar, el
// problema aparecería justo en el peor lugar. Por eso `interactivo` cuelga del modo.
//
// La excepción es el marcador que se está ARRASTRANDO: ese tiene que recibir el mouse, y ahí el click del
// mapa no crea vértices, así que no compiten.
//
// ═══ EL RÓTULO ES CONFIGURABLE ═══
//
// Tres opciones, del menú de aspecto (ver `RotuloDeposito`): nombre completo, solo la inicial, o solo el
// ícono. Con dos depósitos cerca las etiquetas se pisan y tapan justamente el borde que se está mirando;
// con el mapa vacío, el nombre es lo que contesta «¿cuál es cuál?» sin pasar el mouse. Ninguna de las tres
// sirve para las dos situaciones, así que se elige.
//
// El depósito EN EDICIÓN se rotula igual sin importar la opción: es el único objeto de la pantalla en ese
// momento, y esconderle el nombre no ahorra ruido — agrega duda.
import { Marker, Pane, Tooltip } from 'react-leaflet'
import { Warehouse } from 'lucide-react'
import { reactIcon } from '../map/div-icon'
import type { LatLngTuple } from '../map/geo/polyline'
import type { RotuloDeposito } from './distribucion-mapa-store'

/** Encima de los polígonos (pane `zonas`, z 340) y de la geometría en curso: un depósito tapado por su
 *  propio relleno no sirve de referencia. */
export const PANE_DEPOSITOS = 'distribucion-depositos'
const Z_PANE = 480

/** Verde del módulo, el mismo con el que se dibuja la zona. */
const VERDE = '#059669'
const GRIS = '#64748b'
/** Ámbar para el que se está posicionando: el mismo color que el indicador de imantado, y por el mismo
 *  motivo — es un objeto EN CURSO, no un dato guardado. */
const AMBAR = '#d97706'

export interface Deposito {
  distributorId: number
  nombre: string
  posicion: LatLngTuple
  /** Ya tiene polígono dibujado. Cambia el color: es el estado que se lee de un vistazo. */
  conZona: boolean
  /** La distribuidora está en circulación (`distributors.is_active`). */
  activa: boolean
}

/**
 * El disco del depósito.
 *
 * CUATRO ESTADOS Y CUATRO PESOS, en este orden de prioridad:
 *   · `posicionando` → ámbar, grande, con aro: es el objeto que se está moviendo AHORA.
 *   · `enEdicion`    → verde grande con aro: es la dueña de la zona que se está dibujando.
 *   · `seleccionado` → verde lleno, mediano.
 *   · el resto       → verde si tiene zona, gris punteado si no. El punteado dice "esto está pendiente"
 *     con el mismo código que usan las zonas inactivas en `ZonasLayer`, así que no hay que aprender un
 *     segundo lenguaje.
 * Una distribuidora INACTIVA va gris y con menos opacidad en cualquiera de esos casos: no despacha nada,
 * así que su territorio no está en juego.
 */
function pinDeposito({
  conZona,
  activa,
  seleccionado,
  enEdicion,
  posicionando,
  inicial,
}: {
  conZona: boolean
  activa: boolean
  seleccionado: boolean
  enEdicion: boolean
  posicionando: boolean
  /** Letra dentro del disco, o `null` para dibujar el ícono. */
  inicial: string | null
}) {
  const destacado = posicionando || enEdicion
  const lado = destacado ? 34 : seleccionado ? 28 : 24
  const color = posicionando ? AMBAR : !activa ? GRIS : conZona || enEdicion ? VERDE : GRIS
  return reactIcon(
    <div
      style={{
        width: lado,
        height: lado,
        borderRadius: 999,
        background: color,
        // El aro exterior es lo que distingue al destacado sin cambiarle el color: entre discos verdes
        // iguales, el tamaño solo no alcanza a esa escala.
        border: destacado ? '3px solid #fff' : conZona && activa ? '2px solid #fff' : '2px dashed #fff',
        boxSizing: 'border-box',
        boxShadow: destacado
          ? `0 0 0 3px ${color}66, 0 2px 6px rgb(0 0 0 / 0.45)`
          : '0 2px 6px rgb(0 0 0 / 0.4)',
        opacity: activa ? 1 : 0.55,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        cursor: posicionando ? 'grab' : enEdicion ? 'default' : 'pointer',
      }}
    >
      {/* LA INICIAL REEMPLAZA AL ÍCONO, no se apila con él: en un disco de 24 px no entran los dos, y
          entre "es un depósito" —que ya lo dicen la forma y el color— y "es el de Discruz" gana lo
          segundo, que es lo que no se puede deducir de nada más. */}
      {inicial ? (
        <span
          style={{
            fontSize: destacado ? 15 : 12,
            fontWeight: 700,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          {inicial}
        </span>
      ) : (
        <Warehouse size={destacado ? 17 : seleccionado ? 14 : 12} strokeWidth={2.25} />
      )}
    </div>,
    lado,
  )
}

/** La inicial del nombre, salteando el «Distribuidora » que llevan todas: con ese prefijo los diez
 *  depósitos mostrarían una «D» y la opción no distinguiría nada. */
function inicialDe(nombre: string): string {
  const limpio = nombre.replace(/^distribuidora\s+/i, '').trim()
  return (limpio || nombre).charAt(0).toUpperCase()
}

export function DistribucionDepositosLayer({
  depositos,
  seleccionadaId,
  enEdicionId,
  /** El depósito que se está posicionando: se dibuja ámbar y ARRASTRABLE. */
  posicionandoId,
  rotulo,
  onSeleccionar,
  onMover,
  /** `false` mientras se dibuja un polígono: los clicks tienen que llegar al mapa. Ver el encabezado. */
  interactivo,
}: {
  depositos: Deposito[]
  seleccionadaId: number | null
  enEdicionId: number | null
  posicionandoId: number | null
  rotulo: RotuloDeposito
  onSeleccionar: (distributorId: number | null) => void
  onMover: (posicion: LatLngTuple) => void
  interactivo: boolean
}) {
  if (depositos.length === 0) return null

  return (
    <Pane name={PANE_DEPOSITOS} style={{ zIndex: Z_PANE }}>
      {depositos.map((deposito) => {
        const seleccionado = deposito.distributorId === seleccionadaId
        const enEdicion = deposito.distributorId === enEdicionId
        const posicionando = deposito.distributorId === posicionandoId
        // El que se arrastra SIEMPRE recibe el mouse, aunque el resto esté apagado.
        const recibeMouse = interactivo || posicionando
        // El destacado se rotula igual pase lo que pase con la opción: es el único objeto en juego.
        const conNombre = rotulo === 'nombre' || posicionando || enEdicion
        const inicial =
          rotulo === 'inicial' && !posicionando && !enEdicion ? inicialDe(deposito.nombre) : null
        return (
          <Marker
            // EL `recibeMouse` VA EN LA `key`, Y NO ES PARANOIA. Verificado en el fuente de react-leaflet:
            // `updateMarker` re-aplica `position`, `icon`, `zIndexOffset`, `opacity` y `draggable` (ese sí,
            // con enable/disable) — pero `interactive` se pasa a `new L.Marker(...)` al CREARLO y nunca se
            // vuelve a mirar. Sin remontar, entrar a dibujar dejaría los depósitos comiéndose el click y no
            // habría forma de poner un vértice encima de uno. Cambia una vez por cambio de modo y son un
            // puñado de marcadores: el remonte no se nota.
            key={`${deposito.distributorId}-${recibeMouse ? 'on' : 'off'}`}
            position={deposito.posicion}
            // `key` en el ícono no alcanza: react-leaflet cambia el ícono con `setIcon`, y eso sí se
            // aplica en vivo. Se reconstruye en cada render de estado porque `divIcon` es HTML estático.
            icon={pinDeposito({
              conZona: deposito.conZona,
              activa: deposito.activa,
              seleccionado,
              enEdicion,
              posicionando,
              inicial,
            })}
            interactive={recibeMouse}
            draggable={posicionando}
            eventHandlers={{
              click: () =>
                interactivo &&
                !posicionando &&
                onSeleccionar(seleccionado ? null : deposito.distributorId),
              // Solo en `dragend` y no en cada `drag`: los inputs de latitud y longitud del formulario se
              // reescribirían en cada mousemove, y con el cursor dentro de uno de ellos eso pelearía con
              // lo que estás tipeando. Al soltar, una sola vez.
              dragend: (evento) => {
                const { lat, lng } = (evento.target as L.Marker).getLatLng()
                onMover([lat, lng])
              },
            }}
          >
            {conNombre && (
              <Tooltip
                // El `key` fuerza el remontaje al cambiar de estado: Leaflet fija el `className` al CREAR
                // el tooltip y no lo re-aplica. Es la misma trampa documentada en `ZonasLayer`.
                key={seleccionado || enEdicion || posicionando ? 'fuerte' : 'normal'}
                permanent
                direction="bottom"
                offset={[0, 4]}
                pane="tooltipPane"
                className={
                  seleccionado || enEdicion || posicionando
                    ? 'zona-etiqueta zona-etiqueta-sel'
                    : 'zona-etiqueta'
                }
              >
                {deposito.nombre}
                {/* El sub-rótulo dice lo que FALTA o lo que está apagado, nunca lo que está bien: una zona
                    dibujada y activa no necesita decir nada. */}
                {!deposito.activa ? (
                  <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, opacity: 0.75 }}>
                    inactiva
                  </span>
                ) : !deposito.conZona ? (
                  <span style={{ display: 'block', fontSize: '9px', fontWeight: 500, opacity: 0.75 }}>
                    sin zona
                  </span>
                ) : null}
              </Tooltip>
            )}
          </Marker>
        )
      })}
    </Pane>
  )
}
