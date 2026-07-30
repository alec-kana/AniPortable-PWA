export function load<T = unknown>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function save(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function remove(key: string): void {
  localStorage.removeItem(key)
}
