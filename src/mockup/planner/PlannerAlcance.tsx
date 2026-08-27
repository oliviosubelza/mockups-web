// EL ALCANCE DEL PLAN: qué ciudad y qué centro de distribución se está planificando.
//
// ═══ DÓNDE VIVE, Y POR QUÉ TERMINÓ ACÁ ═══
//
// Primero estuvo en la barra de arriba, apretada entre Volver y las herramientas: doce controles en un
// renglón, y la primera víctima era el nombre del centro, truncado a «Distribuidora Discruz · sin
// co…» — justo el dato que estaba ahí para mostrar.
//
// Después salió como TARJETA FLOTANTE propia, y fue peor: la pantalla ya tenía tres capas absolutas
// —la columna izquierda, la barra centrada y el detalle de la derecha—, y una cuarta con `top`/`left`
// fijos no tiene forma de esquivar a las otras.
//
// Ahora es la PRIMERA TARJETA DE LA COLUMNA IZQUIERDA. Esa columna es la única región de la pantalla
// con un layout de verdad —una pila vertical con offsets calculados—, así que puede absorber una
// tarjeta más sin que nada se superponga. Y el orden que queda es el orden del trabajo: sobre qué
// planifico → cómo va → con qué lo armo.
//
// ═══ UNO Y UNO, Y EL CENTRO NO TIENE «TODOS» ═══
//
// Una ciudad y un centro, los dos en modo `unico`. Un plan se ejecuta con una flota que sale de UN
// depósito: planificar «Santa Cruz + Montero» a la vez produce rutas que ninguna distribuidora puede
// correr.
//
// El CENTRO además no ofrece «todos». La ciudad sí —se puede estar mirando el mapa antes de decidir—,
// pero un plan sin centro no existe: los camiones salen de un depósito, y «todos los centros» daría
// una flota de tres distribuidoras cargando en tres galpones para una sola ruta.
//
// ═══ EL PREDETERMINADO SE ELIGE SOLO ═══
//
// Al elegir ciudad se selecciona su centro predeterminado (`distributors.is_default`). Es el que
// recibe lo que ningún contorno cubre, así que es el que un plan nuevo quiere el 90% de las veces —y
// la opción lo dice, para que se entienda por qué apareció ya elegido.
import { Building2, MapPinned } from 'lucide-react'
import { FiltroPopover } from '../FiltroPopover'
import { CIUDAD_IDS, CIUDAD_META, type CiudadId } from '../mock-data'

/** Valor centinela del selector de ciudad: «sin acotar». No es un id. */
export const TODAS = '__todas__'

export interface OpcionCentro {
  value: string
  label: string
  /** Pedidos que le tocan hoy. Se ve el reparto antes de elegir. */
  hint?: number
}

/**
 * Un campo `etiqueta arriba / control abajo`.
 *
 * APILADO Y NO EN FILA: la etiqueta al costado se comía 48 px de los 276 útiles de la columna, que es
 * justo lo que le faltaba al nombre del centro para entrar entero.
 */
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

export function PlannerAlcance({
  ciudad,
  onCiudad,
  pedidosPorCiudad,
  centroId,
  onCentro,
  opcionesCentro,
  centroTieneContorno,
}: {
  /** `null` = todas las ciudades. */
  ciudad: CiudadId | null
  onCiudad: (ciudad: CiudadId | null) => void
  pedidosPorCiudad: Map<CiudadId, number>
  /** `null` = todavía sin elegir. No hay opción «todos»: ver el encabezado. */
  centroId: number | null
  onCentro: (id: number) => void
  opcionesCentro: OpcionCentro[]
  centroTieneContorno: boolean
}) {
  return (
    // Sin ancho ni fondo propios: los pone la columna que la contiene, igual que la tarjeta de
    // métricas de abajo. Dos tarjetas de la misma columna con bordes distintos se leen como dos cosas
    // que cayeron cerca, no como una columna.
    <div className="flex flex-col gap-2 p-2.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Alcance del plan
      </span>

      <Campo label="Ciudad">
        <FiltroPopover
          label="Todas"
          icon={MapPinned}
          modo="unico"
          ancho="w-64"
          active={[ciudad ?? TODAS]}
          onToggle={(v) => onCiudad(v === TODAS ? null : (v as CiudadId))}
          searchPlaceholder="Buscar ciudad…"
          emptyText="Sin ciudades"
          triggerClassName="w-full justify-start"
          options={[
            { value: TODAS, label: 'Todas las ciudades' },
            ...CIUDAD_IDS.map((c) => ({
              value: c,
              label: CIUDAD_META[c].label,
              hint: pedidosPorCiudad.get(c) || undefined,
            })),
          ]}
        />
      </Campo>

      <Campo label="Centro">
        <FiltroPopover
          label="Elegir"
          icon={Building2}
          modo="unico"
          ancho="w-72"
          active={centroId === null ? [] : [String(centroId)]}
          onToggle={(v) => onCentro(Number(v))}
          searchPlaceholder="Buscar centro…"
          emptyText="No hay centros en esta ciudad."
          triggerClassName="w-full justify-start"
          options={opcionesCentro}
        />
      </Campo>

      {/* QUÉ SIGNIFICA EL CENTRO ELEGIDO, en una línea. No es un control: es la regla que la pantalla
          está aplicando, dicha donde se toma la decisión que la activa.

          Acá hubo una casilla «solo dentro del contorno». Se fue cuando cada distribuidora pasó a
          tener contorno sembrado: la casilla quedaba siempre prendida y ofrecía una alternativa que en
          la práctica no existía. Ahora acotar por centro ES acotar por su territorio, y cuando el
          centro no tiene contorno —la única distribuidora de una ciudad, o una recién creada— le tocan
          los pedidos que traen su sello. */}
      <p className="text-[11px] leading-snug text-muted-foreground">
        {centroId === null
          ? 'Elegí un centro: el plan sale de su depósito y toma los pedidos de su territorio.'
          : centroTieneContorno
            ? 'Entran solo los pedidos que caen dentro de su contorno.'
            : 'Este centro no tiene contorno: entran todos los pedidos que le corresponden.'}
      </p>
    </div>
  )
}
