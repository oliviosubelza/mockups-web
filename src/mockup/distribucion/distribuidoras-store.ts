// Store de DISTRIBUIDORAS (tabla `distributors`) — el maestro editable.
//
// ═══ POR QUÉ APARECE AHORA ═══
//
// `DISTRIBUIDORAS` en `mock-data` era una CONSTANTE derivada de los pools: diez filas fijas con nombre,
// ciudad y coordenadas calculadas. Alcanzaba mientras la distribuidora fuera solo un filtro. Dejó de
// alcanzar con las zonas de distribución: para partir el mapa de una ciudad hay que poder DAR DE ALTA la
// segunda distribuidora, ponerle nombre y decir dónde está su depósito — y eso es un CRUD.
//
// Mismo patrón que `logistic-assets-store`, que ya recorrió este camino (era una constante en
// `accesorios.ts` hasta que el esquema trajo `logistic_assets`): dato maestro, vive suelto, se siembra la
// primera vez y después se persiste.
//
// ═══ LA SIEMBRA SALE DE `DISTRIBUIDORAS`, Y NO SE DUPLICA ═══
//
// Los ids (501…), los nombres y las coordenadas los sigue calculando `mock-data`. Este store los COPIA la
// primera vez y de ahí en adelante es el dueño. Escribir la semilla a mano acá daría dos listas de
// distribuidoras que se van separando en cuanto alguien toque el volumen o el reparto por ciudad.
//
// LO QUE SE PAGA, Y CONVIENE SABERLO: las otras pantallas (planificación, monitoreo, activos, catálogo de
// restricciones) siguen leyendo la CONSTANTE. Una distribuidora creada acá no aparece en sus filtros. Es
// el mismo alcance que ya tienen `zones-store` y `logistic-assets-store` —lo que se crea en la pantalla de
// dato maestro no se propaga al resto del mockup— y arreglarlo de verdad es reemplazar la constante por
// este store en los diez archivos que la importan, que es un cambio de otra conversación.
//
// ═══ LA UBICACIÓN ES OBLIGATORIA ═══
//
// `distributors.latitude` y `longitude` son `NOT NULL` en el esquema, y con razón: el depósito es el ancla
// física desde la que se decide qué territorio le toca. Por eso el formulario no deja guardar sin
// coordenada, y por eso `DistribuidoraInput` las pide como `number` y no como `number | null`.
import { create } from 'zustand'
import { DISTRIBUIDORAS } from '../mock-data'

const STORAGE_KEY = 'mockups-web:distribuidoras-v2'
const USUARIO_MOCK = 'Juan Pérez'

/** Espejo de la fila `distributors`. `departmentId` queda afuera: en `db_script.sql` está comentado. */
export interface Distribuidora {
  id: number
  name: string
  cityId: number
  latitude: number
  longitude: number
  isActive: boolean
  /**
   * Este centro recibe los pedidos que NO caen dentro de ningún contorno de su ciudad.
   *
   * ═══ POR QUÉ HACE FALTA ═══
   *
   * Los contornos no tienen por qué cubrir la ciudad entera, y esa es justamente la forma en que se
   * quiere trabajar: con dos centros en una ciudad, se le dibuja el territorio a UNO —el que atiende
   * una zona concreta— y el otro se queda con todo lo demás sin tener que trazar el negativo del
   * primero a mano. Sin esta bandera, un pedido que cae en un hueco no tiene despachante y el hueco
   * hay que taparlo dibujando.
   *
   * ═══ UNO POR CIUDAD, COMO MÁXIMO ═══
   *
   * En la base sería un `UNIQUE (city_id) WHERE is_default AND deleted_at IS NULL` —el mismo recurso
   * con el que `distribution_zones` sostiene su una-zona-por-distribuidora—. Acá lo sostiene
   * `setDistribuidoraPorDefecto`, que apaga la bandera en las hermanas de la misma ciudad antes de
   * prenderla. Cero también es un estado válido: una ciudad sin predeterminado deja los huecos sin
   * dueño, y la pantalla lo avisa en vez de elegir por su cuenta.
   */
  isDefault: boolean
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Lo que el formulario entrega. Sin ids ni auditoría: eso lo pone el store. */
export interface DistribuidoraInput {
  name: string
  cityId: number
  latitude: number
  longitude: number
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Copia de `DISTRIBUIDORAS`, que sigue siendo la fuente de los ids, nombres y coordenadas. */
function semilla(): Distribuidora[] {
  const creado = nowIso()
  const primeraDeCadaCiudad = new Map<number, number>()
  for (const d of DISTRIBUIDORAS) {
    if (!primeraDeCadaCiudad.has(d.cityId)) primeraDeCadaCiudad.set(d.cityId, d.id)
  }
  return DISTRIBUIDORAS.map((d) => ({
    id: d.id,
    name: d.nombre,
    cityId: d.cityId,
    latitude: d.lat,
    longitude: d.lng,
    isActive: true,
    // La PRIMERA de cada ciudad arranca como predeterminada. Sembrar el maestro sin ninguna dejaría
    // a todas las ciudades avisando "sin predeterminado" desde el primer arranque, que es una alarma
    // por un estado que nadie provocó.
    isDefault: primeraDeCadaCiudad.get(d.cityId) === d.id,
    createdBy: USUARIO_MOCK,
    updatedBy: USUARIO_MOCK,
    createdAt: creado,
    updatedAt: creado,
    deletedAt: null,
  }))
}

/**
 * Lo guardado, o la semilla.
 *
 * ACÁ SÍ SE SIEMBRA, al revés que en `zones-store` y `distribucion-store`. La diferencia no es de gusto:
 * una zona sin dibujar es un estado legítimo, pero un maestro de distribuidoras VACÍO no lo es —sin
 * ninguna, la pantalla no tiene nada que filtrar ni a quién dibujarle una zona, y el resto del mockup
 * (pedidos, planes, camiones) apunta a esos ids—. Un `[]` parseado se trata como corrupción y se resiembra,
 * mismo criterio que `logistic-assets-store`.
 */
function readStored(): Distribuidora[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const inicial = semilla()
      writeStored(inicial)
      return inicial
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Distribuidora[]) : semilla()
  } catch {
    return semilla()
  }
}

function writeStored(distribuidoras: Distribuidora[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(distribuidoras))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(distribuidoras))
  } catch {
    // Storage deshabilitado: la sesión sigue en memoria vía Zustand.
  }
}

interface DistribuidorasState {
  distribuidoras: Distribuidora[]
  addDistribuidora: (input: DistribuidoraInput) => Distribuidora
  updateDistribuidora: (id: number, input: DistribuidoraInput) => void
  setDistribuidoraActiva: (id: number, isActive: boolean) => void
  /**
   * Pone (o saca) el predeterminado de una ciudad. Excluyente: prenderlo en una lo apaga en sus
   * hermanas, que es lo que en la base haría el índice único parcial.
   */
  setDistribuidoraPorDefecto: (id: number, esDefecto: boolean) => void
  /** Borrado LÓGICO: sale de los listados pero los planes viejos siguen apuntando a su id. */
  removeDistribuidora: (id: number) => void
  resetDistribuidoras: () => void
}

export const useDistribuidorasStore = create<DistribuidorasState>((set, get) => ({
  distribuidoras: readStored(),

  addDistribuidora: (input) => {
    const actuales = get().distribuidoras
    const ahora = nowIso()
    const nueva: Distribuidora = {
      // El id sale del máximo de TODAS las filas, borradas incluidas: reusar el id de una eliminada haría
      // que un plan viejo apunte a una distribuidora distinta de la que despachó.
      id: actuales.reduce((max, d) => Math.max(max, d.id), 500) + 1,
      name: input.name.trim(),
      cityId: input.cityId,
      latitude: input.latitude,
      longitude: input.longitude,
      isActive: true,
      // Un alta nunca se roba el predeterminado de su ciudad: si ya hay uno, cambiarlo es una decisión
      // explícita. Solo lo toma si la ciudad no tenía ninguno, que es el caso de la primera de todas.
      isDefault: !actuales.some((d) => d.cityId === input.cityId && d.deletedAt === null && d.isDefault),
      createdBy: USUARIO_MOCK,
      updatedBy: USUARIO_MOCK,
      createdAt: ahora,
      updatedAt: ahora,
      deletedAt: null,
    }
    const siguientes = [...actuales, nueva]
    writeStored(siguientes)
    set({ distribuidoras: siguientes })
    return nueva
  },

  updateDistribuidora: (id, input) => {
    const ahora = nowIso()
    const siguientes = get().distribuidoras.map((d) =>
      d.id === id
        ? {
            ...d,
            name: input.name.trim(),
            cityId: input.cityId,
            latitude: input.latitude,
            longitude: input.longitude,
            updatedBy: USUARIO_MOCK,
            updatedAt: ahora,
          }
        : d,
    )
    writeStored(siguientes)
    set({ distribuidoras: siguientes })
  },

  setDistribuidoraPorDefecto: (id, esDefecto) => {
    const ahora = nowIso()
    const objetivo = get().distribuidoras.find((d) => d.id === id)
    if (!objetivo) return
    const siguientes = get().distribuidoras.map((d) => {
      // Fuera de la ciudad del objetivo no se toca nada: el predeterminado es por ciudad.
      if (d.cityId !== objetivo.cityId) return d
      const valor = d.id === id ? esDefecto : false
      if (d.isDefault === valor) return d
      return { ...d, isDefault: valor, updatedBy: USUARIO_MOCK, updatedAt: ahora }
    })
    writeStored(siguientes)
    set({ distribuidoras: siguientes })
  },

  setDistribuidoraActiva: (id, isActive) => {
    const ahora = nowIso()
    const siguientes = get().distribuidoras.map((d) =>
      d.id === id ? { ...d, isActive, updatedBy: USUARIO_MOCK, updatedAt: ahora } : d,
    )
    writeStored(siguientes)
    set({ distribuidoras: siguientes })
  },

  removeDistribuidora: (id) => {
    const ahora = nowIso()
    const siguientes = get().distribuidoras.map((d) =>
      d.id === id ? { ...d, deletedAt: ahora, updatedBy: USUARIO_MOCK, updatedAt: ahora } : d,
    )
    writeStored(siguientes)
    set({ distribuidoras: siguientes })
  },

  resetDistribuidoras: () => {
    const inicial = semilla()
    writeStored(inicial)
    set({ distribuidoras: inicial })
  },
}))

/**
 * Las distribuidoras VIVAS de una ciudad.
 *
 * Reemplaza a `distribuidorasDeCiudad` de `mock-data` en esta pantalla: esa lee la constante y no ve las
 * que se dieron de alta acá. El filtro por `cityId` es el mismo — es lo que hace que al elegir una ciudad
 * se oculten las distribuidoras de las vecinas, aunque el mapa las tenga a treinta kilómetros y entren en
 * el mismo cuadro.
 */
export const distribuidorasVivasDeCiudad = (
  distribuidoras: Distribuidora[],
  cityId: number,
): Distribuidora[] => distribuidoras.filter((d) => d.deletedAt === null && d.cityId === cityId)

/** El centro predeterminado de una ciudad, o `undefined` si nadie lo es. */
export const distribuidoraPorDefectoDeCiudad = (
  distribuidoras: Distribuidora[],
  cityId: number,
): Distribuidora | undefined =>
  distribuidoras.find((d) => d.deletedAt === null && d.cityId === cityId && d.isDefault)
