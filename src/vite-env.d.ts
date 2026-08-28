// Tipos de las variables de entorno de Vite.
//
// POR QUÉ ESTÁ ESCRITO A MANO y no es un `/// <reference types="vite/client" />`. La referencia trae
// además los módulos de assets (`*.svg`, `*.css?inline`, …) y depende de que `vite/client` resuelva
// desde `node_modules`, que en este repo vive del lado de Windows. Declarar las tres variables que la
// app de verdad lee es más chico, no se rompe y —lo importante— es una LISTA: cuando alguien agregue
// una, este archivo es el lugar donde queda escrito qué espera la app en el `.env`.
interface ImportMetaEnv {
  /** Modo desarrollo. Lo pone Vite, no el `.env`. */
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
  /** Base del backend. La leen el cliente HTTP y el SDK de auth. */
  readonly VITE_API_URL?: string
  /** Clave de CARTO para la capa gris. Sin ella se cae a Esri Light Gray, que no pide clave. */
  readonly VITE_CARTO_API_KEY?: string
  /**
   * Endpoint de OSRM, con perfil incluido: `http://localhost:5000/route/v1/driving`.
   * Sin ella se usa el servidor de demostración público. Ver `services/routing-osrm.ts`.
   */
  readonly VITE_OSRM_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
