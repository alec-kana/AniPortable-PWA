import { AniListRequestError, saveBulkEntries, type PendingUpdate } from "./anilist"
import { load, save, remove } from "./storage"

const FLUSH_DEBOUNCE_MS = 5000
// An entry AniList refuses as invalid would otherwise re-queue forever and take every edit
// batched alongside it down with it.
const MAX_FLUSH_ATTEMPTS = 3
// An edit that never reached AniList stops being worth sending: the same list is editable
// from other devices, and replaying a day-old change would overwrite whatever happened since.
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000

// queuedAt rides along for the age check; saveBulkEntries reads the known fields by name and
// ignores it.
type QueuedUpdate = PendingUpdate & { queuedAt: number }

let debounceTimer: ReturnType<typeof setTimeout> | null = null
const pendingUpdates = new Map<number, QueuedUpdate>()
let initialized = false

export type SyncedEntry = { id: number; updatedAt: number }

// Lets the list cache replace its predicted updatedAt with the value the mutation returned.
let onEntriesSynced: ((entries: SyncedEntry[]) => void) | null = null

export function setEntriesSyncedHandler(handler: ((entries: SyncedEntry[]) => void) | null): void {
  onEntriesSynced = handler
}

// While a card overlay is open the flush timer is paused entirely, not just
// extended — otherwise sitting on an open card would flush mid-adjustment.
let openCardCount = 0

function armOrPauseFlushTimer(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (openCardCount === 0 && pendingUpdates.size > 0) {
    debounceTimer = setTimeout(flushAllPendingUpdates, FLUSH_DEBOUNCE_MS)
  }
}

export function notifyCardOpened(): void {
  openCardCount++
  armOrPauseFlushTimer()
}

export function notifyCardClosed(): void {
  openCardCount = Math.max(0, openCardCount - 1)
  armOrPauseFlushTimer()
}

const failedAttempts = new Map<number, number>()

function persistPendingUpdates(): void {
  if (pendingUpdates.size === 0) {
    remove("pendingUpdates")
    return
  }
  save("pendingUpdates", Array.from(pendingUpdates.entries()))
}

function dropStaleUpdates(): void {
  const oldest = Date.now() - MAX_QUEUE_AGE_MS
  let dropped = false

  for (const [id, data] of pendingUpdates) {
    if (data.queuedAt < oldest) {
      pendingUpdates.delete(id)
      failedAttempts.delete(id)
      dropped = true
      console.warn(`[syncQueue] Discarding entry ${id}, queued too long ago to replay safely:`, data)
    }
  }

  // Persist here too, so a flush that finds nothing left to send still clears storage.
  if (dropped) persistPendingUpdates()
}

function isSyncedEntry(value: unknown): value is SyncedEntry {
  const entry = value as SyncedEntry | null
  return !!entry && typeof entry.id === "number" && typeof entry.updatedAt === "number"
}

// The aliased mutation echoes one object per entry it applied, so the payload names exactly
// which edits landed — on a partial failure just as much as on a clean response.
function reportSynced(data: unknown): Set<number> {
  const synced = Object.values((data ?? {}) as Record<string, unknown>).filter(isSyncedEntry)
  if (synced.length > 0) onEntriesSynced?.(synced)
  return new Set(synced.map((entry) => entry.id))
}

export async function flushAllPendingUpdates(): Promise<void> {
  dropStaleUpdates()
  if (pendingUpdates.size === 0) return

  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  const token = load<string>("accessToken")
  if (!token) return

  const updatesToFlush = new Map(pendingUpdates)
  pendingUpdates.clear()

  try {
    const result = await saveBulkEntries(token, updatesToFlush)
    reportSynced(result?.data)
    for (const id of updatesToFlush.keys()) failedAttempts.delete(id)
    // Not a plain remove: edits queued while the request was in flight need persisting too.
    persistPendingUpdates()
  } catch (error) {
    console.error("[syncQueue] Failed to flush updates, will retry later:", error)

    const landed = reportSynced(error instanceof AniListRequestError ? error.data : null)

    // Only a request AniList rejected as invalid counts against an entry. Everything else —
    // offline, an expired token, a rate limit, and the 403 AniList answers with while its API
    // is temporarily disabled — says nothing about the edit, so it retries until it ages out.
    const isPermanentRejection =
      error instanceof AniListRequestError && (error.status === 400 || error.status === 404)

    for (const [id, data] of updatesToFlush) {
      if (landed.has(id)) {
        failedAttempts.delete(id)
        continue
      }

      if (isPermanentRejection) {
        const attempts = (failedAttempts.get(id) ?? 0) + 1
        if (attempts >= MAX_FLUSH_ATTEMPTS) {
          failedAttempts.delete(id)
          console.error(`[syncQueue] Giving up on entry ${id} after ${attempts} attempts:`, data)
          continue
        }
        failedAttempts.set(id, attempts)
      }

      // Re-queue, letting edits that arrived during the failed request win.
      pendingUpdates.set(id, { ...data, ...pendingUpdates.get(id) })
    }

    persistPendingUpdates()
  }
}

export function queueUpdate(payload: { entryId: number } & PendingUpdate): void {
  const { entryId, progress, score, status } = payload

  pendingUpdates.set(entryId, {
    ...pendingUpdates.get(entryId),
    ...(progress !== undefined && { progress }),
    ...(score !== undefined && { score }),
    ...(status !== undefined && { status }),
    // Reset on every edit — the age that matters is how long the newest change has waited.
    queuedAt: Date.now()
  })
  persistPendingUpdates()
  armOrPauseFlushTimer()
}

export function initSyncQueue(): void {
  if (initialized) return
  initialized = true

  // Safety nets for edits that never hit the debounce: tab backgrounded or
  // page unloading. Both are no-ops once the queue is empty.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushAllPendingUpdates()
  })
  window.addEventListener("pagehide", () => {
    flushAllPendingUpdates()
  })

  const saved = load<[number, Partial<QueuedUpdate>][]>("pendingUpdates")
  if (saved?.length) {
    for (const [id, data] of saved) {
      // Anything persisted before queuedAt existed gets a fresh window rather than being
      // treated as infinitely old and thrown away.
      pendingUpdates.set(id, { ...data, queuedAt: data.queuedAt ?? Date.now() })
    }
    flushAllPendingUpdates()
  }
}
