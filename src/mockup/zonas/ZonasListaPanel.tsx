// Listado de zonas como PANEL FLOTANTE sobre el mapa, plegable.
//
// POR QUÉ NO ES UN SplitPane, aunque la pantalla tenga "lista + mapa": las dos pantallas del proyecto
// que lo usaban lo abandonaron y las dos dejaron escrito por qué (`MonitoreoDetalleView.tsx:1-13`,
// `PlannerView.tsx:10-14`). Un panel que EMPUJA le come ancho al mapa, y al abrirlo o cerrarlo Leaflet
// rearma los tiles y se pierde la referencia visual de dónde estabas mirando. En un editor de dibujo es
// peor todavía: el canvas se reencuadraría mientras estás poniendo vértices.
//
// POR QUÉ UNA LISTA Y NO EL `DataTable`: en 320 px de ancho una tabla con filtros y paginado no entra.
// Lo que hace falta acá es encontrar una zona y saltar a ella, no comparar columnas.
//
// ESTE PANEL SOLO SELECCIONA. Las acciones de la zona elegida (editar contorno, encuadrar, activar,
// eliminar) estaban en un pie acá abajo y se fueron a `ZonasAccionesBar`, la barra flotante del centro
// del mapa. Dos razones: estaban a 300 px de la zona sobre la que operaban —seleccionabas un polígono en
// el medio del mapa y los botones aparecían contra el borde izquierdo—, y mezclaban ENCONTRAR con
// OPERAR, así que el panel crecía y se encogía por abajo en cada cambio de selección y el pie tapaba las
// últimas filas justo cuando estabas comparando zonas.
//
// Lo que queda acá es una sola cosa y bien hecha: buscar, filtrar y elegir. La acción se hace donde está
// la zona.
import { AlertTriangle, Ban, MapPin, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TipoConflicto } from '../map/geo/holgura'
import { CIUDAD_META, ciudadDeCityId } from '../mock-data'
import { describirVigencia } from '../restricciones/vigencia'
import { TIPO_ZONA_META, type TipoZona, type Zona } from '../zones-store'

/**
 * SIN FILTRO POR CIUDAD, y no es que sobrara: molestaba.
 *
 * Eran cinco chips (Santa Cruz, Montero, Warnes, La Guardia, Cotoca) que llenaban la fila entera en 320
 * px y empujaban los de ESTADO y TIPO a un segundo y tercer renglón, o directamente fuera de vista. Los
 * dos que quedaron son los que se usan —"mostrame las restricciones", "mostrame las que saqué de
 * circulación"— y ahora entran los tres grupos en un solo renglón.
 *
 * La ciudad no desapareció de la pantalla: sigue en su columna, en cada fila. Es un dato para leer, no
 * una pregunta que alguien haga cincuenta veces por sesión — y para la vez que sí, el buscador de arriba
 * está a un tab de distancia y el mapa ya te muestra cuáles caen dónde.
 */
export interface FiltrosZonas {
  texto: string
  estado?: 'activa' | 'inactiva'
  tipo?: TipoZona
}

const ESTADOS: { label: string; value: 'activa' | 'inactiva' }[] = [
  { label: 'Activas', value: 'activa' },
  { label: 'Inactivas', value: 'inactiva' },
]

/** Sin chip "Todas": deseleccionar el que está activo ES ver todas, igual que en estado. Un
 *  tercer chip para el valor neutro agregaría un estado que ya se puede expresar y, peor, dejaría dos
 *  formas de pedir lo mismo (tocar "Todas" o volver a tocar el que estaba). */
const TIPOS = (Object.keys(TIPO_ZONA_META) as TipoZona[]).map((value) => ({
  value,
  label: TIPO_ZONA_META[value].plural,
}))

export function ZonasListaPanel({
  zonas,
  filtros,
  onFiltros,
  seleccionadaId,
  onSeleccionar,
  onEditar,
  deshabilitado,
  enConflicto,
}: {
  /** Ya filtradas por el llamador: el panel muestra, no decide. */
  zonas: Zona[]
  filtros: FiltrosZonas
  onFiltros: (f: FiltrosZonas) => void
  seleccionadaId: number | null
  onSeleccionar: (id: number | null) => void
  /** Doble click en una fila: el único atajo a una acción que queda en el panel. */
  onEditar: (id: number) => void
  /** `true` mientras se dibuja o edita: el panel queda de consulta y no puede disparar acciones que
   *  cambiarían de zona en medio de un trazo sin guardar. */
  deshabilitado: boolean
  /**
   * Zonas con problema de bordes, para marcarlas en la fila.
   *
   * Va acá además de en el mapa porque una zona en conflicto puede estar fuera de la pantalla: si la
   * marca vive SOLO en el polígono, el que audita tiene que pasear la cámara para encontrar cuáles son.
   * En la lista están todas juntas, y el listado ya es la forma de llegar a una zona.
   */
  enConflicto?: Map<number, TipoConflicto>
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 border-b border-border p-2.5">
        {/* Sin botón "Nueva" acá: crear una zona ya es el primer botón de la barra de arriba, y dos
            botones iguales en la misma pantalla obligan a mantener dos comportamientos sincronizados
            para nada. El buscador se queda con todo el ancho, que es lo que necesita. */}
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filtros.texto}
            onChange={(e) => onFiltros({ ...filtros, texto: e.target.value })}
            placeholder="Buscar zona…"
            className="h-7 pl-7 text-xs"
          />
        </div>

        {/* Filtros como chips y no como <Select>: son pocos valores y alternarlos es un click en vez de
            abrir un desplegable, elegir y que se cierre.
            UN SOLO RENGLÓN (`flex` sin `wrap`): con los cinco chips de ciudad afuera, estado y tipo entran
            justos, y dejarlo envolviendo haría que la fila se partiera en dos por un par de píxeles y el
            listado empezara más abajo sin motivo. */}
        <div className="flex items-center gap-1">
          {ESTADOS.map(({ label, value }) => {
            const activo = filtros.estado === value
            return (
              <Button
                key={value}
                variant={activo ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => onFiltros({ ...filtros, estado: activo ? undefined : value })}
              >
                {label}
              </Button>
            )
          })}
          <span className="mx-0.5 my-auto h-4 w-px bg-border" aria-hidden />
          {/* El filtro por tipo es lo que hace usable la lista con los dos tipos mezclados: "ver solo
              las restricciones" es una pregunta entera —qué le está recortando el mapa al planificador—
              y sin esto habría que leerlas una por una entre las de reparto, que siempre son más. */}
          {TIPOS.map(({ label, value }) => {
            const activo = filtros.tipo === value
            return (
              <Button
                key={value}
                variant={activo ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => onFiltros({ ...filtros, tipo: activo ? undefined : value })}
              >
                {label}
              </Button>
            )
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {zonas.length === 0 ? (
          // DOS vacíos distintos, y desde que la pantalla arranca sin zonas de ejemplo el segundo es el
          // primero que ve cualquiera. "Ninguna zona con estos filtros" delante de una lista que nunca
          // tuvo nada manda a revisar unos chips que no están tocados; el mensaje tiene que decir que
          // falta dibujar, no que falta destildar.
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {filtros.texto || filtros.estado || filtros.tipo
              ? 'Ninguna zona con estos filtros.'
              : 'Todavía no hay zonas. Dibujá la primera con «Nueva zona».'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {zonas.map((zona) => {
              const sel = zona.id === seleccionadaId
              const conflicto = enConflicto?.get(zona.id)
              const ciudad = ciudadDeCityId(zona.cityId)
              const restringida = zona.tipo === 'restringida'
              return (
                <li key={zona.id}>
                  <button
                    type="button"
                    // Un click selecciona (y encuadra); el doble click entra a editar el contorno. Es
                    // el gesto que ya tiene aprendido cualquiera que haya usado un explorador de
                    // archivos, y evita gastar un botón por fila.
                    onClick={() => onSeleccionar(sel ? null : zona.id)}
                    onDoubleClick={() => !deshabilitado && onEditar(zona.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                      sel ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60',
                    )}
                  >
                    <span className="flex w-full items-center gap-2">
                      {/* El ícono de la fila hace de indicador de estado: un conflicto de bordes lo
                          reemplaza por el triángulo, en vez de sumar una segunda marca al renglón. En 320
                          px de ancho cada elemento nuevo le come lugar al nombre, que es lo que se lee. */}
                      {conflicto ? (
                        <AlertTriangle
                          size={13}
                          className={cn(
                            'shrink-0',
                            conflicto === 'solapa' ? 'text-destructive' : 'text-amber-500',
                          )}
                          aria-label={conflicto === 'solapa' ? 'Se pisa con otra zona' : 'Borde demasiado cerca de otra zona'}
                        />
                      ) : restringida ? (
                        // Ícono propio para las restringidas, además del badge: es lo que se lee de un
                        // barrido vertical por la columna de íconos, sin tener que llegar al final de
                        // cada renglón. El `Ban` dice lo mismo que el rojo punteado del mapa.
                        <Ban
                          size={13}
                          className={cn('shrink-0', zona.isActive ? 'text-destructive' : 'text-muted-foreground')}
                        />
                      ) : (
                        <MapPin
                          size={13}
                          className={cn('shrink-0', zona.isActive ? 'text-primary' : 'text-muted-foreground')}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">{zona.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {ciudad ? CIUDAD_META[ciudad].label : `city ${zona.cityId}`}
                      </span>
                      {/* Badge SOLO en las restringidas, no uno por tipo en cada fila. En 320 px de ancho
                          una etiqueta "Reparto" en el 90% de los renglones le come lugar al nombre —que
                          es lo único que se lee para encontrar una zona— para repetir lo que ya es el
                          caso por defecto. Mismo criterio que la píldora "Inactiva", que tampoco tiene su
                          opuesta "Activa". */}
                      {restringida && (
                        <Badge variant="destructive" className="h-4 shrink-0 px-1 text-[10px]">
                          {TIPO_ZONA_META.restringida.label}
                        </Badge>
                      )}
                      {!zona.isActive && (
                        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[10px]">
                          Inactiva
                        </Badge>
                      )}
                    </span>

                    {/* CUÁNDO RIGE, en un segundo renglón y SOLO en las restringidas.
                        No entra en el primero: ahí ya conviven el ícono, el nombre, la ciudad y hasta
                        dos badges en 320 px, y meterle "Lu a Vi · 07:00–19:00" obligaría a truncar el
                        NOMBRE, que es lo único que se usa para encontrar una zona en la lista. Un
                        renglón entero para el resumen es más barato que eso y además lo deja completo.

                        Solo en las restringidas por lo mismo que el badge: en una de reparto el campo
                        no significa nada (ver `zones-store`), así que un "Permanente" en el 90% de las
                        filas sería una columna de ruido que empuja la lista al doble de alto para
                        repetir la misma palabra.

                        SE MUESTRA TAMBIÉN CUANDO ES "Permanente", que es el caso más común. Es
                        deliberado: la pregunta que contesta esta línea no es "¿tiene horario?" sino
                        "¿esto recorta hoy?", y esconderla en el caso permanente dejaría al que audita
                        sin saber si la zona rige siempre o si el dato no está cargado. Con dos
                        restricciones vecinas, una permanente y otra de fin de semana, la diferencia es
                        justo la que hay que ver. */}
                    {restringida && (
                      <span className="w-full pl-[21px] text-[11px] leading-tight text-muted-foreground">
                        {describirVigencia(zona.vigencia)}
                      </span>
                    )}
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
