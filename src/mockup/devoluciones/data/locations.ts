/**
 * Provinces (and their cities) used to assign a route's location. Names mirror
 * the backend payload (provinceName / cityName). In the real API a route is
 * created with the province id; here we key selects by name to keep the mock
 * self-contained.
 */
export interface Province {
  id: number;
  name: string;
}

export const PROVINCES: Province[] = [
  { id: 1, name: "ANDRES IBAÑEZ" },
  { id: 2, name: "OBISPO SANTISTEVAN" },
  { id: 3, name: "WARNES" },
  { id: 4, name: "SARA" },
];

/** All mock cities belong to the Santa Cruz department. */
export const DEPARTMENT_NAME = "SANTA CRUZ";

/** A city and the province it belongs to (Santa Cruz department). */
export interface City {
  name: string;
  provinceName: string;
  /**
   * Two-letter code, the first segment of a route's code (`SC-FE-PA-123-Zona Norte`).
   *
   * Written out rather than derived from the name. The rule that produces these is
   * "initials if the name has two words, first two letters if it has one", and the
   * moment a city collides with another under that rule — a second `PORTA…`, a
   * `SAN CARLOS` against `SANTA CRUZ` — a derivation would silently hand two cities
   * the same code. Here the collision is a visible edit in one file.
   */
  code: string;
}

export const CITIES: City[] = [
  { name: "SANTA CRUZ", provinceName: "ANDRES IBAÑEZ", code: "SC" },
  { name: "MONTERO", provinceName: "OBISPO SANTISTEVAN", code: "MO" },
  { name: "WARNES", provinceName: "WARNES", code: "WA" },
  { name: "LA GUARDIA", provinceName: "ANDRES IBAÑEZ", code: "LG" },
  { name: "COTOCA", provinceName: "ANDRES IBAÑEZ", code: "CO" },
  { name: "PORTACHUELO", provinceName: "SARA", code: "PO" },
];

/** Look up the province a city belongs to. */
export function provinceForCity(cityName: string): string | undefined {
  return CITIES.find((c) => c.name === cityName)?.provinceName;
}

/** The city's route-code segment. `undefined` while no city is chosen. */
export function cityCode(cityName: string | undefined): string | undefined {
  if (!cityName) return undefined;
  return CITIES.find((c) => c.name === cityName)?.code;
}
