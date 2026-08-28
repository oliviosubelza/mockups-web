// Panel de abajo: LAS SEIS RUTAS A LA VEZ, una fila cada una, comparables de un vistazo.
//
// POR QUÉ EXISTE SI YA HAY UN PANEL DE RUTAS. El panel de la izquierda muestra UNA ruta a la vez y eso
// está bien pensado: ahí la pregunta es "¿este recorrido tiene sentido?, ¿en qué orden visita?", y para
// esa pregunta las otras cinco rutas son ruido. Pero hay otra pregunta, anterior, que ese panel no puede
// contestar: "¿cuál va apretada y cuál vacía?". Hoy se contesta abriendo el select y mirando ruta por
// ruta —seis clicks para una comparación—, o abriéndolas de a una para leer peso y volumen. Acá las seis
// están escritas juntas: la ocupación, el peso, el volumen y los conteos se leen en columna, y la que se
// pasó salta sola sin que haya que buscarla.
//
// POR QUÉ LA TABLA ES LA REUTILIZABLE Y NO UN `<table>` A MANO. La razón de fondo sigue siendo la
// misma —la comparación es VERTICAL, y para eso las celdas tienen que alinearse entre filas, cosa que
// un `<table>` hace y un montón de divs con flex no—, solo que ese reparto de anchos lo da igual el
// `DataTable` del repo, y encima trae gratis lo que acá se estaba escribiendo a mano o directamente
// faltaba: ORDENAR por cualquier columna (ordenar por ocupación es literalmente la pregunta del
// panel), el SELECTOR DE COLUMNAS (nueve columnas en un panel de 200 px: el que no mira bandeo lo
// apaga), la DENSIDAD, el ancho de cada columna arrastrable, y la PERSISTENCIA de todo eso por
// `tableId` —el orden y las columnas elegidas sobreviven al reload—.
//
// Y hay una razón que antes jugaba en contra y ahora juega a favor: el `DataTable` SIEMPRE dibuja su
// toolbar. Cuando la tabla era a mano eso era peso muerto que no se quería pagar; hoy es justo el
// lugar donde había que poner las herramientas de la flota (ver/ocultar/aislar rutas), que hasta
// ahora vivían escondidas dentro del popover del panel de la izquierda.
//
// SIN PAGINADOR Y SIN BUSCADOR, A PROPÓSITO. Son seis rutas —nueve en el peor caso—: el paginador se
// come 30 px de alto en un panel que arranca en 180 y no divide nada, y buscar entre seis nombres es
// más trabajo que leerlos. El buscador que sí hace falta es el de CLIENTES, y ese vive en el panel de
// la izquierda, sobre las paradas, que son sesenta.
//
// POR QUÉ SE PLIEGA HASTA UNA BARRITA. Arrastrar para abajo NO se detiene en el alto mínimo: pasado el
// piso, el panel se PLIEGA y queda solo su cabecera. Un panel que se resiste a bajar de tres filas
// obliga a cerrarlo del todo para recuperar el mapa, y cerrarlo pierde el rastro de que existía —
// después hay que acordarse de que estaba en el menú "Ver". Plegado sigue diciendo qué es, cuántas
// rutas hay, y se vuelve a abrir con un click o tirando para arriba.
//
// POR QUÉ LA MANIJA DE ARRASTRE VA ARRIBA. El panel está anclado al BORDE DE ABAJO de la pantalla, sobre
// el mapa: su borde de abajo no se mueve, el que se mueve es el de arriba. La manija va donde está el
// movimiento, y arrastrar hacia arriba agranda —de ahí el `yInicial - clientY` del cálculo—.
import { useCallback, useMemo } from 'react'
import { ArrowRight, Boxes, ChevronDown, ChevronUp, Crosshair, Eye, EyeOff, PackageX, X } from 'lucide-react'
import { DataTable, DENSITY, defineColumns } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MAX_CLIENTES_POR_CAMION, type Parada } from '../mock-data'
import { resumenAccesorios, totalAccesorios } from '../accesorios'
import { TEXTO_OCUPACION, cargaDeRuta, type CargaRuta, type RutaPlan } from './planner-model'
import { CentroSelect } from './CentroSelect'
import { usePlannerStore } from './planner-store'
import { useDistribuidorasStore } from '../distribucion/distribuidoras-store'

const fmt = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/**
 * Alto mínimo y máximo del panel, en px. El arrastre recorta contra estos dos números.
 *
 * EL PISO ES 180 Y NO 140 desde que la tabla es el `DataTable`: el componente dibuja SIEMPRE su
 * toolbar —tres botones de ícono, unos 32 px más el gap— y con densidad compacta su encabezado
 * pegajoso mide 28 px. Sumando la manija y la cabecera del panel, arriba de 70 px son cromo antes de
 * la primera fila: en 140 px entraba UNA fila y media, o sea nada que comparar, que es lo único que
 * este panel hace. El techo sigue evitando que el panel se coma el mapa que está tapando — si hace
 * falta más alto que 520 px, la pantalla que se quiere es la de rutas, no esta.
 */
export const RUTAS_TABLA_MIN_PX = 180
export const RUTAS_TABLA_MAX_PX = 520

/**
 * Alto plegado: la manija (5 px), la cabecera (28 px) y los dos píxeles del borde de la tarjeta.
 *
 * Los 2 del borde importan: el `height` del contenedor es su caja CON borde, así que sin contarlos la
 * cabecera queda 2 px recortada por el `overflow-hidden` y su línea de abajo se ve comida.
 *
 * Lo exporta porque `PlannerView` lo necesita para dos cosas que no puede adivinar: el `height` del
 * contenedor y el margen inferior que le declara a la cámara del mapa.
 */
export const RUTAS_TABLA_PLEGADO_PX = 35

/**
 * Cuánto hay que seguir tirando para abajo, pasado el mínimo, para que el panel se pliegue.
 *
 * No se pliega en el mínimo exacto: entre el piso y el pliegue hay una zona muerta para que el que
 * está buscando "lo más chico que sirva" no termine plegándolo de un temblor. Y al revés, desplegar
 * pide subir hasta el mínimo: los dos umbrales son el mismo, así que el gesto no oscila.
 */
const HOLGURA_PLEGADO_PX = 28

/**
 * Id del grupo "Sin asignar".
 *
 * MISMO VALOR que el `SIN_ASIGNAR` de `RutasPanel.tsx`, que no lo exporta. Está duplicado a propósito
 * y no compartido porque compartirlo obligaba a editar ese archivo; el día que uno cambie hay que
 * mover LOS DOS, o esta tabla va a elegir un grupo que el panel de la izquierda no reconoce.
 */
const SIN_ASIGNAR = '__sin-asignar__'

/**
 * Una fila de la tabla. PLANA a propósito, y no `{ ruta, carga }`.
 *
 * `ColumnDefConfig.accessorKey` es `keyof T & string`: la columna solo puede ordenar por un campo que
 * exista EN LA RAÍZ de la fila. Con la forma anidada, ocupación, peso, volumen y conteos quedarían
 * detrás de `carga.` y ninguna de esas seis columnas —justo las que se ordenan— podría declarar
 * accessor; habría que escribir comparadores a mano y perder el orden persistido por `tableId`.
 * Así que la fila se aplana una vez en un `useMemo` y las columnas leen campos sueltos.
 */
interface FilaRuta {
  id: string
  nombre: string
  color: string
  placa: string
  clase: string
  tipo: 'Frío' | 'Seco'
  ocupacionPct: number
  nivel: CargaRuta['nivel']
  excedeClientes: boolean
  pesoTon: number
  capacidadPeso: number
  volumenM3: number
  capacidadVolumen: number
  paradas: number
  pedidos: number
  bandeo: number
  bandeoResumen: string
  /**
   * De dónde sale y a dónde vuelve el camión. Iguales salvo que el plan haya movido la llegada.
   *
   * Se guardan los nombres Y los ids: los nombres para leer y ordenar, los ids porque son el valor de
   * los dos selects de la celda. Las dos se eligen A MANO — ver `cambiarSalida` en `PlannerView`.
   */
  salida: string
  llegada: string
  /** Los ids son los que el select escribe y lee; los nombres, lo que se ordena y se lee. */
  salidaId: number
  llegadaId: number
  /** `true` cuando vuelve a un centro DISTINTO del que salió. Es lo único que hay que destacar. */
  retornaEnOtro: boolean
  oculta: boolean
}

/**
 * Barra de ocupación dentro de una celda.
 *
 * ES EL MISMO LENGUAJE VISUAL que el componente `Ocupacion` de `RutasPanel.tsx`, A PROPÓSITO: barra
 * fina, color de la ruta cuando el nivel es 'ok', ámbar/rosa según el nivel, y el tramo que pasa del
 * 100% pegado a la derecha y RAYADO. Es el mismo dato en dos pantallas de la misma vista y leerlo con
 * dos códigos distintos obligaría a aprenderlo dos veces. No se importa el otro porque es local a ese
 * archivo; se copia el patrón adaptado a una celda —más angosta, sin gap grande— en vez de exportarlo
 * y tocar el archivo de al lado.
 *
 * Recibe `ocupacionPct` y `nivel` sueltos y no una `CargaRuta` entera porque la fila de esta tabla es
 * plana (ver `FilaRuta`) y no tiene un objeto `carga` para pasarle.
 */
function BarraOcupacion({
  ocupacionPct,
  nivel,
  color,
}: {
  ocupacionPct: number
  nivel: CargaRuta['nivel']
  color: string
}) {
  // Mismo criterio que en `RutasPanel`: el exceso se dibuja proporcional con un piso de 6% —al 101%
  // tiene que verse ALGO— y un techo de 40%, para que al 1200% la barra siga siendo una barra.
  const excesoPct =
    ocupacionPct <= 100 ? 0 : Math.min(40, Math.max(6, ((ocupacionPct - 100) / 100) * 40))

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full min-w-0 flex-1 rounded-l-full transition-all duration-500',
            nivel === 'alta' && 'bg-amber-500',
            nivel === 'critica' && 'bg-rose-500',
          )}
          style={{
            width: `${Math.min(100, ocupacionPct)}%`,
            background: nivel === 'ok' ? color : undefined,
          }}
        />
        {excesoPct > 0 && (
          <div
            className={cn(
              'h-full shrink-0 rounded-r-full',
              nivel === 'critica' ? 'bg-rose-600' : 'bg-amber-600',
            )}
            style={{
              width: `${excesoPct}%`,
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0 2px, transparent 2px 4px)',
            }}
          />
        )}
      </div>
      <span
        className={cn(
          'w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums',
          nivel === 'ok' ? 'text-foreground' : TEXTO_OCUPACION[nivel],
        )}
      >
        {ocupacionPct}%
      </span>
    </div>
  )
}

/** Botón fantasma de 20 px para las acciones de la fila. */
function AccionFila({
  titulo,
  onClick,
  children,
}: {
  titulo: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      // La fila entera también tiene click (elegir la ruta). Sin cortar la propagación, tocar el ojo
      // haría además foco en la ruta: dos cosas por un click, y una no se pidió.
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      title={titulo}
      aria-label={titulo}
      className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  )
}

export function RutasTablaPanel({
  rutas,
  paradasAsignadas,
  centrosSalida,
  centrosLlegada,
  onSalida,
  onLlegada,
  alto,
  onAlto,
  plegado,
  onPlegado,
  onCerrar,
}: {
  rutas: RutaPlan[]
  /** Todas las paradas con su asignación aplicada. La carga de cada ruta se calcula acá con `cargaDeRuta`. */
  paradasAsignadas: Parada[]
  /** Centros elegibles como SALIDA. Los arma `PlannerView`: son los del plan, no todos. */
  centrosSalida: { id: number; nombre: string }[]
  /** Centros elegibles como LLEGADA: toda la ciudad, no solo los que el plan trajo. */
  centrosLlegada: { id: number; nombre: string }[]
  onSalida: (rutaId: string, centroId: number) => void
  onLlegada: (rutaId: string, centroId: number) => void
  /**
   * Alto actual del panel en px (lo maneja PlannerView).
   *
   * Plegado, este número NO baja: sigue siendo el alto al que hay que volver. Si el pliegue lo pisara,
   * desplegar tendría que inventar un alto y el panel volvería siempre del mismo tamaño, olvidando el
   * que el usuario había elegido.
   */
  alto: number
  /** Nuevo alto pedido por el arrastre. */
  onAlto: (px: number) => void
  /** Plegado = solo la cabecera. */
  plegado: boolean
  onPlegado: (v: boolean) => void
  onCerrar: () => void
}) {
  const rutaFoco = usePlannerStore((s) => s.rutaFoco)
  const setRutaFoco = usePlannerStore((s) => s.setRutaFoco)
  const rutasOcultas = usePlannerStore((s) => s.rutasOcultas)
  const toggleRutaVisible = usePlannerStore((s) => s.toggleRutaVisible)
  const setRutasOcultas = usePlannerStore((s) => s.setRutasOcultas)
  const accesorios = usePlannerStore((s) => s.accesorios)
  const pedirEncuadre = usePlannerStore((s) => s.pedirEncuadre)

  /**
   * El nombre de un centro por su id. Sale del maestro y no de la ruta porque la ruta guarda ids: el
   * nombre es de la distribuidora, y duplicarlo en la ruta sería tener dos nombres para lo mismo.
   */
  const distribuidoras = useDistribuidorasStore((s) => s.distribuidoras)
  const nombreDeCentro = (id: number) =>
    distribuidoras.find((d) => d.id === id)?.name ?? `Centro ${id}`

  const filas = useMemo<FilaRuta[]>(
    () =>
      rutas.map((ruta) => {
        const carga = cargaDeRuta(paradasAsignadas, ruta)
        const items = accesorios[ruta.id] ?? []
        const salida = nombreDeCentro(ruta.salidaId)
        const llegada = nombreDeCentro(ruta.llegadaId)
        return {
          id: ruta.id,
          nombre: ruta.nombre,
          color: ruta.color,
          placa: ruta.camion.placa,
          clase: ruta.camion.clase,
          tipo: ruta.camion.tipo,
          ocupacionPct: carga.ocupacionPct,
          nivel: carga.nivel,
          excedeClientes: carga.excedeClientes,
          pesoTon: carga.pesoKg / 1000,
          capacidadPeso: ruta.camion.capacidadPeso,
          volumenM3: carga.volumenM3,
          capacidadVolumen: ruta.camion.capacidadVolumen,
          paradas: carga.paradas.length,
          pedidos: carga.pedidos,
          bandeo: totalAccesorios(items),
          bandeoResumen: resumenAccesorios(items),
          salida,
          llegada,
          salidaId: ruta.salidaId,
          llegadaId: ruta.llegadaId,
          retornaEnOtro: ruta.salidaId !== ruta.llegadaId,
          oculta: rutasOcultas.includes(ruta.id),
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rutas, paradasAsignadas, accesorios, rutasOcultas, distribuidoras],
  )

  const columnas = useMemo(
    () =>
      defineColumns<FilaRuta>([
        {
          id: 'ruta',
          header: 'Ruta',
          accessorKey: 'nombre',
          size: 180,
          cell: (f) => (
            <div className="flex items-center gap-2">
              {/* Barra del color de la RUTA, solo en la elegida. El borde de la fila dice "esta está
                  elegida" en el color de marca; esta dice "y es esta ruta" en el color del trazo que
                  el mapa está resaltando. `invisible` y no condicional para que la columna mida
                  siempre igual. */}
              <span
                className={cn('h-5 w-1.5 shrink-0 rounded-full', rutaFoco !== f.id && 'invisible')}
                style={{ background: f.color }}
                aria-hidden
              />
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: f.color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate font-medium">{f.nombre}</span>
              {/* Si la ruta no se está dibujando, la fila tiene que decirlo: la tabla la lista con
                  todos sus números y el mapa no muestra nada, y eso parece un bug. */}
              {f.oculta && (
                <EyeOff
                  size={11}
                  className="shrink-0 text-muted-foreground"
                  aria-label="Oculta en el mapa"
                />
              )}
            </div>
          ),
        },
        {
          id: 'retorno',
          header: 'Sale / vuelve',
          size: 250,
          enableSorting: false,
          // DOS SELECTS Y NO TEXTO. Esto era una celda de lectura y la decisión no tenía dónde
          // tomarse: la salida salía del maestro de flota y la llegada la calculaba el optimizador.
          // Las dos son decisiones operativas —dónde carga, dónde duerme— y se toman ACÁ, mirando la
          // ocupación de cada ruta en la misma fila, que es el dato con el que se deciden.
          cell: (fila) => (
            <div className="flex min-w-0 items-center gap-1">
              <CentroSelect
                valor={fila.salidaId}
                nombre={fila.salida}
                opciones={centrosSalida}
                onElegir={(id) => onSalida(fila.id, id)}
                titulo={`${fila.nombre}: de dónde sale`}
              />
              <ArrowRight
                size={11}
                className={cn(
                  'shrink-0',
                  // Gris cuando abre y cierra en el mismo centro: ahí la flecha es solo la unión de
                  // dos controles. Se marca cuando dice algo, que es el caso nuevo.
                  fila.retornaEnOtro ? 'text-foreground' : 'text-muted-foreground/50',
                )}
              />
              <CentroSelect
                valor={fila.llegadaId}
                nombre={fila.llegada}
                opciones={centrosLlegada}
                onElegir={(id) => onLlegada(fila.id, id)}
                titulo={`${fila.nombre}: a dónde vuelve`}
                destacado={fila.retornaEnOtro}
              />
            </div>
          ),
        },
        {
          id: 'camion',
          header: 'Camión',
          accessorKey: 'placa',
          size: 150,
          // Placa y clase EN LA MISMA LÍNEA: la fila mide 28 px en densidad compacta y dos renglones
          // apilados no entran sin estirar todas las filas por un dato secundario.
          cell: (f) => (
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-[11px]">{f.placa}</span>
              <span className="truncate text-[10px] text-muted-foreground">{f.clase}</span>
            </div>
          ),
        },
        {
          id: 'tipo',
          header: 'Tipo',
          accessorKey: 'tipo',
          size: 70,
          // Una palabra y no un badge: es una columna más de la comparación, y un badge por fila
          // metería seis cápsulas de color compitiendo con las barras de ocupación.
          cell: (f) => (
            <span
              className={cn(
                'text-[11px]',
                f.tipo === 'Frío'
                  ? 'font-medium text-sky-600 dark:text-sky-400'
                  : 'text-muted-foreground',
              )}
            >
              {f.tipo}
            </span>
          ),
        },
        {
          id: 'ocupacionPct',
          header: 'Ocupación',
          accessorKey: 'ocupacionPct',
          size: 130,
          cell: (f) => (
            <BarraOcupacion ocupacionPct={f.ocupacionPct} nivel={f.nivel} color={f.color} />
          ),
        },
        {
          id: 'pesoTon',
          header: 'Peso',
          accessorKey: 'pesoTon',
          size: 110,
          meta: { align: 'right' },
          cell: (f) => (
            <span className="text-[11px] tabular-nums">
              <span className="font-medium">{fmt.format(f.pesoTon)}</span>
              <span className="text-muted-foreground"> / {f.capacidadPeso} t</span>
            </span>
          ),
        },
        {
          id: 'volumenM3',
          header: 'Volumen',
          accessorKey: 'volumenM3',
          size: 120,
          meta: { align: 'right' },
          cell: (f) => (
            <span className="text-[11px] tabular-nums">
              <span className="font-medium">{fmt.format(f.volumenM3)}</span>
              <span className="text-muted-foreground"> / {f.capacidadVolumen} m³</span>
            </span>
          ),
        },
        {
          id: 'paradas',
          header: 'Paradas',
          accessorKey: 'paradas',
          size: 90,
          meta: { align: 'right' },
          // El conteo se pinta cuando pasa el techo de clientes: es la MISMA cifra cambiando de
          // color, no un cartel nuevo al lado. Mismo criterio que el panel de Rutas.
          cell: (f) => (
            <span
              className={cn(
                'text-[11px] tabular-nums',
                f.excedeClientes && 'font-semibold text-amber-600 dark:text-amber-400',
              )}
              title={
                f.excedeClientes
                  ? `Más de ${MAX_CLIENTES_POR_CAMION} clientes en un camión: no le da la jornada aunque le sobre capacidad`
                  : undefined
              }
            >
              {f.paradas}
            </span>
          ),
        },
        {
          id: 'pedidos',
          header: 'Pedidos',
          accessorKey: 'pedidos',
          size: 90,
          meta: { align: 'right' },
          cell: (f) => <span className="text-[11px] tabular-nums">{f.pedidos}</span>,
        },
        {
          id: 'bandeo',
          header: 'Bandeo',
          accessorKey: 'bandeo',
          size: 90,
          meta: { align: 'right' },
          // BANDEO = DATO, NO ACCIÓN. Acá no se abre el diálogo de accesorios: el `AccesoriosDialog`
          // se monta DENTRO de `RutasPanel`, así que si el dock de la izquierda no está en "rutas"
          // ese diálogo no existe y el click no haría nada. Editar el bandeo se sigue haciendo desde
          // el engranaje de la ruta; esta columna solo contesta "¿esta ruta lleva algo además de
          // mercadería?".
          cell: (f) =>
            f.bandeo === 0 ? (
              <span className="text-[11px] text-muted-foreground">—</span>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums"
                title={f.bandeoResumen}
              >
                <Boxes size={11} className="shrink-0 text-muted-foreground" />
                {f.bandeo}
              </span>
            ),
        },
        {
          id: 'acciones',
          header: '',
          size: 70,
          enableSorting: false,
          enableHiding: false,
          meta: { align: 'right' },
          cell: (f) => (
            <div className="flex items-center justify-end gap-0.5">
              <AccionFila
                titulo={f.oculta ? `Mostrar ${f.nombre} en el mapa` : `Ocultar ${f.nombre} del mapa`}
                onClick={() => toggleRutaVisible(f.id)}
              >
                {f.oculta ? <EyeOff size={12} /> : <Eye size={12} />}
              </AccionFila>
              <AccionFila
                titulo={`Encuadrar ${f.nombre} en el mapa`}
                // `pedirEncuadre('ruta')` encuadra la ruta EN FOCO, no una ruta por id: hay que
                // hacer foco ANTES o el mapa vuela a la ruta que estaba elegida.
                onClick={() => {
                  setRutaFoco(f.id)
                  pedirEncuadre('ruta')
                }}
              >
                <Crosshair size={12} />
              </AccionFila>
            </div>
          ),
        },
      ]),
    // `rutaFoco` entra en las deps porque la celda "Ruta" dibuja la barra de la elegida: sin él, las
    // columnas quedan memoizadas con el foco viejo y la barra nunca se mueve de la primera fila.
    [
      pedirEncuadre,
      rutaFoco,
      setRutaFoco,
      toggleRutaVisible,
      centrosSalida,
      centrosLlegada,
      onSalida,
      onLlegada,
    ],
  )

  const sinAsignar = useMemo(() => paradasAsignadas.filter((p) => !p.rutaId), [paradasAsignadas])

  // Los totales de la cabecera se cuentan sobre TODAS las paradas del plan y no sobre las de las rutas:
  // así el resumen cierra con la suma de las filas de abajo, incluida la de "Sin asignar".
  const totalParadas = paradasAsignadas.length
  const totalPedidos = paradasAsignadas.reduce((acc, p) => acc + p.pedidos.length, 0)

  /**
   * Totales del plan: peso, volumen y ocupación promedio.
   *
   * VAN EN LA CABECERA DEL PANEL, no abajo de la tabla, porque el `DataTable` no ofrece `tfoot`: no
   * hay slot para una fila de totales y meterla como una fila más de `data` la haría ordenable —se
   * iría al medio en cuanto alguien ordene por ocupación— y contable en el "N filas". Arriba, además,
   * el total queda pegado al resumen que ya estaba y se lee incluso con el panel plegado.
   */
  const totales = useMemo(() => {
    const pesoTon = filas.reduce((acc, f) => acc + f.pesoTon, 0)
    const volumenM3 = filas.reduce((acc, f) => acc + f.volumenM3, 0)
    const ocupacionPct =
      filas.length === 0
        ? 0
        : Math.round(filas.reduce((acc, f) => acc + f.ocupacionPct, 0) / filas.length)
    return { pesoTon, volumenM3, ocupacionPct }
  }, [filas])

  const enMapa = rutas.length - rutasOcultas.length
  /** "Aislar" necesita una RUTA en foco: `rutaFoco` también puede valer `SIN_ASIGNAR` o `null`. */
  const focoEsRuta = rutas.some((r) => r.id === rutaFoco)

  /**
   * Arrastre del borde de arriba. Mismo patrón que `useSidebarResize`: en el mousedown se capturan la
   * coordenada y el alto INICIALES, y el movimiento se escucha en `document` —no en la manija— porque
   * el puntero se le escapa en cuanto el gesto es rápido y ahí el arrastre se cortaría solo.
   */
  const iniciarArrastre = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const yInicial = e.clientY
      // Plegado, el arrastre arranca desde el alto REAL —la barrita— y no desde `alto`, que guarda el
      // desplegado: si no, tirar un píxel para arriba lo abriría de golpe a 200 px.
      const altoInicial = plegado ? RUTAS_TABLA_PLEGADO_PX : alto

      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'

      const alMover = (ev: MouseEvent) => {
        // Anclado abajo: subir el puntero AGRANDA. De ahí la resta invertida.
        const siguiente = altoInicial + (yInicial - ev.clientY)
        // Pasado el piso menos la holgura, el panel se PLIEGA en vez de quedarse clavado en el mínimo.
        // No se toca `alto`: plegar no es cambiar de tamaño, es esconder el cuerpo.
        if (siguiente < RUTAS_TABLA_MIN_PX - HOLGURA_PLEGADO_PX) {
          onPlegado(true)
          return
        }
        // En la zona muerta —entre el pliegue y el mínimo— no hay nada que hacer: ni plegar ni un alto
        // que sirva. Se deja como está y el gesto sigue.
        if (siguiente < RUTAS_TABLA_MIN_PX) return
        onPlegado(false)
        onAlto(Math.min(RUTAS_TABLA_MAX_PX, siguiente))
      }

      const alSoltar = () => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', alMover)
        document.removeEventListener('mouseup', alSoltar)
      }

      document.addEventListener('mousemove', alMover)
      document.addEventListener('mouseup', alSoltar)
    },
    [alto, onAlto, onPlegado, plegado],
  )

  /**
   * Herramientas de la FLOTA de rutas, en el slot `toolbar` de la tabla.
   *
   * Prender y apagar rutas de a una sirve para AISLAR un recorrido, y aislar es justo lo que más se
   * hace cuando dos rutas se pisan en el mapa: hoy son cinco clicks de ojito en el popover del panel
   * de la izquierda. "Aislar la elegida" lo hace de uno, y va acá y no allá porque acá está la lista
   * completa con sus números: se decide y se aísla sin cambiar de panel.
   */
  const herramientas = (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 shrink-0 px-1.5 text-[11px]"
        title="Mostrar todas las rutas en el mapa"
        disabled={rutasOcultas.length === 0}
        onClick={() => setRutasOcultas([])}
      >
        Ver todas
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 shrink-0 px-1.5 text-[11px]"
        title="Ocultar todas las rutas del mapa"
        disabled={enMapa === 0}
        onClick={() => setRutasOcultas(rutas.map((r) => r.id))}
      >
        Ocultar todas
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-6 shrink-0 px-1.5 text-[11px]"
        title="Dejar en el mapa solo la ruta elegida"
        disabled={!focoEsRuta}
        onClick={() => setRutasOcultas(rutas.filter((r) => r.id !== rutaFoco).map((r) => r.id))}
      >
        Aislar la elegida
      </Button>
      <span className="shrink-0 px-1 text-[11px] tabular-nums text-muted-foreground">
        {enMapa} de {rutas.length} en el mapa
      </span>
      {/* ── "Sin asignar": UN CHIP, NO UNA FILA ──
          Antes era la última fila de la tabla y se la saca a propósito. No es una ruta: no tiene
          camión, ni placa, ni tipo, ni capacidad contra la que medir una ocupación, así que como fila
          obligaba a que las diez columnas toleraran nulos —y a decidir qué dice cada celda vacía, con
          el riesgo de que un 0% se leyera como "va vacío" cuando lo que pasa es que no hay camión—.
          Peor todavía con la tabla reutilizable: una fila así se ordena junto a las otras (se iría al
          medio al ordenar por ocupación) y se cuenta en el total de filas. Como chip dice lo único
          real que tenía —cuánto quedó afuera— y sigue haciendo foco en el grupo. */}
      {sinAsignar.length > 0 && (
        <Button
          // SÓLIDO y no `outline`. Es el único aviso de la barra —lo que quedó afuera del plan— y en
          // outline competía de igual a igual con los dos controles neutros que tiene al lado: mismo
          // peso visual, apenas otro tono. Relleno, se lee de un vistazo sin leerlo.
          variant="default"
          size="sm"
          className="h-6 shrink-0 gap-1 bg-amber-500 px-1.5 text-[11px] text-white hover:bg-amber-600 dark:bg-amber-500 dark:text-white dark:hover:bg-amber-600"
          title="Paradas que no entraron en ningún camión del plan"
          onClick={() => setRutaFoco(SIN_ASIGNAR)}
        >
          <PackageX size={11} className="shrink-0" />
          {sinAsignar.length} sin asignar
        </Button>
      )}
    </>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Manija de arrastre ──
          Cinco píxeles de alto: menos no se agarra, más se lee como una franja de la tarjeta. El grip
          del medio es la única señal de que esto se puede mover, así que se ilumina al pasar por
          encima —un borde sensible sin marca es un borde que nadie descubre—. */}
      <div
        onMouseDown={iniciarArrastre}
        role="separator"
        aria-orientation="horizontal"
        title="Arrastrar para cambiar el alto del panel"
        className="group flex h-[5px] shrink-0 cursor-ns-resize items-center justify-center"
      >
        <span
          className="h-[3px] w-8 rounded-full bg-muted-foreground/30 transition-colors group-hover:bg-muted-foreground/70"
          aria-hidden
        />
      </div>

      {/* ── Cabecera ── */}
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-border px-2">
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Rutas generadas
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] tabular-nums text-muted-foreground">
          {rutas.length} rutas · {totalParadas} paradas · {totalPedidos} pedidos
        </span>
        {/* Los totales del plan (ver `totales`): la suma que la tabla no puede firmar abajo. */}
        <span
          className="shrink-0 truncate text-[11px] tabular-nums text-muted-foreground"
          title="Totales del plan: peso, volumen y ocupación promedio de las rutas"
        >
          {fmt.format(totales.pesoTon)} t · {fmt.format(totales.volumenM3)} m³ ·{' '}
          {totales.ocupacionPct}% prom.
        </span>
        {/* Plegar y CERRAR son dos cosas distintas y por eso son dos botones: plegado el panel sigue
            en pantalla diciendo qué es y cuánto hay —y se vuelve a abrir de un click—; cerrado
            desaparece y hay que ir a buscarlo al menú "Ver". */}
        <button
          type="button"
          onClick={() => onPlegado(!plegado)}
          title={plegado ? 'Desplegar la tabla de rutas' : 'Plegar la tabla de rutas'}
          aria-label={plegado ? 'Desplegar la tabla de rutas' : 'Plegar la tabla de rutas'}
          aria-expanded={!plegado}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {plegado ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={onCerrar}
          title="Cerrar el panel de rutas"
          aria-label="Cerrar el panel de rutas"
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Plegado no se dibuja NADA del cuerpo, y no es solo que no se vea: una tabla recortada a 0 px
          sigue costando su layout y sus filas, y el panel se pliega justo cuando lo que se quiere es
          el mapa. */}
      {plegado ? null : (
        // `fillHeight` pide que el padre sea un flex-col ACOTADO: este envoltorio cede el alto que
        // sobra (`min-h-0 flex-1`) y no scrollea él —scrollea el cuerpo de la tabla, con el encabezado
        // pegado—.
        //
        // Y ES `flex flex-col`, NO UN BLOQUE: con `fillHeight` el DataTable se declara `min-h-0
        // flex-1`, y eso solo mide algo si su padre es flex. Como bloque, el alto de la tabla lo daba
        // su contenido, el `overflow-hidden` de acá lo recortaba, y las filas de abajo desaparecían
        // sin barra de scroll: se veía exactamente como una tabla que no scrollea.
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2">
          <DataTable
            tableId="planner-rutas-generadas"
            columns={columnas}
            data={filas}
            getRowId={(f) => f.id}
            fillHeight
            stickyHeader
            defaultDensity={DENSITY.compact}
            // La pregunta del panel es "¿cuál va apretada?": la tabla arranca contestándola.
            initialSort={{ id: 'ocupacionPct', desc: true }}
            onRowClick={(f) => setRutaFoco(f.id)}
            // La franja vertical del color de la ruta que marcaba la fila en foco ya no se puede: era
            // un `box-shadow: inset` en la primera celda, y las celdas ahora las pinta el DataTable.
            // Queda solo el fondo, que es de todos modos la señal que se lee de lejos.
            rowClassName={(f) =>
              cn(
                'cursor-pointer',
                // CUATRO señales para la fila elegida, y no es de más: es la fila que manda qué
                // resalta el mapa, así que tiene que encontrarse sin leer. Se probó con `bg-accent/60`
                // (invisible en tema claro) y después con `bg-primary/10` (se notaba, no saltaba).
                // Ahora: fondo del color de marca al 20%, texto en negrita, el texto pasa al color de
                // marca, y la barra del color de la ruta en la primera celda.
                //
                // El borde izquierdo lo llevan TODAS las filas, transparente en las no elegidas: si
                // solo lo tuviera la elegida, el contenido de su primera celda se correría 2 px y la
                // tabla temblaría en cada click.
                'border-l-2 border-l-transparent',
                rutaFoco === f.id && 'border-l-primary bg-primary/20 font-semibold text-primary',
                // Una ruta apagada se lee apagada, igual que en el select del panel de la izquierda:
                // mismo dato, menos tinta.
                f.oculta && 'opacity-50',
              )
            }
            emptyTitle="Todavía no hay rutas generadas"
            emptyMessage="Elegí camiones y pedidos, y generá el plan."
            toolbar={herramientas}
          />
        </div>
      )}
    </div>
  )
}
