/**
 * The product catalogue: Grupo Venado's real portfolio, the same rows the
 * pre-venta app (`app_sales`) sells from — Kris (salsas, culinarios, postres,
 * cereales, gelatinas, bebidas en polvo), Bristar (limpieza), Frussion and
 * Speranza (bebidas listas), plus the Fleischmann licence.
 *
 * It started as the list "registro de baja rotación" tasks name a product from,
 * and now also prices the order lines, so each SKU carries its packaging, its
 * tariff and how it has to travel.
 *
 * A real backend owns this list. Codes are grouped by product line — 1xxxx
 * singles, 2xxxx gelatinas, 3xxxx bebidas en polvo, 4xxxx salsas, 5xxxx
 * cereales, 6xxxx culinarios, 7xxxx postres, 8xxxx bebidas listas — and within a
 * line the middle digits are the size and the last the flavor. The database only
 * requires uniqueness; the grouping is here so a human can still scan the list.
 *
 * Families are written in the app's own title case rather than the ERP's
 * uppercase, because `family` is printed straight into a filter dropdown and a
 * badge — the value is the label, and a dropdown of shouted words reads as an
 * error state.
 */
import type { StorageClass } from "../types";

export interface Product {
  /** Mock id, always `prd_` + `code`: one product, one code, no second identity. */
  id: string;
  /** Business code (`Cod` in the ERP) — an integer, not an alphanumeric SKU. */
  code: number;
  /** Full commercial description, flavor and size included — what the DB stores. */
  name: string;
  /**
   * Name without flavor or size, e.g. "Mayonesa Kris". Not a database column: it
   * is derived so sibling rows of the same line can be matched — which is what a
   * bonification is swapped for.
   */
  baseName: string;
  /**
   * Flavor as it appears inside `name`. The database has no flavor attribute, so
   * two flavors of the same line are unrelated rows that only look alike.
   */
  flavor?: string;
  /** Size attribute, e.g. "250 gr" / "1 L". Real column, unlike flavor. */
  sizeLabel: string;
  /**
   * Commercial family the SKU belongs to. The widest of the three filter
   * dimensions the pickers narrow by, and the key the owning company hangs off.
   */
  family: string;
  /**
   * Legal entity that sells this SKU. The catalogue spans several, which is why
   * one order can end up split into one document per company.
   */
  company: string;
  /**
   * How it has to travel. A dry SKU and a refrigerated one cannot share a load,
   * so this is what splits a company's dispatch a second time.
   */
  storage: StorageClass;
  /** Label of the minimum sale unit, as it reads on an order line. */
  unitLabel: string;
  /** Label of the maximum sale unit. */
  caseLabel: string;
  /** Minimum units contained in one maximum unit. */
  unitsPerCase: number;
  /**
   * The SKU's only tariff: price of one minimum unit (Bs).
   *
   * A case has no price of its own — it is valued as the minimum units it
   * contains, which is how the ERP prices a line.
   */
  priceUnit: number;
  /**
   * ICE per *minimum unit* (Bs), never the line's total. Only the bebidas listas
   * carry it: the tax lands on the sealed bottle and not on the sobre the same
   * juice is sold as elsewhere in this catalogue.
   */
  ice: number;
  /**
   * Units on hand at the warehouse, counted in *minimum* units — the same unit
   * `priceUnit` is quoted in, so "24" means 24 bottles and not 24 cases.
   *
   * A real backend owns this and it moves by the minute; here it is a fixed
   * figure per SKU, spread on purpose so the picker's three states (holgado,
   * bajo, agotado) are all reachable in the mock.
   *
   * Whether it *gates* depends on who is selling, and the two answers are both
   * right:
   *
   * - **Pre-venta informs.** The seller takes the order and the warehouse fills
   *   it later, so a SKU at zero is still orderable and the number is a warning.
   * - **Venta en agencia gates.** The goods leave the counter in the buyer's
   *   hands, so what is not on the shelf cannot be sold — see
   *   `stockBlockedReason` in the agency sales service.
   */
  stock: number;
}

/** Below this many minimum units the picker calls the stock low. */
export const LOW_STOCK_THRESHOLD = 60;

/**
 * Which empresa owns a SKU: the family, then the default. Two layers, and no
 * exception list — the three legal entities are organised by product line rather
 * than by brand, so the family is a complete key. The Fleischmann sobre is
 * panadería, so it is Vemassa alongside the Kris polvo para hornear next to it;
 * Speranza water is a bebida, so it is Facrulesa alongside Frussion.
 *
 * Ivsa is the default rather than a listed key because it holds the largest
 * share: listing it would mean naming six families to say "everything else", and
 * every family added later would have to be added here too to keep the same
 * answer.
 */
const DEFAULT_COMPANY = "IVSA";
const COMPANY_BY_FAMILY: Record<string, string> = {
  Bebidas: "FACRULESA",
  Panadería: "VEMASSA",
  Postres: "VEMASSA",
  Gelatinas: "VEMASSA",
};

/**
 * The cold chain, by product line rather than by row: the two bebidas listas
 * lines travel refrigerated and everything else travels dry.
 *
 * It is a property of the line and not of the size, so naming the line keeps the
 * nine bottle rows from disagreeing with each other. Both lines are Facrulesa's,
 * which is what gives an order the two shapes of the per-company reading at
 * once — two companies whose goods all travel dry show their products straight
 * away, and the third divides into two loads first.
 */
const COLD_CHAIN_LINES = new Set(["Frussion", "Agua Speranza"]);

function product(opts: {
  code: number;
  baseName: string;
  family: string;
  sizeLabel: string;
  unitLabel: string;
  priceUnit: number;
  unitsPerCase: number;
  stock: number;
  caseLabel?: string;
  flavor?: string;
  ice?: number;
}): Product {
  const { caseLabel = "Caja", ice = 0, flavor, ...rest } = opts;
  return {
    ...rest,
    flavor,
    caseLabel,
    ice,
    id: `prd_${opts.code}`,
    company: COMPANY_BY_FAMILY[opts.family] ?? DEFAULT_COMPANY,
    storage: COLD_CHAIN_LINES.has(opts.baseName) ? "REFRIGERADO" : "SECO",
    // The description is assembled from the parts instead of the parts being
    // parsed back out of it: the database stores only this string, and guessing
    // where the flavor ends is exactly the mistake this model avoids.
    name: `${opts.baseName}${flavor ? ` ${flavor}` : ""} ${opts.sizeLabel}`,
  };
}

export const PRODUCTS: Product[] = [
  // Single-row lines: no sibling shares their baseName, so a bonification of one
  // of these has only itself to offer.
  product({ code: 10010, baseName: "Aceite de Oliva Kris", family: "Aceites", sizeLabel: "250 ml", unitLabel: "Botella", priceUnit: 39.9, unitsPerCase: 12, stock: 640 }),
  product({ code: 10020, baseName: "Maicena Kris", family: "Abarrotes", sizeLabel: "200 gr", unitLabel: "Bolsa", priceUnit: 6.2, unitsPerCase: 24, stock: 1980 }),
  product({ code: 10030, baseName: "Avena Kris Instantánea", family: "Cereales", sizeLabel: "400 gr", unitLabel: "Bolsa", priceUnit: 16.7, unitsPerCase: 20, stock: 1240 }),
  product({ code: 10040, baseName: "Puré de Papas Kris", family: "Culinarios", sizeLabel: "250 gr", unitLabel: "Estuche", priceUnit: 36.1, unitsPerCase: 12, stock: 380 }),
  product({ code: 10050, baseName: "Detergente Bristar en Polvo", family: "Limpieza", sizeLabel: "2 kg", unitLabel: "Bolsa", priceUnit: 46.7, unitsPerCase: 8, stock: 296 }),
  product({ code: 10060, baseName: "Levadura Fleischmann Seca Activa", family: "Panadería", sizeLabel: "170 gr", unitLabel: "Sobre", priceUnit: 18.9, unitsPerCase: 20, stock: 54 }),
  product({ code: 10070, baseName: "Polvo para Hornear Kris", family: "Panadería", sizeLabel: "57 gr", unitLabel: "Sobre", priceUnit: 4.8, unitsPerCase: 24, stock: 1416 }),
  product({ code: 10080, baseName: "Lavavajillas Bristar Limón", family: "Limpieza", sizeLabel: "1050 ml", unitLabel: "Botella", priceUnit: 20.6, unitsPerCase: 12, stock: 720 }),
  product({ code: 10090, baseName: "Extracto de Tomate Kris", family: "Salsas", sizeLabel: "140 gr", unitLabel: "Doypack", priceUnit: 6.7, unitsPerCase: 24, stock: 2160 }),
  product({ code: 10100, baseName: "Salsa Golf Kris", family: "Salsas", sizeLabel: "380 gr", unitLabel: "Pomo", priceUnit: 25.6, unitsPerCase: 12, stock: 468 }),
  product({ code: 10110, baseName: "Salsa Barbacoa Kris", family: "Salsas", sizeLabel: "430 gr", unitLabel: "Pomo", priceUnit: 25.7, unitsPerCase: 12, stock: 41 }),
  product({ code: 10120, baseName: "Gelatina de Pata Kris", family: "Postres", sizeLabel: "120 gr", unitLabel: "Estuche", priceUnit: 9.3, unitsPerCase: 24, stock: 0 }),
  product({ code: 10130, baseName: "Lavandina Bristar Original", family: "Limpieza", sizeLabel: "1 L", unitLabel: "Botella", priceUnit: 13.3, unitsPerCase: 12, stock: 1104 }),
  product({ code: 10140, baseName: "Mejorador de Masa Kris", family: "Panadería", sizeLabel: "300 gr", unitLabel: "Bolsa", priceUnit: 49.4, unitsPerCase: 10, stock: 130 }),
  product({ code: 10150, baseName: "Mostaza Kris", family: "Salsas", sizeLabel: "120 gr", unitLabel: "Sachet", priceUnit: 4.7, unitsPerCase: 24, stock: 1848 }),
  product({ code: 10160, baseName: "Caldo Kris de Gallina", family: "Culinarios", sizeLabel: "95 gr", unitLabel: "Estuche", priceUnit: 13.3, unitsPerCase: 24, stock: 912 }),
  product({ code: 10170, baseName: "Salsa Kris Criolla para Churrasco", family: "Salsas", sizeLabel: "200 gr", unitLabel: "Frasco", priceUnit: 14.0, unitsPerCase: 12, stock: 36 }),
  product({ code: 10180, baseName: "Ambientador Bristar Citrus", family: "Limpieza", sizeLabel: "360 ml", unitLabel: "Aerosol", priceUnit: 17.3, unitsPerCase: 12, stock: 252 }),
  product({ code: 10190, baseName: "Multiuso Bristar Citrus", family: "Limpieza", sizeLabel: "930 ml", unitLabel: "Botella", priceUnit: 21.8, unitsPerCase: 12, stock: 384 }),

  // GELATINA KRIS — the matrix is ragged in the catalog itself: the 230 gr sobre
  // and the 250 gr sobre carry different flavors, they are not two sizes of one.
  product({ code: 20101, baseName: "Gelatina Kris", flavor: "Frutilla", family: "Gelatinas", sizeLabel: "230 gr", unitLabel: "Sobre", priceUnit: 9.7, unitsPerCase: 24, stock: 1536 }),
  product({ code: 20105, baseName: "Gelatina Kris", flavor: "Cereza", family: "Gelatinas", sizeLabel: "230 gr", unitLabel: "Sobre", priceUnit: 9.7, unitsPerCase: 24, stock: 984 }),
  product({ code: 20107, baseName: "Gelatina Kris", flavor: "Frambuesa", family: "Gelatinas", sizeLabel: "230 gr", unitLabel: "Sobre", priceUnit: 9.7, unitsPerCase: 24, stock: 48 }),
  product({ code: 20202, baseName: "Gelatina Kris", flavor: "Piña", family: "Gelatinas", sizeLabel: "250 gr", unitLabel: "Sobre", priceUnit: 9.7, unitsPerCase: 24, stock: 1272 }),
  product({ code: 20203, baseName: "Gelatina Kris", flavor: "Naranja", family: "Gelatinas", sizeLabel: "250 gr", unitLabel: "Sobre", priceUnit: 9.7, unitsPerCase: 24, stock: 816 }),
  product({ code: 20204, baseName: "Gelatina Kris", flavor: "Limón", family: "Gelatinas", sizeLabel: "250 gr", unitLabel: "Sobre", priceUnit: 9.7, unitsPerCase: 24, stock: 624 }),

  // GELATINA LIGHT KRIS — its own line, not a size of the one above: single 24 gr
  // presentation, four flavors, and a price per sobre above the regular one.
  product({ code: 21101, baseName: "Gelatina Light Kris", flavor: "Frutilla", family: "Gelatinas", sizeLabel: "24 gr", unitLabel: "Sobre", priceUnit: 10.9, unitsPerCase: 24, stock: 312 }),
  product({ code: 21102, baseName: "Gelatina Light Kris", flavor: "Piña", family: "Gelatinas", sizeLabel: "24 gr", unitLabel: "Sobre", priceUnit: 10.9, unitsPerCase: 24, stock: 216 }),
  product({ code: 21105, baseName: "Gelatina Light Kris", flavor: "Cereza", family: "Gelatinas", sizeLabel: "24 gr", unitLabel: "Sobre", priceUnit: 10.9, unitsPerCase: 24, stock: 24 }),
  product({ code: 21103, baseName: "Gelatina Light Kris", flavor: "Naranja", family: "Gelatinas", sizeLabel: "24 gr", unitLabel: "Sobre", priceUnit: 10.9, unitsPerCase: 24, stock: 168 }),

  // REFRESCO EN POLVO KRIS — the widest flavor axis in the catalog, and the two
  // Bolivian flavors (mocochinchi, chicha morada) sit in it as equals.
  product({ code: 30101, baseName: "Refresco en Polvo Kris", flavor: "Frutilla", family: "Bebidas", sizeLabel: "20 gr", unitLabel: "Sobre", priceUnit: 1.5, unitsPerCase: 50, stock: 4200 }),
  product({ code: 30102, baseName: "Refresco en Polvo Kris", flavor: "Piña", family: "Bebidas", sizeLabel: "20 gr", unitLabel: "Sobre", priceUnit: 1.5, unitsPerCase: 50, stock: 3650 }),
  product({ code: 30103, baseName: "Refresco en Polvo Kris", flavor: "Naranja", family: "Bebidas", sizeLabel: "20 gr", unitLabel: "Sobre", priceUnit: 1.5, unitsPerCase: 50, stock: 3900 }),
  product({ code: 30104, baseName: "Refresco en Polvo Kris", flavor: "Limón", family: "Bebidas", sizeLabel: "20 gr", unitLabel: "Sobre", priceUnit: 1.5, unitsPerCase: 50, stock: 2850 }),
  product({ code: 30105, baseName: "Refresco en Polvo Kris", flavor: "Cereza", family: "Bebidas", sizeLabel: "20 gr", unitLabel: "Sobre", priceUnit: 1.5, unitsPerCase: 50, stock: 2100 }),
  product({ code: 30106, baseName: "Refresco en Polvo Kris", flavor: "Uva", family: "Bebidas", sizeLabel: "20 gr", unitLabel: "Sobre", priceUnit: 1.5, unitsPerCase: 50, stock: 1750 }),
  product({ code: 30107, baseName: "Refresco en Polvo Kris", flavor: "Frambuesa", family: "Bebidas", sizeLabel: "20 gr", unitLabel: "Sobre", priceUnit: 1.5, unitsPerCase: 50, stock: 1400 }),
  product({ code: 30108, baseName: "Refresco en Polvo Kris", flavor: "Durazno", family: "Bebidas", sizeLabel: "20 gr", unitLabel: "Sobre", priceUnit: 1.5, unitsPerCase: 50, stock: 2450 }),
  product({ code: 30109, baseName: "Refresco en Polvo Kris", flavor: "Mocochinchi", family: "Bebidas", sizeLabel: "20 gr", unitLabel: "Sobre", priceUnit: 1.5, unitsPerCase: 50, stock: 5100 }),
  product({ code: 30110, baseName: "Refresco en Polvo Kris", flavor: "Chicha Morada", family: "Bebidas", sizeLabel: "20 gr", unitLabel: "Sobre", priceUnit: 1.5, unitsPerCase: 50, stock: 3300 }),

  // NÉCTAR KRIS EN POLVO
  product({ code: 31102, baseName: "Néctar Kris en Polvo", flavor: "Piña", family: "Bebidas", sizeLabel: "100 gr", unitLabel: "Sobre", priceUnit: 5.0, unitsPerCase: 24, stock: 456 }),
  product({ code: 31111, baseName: "Néctar Kris en Polvo", flavor: "Mango", family: "Bebidas", sizeLabel: "100 gr", unitLabel: "Sobre", priceUnit: 5.0, unitsPerCase: 24, stock: 288 }),

  // MILK SHAKE KRIS EN POLVO
  product({ code: 32112, baseName: "Milk Shake Kris en Polvo", flavor: "Vainilla", family: "Bebidas", sizeLabel: "120 gr", unitLabel: "Sobre", priceUnit: 5.9, unitsPerCase: 24, stock: 360 }),
  product({ code: 32113, baseName: "Milk Shake Kris en Polvo", flavor: "Chocolate", family: "Bebidas", sizeLabel: "120 gr", unitLabel: "Sobre", priceUnit: 5.9, unitsPerCase: 24, stock: 52 }),

  // MAYONESA KRIS — the deepest size axis in the catalog, from the 125 gr sachet
  // the tienda sells loose up to the 1 kg sachet the pensión buys. The container
  // changes with the size, which is why `unitLabel` is per row and not per line.
  product({ code: 40101, baseName: "Mayonesa Kris", flavor: "Original", family: "Salsas", sizeLabel: "125 gr", unitLabel: "Sachet", priceUnit: 6.1, unitsPerCase: 24, stock: 2400 }),
  product({ code: 40203, baseName: "Mayonesa Kris", flavor: "Con Ajo", family: "Salsas", sizeLabel: "200 gr", unitLabel: "Sachet", priceUnit: 13.9, unitsPerCase: 24, stock: 576 }),
  product({ code: 40301, baseName: "Mayonesa Kris", flavor: "Original", family: "Salsas", sizeLabel: "230 gr", unitLabel: "Sachet", priceUnit: 13.1, unitsPerCase: 24, stock: 1320 }),
  product({ code: 40404, baseName: "Mayonesa Kris", flavor: "Light", family: "Salsas", sizeLabel: "350 ml", unitLabel: "Doypack", priceUnit: 28.4, unitsPerCase: 12, stock: 168 }),
  product({ code: 40501, baseName: "Mayonesa Kris", flavor: "Original", family: "Salsas", sizeLabel: "380 gr", unitLabel: "Pomo", priceUnit: 24.0, unitsPerCase: 12, stock: 864 }),
  product({ code: 40502, baseName: "Mayonesa Kris", flavor: "Picante", family: "Salsas", sizeLabel: "380 gr", unitLabel: "Pomo", priceUnit: 24.6, unitsPerCase: 12, stock: 300 }),
  product({ code: 40601, baseName: "Mayonesa Kris", flavor: "Original", family: "Salsas", sizeLabel: "500 gr", unitLabel: "Sachet", priceUnit: 26.3, unitsPerCase: 12, stock: 492 }),
  product({ code: 40701, baseName: "Mayonesa Kris", flavor: "Original", family: "Salsas", sizeLabel: "1 kg", unitLabel: "Sachet", priceUnit: 44.4, unitsPerCase: 6, stock: 42 }),

  // KÉTCHUP KRIS
  product({ code: 41101, baseName: "Kétchup Kris", flavor: "Original", family: "Salsas", sizeLabel: "200 gr", unitLabel: "Sachet", priceUnit: 11.1, unitsPerCase: 24, stock: 1104 }),
  product({ code: 41201, baseName: "Kétchup Kris", flavor: "Original", family: "Salsas", sizeLabel: "410 gr", unitLabel: "Pomo", priceUnit: 19.1, unitsPerCase: 12, stock: 708 }),
  product({ code: 41202, baseName: "Kétchup Kris", flavor: "Picante", family: "Salsas", sizeLabel: "410 gr", unitLabel: "Pomo", priceUnit: 21.7, unitsPerCase: 12, stock: 264 }),
  product({ code: 41205, baseName: "Kétchup Kris", flavor: "Estilo Americano", family: "Salsas", sizeLabel: "410 gr", unitLabel: "Frasco", priceUnit: 18.7, unitsPerCase: 12, stock: 96 }),
  product({ code: 41301, baseName: "Kétchup Kris", flavor: "Original", family: "Salsas", sizeLabel: "500 gr", unitLabel: "Sachet", priceUnit: 22.4, unitsPerCase: 12, stock: 372 }),
  product({ code: 41401, baseName: "Kétchup Kris", flavor: "Original", family: "Salsas", sizeLabel: "1 kg", unitLabel: "Sachet", priceUnit: 33.7, unitsPerCase: 6, stock: 30 }),

  // CEREALES KRIS — five lines with no flavor axis at all: the sub-brand IS the
  // product, so the only suggestion a seller gets here is the bigger bag.
  product({ code: 50101, baseName: "Cereal Kris Frutaritos", family: "Cereales", sizeLabel: "220 gr", unitLabel: "Estuche", priceUnit: 23.2, unitsPerCase: 12, stock: 588 }),
  product({ code: 50102, baseName: "Cereal Kris Frutaritos", family: "Cereales", sizeLabel: "400 gr", unitLabel: "Estuche", priceUnit: 39.5, unitsPerCase: 12, stock: 336 }),
  product({ code: 50103, baseName: "Cereal Kris Frutaritos", family: "Cereales", sizeLabel: "790 gr", unitLabel: "Doypack", priceUnit: 54.3, unitsPerCase: 6, stock: 114 }),
  product({ code: 50201, baseName: "Cereal Kris Corn Flakes", family: "Cereales", sizeLabel: "250 gr", unitLabel: "Estuche", priceUnit: 23.2, unitsPerCase: 12, stock: 504 }),
  product({ code: 50202, baseName: "Cereal Kris Corn Flakes", family: "Cereales", sizeLabel: "400 gr", unitLabel: "Estuche", priceUnit: 39.5, unitsPerCase: 12, stock: 288 }),
  product({ code: 50203, baseName: "Cereal Kris Corn Flakes", family: "Cereales", sizeLabel: "840 gr", unitLabel: "Doypack", priceUnit: 54.3, unitsPerCase: 6, stock: 90 }),
  product({ code: 50301, baseName: "Cereal Kris Kriskao", family: "Cereales", sizeLabel: "220 gr", unitLabel: "Estuche", priceUnit: 23.2, unitsPerCase: 12, stock: 456 }),
  product({ code: 50302, baseName: "Cereal Kris Kriskao", family: "Cereales", sizeLabel: "400 gr", unitLabel: "Estuche", priceUnit: 39.5, unitsPerCase: 12, stock: 240 }),
  product({ code: 50303, baseName: "Cereal Kris Kriskao", family: "Cereales", sizeLabel: "710 gr", unitLabel: "Doypack", priceUnit: 54.3, unitsPerCase: 6, stock: 78 }),
  product({ code: 50401, baseName: "Cereal Kris Azucaraditas", family: "Cereales", sizeLabel: "220 gr", unitLabel: "Estuche", priceUnit: 23.2, unitsPerCase: 12, stock: 420 }),
  product({ code: 50402, baseName: "Cereal Kris Azucaraditas", family: "Cereales", sizeLabel: "400 gr", unitLabel: "Estuche", priceUnit: 39.5, unitsPerCase: 12, stock: 192 }),
  product({ code: 50403, baseName: "Cereal Kris Azucaraditas", family: "Cereales", sizeLabel: "840 gr", unitLabel: "Doypack", priceUnit: 54.3, unitsPerCase: 6, stock: 66 }),
  product({ code: 50501, baseName: "Cereal Kris Choco Explosión", family: "Cereales", sizeLabel: "220 gr", unitLabel: "Estuche", priceUnit: 23.2, unitsPerCase: 12, stock: 372 }),
  product({ code: 50502, baseName: "Cereal Kris Choco Explosión", family: "Cereales", sizeLabel: "400 gr", unitLabel: "Estuche", priceUnit: 39.5, unitsPerCase: 12, stock: 0 }),
  product({ code: 50503, baseName: "Cereal Kris Choco Explosión", family: "Cereales", sizeLabel: "750 gr", unitLabel: "Doypack", priceUnit: 54.3, unitsPerCase: 6, stock: 54 }),

  // SOPAS Y CREMAS KRIS — the flavor axis carries a different weight per row,
  // which is exactly the case where reading the size out of the name goes wrong.
  product({ code: 60114, baseName: "Sopa Kris", flavor: "Pollo con Fideos", family: "Culinarios", sizeLabel: "65 gr", unitLabel: "Sobre", priceUnit: 8.3, unitsPerCase: 24, stock: 1128 }),
  product({ code: 60215, baseName: "Sopa Kris", flavor: "Pollo con Arroz", family: "Culinarios", sizeLabel: "61 gr", unitLabel: "Sobre", priceUnit: 8.3, unitsPerCase: 24, stock: 936 }),
  product({ code: 61116, baseName: "Crema Kris", flavor: "Champiñones", family: "Culinarios", sizeLabel: "78 gr", unitLabel: "Sobre", priceUnit: 9.1, unitsPerCase: 24, stock: 648 }),
  product({ code: 61217, baseName: "Crema Kris", flavor: "Pollo", family: "Culinarios", sizeLabel: "82 gr", unitLabel: "Sobre", priceUnit: 9.6, unitsPerCase: 24, stock: 792 }),
  product({ code: 61318, baseName: "Crema Kris", flavor: "Choclo", family: "Culinarios", sizeLabel: "75 gr", unitLabel: "Sobre", priceUnit: 9.6, unitsPerCase: 24, stock: 45 }),

  // FLAN KRIS — Vainilla is the only flavor carried in two sizes, so it is the
  // only row in the line whose size suggestions are not empty.
  product({ code: 70112, baseName: "Flan Kris", flavor: "Vainilla", family: "Postres", sizeLabel: "60 gr", unitLabel: "Sobre", priceUnit: 5.6, unitsPerCase: 24, stock: 984 }),
  product({ code: 70119, baseName: "Flan Kris", flavor: "Dulce de Leche", family: "Postres", sizeLabel: "60 gr", unitLabel: "Sobre", priceUnit: 5.6, unitsPerCase: 24, stock: 720 }),
  product({ code: 70201, baseName: "Flan Kris", flavor: "Frutilla", family: "Postres", sizeLabel: "80 gr", unitLabel: "Sobre", priceUnit: 7.4, unitsPerCase: 24, stock: 456 }),
  product({ code: 70312, baseName: "Flan Kris", flavor: "Vainilla", family: "Postres", sizeLabel: "120 gr", unitLabel: "Estuche", priceUnit: 7.1, unitsPerCase: 24, stock: 288 }),

  // BEBIDAS LISTAS — the only lines carrying ICE, because the tax lands on the
  // sealed bottle and not on the sobre the same juice is sold as two lines above.
  // They are also the whole cold chain: see `COLD_CHAIN_LINES`.
  product({ code: 80103, baseName: "Frussion", flavor: "Naranja", family: "Bebidas", sizeLabel: "300 ml", unitLabel: "Botella", priceUnit: 4.5, unitsPerCase: 12, ice: 0.25, stock: 1440 }),
  product({ code: 80108, baseName: "Frussion", flavor: "Durazno", family: "Bebidas", sizeLabel: "300 ml", unitLabel: "Botella", priceUnit: 4.5, unitsPerCase: 12, ice: 0.25, stock: 1104 }),
  product({ code: 80120, baseName: "Frussion", flavor: "Mandarina", family: "Bebidas", sizeLabel: "300 ml", unitLabel: "Botella", priceUnit: 4.5, unitsPerCase: 12, ice: 0.25, stock: 38 }),
  product({ code: 80203, baseName: "Frussion", flavor: "Naranja", family: "Bebidas", sizeLabel: "1 L", unitLabel: "Botella", priceUnit: 11.9, unitsPerCase: 12, ice: 0.25, stock: 660 }),
  product({ code: 80208, baseName: "Frussion", flavor: "Durazno", family: "Bebidas", sizeLabel: "1 L", unitLabel: "Botella", priceUnit: 11.9, unitsPerCase: 12, ice: 0.25, stock: 528 }),
  product({ code: 80221, baseName: "Frussion", flavor: "Sin Azúcar", family: "Bebidas", sizeLabel: "1 L", unitLabel: "Botella", priceUnit: 12.5, unitsPerCase: 12, ice: 0.25, stock: 156 }),
  product({ code: 81122, baseName: "Agua Speranza", flavor: "Sin Gas", family: "Bebidas", sizeLabel: "600 ml", unitLabel: "Botella", priceUnit: 3.5, unitsPerCase: 12, ice: 0.12, stock: 2880 }),
  product({ code: 81123, baseName: "Agua Speranza", flavor: "Con Gas", family: "Bebidas", sizeLabel: "600 ml", unitLabel: "Botella", priceUnit: 3.8, unitsPerCase: 12, ice: 0.12, stock: 1176 }),
  product({ code: 81222, baseName: "Agua Speranza", flavor: "Sin Gas", family: "Bebidas", sizeLabel: "2 L", unitLabel: "Botella", priceUnit: 8.5, unitsPerCase: 6, ice: 0.12, stock: 57 }),
];

const BY_ID = new Map(PRODUCTS.map((p) => [p.id, p] as const));

export const getProduct = (id: string) => BY_ID.get(id);

/**
 * The rows a bonification of `productId` may be delivered as: the product itself
 * plus its line siblings. The gift is the same product by default — what the
 * client gets to choose is which presentation the warehouse ships.
 *
 * Siblings are matched on `baseName` and not on `family`: a family here is a
 * commercial category wide enough to hold mayonesa, kétchup and mostaza at once,
 * and offering a pomo of mostaza as the gift for a sachet of mayonesa is a
 * different product, not a different presentation.
 */
export function giftOptionsFor(productId: string): Product[] {
  const product = getProduct(productId);
  if (!product) return [];
  return PRODUCTS.filter((p) => p.baseName === product.baseName);
}
