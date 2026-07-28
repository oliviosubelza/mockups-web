import type { StateStorage } from 'zustand/middleware'
import { storage } from './adapter'

/**
 * Backend de persistencia para `zustand/persist`. Delega en el `storage` de la plataforma: IPC a
 * Electron en el desktop, localStorage en el navegador (ver mockup/electron-stub.ts).
 *
 * Se llamaba `electronTabStorage` cuando su único cliente era el store de tabs; no tiene nada de
 * específico de tabs ni de Electron, así que ahora el nombre dice lo que es.
 */
export const persistedStorage: StateStorage = {
  getItem: (name) => storage.get<string>(name),
  setItem: (name, value) => storage.set(name, value),
  removeItem: (name) => storage.delete(name),
}
