// Store de ZONAS de reparto (tabla `zones`). Dato maestro, no de un plan: se crea una vez por
// ciudad y después la usan muchos planes, así que vive fuera del `dispatch-plan-store`/`planner-store`
// (que son del PLAN activo) — mismo criterio que `planes-store` con los planes guardados.
//
// El polígono se guarda en el mismo formato que la columna `polygon_geojson` (GeoJSON, anillo en
// `[lng, lat]`) para que lo que sale de acá sea literalmente el payload que un día viaja al backend.
// Leaflet trabaja en `[lat, lng]`, así que la conversión vive en dos funciones chicas (`aLatLng` /
// `aGeoJson`) y el resto de la pantalla no vuelve a tocar el orden de las coordenadas.
import { create } from 'zustand'
import type { CiudadId } from './mock-data'
import type { LatLngTuple } from './map/geo/polyline'
import type { VentanaVigencia } from './restricciones/vigencia'

// `:v4` porque SE FUE EL SEED: la pantalla arranca sin ninguna zona y las dibuja el usuario. Acá el bump
// no es opcional como en los anteriores, es la mitad del cambio: sin él, todo el que ya tiene la sesión
// arrancada seguiría viendo las siete zonas de ejemplo bajo la clave vieja —guardadas, indistinguibles de
// las propias— y no habría manera de llegar al mapa en blanco salvo borrándolas a mano de a una.
// (El `:v3` fue por lo que se VE: cada zona ganó `tipo` y hacía falta resembrar para que el campo
// existiera. El `:v2`, porque las zonas sembradas se pisaban entre sí y eso dejó de pasar la validación
// de `map/geo/holgura.ts`, así que la primera edición se bloqueaba por un conflicto ajeno.)
//
// `:v5` por la `vigencia`. Acá el bump es de higiene y no de corrección —la migración de lectura ya
// completa el campo faltante con `[]`, que además es el default correcto—, y se sube igual porque el
// costo de equivocarse es asimétrico: sin él, un `undefined` que se le escape a la migración llega a
// `vigenteEn` como lista inexistente y una restricción deja de dibujarse en el planificador sin decir
// por qué, que es exactamente el bug que este módulo viene a evitar.
const STORAGE_KEY = 'mockups-web:zonas:v5'
const USUARIO_MOCK = 'Juan Pérez'

export interface ZonaPoligonoGeoJson {
  type: 'Polygon'
  /** Anillos en `[lng, lat]` (GeoJSON), el primero cerrado (repite el primer vértice al final). */
  coordinates: [number, number][][]
}

/**
 * Para qué sirve el polígono. Es lo que decide qué REGLAS se le aplican, no solo de qué color se pinta:
 *   · `reparto`     → territorio que alguien atiende. Tiene que ser una partición limpia: dos zonas de
 *     reparto no pueden compartir un cliente, así que ni se pisan ni se rozan (`map/geo/holgura.ts`).
 *   · `restringida` → un pedazo de mapa con una limitación de circulación (un centro histórico cerrado,
 *     una avenida en obra). No reparte nada: RECORTA. Por eso se apila libremente sobre las de reparto
 *     y sobre otras restringidas — una avenida en obra que cruza tres zonas de reparto es el caso
 *     normal, y exigirle holgura a eso sería pedirle que no toque justo lo que viene a limitar.
 *
 * Un solo campo y no dos tablas porque la geometría, el alta, la baja y el editor son idénticos: lo
 * único que cambia es qué validaciones corren encima.
 */
export type TipoZona = 'reparto' | 'restringida'

/** Etiquetas de cada tipo, en un solo lugar: las usan el selector del editor, el filtro y el badge de
 *  la lista, y tres literales sueltos se desincronizan al primer cambio de redacción. */
export const TIPO_ZONA_META: Record<TipoZona, { label: string; plural: string }> = {
  reparto: { label: 'Reparto', plural: 'Reparto' },
  restringida: { label: 'Restringida', plural: 'Restringidas' },
}

/** Espejo de la fila `zones` de la base. */
export interface Zona {
  id: number
  name: string
  tipo: TipoZona
  /**
   * CUÁNDO rige. Vacío = permanente (ver `restricciones/vigencia.ts`).
   *
   * EXISTE EN LAS DOS CLASES DE ZONA Y SOLO SIGNIFICA ALGO EN LAS RESTRINGIDAS. No es un descuido del
   * modelo: es que una zona de reparto no es una regla que se prenda y se apague, es un
   * PARTICIONAMIENTO del territorio. Que "Norte" solo rija los martes dejaría el barrio sin dueño los
   * otros seis días —y el hueco no se ve, porque una zona que no está dibujada no se distingue de una
   * que nadie creó—. Una restringida sí: la obra de la avenida empieza el lunes y termina en tres
   * semanas, y ese es el caso que motivó todo esto.
   *
   * Está en `Zona` y no en un tipo aparte porque partir la interfaz en dos obligaría a discriminar por
   * `tipo` en cada punto del código que hoy trata a las zonas como una sola lista (el listado, el
   * mapa, la auditoría, el storage), y todo eso pasaría a tener dos ramas para un campo que la mitad
   * ignora. La restricción se sostiene donde se puede sostener de verdad: el editor solo ofrece el
   * control para las restringidas, y el planificador solo lo evalúa en ellas.
   */
  vigencia: VentanaVigencia[]
  polygonGeoJson: ZonaPoligonoGeoJson | null
  cityId: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  isActive: boolean
}

/** GeoJSON `[lng, lat]` (anillo cerrado) → Leaflet `[lat, lng]` (abierto, sin repetir el primero). */
export function poligonoALatLng(polygon: ZonaPoligonoGeoJson | null): LatLngTuple[] {
  const anillo = polygon?.coordinates?.[0] ?? []
  const abierto =
    anillo.length > 1 &&
    anillo[0][0] === anillo[anillo.length - 1][0] &&
    anillo[0][1] === anillo[anillo.length - 1][1]
      ? anillo.slice(0, -1)
      : anillo
  return abierto.map(([lng, lat]) => [lat, lng])
}

/** Leaflet `[lat, lng]` (abierto) → GeoJSON `[lng, lat]` (anillo cerrado). `null` si no alcanza a ser polígono. */
export function latLngAPoligono(puntos: LatLngTuple[]): ZonaPoligonoGeoJson | null {
  if (puntos.length < 3) return null
  const anillo = puntos.map(([lat, lng]) => [lng, lat] as [number, number])
  anillo.push(anillo[0])
  return { type: 'Polygon', coordinates: [anillo] }
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Centro aproximado de cada ciudad. Es a DÓNDE MIRA el editor al abrirse, y con la lista vacía pasó a ser
 * lo único que hay: sin zonas guardadas no hay nada que encuadrar, así que este punto es la diferencia
 * entre abrir sobre Santa Cruz y abrir sobre el Atlántico en zoom de continente.
 */
export const CIUDAD_CENTRO: Record<CiudadId, LatLngTuple> = {
  santacruz: [-17.783, -63.182],
  montero: [-17.339, -63.25],
  warnes: [-17.517, -63.167],
  laguardia: [-17.917, -63.233],
  cotoca: [-17.817, -63.033],
}

/**
 * Lo que haya guardado, o la lista VACÍA. Ya no hay zonas de ejemplo: la pantalla abre en blanco y las
 * dibuja el usuario. El seed existía para que `/zonas` tuviera algo que mostrar cuando era una tabla; con
 * el editor de mapa la primera acción ya es dibujar, y siete cuadrados ajenos ocupando el centro de Santa
 * Cruz son siete cosas que hay que borrar antes de empezar.
 *
 * OJO CON EL ARRAY VACÍO — es lo único delicado que quedó acá. Con seed, `[]` significaba "no hay nada
 * guardado" y disparaba la resiembra; sin seed, `[]` es un estado LEGÍTIMO y frecuente: el que borró su
 * última zona. Tratarlo como antes sería el peor bug posible de esta pantalla —recargar te devuelve las
 * zonas que acabás de eliminar, y la única salida es volver a eliminarlas—, así que las dos situaciones
 * están explícitamente separadas: `raw === null` es "nunca escribió nada" y un `[]` parseado es "escribió
 * que no hay ninguna". Hoy las dos devuelven lo mismo y por eso el código es una sola línea; si algún día
 * vuelve un seed, tiene que colgar SOLO de `raw === null` y nunca del largo del array.
 */
function readStoredZonas(): Zona[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // El `tipo` se completa al leer y no se confía en que esté. El bump de clave se lleva puesto al que
    // no tocó nada, pero no al que ya guardó zonas propias bajo la clave nueva desde una build sin
    // `tipo`, ni al que arrastra un export a mano. Una sola zona sin tipo alcanza para que el filtro y
    // el color caigan en `undefined` y la zona desaparezca de las dos listas sin decir por qué; el
    // default es `reparto` porque todo lo que existía antes de este campo era eso.
    // La `vigencia` se completa igual que el `tipo` y por la misma razón, pero el default no es una
    // elección: `[]` ES permanente en el modelo, así que toda zona anterior a este campo queda dicha
    // exactamente como venía comportándose. No hay conversión posible en el otro sentido —nadie cargó
    // nunca un horario— y por eso esto no pierde información de nada guardado.
    const guardadas = parsed as (Omit<Zona, 'tipo' | 'vigencia'> & {
      tipo?: TipoZona
      vigencia?: VentanaVigencia[]
    })[]
    return guardadas.map((z) => ({ ...z, tipo: z.tipo ?? 'reparto', vigencia: z.vigencia ?? [] }))
  } catch {
    return []
  }
}

function writeStoredZonas(zonas: Zona[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(zonas))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(zonas))
  } catch {
    // Storage deshabilitado: la sesión sigue en memoria vía Zustand.
  }
}

export interface ZonaInput {
  name: string
  tipo: TipoZona
  /** Vacío = permanente. El editor solo la ofrece para las restringidas; una de reparto la manda `[]`
   *  siempre, y eso ya es el valor correcto (rige siempre) sin necesitar un caso especial acá. */
  vigencia: VentanaVigencia[]
  cityId: number
  polygonGeoJson: ZonaPoligonoGeoJson
}

interface ZonesState {
  zonas: Zona[]
  addZona: (input: ZonaInput) => Zona
  updateZona: (id: number, input: ZonaInput) => void
  setZonaActiva: (id: number, isActive: boolean) => void
  removeZona: (id: number) => void
}

export const useZonesStore = create<ZonesState>((set, get) => ({
  zonas: readStoredZonas(),

  addZona: (input) => {
    const actuales = get().zonas
    const nextId = actuales.reduce((max, z) => Math.max(max, z.id), 0) + 1
    const ahora = nowIso()
    const nueva: Zona = {
      id: nextId,
      name: input.name,
      tipo: input.tipo,
      vigencia: input.vigencia,
      polygonGeoJson: input.polygonGeoJson,
      cityId: input.cityId,
      createdBy: USUARIO_MOCK,
      updatedBy: USUARIO_MOCK,
      createdAt: ahora,
      updatedAt: ahora,
      deletedAt: null,
      isActive: true,
    }
    const updated = [nueva, ...actuales]
    writeStoredZonas(updated)
    set({ zonas: updated })
    return nueva
  },

  // `input.tipo` SE IGNORA a propósito: el tipo se elige al crear y después no se muda.
  //
  // No es prolijidad, es que el cambio dejaría una zona inválida en el mismo instante en que se guarda.
  // Una restringida nace sin la regla de holgura encima, así que lo normal es que se pise con las de
  // reparto que la rodean (un centro histórico cerrado cae ENTERO adentro de la zona que lo atiende).
  // Pasarla a `reparto` convertiría cada uno de esos solapes en un conflicto sobre una geometría que
  // nadie dibujó pensando en esa regla, y el que abriera esa zona a continuación se encontraría con que
  // no puede guardar ni el cambio de nombre hasta rehacerle el contorno. Al revés pasa lo mismo en
  // espejo: la ex-zona de reparto libera territorio que ninguna otra cubre y el hueco no se ve.
  // Si algún día hace falta, es un flujo aparte —"convertir zona"— que muestre lo que rompe antes de
  // hacerlo, no un `<Select>` que se cambia sin querer mientras se corrige un nombre.
  //
  // LA `vigencia` SÍ SE ACTUALIZA, y la diferencia con el `tipo` no es de criterio sino de qué rompe
  // cada cambio. Mudar el tipo deja una geometría inválida contra reglas que nadie tuvo en cuenta al
  // dibujarla; cambiar el horario no toca el polígono ni a los vecinos: la obra se prorrogó dos
  // semanas y hay que decirlo. Es, de hecho, el campo que más va a cambiar de una restricción a lo
  // largo de su vida, y obligar a borrarla y redibujarla para correr una fecha sería absurdo.
  updateZona: (id, input) => {
    const updated = get().zonas.map((z) =>
      z.id === id
        ? {
            ...z,
            name: input.name,
            vigencia: input.vigencia,
            cityId: input.cityId,
            polygonGeoJson: input.polygonGeoJson,
            updatedBy: USUARIO_MOCK,
            updatedAt: nowIso(),
          }
        : z,
    )
    writeStoredZonas(updated)
    set({ zonas: updated })
  },

  setZonaActiva: (id, isActive) => {
    const updated = get().zonas.map((z) =>
      z.id === id ? { ...z, isActive, updatedBy: USUARIO_MOCK, updatedAt: nowIso() } : z,
    )
    writeStoredZonas(updated)
    set({ zonas: updated })
  },

  // Soft delete, como la columna `deleted_at` de la tabla: la zona sale de los listados activos
  // pero el registro se conserva (un plan viejo puede seguir señalando a esta zona por id).
  removeZona: (id) => {
    const updated = get().zonas.map((z) =>
      z.id === id ? { ...z, isActive: false, deletedAt: nowIso(), updatedBy: USUARIO_MOCK, updatedAt: nowIso() } : z,
    )
    writeStoredZonas(updated)
    set({ zonas: updated })
  },
}))
