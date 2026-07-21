// Conversión de unidades de peso: `Camion.capacidadPeso` viene en TONELADAS, `Pedido.peso` en
// KILOGRAMOS (ver mock-data.ts). Punto único de conversión — cualquier suma o comparación de peso
// entre camiones y pedidos pasa por acá para no desfasarse por un factor de 1000. Unidad canónica:
// tonelada.
export const KG_PER_TON = 1000

export const kgToTons = (kg: number): number => kg / KG_PER_TON

export const tonsToKg = (tons: number): number => tons * KG_PER_TON
