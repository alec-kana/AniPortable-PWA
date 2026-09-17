// localStorage throws on access, not just on parse, when the browser blocks storage outright.
// This first runs in initSyncQueue before React mounts, so an unguarded throw is a blank app.
export function load<T = unknown>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// Runs under queueUpdate, so a quota failure here would surface as an edit that does nothing.
export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn(`[storage] Could not persist "${key}"; this session only:`, error)
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {}
}
