// Qué está mal en este plan, ahora mismo.
//
// POR QUÉ UN MÓDULO Y NO UN `if` EN CADA COMPONENTE. Las advertencias del planificador estaban
// repartidas: el déficit de capacidad lo dibujaba `PlannerMetricas`, la sobrecarga y el exceso de
// clientes vivían dentro del panel de Rutas (y solo de la ruta que estuvieras mirando), y el gate de
// "Generar" tenía su propia lista de motivos. Cada una se veía únicamente si estabas parado en el
// lugar correcto, y ninguna contestaba la pregunta que se hace antes de despachar: **¿este plan tiene
// algún problema?**
//
// Acá NO hay React: entran los datos del plan, sale una lista de problemas ordenada por gravedad. Eso
// permite que la barra superior muestre un conteo y que el detalle se lea en un solo lugar.
//
// LO QUE ESTE MÓDULO NO HACE: bloquear. Ninguna de estas reglas impide seguir — el mockup ya venía
// decidido en ese sentido ("ALERTA, NO BLOQUEO") y con razón: hay días en que se sale igual. El único
// gate real sigue siendo el de `PlannerHud`.
import {
  MAX_CLIENTES_POR_CAMION,
  type Camion,
  type Parada,
  type Pedido,
} from '../mock-data'
import { cargaDeRuta, OCUPACION_CRITICA, type RutaPlan } from './planner-model'
import type { PanelId } from './planner-store'

const fmtPeso = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 })

/**
 * `critica` = el plan no se puede despachar así. `alerta` = se puede, pero alguien tiene que saberlo.
 *
 * Dos niveles y no tres: con tres, la diferencia entre el medio y el bajo se discute en cada regla
 * nueva y termina decidiéndose por gusto. Con dos la pregunta es binaria y siempre tiene respuesta:
 * ¿esto que ves te haría frenar el despacho?
 */
export type NivelAlerta = 'critica' | 'alerta'

export interface Alerta {
  id: string
  nivel: NivelAlerta
  titulo: string
  /** Qué pasa y qué hacer. Una alerta que no dice cómo salir es solo una mala noticia. */
  detalle: string
  /** Panel que hay que abrir para resolverla, si hay uno. */
  panel?: PanelId
}

/** Una parada necesita frío si CUALQUIERA de sus pedidos lo necesita. */
export const paradaRequiereFrio = (parada: Parada) =>
  parada.pedidos.some((p) => p.productType === 'Frío')

export function calcularAlertas({
  pedidos,
  camiones,
  rutas,
  paradasAsignadas,
  optimizado,
}: {
  /** Pedidos que EFECTIVAMENTE entran al plan. */
  pedidos: Pedido[]
  /** Camiones elegidos. */
  camiones: Camion[]
  rutas: RutaPlan[]
  /** Paradas ya proyectadas con su asignación. */
  paradasAsignadas: Parada[]
  optimizado: boolean
}): Alerta[] {
  const alertas: Alerta[] = []

  // ── Cadena de frío ────────────────────────────────────────────────────────────────────────────
  // La regla que más caro sale olvidar: un pedido refrigerado en un camión seco no llega, llega
  // podrido. Y el optimizador NO la conoce —reparte por peso—, así que sin este aviso el plan se ve
  // perfectamente sano hasta que alguien abre la puerta del camión.
  const frios = pedidos.filter((p) => p.productType === 'Frío')
  const camionesFrio = camiones.filter((c) => c.tipo === 'Frío')

  if (frios.length > 0) {
    const pesoFrioKg = frios.reduce((acc, p) => acc + p.peso, 0)

    if (camionesFrio.length === 0) {
      alertas.push({
        id: 'frio-sin-camion',
        nivel: 'critica',
        titulo: `${frios.length} pedido${frios.length !== 1 ? 's' : ''} de frío sin camión refrigerado`,
        detalle: `Son ${fmtPeso.format(pesoFrioKg)} kg que necesitan cadena de frío y ningún camión elegido es refrigerado. Sumá al menos uno desde Flota.`,
        panel: 'flota',
      })
    } else {
      // Hay camión frío, pero ¿alcanza? Se compara contra la capacidad de LOS FRÍOS, no contra la
      // total: los kilos de un camión seco no sirven para esta carga por más que sobren.
      const capacidadFrioKg = camionesFrio.reduce((acc, c) => acc + c.capacidadPeso * 1000, 0)
      if (pesoFrioKg > capacidadFrioKg) {
        alertas.push({
          id: 'frio-capacidad',
          nivel: 'critica',
          titulo: 'La flota de frío no alcanza',
          detalle: `Hay ${fmtPeso.format(pesoFrioKg)} kg de frío y ${fmtPeso.format(capacidadFrioKg)} kg de capacidad refrigerada. Faltan ${fmtPeso.format(pesoFrioKg - capacidadFrioKg)} kg.`,
          panel: 'flota',
        })
      }
    }

    // Después de repartir, dónde CAYÓ cada uno. El optimizador no mira refrigeración, así que esto no
    // es un caso raro: es lo que va a pasar casi siempre que haya frío y camiones secos.
    if (optimizado) {
      const idFrio = new Set(camionesFrio.map((c) => c.id))
      const rutaSeca = new Set(
        rutas.filter((r) => !idFrio.has(r.camion.id)).map((r) => r.id),
      )
      const malUbicadas = paradasAsignadas.filter(
        // `p.rutaId` es opcional además de nullable: sin el truthy, TS no descarta `undefined`.
        (p) => Boolean(p.rutaId) && rutaSeca.has(p.rutaId!) && paradaRequiereFrio(p),
      )
      if (malUbicadas.length > 0) {
        alertas.push({
          id: 'frio-en-camion-seco',
          nivel: 'critica',
          titulo: `${malUbicadas.length} parada${malUbicadas.length !== 1 ? 's' : ''} de frío en camión seco`,
          detalle:
            'El reparto automático no mira la refrigeración. Movelas a una ruta con camión de frío desde el mapa o el panel de Rutas.',
          panel: 'rutas',
        })
      }
    }
  }

  // ── Capacidad por ruta ────────────────────────────────────────────────────────────────────────
  if (optimizado) {
    const sobrecargadas = rutas.filter(
      (r) => cargaDeRuta(paradasAsignadas, r).ocupacionPct > OCUPACION_CRITICA,
    )
    if (sobrecargadas.length > 0) {
      alertas.push({
        id: 'sobrecarga',
        nivel: 'critica',
        titulo: `${sobrecargadas.length} ruta${sobrecargadas.length !== 1 ? 's' : ''} sobre el ${OCUPACION_CRITICA}% de capacidad`,
        detalle: `${sobrecargadas.map((r) => r.nombre).join(', ')}. Ningún acomodo mete esa carga: sacales paradas o repartilas.`,
        panel: 'rutas',
      })
    }

    const conExcesoClientes = rutas.filter(
      (r) => cargaDeRuta(paradasAsignadas, r).excedeClientes,
    )
    if (conExcesoClientes.length > 0) {
      alertas.push({
        id: 'clientes',
        nivel: 'alerta',
        titulo: `${conExcesoClientes.length} ruta${conExcesoClientes.length !== 1 ? 's' : ''} con más de ${MAX_CLIENTES_POR_CAMION} clientes`,
        detalle: `${conExcesoClientes.map((r) => r.nombre).join(', ')}. Les sobra caja pero no les da la jornada.`,
        panel: 'rutas',
      })
    }

    // ── PARADAS SIN CAMIÓN: DOS CAUSAS, Y NO SE ARREGLAN IGUAL ──────────────────────────────────
    //
    // Este aviso decía siempre «no entraron con la capacidad elegida», y para la causa más frecuente
    // era MENTIRA: la mayoría de las veces la parada lleva producto de FRÍO y no hay ningún camión
    // refrigerado en el plan. Con ese texto, el que lo leía sumaba camiones secos y la parada seguía
    // sin asignarse — el consejo empujaba al lado contrario de la solución.
    //
    // La refrigeración es una restricción DURA en `optimizar` (`sirve`): un camión seco no lleva frío
    // ni aunque le sobre lugar. Un camión de frío sí puede llevar carga seca, así que la restricción
    // corre en un solo sentido y por eso alcanza con preguntar si HAY alguno.
    const sinAsignar = paradasAsignadas.filter((p) => !p.rutaId)
    if (sinAsignar.length > 0) {
      // TERCERA CAUSA, y la más nueva: la parada es de un centro que no puso ningún camión en el
      // plan. Una ruta es de UNA distribuidora —sale de su depósito, con su mercadería— así que una
      // parada de un centro sin flota elegida no la puede llevar nadie por más lugar que sobre.
      //
      // Se separa por lo mismo que se separó el frío: sin distinguirla, el aviso decía «no entraron
      // con la capacidad elegida» y el consejo era sumar camiones — de la distribuidora equivocada.
      const centrosConFlota = new Set(rutas.map((r) => r.salidaId))
      const porCentro = sinAsignar.filter(
        (p) => p.distribuidoraId != null && !centrosConFlota.has(p.distribuidoraId),
      )
      const restantes = sinAsignar.filter((p) => !porCentro.includes(p))

      const hayCamionDeFrio = rutas.some((r) => r.camion.tipo === 'Frío')
      const porFrio = hayCamionDeFrio ? [] : restantes.filter(paradaRequiereFrio)
      const porCapacidad = restantes.length - porFrio.length

      if (porCentro.length > 0) {
        alertas.push({
          id: 'sin-asignar-centro',
          nivel: 'alerta',
          titulo: `${porCentro.length} parada${porCentro.length !== 1 ? 's' : ''} sin flota de su centro`,
          detalle:
            'Son de un centro de distribución que no puso ningún camión en el plan. Una ruta sale de un solo depósito, así que ningún otro camión las puede llevar: elegí flota de ese centro desde Flota, o sacá el centro del alcance.',
          panel: 'flota',
        })
      }

      if (porFrio.length > 0) {
        alertas.push({
          id: 'sin-asignar-frio',
          nivel: 'alerta',
          titulo: `${porFrio.length} parada${porFrio.length !== 1 ? 's' : ''} sin camión de frío`,
          detalle:
            'Llevan producto refrigerado y no hay ningún camión de frío en el plan. Sumá uno desde Flota: un camión de frío también puede cargar seco, así que no hace falta sacar nada.',
          panel: 'flota',
        })
      }

      if (porCapacidad > 0) {
        alertas.push({
          id: 'sin-asignar',
          nivel: 'alerta',
          titulo: `${porCapacidad} parada${porCapacidad !== 1 ? 's' : ''} sin camión`,
          detalle:
            'No entraron en ninguna ruta con la capacidad elegida. Sumá flota, movelas a mano o sacalas del plan.',
          panel: 'rutas',
        })
      }
    }
  }

  // Las críticas primero. Dentro de cada nivel se respeta el orden en que se agregaron, que va de lo
  // que impide despachar a lo que solo conviene mirar.
  return alertas.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'critica' ? -1 : 1))
}
