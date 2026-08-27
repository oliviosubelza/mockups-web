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
// ═══ UNA CIUDAD, VARIOS CENTROS ═══
//
// La ciudad sigue siendo `unico`: planificar «Santa Cruz + Montero» a la vez produce rutas de sesenta
// kilómetros entre paradas que ninguna flota corre.
//
// El CENTRO pasó a multi. El argumento para que fuera uno solo —«un plan sale de un depósito»— vale
// para cada CAMIÓN, no para el plan: dos centros que reparten la misma ciudad se planifican juntos
// porque sus territorios se tocan y sus camiones se cruzan. Y lo que un plan de dos permite es
// justamente lo que se pierde planificando por separado: que un camión salga de uno y VUELVA AL OTRO
// cuando termina más cerca de ese (ver `elegirLlegadas` en `planner-model`).
//
// ═══ AL ELEGIR CIUDAD SE SELECCIONAN TODOS SUS CENTROS ═══
//
// Y no solo el predeterminado. El caso normal es planificar la ciudad entera; acotar a uno es la
// excepción, y una excepción no debería ser el estado inicial. Además con todos elegidos el plan
// arranca pudiendo repartir llegadas entre los depósitos, que es la función nueva — con uno solo esa
// posibilidad ni existe y habría que descubrirla tildando el segundo.
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
  centroIds,
  onCentro,
  opcionesCentro,
  centrosConContorno,
}: {
  /** `null` = todas las ciudades. */
  ciudad: CiudadId | null
  onCiudad: (ciudad: CiudadId | null) => void
  pedidosPorCiudad: Map<CiudadId, number>
  /** Los centros del plan. Vacío = ninguno elegido todavía. */
  centroIds: number[]
  onCentro: (id: number) => void
  opcionesCentro: OpcionCentro[]
  /** Cuántos de los centros elegidos tienen contorno dibujado. Decide qué dice la línea de abajo. */
  centrosConContorno: number
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

      <Campo label={centroIds.length > 1 ? `Centros · ${centroIds.length}` : 'Centro'}>
        {/* MULTI y ya no `unico`. El trigger muestra el contador, que es lo que hace `FiltroPopover`
            en su modo por defecto: con dos centros elegidos, ver el nombre de uno solo mentiría. */}
        <FiltroPopover
          label="Elegir"
          icon={Building2}
          ancho="w-72"
          active={centroIds.map(String)}
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
        {centroIds.length === 0
          ? 'Elegí al menos un centro: el plan sale de sus depósitos y toma los pedidos de sus territorios.'
          : centrosConContorno === centroIds.length
            ? centroIds.length === 1
              ? 'Entran solo los pedidos que caen dentro de su contorno.'
              : 'Entran los pedidos que caen dentro de sus contornos. Un camión puede volver al depósito del otro centro si termina más cerca.'
            : centrosConContorno === 0
              ? 'Sin contorno dibujado: entran todos los pedidos que les corresponden.'
              : 'Los centros con contorno aportan lo que cae adentro; los que no tienen, lo que trae su sello.'}
      </p>
    </div>
  )
}
