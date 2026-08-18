// Panel "Pedidos": de qué universo sale la planificación y qué entra de lo que no entra solo.
//
// LA UNIFICACIÓN PASA ACÁ. En el flujo actual esto es el paso 1 (una tabla, sin mapa) y las paradas
// recién se ven en el paso 2. Al vivir sobre el mapa, cada tilde de un filtro se ve caer en la ciudad:
// filtrar y armar dejan de ser dos momentos.
//
// TRES BLOQUES, EN ORDEN DE DECISIÓN:
//   1. Filtros    → de dónde salen los pedidos.
//   2. Composición → la barra apilada con el color de cada canal y los totales (se VIGILA, no se
//                   toca), y debajo tres cards iguales que abren las tres listas: Canales (el
//                   desglose), Fuera de corte (los tardíos que entran igual y se pueden sacar) y
//                   Bloqueados (lo que Ventas tiene que destrabar). Tres puertas iguales, tres
//                   preguntas.
//   3. Paradas    → lo que el camión va a visitar, ya unificado por punto de entrega, paginado.
//
// POR QUÉ EL DESGLOSE POR CANAL Y NO UNA LISTA PLANA DE PEDIDOS. Antes las 59 paradas iban todas
// juntas, mezclando mayoristas con kioscos: no había forma de contestar "¿cuánto me está metiendo
// Tradicional?" ni de sacar un canal entero. El agregado por canal es la unidad en la que se DECIDE;
// la parada es la unidad en la que se NAVEGA el mapa. Son dos controles porque son dos preguntas.
import { useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  AlertTriangle,
  Building2,
  Globe,
  Lock,
  MapPin,
  Trash2,
  Search,
  Store,
  User,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { CanalGlyph } from '../canal-glyph'
import { CanalPedidosDialog } from '../CanalPedidosDialog'
import {
  entraPorCorte,
  estaIncluido,
  selectScopedOrders,
  useDispatchPlanStore,
} from '../dispatch-plan-store'
import {
  CANAL_IDS,
  CANAL_META,
  CIUDAD_IDS,
  CIUDAD_META,
  MERCADO_IDS,
  MERCADO_META,
  pedidoEsSeleccionable,
  VENDEDORES,
  ZONA_IDS,
  ZONA_META,
  type CanalId,
  type CiudadId,
  type MercadoId,
  type Parada,
  type ZonaId,
} from '../mock-data'
import { BloqueadosDialog } from './BloqueadosDialog'
import { agruparQuitados, QuitadosDialog } from './QuitadosDialog'
import { BarraCanales, CanalesDialog } from './CanalesDialog'
import { FiltroPopover } from './FiltroPopover'
import { FueraDeCorteDialog } from './FueraDeCorteDialog'
import { Paginador, usePagina } from './Paginador'
import type { RutaPlan } from './planner-model'

const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

const POR_PAGINA = 10

/**
 * Card cuadrada que abre una lista. Las tres del panel son la misma pieza con distinto contenido, y
 * eso es deliberado: si "canales", "fuera de corte" y "bloqueados" tuvieran cada una su forma, habría
 * que aprender tres controles para hacer siempre lo mismo —abrir una lista—.
 *
 * EL NÚMERO MANDA. Va grande y arriba porque es el dato por el que se mira la card; la etiqueta abajo,
 * chica, solo dice de qué es ese número. Al revés (etiqueta grande, número escondido) obliga a leer
 * palabras para enterarse de algo que se contesta con un vistazo.
 *
 * En cero se APAGA y se deshabilita, pero NO desaparece: la grilla se queda quieta y quien la usa
 * aprende dónde está cada puerta. Además "0 bloqueados" es información — no es lo mismo que no saber.
 */
function CardConsulta({
  icon: Icon,
  valor,
  etiqueta,
  titulo,
  tono = 'neutro',
  onClick,
}: {
  icon: typeof Store
  valor: number
  etiqueta: string
  titulo: string
  /** Color del estado. `neutro` incluye el caso "ya está resuelto", que no necesita gritar. */
  tono?: 'neutro' | 'ambar' | 'rojo'
  onClick: () => void
}) {
  const vacio = valor === 0

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={vacio}
      title={titulo}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors',
        vacio
          ? 'cursor-default border-border/60 bg-muted/20 opacity-60'
          : tono === 'ambar'
            ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20'
            : tono === 'rojo'
              ? 'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20'
              : 'border-border hover:bg-muted/60',
      )}
    >
      <span className="flex w-full items-center gap-1">
        <Icon
          size={12}
          className={cn(
            'shrink-0',
            vacio
              ? 'text-muted-foreground'
              : tono === 'ambar'
                ? 'text-amber-600 dark:text-amber-400'
                : tono === 'rojo'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-muted-foreground',
          )}
        />
        <span className="ml-auto text-sm font-semibold leading-none tabular-nums">{valor}</span>
      </span>
      {/* `leading-tight` y dos líneas permitidas: "Fuera de corte" no entra en 90 px de una sola, y
          cortarlo con puntos suspensivos dejaría tres cards diciendo "Fuera d…". */}
      <span className="w-full text-[10px] leading-tight text-muted-foreground">{etiqueta}</span>
    </button>
  )
}

export function PedidosPanel({
  paradas,
  rutas,
  paradaFoco,
  onFoco,
}: {
  /** Paradas ya proyectadas con su asignación: la lista muestra el color de la ruta que les tocó. */
  paradas: Parada[]
  rutas: RutaPlan[]
  paradaFoco: string | null
  onFoco: (paradaId: string) => void
}) {
  const colorPorRuta = useMemo(() => new Map(rutas.map((r) => [r.id, r.color])), [rutas])
  const activeCanales = useDispatchPlanStore((s) => s.activeCanales)
  const activeCiudades = useDispatchPlanStore((s) => s.activeCiudades)
  const activeMercados = useDispatchPlanStore((s) => s.activeMercados)
  const activeZonas = useDispatchPlanStore((s) => s.activeZonas)
  const activeVendedores = useDispatchPlanStore((s) => s.activeVendedores)
  const orderOverrides = useDispatchPlanStore((s) => s.orderOverrides)
  const applySelection = useDispatchPlanStore((s) => s.applySelection)
  const setOrdersIncluded = useDispatchPlanStore((s) => s.setOrdersIncluded)
  // `useShallow`: el selector deriva un array NUEVO en cada llamada y sin igualdad shallow Zustand v5
  // lo ve como snapshot cambiante en cada render (bucle infinito).
  const enScope = useDispatchPlanStore(useShallow(selectScopedOrders))

  const [busqueda, setBusqueda] = useState('')
  const [canalesAbierto, setCanalesAbierto] = useState(false)
  const [canalDetalle, setCanalDetalle] = useState<CanalId | null>(null)
  const [fueraAbierto, setFueraAbierto] = useState(false)
  const [bloqueadosAbierto, setBloqueadosAbierto] = useState(false)
  const [quitadosAbierto, setQuitadosAbierto] = useState(false)

  // El estado del filtro vive SOLO en el store: acá no hay draft local. En el paso 1 el draft existía
  // para juntar varios toggles en un fetch; sobre el mapa el efecto tiene que verse en el toggle, que
  // es justamente lo que esta pantalla viene a proponer.
  const toggle = (
    dimension: 'canales' | 'ciudades' | 'mercados' | 'zonas' | 'vendedores',
    value: string,
  ) => {
    const actual = {
      canales: activeCanales as string[],
      ciudades: activeCiudades as string[],
      mercados: activeMercados as string[],
      zonas: activeZonas as string[],
      vendedores: activeVendedores,
    }
    const siguiente = actual[dimension].includes(value)
      ? actual[dimension].filter((v) => v !== value)
      : [...actual[dimension], value]

    applySelection({
      canales: (dimension === 'canales' ? siguiente : actual.canales) as CanalId[],
      ciudades: (dimension === 'ciudades' ? siguiente : actual.ciudades) as CiudadId[],
      mercados: (dimension === 'mercados' ? siguiente : actual.mercados) as MercadoId[],
      zonas: (dimension === 'zonas' ? siguiente : actual.zonas) as ZonaId[],
      vendedores: dimension === 'vendedores' ? siguiente : actual.vendedores,
    })
  }

  const fuera = useMemo(() => enScope.filter((p) => !entraPorCorte(p)), [enScope])
  const fueraIncluidos = useMemo(
    () => fuera.filter((p) => estaIncluido(p, orderOverrides)),
    [fuera, orderOverrides],
  )
  /**
   * Hay pedidos tardíos DENTRO del plan. Eso es lo que amerita el ámbar.
   *
   * Antes la alerta era "quedan sin decidir", porque fuera de corte no entraba solo. Ahora entran
   * todos por defecto, así que "sin decidir" ya no existe — y la pregunta que sí importa pasó a ser
   * la inversa: cuántos de los que estoy por despachar cierran después del corte.
   */
  const llevaTardios = fueraIncluidos.length > 0

  /**
   * Los que la regla de bonificaciones deja afuera del plan (`pedidoEsSeleccionable`).
   *
   * No se cruzan con "fuera de corte": son dos exclusiones por motivos distintos y con destinos
   * distintos —el de corte se DECIDE acá, el bloqueado lo destraba Ventas—. Un pedido puede estar en
   * las dos listas, y está bien: cada una contesta su propia pregunta.
   */
  const bloqueados = useMemo(
    () => enScope.filter((p) => !pedidoEsSeleccionable(p)),
    [enScope],
  )

  /**
   * Puntos que alguien SACÓ del plan: son seleccionables (nada los bloquea) y aun así no entran.
   *
   * La definición es "podría entrar y no entra", así que junta todo lo que se destildó, venga de la
   * herramienta de quitar del mapa, del diálogo por canal o del de fuera de corte. Eso es lo correcto:
   * son un solo interruptor (`orderOverrides`), y tener tres listas de "lo que saqué" según por dónde
   * lo saqué sería inventar diferencias que el estado no tiene.
   */
  const quitados = useMemo(
    () =>
      agruparQuitados(
        enScope.filter((p) => pedidoEsSeleccionable(p) && !estaIncluido(p, orderOverrides)),
      ),
    [enScope, orderOverrides],
  )

  /**
   * Agregado por canal de lo que EFECTIVAMENTE entra al plan (`estaIncluido` = regla de corte + las
   * decisiones manuales). Se cuenta sobre el mismo predicado que usan el mapa y el HUD, así el resumen
   * no puede contar distinto de lo que se ve dibujado.
   */
  const porCanal = useMemo(() => {
    return CANAL_IDS.filter((c) => activeCanales.includes(c))
      .map((canal) => {
        const delCanal = enScope.filter((p) => p.canal === canal)
        const incluidos = delCanal.filter((p) => estaIncluido(p, orderOverrides))
        return {
          canal,
          pedidos: incluidos.length,
          total: delCanal.length,
          clientes: new Set(incluidos.map((p) => p.cliente)).size,
          pesoKg: incluidos.reduce((acc, p) => acc + p.peso, 0),
          fuera: delCanal.filter((p) => !entraPorCorte(p)).length,
        }
      })
      .filter((fila) => fila.total > 0)
  }, [activeCanales, enScope, orderOverrides])

  const totales = useMemo(
    () => ({
      pedidos: porCanal.reduce((acc, f) => acc + f.pedidos, 0),
      pesoKg: porCanal.reduce((acc, f) => acc + f.pesoKg, 0),
    }),
    [porCanal],
  )

  const paradasVisibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    if (!texto) return paradas
    return paradas.filter(
      (p) =>
        p.cliente.toLowerCase().includes(texto) || p.puntoEntrega.toLowerCase().includes(texto),
    )
  }, [busqueda, paradas])

  const pagina = usePagina(paradasVisibles, POR_PAGINA, busqueda)

  const sinCanal = activeCanales.length === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ── 1. Filtros ──
          ORDEN: Ciudad (el más amplio) primero, después Canal, Mercado, Zona, Vendedor — mismo orden
          que el paso 1, para que quien ya conoce la pantalla no tenga que reaprenderlo. */}
      <div className="shrink-0 border-b border-border px-2 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <FiltroPopover
            label="Ciudad"
            icon={Building2}
            active={activeCiudades}
            onToggle={(v) => toggle('ciudades', v)}
            searchPlaceholder="Buscar ciudad…"
            emptyText="Sin ciudades"
            options={CIUDAD_IDS.map((c) => ({ value: c, label: CIUDAD_META[c].label }))}
          />
          <FiltroPopover
            label="Canal"
            icon={Store}
            active={activeCanales}
            onToggle={(v) => toggle('canales', v)}
            searchPlaceholder="Buscar canal…"
            emptyText="Sin canales"
            options={CANAL_IDS.map((c) => ({
              value: c,
              label: CANAL_META[c].label,
              glyph: (
                <span className="shrink-0" style={{ color: CANAL_META[c].color }}>
                  <CanalGlyph canal={c} size={14} />
                </span>
              ),
            }))}
          />
          <FiltroPopover
            label="Mercado"
            icon={Globe}
            active={activeMercados}
            onToggle={(v) => toggle('mercados', v)}
            searchPlaceholder="Buscar mercado…"
            emptyText="Sin mercados"
            options={MERCADO_IDS.map((m) => ({ value: m, label: MERCADO_META[m].label }))}
          />
          <FiltroPopover
            label="Zona"
            icon={MapPin}
            active={activeZonas}
            onToggle={(v) => toggle('zonas', v)}
            searchPlaceholder="Buscar zona…"
            emptyText="Sin zonas"
            options={ZONA_IDS.map((z) => ({ value: z, label: ZONA_META[z].label }))}
          />
          <FiltroPopover
            label="Vendedor"
            icon={User}
            active={activeVendedores}
            onToggle={(v) => toggle('vendedores', v)}
            searchPlaceholder="Buscar vendedor…"
            emptyText="Sin vendedores"
            options={VENDEDORES.map((v) => ({ value: v, label: v }))}
          />
        </div>
      </div>

      {sinCanal ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
          <p className="text-sm font-medium">Elegí un canal</p>
          <p className="text-xs text-muted-foreground">
            Sin canal no hay pedidos que traer, y el mapa queda vacío.
          </p>
        </div>
      ) : (
        <>
          {/* ── 2. Composición del plan y sus tres consultas ──
              LA BARRA ES EL RESUMEN, LAS CARDS SON LAS PUERTAS. Antes esto era un select-search que no
              seleccionaba nada (abría diálogos) y, debajo, una fila ancha para "fuera de corte". Dos
              controles de ancho completo, con dos formas distintas, para tres cosas que son la misma:
              abrir una lista. Alineados en una grilla de tres se leen de un vistazo, y cada uno lleva
              su número adelante — que es el dato por el que se los mira.

              La barra apilada queda arriba y NO es un botón: es el estado del plan, se vigila. Sus
              colores son los mismos con los que cada canal se dibuja en el mapa. */}
          <div className="shrink-0 space-y-2 border-b border-border px-2 py-2">
            <div className="space-y-1">
              <BarraCanales filas={porCanal} />
              <div className="flex items-baseline gap-1.5 text-[11px] text-muted-foreground">
                {/* LOS DOS NÚMEROS JUNTOS, y en este orden. Es la única línea de la pantalla que
                    dice de qué está hecha la lista de abajo: 54 lugares a los que hay que ir, 71
                    pedidos para repartir entre ellos. Sin verlos al lado, "54" y "71" aparecían en
                    pantallas distintas y no había forma de deducir que un punto agrupa varios
                    pedidos — que es exactamente la regla que ordena todo lo demás. */}
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold tabular-nums text-foreground">
                    {paradas.length}
                  </span>{' '}
                  puntos ·{' '}
                  <span className="font-semibold tabular-nums text-foreground">
                    {totales.pedidos}
                  </span>{' '}
                  pedidos
                </span>
                <span className="shrink-0 tabular-nums">{fmtPeso.format(totales.pesoKg)} kg</span>
              </div>
            </div>

            {/* Cuatro cards iguales en 2×2, y no en una fila de cuatro: en 284 px una fila deja 66 px
                por card y "Fuera de corte" se parte en tres renglones. Con dos columnas cada una tiene
                139 px, la etiqueta entra en una línea y las cards quedan efectivamente cuadradas.

                La grilla NO se reacomoda cuando un conteo cae a cero: la card se apaga y se
                deshabilita, pero se queda. Que las puertas cambien de lugar según el día es la forma
                más rápida de que nadie aprenda dónde están.

                ORDEN: primero lo que describe el plan (Canales), después las tres formas en que un
                pedido puede no estar entrando — por horario, porque lo sacaste, o porque Ventas lo
                tiene trabado. */}
            <div className="grid grid-cols-2 gap-1.5">
              <CardConsulta
                icon={Store}
                valor={porCanal.length}
                etiqueta={`Canal${porCanal.length === 1 ? '' : 'es'}`}
                titulo="Ver el desglose por canal"
                onClick={() => setCanalesAbierto(true)}
              />
              <CardConsulta
                icon={AlertTriangle}
                valor={fuera.length}
                etiqueta="Fuera de corte"
                // Ámbar mientras el plan lleve alguno adentro. Sacándolos todos se apaga: ahí ya no
                // hay nada tardío que pueda no llegar.
                tono={llevaTardios ? 'ambar' : 'neutro'}
                titulo={
                  fuera.length === 0
                    ? 'No hay pedidos fuera del horario de corte'
                    : `${fueraIncluidos.length} de ${fuera.length} entran al plan — destildá los que no lleguen`
                }
                onClick={() => setFueraAbierto(true)}
              />
              <CardConsulta
                icon={Trash2}
                valor={quitados.length}
                etiqueta="Quitados"
                titulo={
                  quitados.length === 0
                    ? 'No sacaste ningún punto del plan'
                    : 'Puntos que sacaste a mano — se pueden devolver'
                }
                onClick={() => setQuitadosAbierto(true)}
              />
              <CardConsulta
                icon={Lock}
                valor={bloqueados.length}
                etiqueta="Bloqueados"
                tono={bloqueados.length > 0 ? 'rojo' : 'neutro'}
                titulo={
                  bloqueados.length === 0
                    ? 'Ningún pedido bloqueado'
                    : 'Les falta stock de una bonificación: no se pueden planificar'
                }
                onClick={() => setBloqueadosAbierto(true)}
              />
            </div>
          </div>

          {/* ── 3. Paradas ──
              Cabecera con buscador y contador. Es la lista de navegación del mapa: click en una fila
              vuela hasta el punto. */}
          <div className="shrink-0 border-b border-border px-2 py-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={`Buscar en ${paradas.length} puntos`}
                className="h-7 pl-7 text-xs"
                aria-label="Buscar punto de entrega"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {pagina.items.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {paradas.length === 0
                  ? 'Los filtros actuales no dejan pasar ningún pedido.'
                  : 'Ninguna parada coincide con la búsqueda.'}
              </p>
            ) : (
              pagina.items.map((parada) => {
                const meta = CANAL_META[parada.canal]
                const enFoco = paradaFoco === parada.id
                const color = parada.rutaId ? colorPorRuta.get(parada.rutaId) : undefined
                return (
                  <button
                    key={parada.id}
                    type="button"
                    onClick={() => onFoco(parada.id)}
                    // El título dice el "1 a n" en palabras. La fila lo comprime a "3p" por ancho,
                    // pero esa abreviatura solo se entiende si en algún lado está escrita entera.
                    title={`${parada.cliente} · ${parada.puntoEntrega} · ${parada.pedidos.length} pedido${parada.pedidos.length !== 1 ? 's' : ''} en este punto · ${parada.ventana}`}
                    className={cn(
                      'flex h-7 w-full items-center gap-2 px-2 text-left text-xs transition-colors',
                      enFoco ? 'bg-primary/10' : 'hover:bg-muted/70',
                    )}
                  >
                    {/* Punto del color de la ruta: dice de un vistazo qué quedó sin asignar. Sin ruta =
                        círculo vacío con aro gris, el mismo lenguaje que el pin del mapa — que también
                        dejó el punteado: era la única parada con la silueta rota y se leía como un
                        marcador a medio dibujar, no como uno pendiente. */}
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        !color && 'border border-muted-foreground',
                      )}
                      style={color ? { background: color } : undefined}
                      aria-hidden
                    />
                    <span className="shrink-0" style={{ color: meta.color }}>
                      <CanalGlyph canal={parada.canal} size={13} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{parada.cliente}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {parada.pedidos.length}p · {fmtPeso.format(parada.pesoTotal)}kg
                    </span>
                  </button>
                )
              })
            )}
          </div>

          <Paginador pagina={pagina} />
        </>
      )}

      {/* Diálogos. `CanalPedidosDialog` es el MISMO del paso 1: mismo componente, mismo store, misma
          convención de guardado instantáneo — la propuesta no reimplementa lo que ya funciona. */}
      <CanalesDialog
        abierto={canalesAbierto}
        onOpenChange={setCanalesAbierto}
        filas={porCanal}
        onElegirCanal={(canal) => {
          // Se CIERRA el desglose antes de abrir el detalle en vez de apilar un diálogo sobre otro:
          // dos capas modales encima del mapa dejan al usuario sin saber qué cierra Escape.
          setCanalesAbierto(false)
          setCanalDetalle(canal)
        }}
      />
      <CanalPedidosDialog
        canal={canalDetalle}
        pedidos={canalDetalle ? enScope.filter((p) => p.canal === canalDetalle) : []}
        onClose={() => setCanalDetalle(null)}
      />
      <FueraDeCorteDialog
        abierto={fueraAbierto}
        pedidos={fuera}
        onClose={() => setFueraAbierto(false)}
      />
      <BloqueadosDialog
        abierto={bloqueadosAbierto}
        onOpenChange={setBloqueadosAbierto}
        pedidos={bloqueados}
      />
      <QuitadosDialog
        abierto={quitadosAbierto}
        onOpenChange={setQuitadosAbierto}
        puntos={quitados}
        onDevolver={(ids) => setOrdersIncluded(ids, ids)}
      />
    </div>
  )
}
