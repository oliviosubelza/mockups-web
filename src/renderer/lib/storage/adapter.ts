export const storage = {
  get: <T>(key: string): Promise<T | null> => window.electron.storage.get<T>(key),
  set: <T>(key: string, value: T): Promise<void> => window.electron.storage.set<T>(key, value),
  delete: (key: string): Promise<void> => window.electron.storage.delete(key),
}
