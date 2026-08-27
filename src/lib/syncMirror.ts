import type { PendingUpdate } from "./anilist"

// A service worker can't read localStorage, so the queue is mirrored into the Cache API — the
// one store both the page and a worker woken with no page open can reach. Only the Background
// Sync path reads it; the page keeps localStorage as its own source of truth.
const MIRROR_CACHE = "sync-mirror"
// Never fetched — the Cache API keys on a URL, so this is only ever an identifier.
const MIRROR_KEY = "/__aniportable-sync-mirror"

export type SyncMirror = { token: string; updates: [number, PendingUpdate][] }

export async function writeSyncMirror(mirror: SyncMirror | null): Promise<void> {
  try {
    const cache = await caches.open(MIRROR_CACHE)
    if (mirror) {
      await cache.put(MIRROR_KEY, new Response(JSON.stringify(mirror)))
    } else {
      await cache.delete(MIRROR_KEY)
    }
  } catch (error) {
    // Storage denied or evicted. The in-page retry timer is the baseline either way, so this
    // only costs the closed-app retry.
    console.warn("[syncMirror] Could not mirror the queue for the service worker:", error)
  }
}

export async function readSyncMirror(): Promise<SyncMirror | null> {
  try {
    const cache = await caches.open(MIRROR_CACHE)
    const response = await cache.match(MIRROR_KEY)
    if (!response) return null
    const mirror = (await response.json()) as SyncMirror
    // A mirror with no token can't be sent, and an empty one has nothing to send.
    return mirror?.token && mirror.updates?.length ? mirror : null
  } catch {
    return null
  }
}
