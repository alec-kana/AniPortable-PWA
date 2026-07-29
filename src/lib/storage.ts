// localStorage-backed replacement for the extension's chrome.storage.local
// wrapper. Kept async-signatured for parity with the original call sites
// even though localStorage itself is synchronous.
export class Storage {
  static DATA = {
    ACCESS_TOKEN: "accessToken",
    USER: "user",
    PENDING_UPDATES: "pendingUpdates",
    SETTINGS: "settings"
  }

  static async set(key: string, data: unknown): Promise<void> {
    localStorage.setItem(key, JSON.stringify(data))
  }

  static async remove(key: string): Promise<void> {
    localStorage.removeItem(key)
  }

  static async get<T = unknown>(key: string): Promise<T | null> {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }
}
