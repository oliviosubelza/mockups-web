// Store de ACTIVOS LOGÍSTICOS (tabla `logistic_assets`) — el catálogo del bandeo.
//
// QUÉ ES EL BANDEO. Todo lo que el camión se lleva y NO es mercadería: pallets, carritos de carga
// ("burritos"), jabas, y mañana refrigeradores. La pregunta que hoy no tiene respuesta en el sistema es
// "salió con 12 pallets, ¿volvió con 12?".
//
// POR QUÉ ESTE STORE APARECE AHORA. El módulo del bandeo (`accesorios.ts`) ya existía, pero su catálogo
// era una CONSTANTE en el código con el comentario "no hay tabla de accesorios en el esquema ni pantalla
// de dato maestro". El esquema nuevo trae `logistic_assets`, así que el catálogo pasa a ser dato editable
// y esto es su respaldo.
//
// DATO MAESTRO, NO DATO DE UN PLAN: se da de alta una vez y lo usan muchas OTs, así que vive suelto
// (mismo criterio que `zones-store` y `planes-store`, y no `dispatch-plan-store`, que es del plan activo).
//
// LA BANDERA `isSerialized` ES EL CORAZÓN DEL MODELO, no una opción más del formulario. Divide en dos el
// modo de contar:
//   · `false` → por CANTIDAD. Doce pallets son doce pallets, son intercambiables. "Salió con 12, volvió
//     con 10, faltan 2" y no importa cuáles dos.
//   · `true`  → por SERIE. Cada unidad es un activo fijo con código propio (el caso del refrigerador, que
//     vive en SAP), así que se sabe exactamente cuál no volvió.
// Es UN catálogo con una bandera y no dos entidades: el día que Activos Fijos entregue los
// refrigeradores se agrega una fila y no se rehace nada.
import { create } from 'zustand'

const STORAGE_KEY = 'mockups-web:activos-logisticos'
const USUARIO_MOCK = 'Juan Pérez'

/**
 * Valores de `logistic_assets.asset_type`.
 *
 * Los cuatro primeros son los que enumera el comentario de la columna en el esquema. `REFRIGERATOR` lo
 * agregamos nosotros: el bandeo incluye refrigeradores (es el único caso serializado que existe) y el
 * enumerado del esquema no tiene casillero para uno — `THERMO_LOGGER` es un registrador de temperatura,
 * un aparato distinto. La columna es `VARCHAR(50)` sin CHECK, así que sumar el valor no rompe nada, pero
 * hay que confirmarlo con el equipo de datos antes de que el backend valide el enumerado.
 */
export type TipoActivo = 'PALLET' | 'HAND_TRUCK' | 'CRATE' | 'THERMO_LOGGER' | 'REFRIGERATOR'

/**
 * Etiquetas de cada tipo.
 *
 * `plural` está acá y NO en la tabla: `logistic_assets` tiene `name` y nada más, y el español no forma
 * el plural agregando una `s` en todos los casos ("jaba"/"jabas" sí, pero el nombre libre que escriba el
 * usuario puede terminar en cualquier letra). Como el badge del bandeo dice "12 pallets", el plural tiene
 * que salir de algún lado: sale del TIPO, que es un enumerado cerrado, no del nombre libre de la fila.
 */
export const TIPO_ACTIVO_META: Record<TipoActivo, { label: string; plural: string; nota?: string }> = {
  PALLET: { label: 'Pallet', plural: 'Pallets' },
  HAND_TRUCK: {
    label: 'Carrito de carga',
    plural: 'Carritos de carga',
    nota: 'También "burrito". No está en ningún padrón: se cuenta, no se identifica.',
  },
  CRATE: { label: 'Jaba', plural: 'Jabas' },
  THERMO_LOGGER: {
    label: 'Registrador de temperatura',
    plural: 'Registradores de temperatura',
    nota: 'Aparato de cadena de frío. Va por serie porque cada uno se calibra aparte.',
  },
  REFRIGERATOR: {
    label: 'Refrigerador',
    plural: 'Refrigeradores',
    nota: 'Activo fijo de SAP: cada unidad va con su código. Tipo no incluido en el enumerado del esquema.',
  },
}

export const TIPOS_ACTIVO = Object.keys(TIPO_ACTIVO_META) as TipoActivo[]

/** Espejo de la fila `logistic_assets`. */
export interface ActivoLogistico {
  id: number
  /** `null` = flota global/corporativa, no de una distribuidora puntual (la columna es NULLABLE). */
  distributorId: number | null
  code: string
  name: string
  assetType: TipoActivo
  isSerialized: boolean
  tareWeightKg: number
  tareVolumeM3: number
  isActive: boolean
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** Lo que el formulario entrega. Sin ids ni auditoría: eso lo pone el store. */
export interface ActivoLogisticoInput {
  distributorId: number | null
  code: string
  name: string
  assetType: TipoActivo
  isSerialized: boolean
  tareWeightKg: number
  tareVolumeM3: number
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Catálogo sembrado.
 *
 * Los cuatro primeros son los MISMOS que ya tenía `accesorios.ts` como constante (pallet, carrito, jaba,
 * refrigerador) y con los mismos pesos: así el catálogo editable y el módulo del bandeo dicen lo mismo
 * mientras no estén cableados entre sí. Los otros dos existen para que los filtros de la pantalla tengan
 * algo que filtrar de entrada: uno de una distribuidora puntual y uno dado de baja.
 */
function defaultActivosSeed(): ActivoLogistico[] {
  const creado = nowIso()
  const seeds: (ActivoLogisticoInput & { isActive?: boolean })[] = [
    {
      code: 'PALLET-STD',
      name: 'Pallet madera estándar (1,20 × 1,00 m)',
      assetType: 'PALLET',
      isSerialized: false,
      tareWeightKg: 25,
      tareVolumeM3: 0.12,
      distributorId: null,
    },
    {
      code: 'CART-300KG',
      name: 'Carrito de carga 2 ruedas (300 kg)',
      assetType: 'HAND_TRUCK',
      isSerialized: false,
      tareWeightKg: 18,
      tareVolumeM3: 0.35,
      distributorId: null,
    },
    {
      code: 'CANASTILLA-VERDE',
      name: 'Jaba plástica verde',
      assetType: 'CRATE',
      isSerialized: false,
      tareWeightKg: 2,
      tareVolumeM3: 0.04,
      distributorId: null,
    },
    {
      code: 'REFRI-SAP',
      name: 'Refrigerador comercial (activo fijo)',
      assetType: 'REFRIGERATOR',
      isSerialized: true,
      tareWeightKg: 45,
      tareVolumeM3: 0.9,
      distributorId: null,
    },
    {
      code: 'THERMO-01',
      name: 'Registrador de temperatura reutilizable',
      assetType: 'THERMO_LOGGER',
      isSerialized: true,
      tareWeightKg: 0.4,
      tareVolumeM3: 0.001,
      distributorId: 501,
    },
    {
      code: 'PALLET-EUR',
      name: 'Pallet europeo (retirado de circulación)',
      assetType: 'PALLET',
      isSerialized: false,
      tareWeightKg: 22,
      tareVolumeM3: 0.11,
      distributorId: null,
      isActive: false,
    },
  ]
  return seeds.map((seed, i) => ({
    id: i + 1,
    distributorId: seed.distributorId,
    code: seed.code,
    name: seed.name,
    assetType: seed.assetType,
    isSerialized: seed.isSerialized,
    tareWeightKg: seed.tareWeightKg,
    tareVolumeM3: seed.tareVolumeM3,
    isActive: seed.isActive ?? true,
    createdBy: USUARIO_MOCK,
    updatedBy: USUARIO_MOCK,
    createdAt: creado,
    updatedAt: creado,
    deletedAt: null,
  }))
}

function readStored(): ActivoLogistico[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const seed = defaultActivosSeed()
      writeStored(seed)
      return seed
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as ActivoLogistico[]) : defaultActivosSeed()
  } catch {
    return defaultActivosSeed()
  }
}

function writeStored(activos: ActivoLogistico[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(activos))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activos))
  } catch {
    // Storage deshabilitado: la sesión sigue en memoria vía Zustand.
  }
}

/** Normalización del código: es un identificador, no una frase. Sin espacios de sobra y en mayúsculas. */
export const normalizarCodigo = (code: string) => code.trim().toUpperCase()

interface LogisticAssetsState {
  activos: ActivoLogistico[]
  addActivo: (input: ActivoLogisticoInput) => ActivoLogistico
  updateActivo: (id: number, input: ActivoLogisticoInput) => void
  setActivoEnUso: (id: number, isActive: boolean) => void
  removeActivo: (id: number) => void
  restaurarSeed: () => void
}

export const useLogisticAssetsStore = create<LogisticAssetsState>((set, get) => ({
  activos: readStored(),

  addActivo: (input) => {
    const actuales = get().activos
    const nextId = actuales.reduce((max, a) => Math.max(max, a.id), 0) + 1
    const ahora = nowIso()
    const nuevo: ActivoLogistico = {
      ...input,
      code: normalizarCodigo(input.code),
      name: input.name.trim(),
      id: nextId,
      isActive: true,
      createdBy: USUARIO_MOCK,
      updatedBy: USUARIO_MOCK,
      createdAt: ahora,
      updatedAt: ahora,
      deletedAt: null,
    }
    const updated = [nuevo, ...actuales]
    writeStored(updated)
    set({ activos: updated })
    return nuevo
  },

  updateActivo: (id, input) => {
    const updated = get().activos.map((a) =>
      a.id === id
        ? {
            ...a,
            ...input,
            code: normalizarCodigo(input.code),
            name: input.name.trim(),
            updatedBy: USUARIO_MOCK,
            updatedAt: nowIso(),
          }
        : a,
    )
    writeStored(updated)
    set({ activos: updated })
  },

  // `is_active` es "está en circulación", NO "existe". Un activo retirado sigue nombrado en las OTs
  // viejas, así que se apaga para que no aparezca al cargar bandeo nuevo y nada más.
  setActivoEnUso: (id, isActive) => {
    const updated = get().activos.map((a) =>
      a.id === id ? { ...a, isActive, updatedBy: USUARIO_MOCK, updatedAt: nowIso() } : a,
    )
    writeStored(updated)
    set({ activos: updated })
  },

  // Soft delete, como la columna `deleted_at`: la fila sale de los listados pero el registro se
  // conserva — `transport_order_assets.logistic_asset_id` de un viaje viejo sigue apuntando acá.
  removeActivo: (id) => {
    const ahora = nowIso()
    const updated = get().activos.map((a) =>
      a.id === id ? { ...a, isActive: false, deletedAt: ahora, updatedBy: USUARIO_MOCK, updatedAt: ahora } : a,
    )
    writeStored(updated)
    set({ activos: updated })
  },

  /** Vuelve al catálogo sembrado. Es un botón de demo, como el "Reiniciar" de la lista de planes. */
  restaurarSeed: () => {
    const seed = defaultActivosSeed()
    writeStored(seed)
    set({ activos: seed })
  },
}))

/** `true` si otro activo VIVO ya usa ese código. El código es el identificador operativo del catálogo. */
export function codigoEnUso(activos: ActivoLogistico[], code: string, exceptId?: number): boolean {
  const buscado = normalizarCodigo(code)
  return activos.some((a) => !a.deletedAt && a.id !== exceptId && a.code === buscado)
}
