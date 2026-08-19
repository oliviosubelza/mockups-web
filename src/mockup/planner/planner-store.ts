// Estado de PANTALLA del planificador unificado (propuesta). Lo que es del PLAN —camiones elegidos,
// canales, filtros, pedidos incluidos— sigue viviendo en `dispatch-plan-store`: esta pantalla no
// inventa una segunda fuente de verdad, solo agrega lo que el paso 2 necesitaba y no existía todavía
// (la asignación parada→ruta y qué herramienta del mapa está activa).
//
// Vive en zustand y no en useState porque lo leen piezas que no son hermanas: el mapa, la barra de
// herramientas que está DENTRO del MapContainer, los tres paneles del dock y el HUD.
import { create } from 'zustand'
import { CAPA_POR_DEFECTO, type CapaBase } from '../map/tiles'
import type { Asignaciones } from './planner-model'
import { nuevoAccesorio, tipoAccesorio, type AccesoriosPorRuta } from '../accesorios'

/** Panel del dock izquierdo. Uno a la vez: dos paneles abiertos ya no dejan ver el mapa. */
export type PanelId = 'flota' | 'pedidos' | 'rutas'

/**
 * Herramienta del puntero sobre el mapa.
 *
 *   · `pan`   → navegar. Click en un marcador abre su ficha.
 *   · `punto` → marcar de a una, clickeando. Es la que faltaba: rectángulo y lazo sirven para agarrar
 *               un barrio entero, pero corregir un reparto casi siempre es sacar DOS paradas puntuales
 *               de una ruta, y para eso dibujar una forma alrededor de dos puntos sueltos es absurdo.
 *   · `rect` / `lasso` → marcar por área, dibujando.
 *
 * Shift+click marca de a una en CUALQUIER modo, así que `punto` es el atajo para quien va a marcar
 * muchas seguidas y no quiere sostener la tecla.
 */
export type Herramienta = 'pan' | 'punto' | 'rect' | 'lasso'

/**
 * Fondo del mapa. El tipo, las URLs y cuál viene por defecto viven en `map/tiles`: son de todos los
 * mapas del mockup y no de esta pantalla. Se re-exporta porque media planificación lo importa de acá.
 */
export type { CapaBase } from '../map/tiles'

/**
 * Qué codifica el COLOR de cada punto de entrega.
 *
 * Son dos preguntas distintas y ninguna gana siempre: antes de repartir, el color útil es el CANAL
 * (dónde están los mayoristas, dónde los kioscos); después de repartir, es la RUTA (a quién le tocó
 * cada punto). Por eso es un interruptor y no una decisión fija — y por eso al optimizar salta solo a
 * `ruta`: en ese momento la pregunta cambió.
 */
export type ColorPor = 'canal' | 'ruta'

interface PlannerState {
  /**
   * Qué panel muestra el dock. SIEMPRE hay uno elegido (no es nullable): "ninguno" no es un panel, es
   * el dock cerrado, y eso lo dice `dockAbierto`. Separarlos es lo que permite que al reabrir vuelva
   * el panel en el que estabas en vez de uno por defecto.
   */
  panel: PanelId
  /** Dock desplegado (riel + panel). Cerrado, deja solo el lanzador flotante. */
  dockAbierto: boolean
  /**
   * Paneles flotantes encendidos. Se apagan desde el menú "Paneles" de la barra de herramientas, igual
   * que la vista de VSCode: la pantalla la arma quien la usa, no nosotros. Una sesión que solo quiere
   * mirar el trazo apaga todo y se queda con el mapa entero.
   */
  verMetricas: boolean
  verAcciones: boolean
  herramienta: Herramienta
  capa: CapaBase
  colorPor: ColorPor
  /** Ruta cuyo detalle está abierto en el panel de Rutas (`null` = todavía no eligió ninguna). */
  rutaFoco: string | null
  verMercados: boolean
  /** Etiqueta permanente (cliente + ventana) bajo cada pin. Apagada: a 30 paradas se pisan entre sí. */
  verEtiquetas: boolean
  /** Trazos de las rutas. Apagarlos deja los pines con su color y su número, sin las líneas. */
  verTrazos: boolean
  /** Polígono del almacén de salida. Se puede apagar cuando estorba en el centro del cuadro. */
  verDeposito: boolean
  /** Rutas ocultas del mapa (el "ojo" de la lista de rutas). Vacío = se ven todas. */
  rutasOcultas: string[]
  /**
   * Nombres puestos a mano, por id de ruta. Solo están los que alguien escribió: el resto cae al
   * `Ruta N` por defecto de `construirRutas`. Es un mapa y no un campo dentro de la ruta porque las
   * rutas se rederivan de los camiones elegidos en cada render.
   */
  nombresRuta: Record<string, string>
  asignaciones: Asignaciones
  /**
   * Bandeo por ruta: pallets, carritos y demás que el camión se lleva y tiene que devolver. Fuera de
   * la `RutaPlan` por lo mismo que `asignaciones` y `nombresRuta` — las rutas se rederivan de los
   * camiones elegidos en cada render, así que lo que se guarda adentro se pierde al filtrar.
   */
  accesorios: AccesoriosPorRuta
  /** Ruta cuyo diálogo de accesorios está abierto (`null` = cerrado). */
  accesoriosRuta: string | null
  optimizado: boolean
  optimizando: boolean
  /** Trabajo simulado en curso (mover paradas). Bloquea el mapa con un velo, igual que optimizar. */
  procesando: string | null
  /** Parada abierta en el panel de detalle (derecha). */
  paradaFoco: string | null
  /**
   * Ficha del punto (el diálogo con la foto) abierta.
   *
   * Es una bandera aparte de `paradaFoco` y no otro id: la ficha SIEMPRE muestra la parada en foco, así
   * que un segundo id sería una copia que se puede desincronizar. Lo único que hace falta saber es si
   * está abierta.
   */
  fichaAbierta: boolean
  /** Pedido de encuadre: cambia el número y el mapa vuela a `paradaFoco` (o a todo, si es null). */
  encuadreToken: number
  encuadreObjetivo: 'foco' | 'todo' | null
  /** Ids de parada marcados con rectángulo/lazo. Alimenta la barra de acciones de abajo. */
  seleccion: string[]

  /** Click en el riel: el mismo botón despliega y pliega. */
  abrirPanel: (panel: PanelId) => void
  /** Apertura PROGRAMÁTICA (tras optimizar, desde el estado vacío): nunca pliega. */
  mostrarPanel: (panel: PanelId) => void
  cerrarDock: () => void
  setVerMetricas: (v: boolean) => void
  setVerAcciones: (v: boolean) => void
  setHerramienta: (h: Herramienta) => void
  setCapa: (c: CapaBase) => void
  setColorPor: (c: ColorPor) => void
  setRutaFoco: (id: string | null) => void
  setVerMercados: (v: boolean) => void
  setVerEtiquetas: (v: boolean) => void
  setVerTrazos: (v: boolean) => void
  setVerDeposito: (v: boolean) => void
  toggleRutaVisible: (rutaId: string) => void
  /** Prende o apaga TODAS de una: la lista vacía muestra todo. */
  setRutasOcultas: (ids: string[]) => void
  setNombreRuta: (rutaId: string, nombre: string) => void
  setAsignaciones: (a: Asignaciones) => void
  /**
   * Pone la cantidad de UN tipo en una ruta. Cantidad 0 (o menos) BORRA la entrada en vez de guardar
   * un cero: "lleva 0 pallets" y "no lleva pallets" son lo mismo, y dejar la fila haría que el
   * resumen y el badge tuvieran que filtrar ceros en cada lectura.
   */
  setAccesorio: (rutaId: string, tipoId: string, cantidad: number, series?: string[]) => void
  quitarAccesorio: (rutaId: string, tipoId: string) => void
  abrirAccesorios: (rutaId: string) => void
  cerrarAccesorios: () => void
  setOptimizado: (v: boolean) => void
  setOptimizando: (v: boolean) => void
  setProcesando: (label: string | null) => void
  setParadaFoco: (id: string | null) => void
  /** Click en un marcador: enfoca la parada y abre su ficha. */
  abrirFicha: (id: string) => void
  cerrarFicha: () => void
  pedirEncuadre: (objetivo: 'foco' | 'todo') => void
  setSeleccion: (ids: string[]) => void
  /** Suma o saca UNA parada de la selección (click en el marcador, o Shift+click). */
  alternarSeleccion: (id: string) => void
  /**
   * Menú contextual de una parada (click derecho en su marcador). Guarda la posición en píxeles DENTRO
   * del contenedor del mapa —`containerPoint` de Leaflet—, no coordenadas de viewport: el menú se
   * dibuja como hijo absoluto de la pantalla, así que ese es el sistema de referencia correcto y
   * sobrevive a que el tablero esté desplazado (modo mockup).
   */
  menuParada: { id: string; x: number; y: number } | null
  /** Ayuda de atajos de teclado abierta. */
  atajosAbiertos: boolean
  setAtajosAbiertos: (v: boolean) => void
  abrirMenuParada: (menu: { id: string; x: number; y: number }) => void
  cerrarMenuParada: () => void
  reset: () => void
}

const INICIAL = {
  // FLOTA PRIMERO. Antes abría en Pedidos, y eso invertía el orden real de la decisión: sin camiones
  // elegidos no hay con qué repartir nada, así que la primera pregunta de la pantalla es "¿con qué
  // salgo?" y recién después "¿qué llevo?". Además el gate de Optimizar pide camiones, así que abrir
  // en Pedidos dejaba al usuario armando una selección que todavía no podía usar.
  panel: 'flota' as PanelId,
  dockAbierto: true,
  verMetricas: true,
  verAcciones: true,
  herramienta: 'pan' as Herramienta,
  capa: CAPA_POR_DEFECTO,
  colorPor: 'canal' as ColorPor,
  rutaFoco: null as string | null,
  verMercados: false,
  verEtiquetas: false,
  verTrazos: true,
  verDeposito: true,
  rutasOcultas: [] as string[],
  nombresRuta: {} as Record<string, string>,
  asignaciones: {} as Asignaciones,
  accesorios: {} as AccesoriosPorRuta,
  accesoriosRuta: null as string | null,
  optimizado: false,
  optimizando: false,
  procesando: null as string | null,
  paradaFoco: null as string | null,
  fichaAbierta: false,
  encuadreToken: 0,
  encuadreObjetivo: null as 'foco' | 'todo' | null,
  seleccion: [] as string[],
  menuParada: null as { id: string; x: number; y: number } | null,
  atajosAbiertos: false,
}

export const usePlannerStore = create<PlannerState>((set) => ({
  ...INICIAL,

  // Click en la herramienta ya activa pliega el dock: el mismo botón abre y cierra, sin un segundo
  // control. Click en OTRA herramienta con el dock plegado lo despliega en esa — nadie espera tener
  // que abrir primero y elegir después.
  abrirPanel: (panel) =>
    set((s) =>
      s.panel === panel && s.dockAbierto ? { dockAbierto: false } : { panel, dockAbierto: true },
    ),
  mostrarPanel: (panel) => set({ panel, dockAbierto: true }),
  cerrarDock: () => set({ dockAbierto: false }),
  setVerMetricas: (verMetricas) => set({ verMetricas }),
  setVerAcciones: (verAcciones) => set({ verAcciones }),
  // Cambiar de herramienta ya NO limpia lo marcado. Antes lo hacía porque la selección solo existía
  // mientras se veía la forma dibujada; ahora se arma click a click y sobrevive al cambio de modo —
  // marcar tres con el lazo, pasar a `punto` y sumar una cuarta es exactamente el flujo esperado.
  // Para limpiar están la X de la barra y Escape.
  setHerramienta: (herramienta) => set({ herramienta }),
  setCapa: (capa) => set({ capa }),
  setColorPor: (colorPor) => set({ colorPor }),
  setRutaFoco: (rutaFoco) => set({ rutaFoco }),
  setVerMercados: (verMercados) => set({ verMercados }),
  setVerEtiquetas: (verEtiquetas) => set({ verEtiquetas }),
  setVerTrazos: (verTrazos) => set({ verTrazos }),
  setVerDeposito: (verDeposito) => set({ verDeposito }),
  toggleRutaVisible: (rutaId) =>
    set((s) => ({
      rutasOcultas: s.rutasOcultas.includes(rutaId)
        ? s.rutasOcultas.filter((id) => id !== rutaId)
        : [...s.rutasOcultas, rutaId],
    })),
  // Un nombre vacío BORRA la entrada en vez de guardar "": así la ruta vuelve al `Ruta N` por defecto
  // y no queda con una etiqueta en blanco que no se puede deshacer desde la pantalla.
  setRutasOcultas: (rutasOcultas) => set({ rutasOcultas }),
  setNombreRuta: (rutaId, nombre) =>
    set((s) => {
      const limpio = nombre.trim()
      const next = { ...s.nombresRuta }
      if (limpio) next[rutaId] = limpio
      else delete next[rutaId]
      return { nombresRuta: next }
    }),
  setAsignaciones: (asignaciones) => set({ asignaciones }),
  setAccesorio: (rutaId, tipoId, cantidad, series = []) =>
    set((s) => {
      const tipo = tipoAccesorio(tipoId)
      if (!tipo) return s
      const previos = s.accesorios[rutaId] ?? []
      const resto = previos.filter((item) => item.tipoId !== tipoId)
      const item = nuevoAccesorio(tipo, Math.max(0, Math.trunc(cantidad)), series)
      const next = { ...s.accesorios }
      // Una ruta sin accesorios sale del mapa entera: así `Object.keys(accesorios).length` sigue
      // siendo "cuántas rutas llevan bandeo" y no cuenta las que quedaron con la lista vacía.
      const items = item.salida > 0 ? [...resto, item] : resto
      if (items.length) next[rutaId] = items
      else delete next[rutaId]
      return { accesorios: next }
    }),
  quitarAccesorio: (rutaId, tipoId) =>
    set((s) => {
      const items = (s.accesorios[rutaId] ?? []).filter((item) => item.tipoId !== tipoId)
      const next = { ...s.accesorios }
      if (items.length) next[rutaId] = items
      else delete next[rutaId]
      return { accesorios: next }
    }),
  abrirAccesorios: (accesoriosRuta) => set({ accesoriosRuta }),
  cerrarAccesorios: () => set({ accesoriosRuta: null }),
  setOptimizado: (optimizado) => set({ optimizado }),
  setOptimizando: (optimizando) => set({ optimizando }),
  setProcesando: (procesando) => set({ procesando }),
  // Soltar el foco cierra la ficha: no puede quedar una ficha abierta de una parada que ya no lo está.
  setParadaFoco: (paradaFoco) =>
    set(paradaFoco === null ? { paradaFoco, fichaAbierta: false, menuParada: null } : { paradaFoco }),
  abrirFicha: (paradaFoco) => set({ paradaFoco, fichaAbierta: true }),
  cerrarFicha: () => set({ fichaAbierta: false }),
  pedirEncuadre: (encuadreObjetivo) =>
    set((s) => ({ encuadreObjetivo, encuadreToken: s.encuadreToken + 1 })),
  setSeleccion: (seleccion) => set({ seleccion }),
  alternarSeleccion: (id) =>
    set((s) => ({
      seleccion: s.seleccion.includes(id)
        ? s.seleccion.filter((x) => x !== id)
        : [...s.seleccion, id],
    })),
  setAtajosAbiertos: (atajosAbiertos) => set({ atajosAbiertos }),
  // Abrir el menú enfoca la parada: el menú actúa sobre ella, así que tiene que verse cuál es.
  abrirMenuParada: (menuParada) => set({ menuParada, paradaFoco: menuParada.id }),
  cerrarMenuParada: () => set({ menuParada: null }),
  reset: () => set({ ...INICIAL }),
}))
