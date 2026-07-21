import type { StateStorage } from 'zustand/middleware'
import { storage } from './adapter'

export const electronTabStorage: StateStorage = {
  getItem: (name) => storage.get<string>(name),
  setItem: (name, value) => storage.set(name, value),
  removeItem: (name) => storage.delete(name),
}
