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
// POR QUÉ ES UNA TABLA DE VERDAD Y NO FILAS DE DIVS. Todo el sentido de esta pantalla es la comparación
// VERTICAL: el 118% de la ruta 3 vale porque al lado está el 41% de la ruta 4, y para eso las celdas
// tienen que alinearse entre filas. Con divs y flex cada fila negocia sus anchos por su cuenta según lo
// que le tocó de contenido —una placa más larga, un volumen de tres dígitos— y las columnas se
// desalinean justo cuando hay más para comparar. `<table>` reparte el ancho una vez para todas.
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
import { Boxes, ChevronDown, ChevronUp, Crosshair, Eye, EyeOff, PackageX, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MAX_CLIENTES_POR_CAMION, type Parada } from '../mock-data'
import { resumenAccesorios, totalAccesorios } from '../accesorios'
import { TEXTO_OCUPACION, cargaDeRuta, type CargaRuta, type RutaPlan } from './planner-model'
import { usePlannerStore } from './planner-store'

const fmt = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/**
 * Alto mínimo y máximo del panel, en px. El arrastre recorta contra estos dos números.
 *
 * El piso deja ver la cabecera y dos o tres filas: menos que eso no es un panel chico, es un panel que
 * no sirve para nada y conviene cerrar. El techo evita que el panel se coma el mapa que está tapando —
 * si hace falta más alto que 520 px, la pantalla que se quiere es la de rutas, no esta.
 */
export const RUTAS_TABLA_MIN_PX = 140
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

/** Alto de fila y padding, una sola vez: son nueve celdas y a mano se despintan de a una. */
const CELDA = 'h-7 px-2 align-middle'

/**
 * Barra de ocupación dentro de una celda.
 *
 * ES EL MISMO LENGUAJE VISUAL que el componente `Ocupacion` de `RutasPanel.tsx`, A PROPÓSITO: barra
 * fina, color de la ruta cuando el nivel es 'ok', ámbar/rosa según el nivel, y el tramo que pasa del
 * 100% pegado a la derecha y RAYADO. Es el mismo dato en dos pantallas de la misma vista y leerlo con
 * dos códigos distintos obligaría a aprenderlo dos veces. No se importa el otro porque es local a ese
 * archivo; se copia el patrón adaptado a una celda —más angosta, sin gap grande— en vez de exportarlo
 * y tocar el archivo de al lado.
 */
function BarraOcupacion({ carga, color }: { carga: CargaRuta; color: string }) {
  const { nivel, ocupacionPct } = carga
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
  alto,
  onAlto,
  plegado,
  onPlegado,
  onCerrar,
}: {
  rutas: RutaPlan[]
  /** Todas las paradas con su asignación aplicada. La carga de cada ruta se calcula acá con `cargaDeRuta`. */
  paradasAsignadas: Parada[]
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
  const accesorios = usePlannerStore((s) => s.accesorios)
  const pedirEncuadre = usePlannerStore((s) => s.pedirEncuadre)

  const filas = useMemo(
    () => rutas.map((r) => ({ ruta: r, carga: cargaDeRuta(paradasAsignadas, r) })),
    [rutas, paradasAsignadas],
  )

  const sinAsignar = useMemo(() => paradasAsignadas.filter((p) => !p.rutaId), [paradasAsignadas])

  // Los totales de la cabecera se cuentan sobre TODAS las paradas del plan y no sobre las de las rutas:
  // así el resumen cierra con la suma de las filas de abajo, incluida la de "Sin asignar".
  const totalParadas = paradasAsignadas.length
  const totalPedidos = paradasAsignadas.reduce((acc, p) => acc + p.pedidos.length, 0)

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

  /** Elegir con teclado la fila que tiene el foco. Espacio se corta o la página scrollea. */
  const alTeclear = (e: React.KeyboardEvent, id: string) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    setRutaFoco(id)
  }

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
      {plegado ? null : rutas.length === 0 ? (
        <p className="flex min-h-0 flex-1 items-center justify-center px-4 text-center text-xs text-muted-foreground">
          Todavía no hay rutas generadas.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-xs">
            {/* El `sticky` va en los `th` y no solo en el `thead`: el navegador no pega un `thead`
                completo de forma confiable, pero sí cada celda de encabezado. */}
            <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-muted/40">
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="h-6 px-2 text-left font-semibold">Ruta</th>
                <th className="h-6 px-2 text-left font-semibold">Camión</th>
                <th className="h-6 px-2 text-left font-semibold">Tipo</th>
                <th className="h-6 w-40 px-2 text-left font-semibold">Ocupación</th>
                <th className="h-6 px-2 text-right font-semibold">Peso</th>
                <th className="h-6 px-2 text-right font-semibold">Volumen</th>
                <th className="h-6 px-2 text-right font-semibold">Paradas</th>
                <th className="h-6 px-2 text-right font-semibold">Pedidos</th>
                <th className="h-6 px-2 text-right font-semibold">Bandeo</th>
                <th className="h-6 w-14 px-2 text-right font-semibold">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ ruta, carga }) => {
                const enFoco = rutaFoco === ruta.id
                const oculta = rutasOcultas.includes(ruta.id)
                const items = accesorios[ruta.id] ?? []
                const bandeo = totalAccesorios(items)

                return (
                  <tr
                    key={ruta.id}
                    tabIndex={0}
                    onClick={() => setRutaFoco(ruta.id)}
                    onKeyDown={(e) => alTeclear(e, ruta.id)}
                    className={cn(
                      'cursor-pointer border-b border-border/60 outline-none transition-colors focus-visible:bg-accent/60',
                      enFoco ? 'bg-accent/60' : 'hover:bg-muted/50',
                      // Una ruta apagada se lee apagada, igual que en el select del panel de la
                      // izquierda: mismo dato, menos tinta.
                      oculta && 'opacity-50',
                    )}
                  >
                    {/* La barra vertical del color va como sombra INTERNA de la primera celda y no del
                        `<tr>`: con `border-collapse` el navegador no dibuja `box-shadow` sobre una
                        fila, pero sí sobre sus celdas. */}
                    <td
                      className={cn(CELDA, 'max-w-40')}
                      style={enFoco ? { boxShadow: `inset 2px 0 0 ${ruta.color}` } : undefined}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: ruta.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">{ruta.nombre}</span>
                        {/* Si la ruta no se está dibujando, la fila tiene que decirlo: la tabla la
                            lista con todos sus números y el mapa no muestra nada, y eso parece un bug. */}
                        {oculta && (
                          <EyeOff
                            size={11}
                            className="shrink-0 text-muted-foreground"
                            aria-label="Oculta en el mapa"
                          />
                        )}
                      </div>
                    </td>

                    {/* Placa y clase EN LA MISMA LÍNEA: la fila mide 28 px y dos renglones apilados no
                        entran sin estirar todas las filas de la tabla por un dato secundario. */}
                    <td className={CELDA}>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-[11px]">{ruta.camion.placa}</span>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {ruta.camion.clase}
                        </span>
                      </div>
                    </td>

                    {/* Una palabra y no un badge: es una columna más de la comparación, y un badge por
                        fila metería seis cápsulas de color compitiendo con las barras de ocupación. */}
                    <td className={CELDA}>
                      <span
                        className={cn(
                          'text-[11px]',
                          ruta.camion.tipo === 'Frío'
                            ? 'font-medium text-sky-600 dark:text-sky-400'
                            : 'text-muted-foreground',
                        )}
                      >
                        {ruta.camion.tipo}
                      </span>
                    </td>

                    <td className={CELDA}>
                      <BarraOcupacion carga={carga} color={ruta.color} />
                    </td>

                    <td className={cn(CELDA, 'text-right text-[11px] tabular-nums')}>
                      <span className="font-medium">{fmt.format(carga.pesoKg / 1000)}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        / {ruta.camion.capacidadPeso} t
                      </span>
                    </td>

                    <td className={cn(CELDA, 'text-right text-[11px] tabular-nums')}>
                      <span className="font-medium">{fmt.format(carga.volumenM3)}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        / {ruta.camion.capacidadVolumen} m³
                      </span>
                    </td>

                    {/* El conteo se pinta cuando pasa el techo de clientes: es la MISMA cifra cambiando
                        de color, no un cartel nuevo al lado. Mismo criterio que el panel de Rutas. */}
                    <td
                      className={cn(
                        CELDA,
                        'text-right text-[11px] tabular-nums',
                        carga.excedeClientes && 'font-semibold text-amber-600 dark:text-amber-400',
                      )}
                      title={
                        carga.excedeClientes
                          ? `Más de ${MAX_CLIENTES_POR_CAMION} clientes en un camión: no le da la jornada aunque le sobre capacidad`
                          : undefined
                      }
                    >
                      {carga.paradas.length}
                    </td>

                    <td className={cn(CELDA, 'text-right text-[11px] tabular-nums')}>
                      {carga.pedidos}
                    </td>

                    {/* BANDEO = DATO, NO ACCIÓN. Acá no se abre el diálogo de accesorios: el
                        `AccesoriosDialog` se monta DENTRO de `RutasPanel`, así que si el dock de la
                        izquierda no está en "rutas" ese diálogo no existe y el click no haría nada.
                        Editar el bandeo se sigue haciendo desde el engranaje de la ruta; esta columna
                        solo contesta "¿esta ruta lleva algo además de mercadería?". */}
                    <td className={cn(CELDA, 'text-right text-[11px] tabular-nums')}>
                      {bandeo === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 font-medium"
                          title={resumenAccesorios(items)}
                        >
                          <Boxes size={11} className="shrink-0 text-muted-foreground" />
                          {bandeo}
                        </span>
                      )}
                    </td>

                    <td className={CELDA}>
                      <div className="flex items-center justify-end gap-0.5">
                        <AccionFila
                          titulo={
                            oculta
                              ? `Mostrar ${ruta.nombre} en el mapa`
                              : `Ocultar ${ruta.nombre} del mapa`
                          }
                          onClick={() => toggleRutaVisible(ruta.id)}
                        >
                          {oculta ? <EyeOff size={12} /> : <Eye size={12} />}
                        </AccionFila>
                        <AccionFila
                          titulo={`Encuadrar ${ruta.nombre} en el mapa`}
                          // `pedirEncuadre('ruta')` encuadra la ruta EN FOCO, no una ruta por id: hay
                          // que hacer foco ANTES o el mapa vuela a la ruta que estaba elegida.
                          onClick={() => {
                            setRutaFoco(ruta.id)
                            pedirEncuadre('ruta')
                          }}
                        >
                          <Crosshair size={12} />
                        </AccionFila>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {/* ── "Sin asignar", ÚLTIMA y solo si hay ──
                  Es el resto de empaquetado del optimizador, no un camión: no tiene placa, ni tipo, ni
                  capacidad contra la que medir una ocupación. Por eso esas celdas van VACÍAS en vez de
                  con un cero o un guión en cada una: un 0% de ocupación diría "va vacío", cuando lo que
                  pasa es que no hay camión. Lo único real de esta fila son los conteos —cuánto quedó
                  afuera—, que es justo el número que hay que mirar cuando existe. */}
              {sinAsignar.length > 0 && (
                <tr
                  tabIndex={0}
                  onClick={() => setRutaFoco(SIN_ASIGNAR)}
                  onKeyDown={(e) => alTeclear(e, SIN_ASIGNAR)}
                  className={cn(
                    'cursor-pointer outline-none transition-colors focus-visible:bg-accent/60',
                    rutaFoco === SIN_ASIGNAR ? 'bg-accent/60' : 'hover:bg-muted/50',
                  )}
                >
                  <td className={CELDA}>
                    <div className="flex items-center gap-2">
                      <PackageX
                        size={12}
                        className="shrink-0 text-amber-600 dark:text-amber-400"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-amber-700 dark:text-amber-300">
                        Sin asignar
                      </span>
                    </div>
                  </td>
                  <td className={CELDA} />
                  <td className={CELDA} />
                  <td className={CELDA} />
                  <td className={CELDA} />
                  <td className={CELDA} />
                  <td
                    className={cn(
                      CELDA,
                      'text-right text-[11px] font-semibold tabular-nums text-amber-600 dark:text-amber-400',
                    )}
                    title="Paradas que no entraron en ningún camión del plan"
                  >
                    {sinAsignar.length}
                  </td>
                  <td
                    className={cn(
                      CELDA,
                      'text-right text-[11px] font-semibold tabular-nums text-amber-600 dark:text-amber-400',
                    )}
                  >
                    {sinAsignar.reduce((acc, p) => acc + p.pedidos.length, 0)}
                  </td>
                  <td className={CELDA} />
                  <td className={CELDA} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
