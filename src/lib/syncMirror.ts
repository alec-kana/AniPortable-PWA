import type { PendingUpdate } from "./anilist"

// A service worker can't read localStorage, so the queue is mirrored into the Cache API — the
// one store both the page and a worker woken with no page open can reach. Only the Background
// Sync path reads it; the page keeps localStorage as its own source of truth.
const MIRROR_CACHE = "sync-mirror"
// Never fetched — the Cache API keys on a URL, so this is only ever an identifier.
const MIRROR_KEY = "/__aniportable-sync-mirror"

// Replaying a day-old edit would overwrite whatever another device has done since. Lives here,
// not in syncQueue, so readSyncMirror can apply it without importing back into its own importer.
export const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000

export type MirroredUpdate = PendingUpdate & { queuedAt?: number }

export type SyncMirror = { token: string; updates: [number, MirroredUpdate][] }

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
    if (!mirror?.token || !mirror.updates?.length) return null

    // The same age rule the page applies to its own queue. An unstamped entry predates the
    // field and is kept, as it is on restore.
    const oldest = Date.now() - MAX_QUEUE_AGE_MS
    const fresh = mirror.updates.filter(([, data]) => (data.queuedAt ?? Date.now()) >= oldest)
    if (fresh.length === mirror.updates.length) return mirror

    // Nothing here is sendable again, so drop it rather than re-read it on every future sync.
    if (fresh.length === 0) {
      await writeSyncMirror(null)
      return null
    }
    return { ...mirror, updates: fresh }
  } catch {
    return null
  }
}
