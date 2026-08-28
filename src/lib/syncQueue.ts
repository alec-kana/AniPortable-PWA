import { AniListRequestError, isInvalidTokenError, saveBulkEntries, type PendingUpdate } from "./anilist"
import { clearInvalidSession } from "./authChannel"
import { load, save, remove } from "./storage"
import { writeSyncMirror } from "./syncMirror"

const FLUSH_DEBOUNCE_MS = 5000
// The extension retries a failed flush from a chrome.alarm, which fires whether or not the
// popup is open. The web has no equivalent, so the same backoff runs on two weaker halves: this
// timer while a page is open, and Background Sync (Chromium only) once it isn't.
const RETRY_BASE_MS = 30_000 // 30s, matching the floor Chrome clamps an alarm to
const RETRY_MAX_MS = 30 * 60_000
const BACKGROUND_SYNC_TAG = "flush-pending-updates"
// An entry AniList refuses as invalid would otherwise re-queue forever and take every edit
// batched alongside it down with it.
const MAX_FLUSH_ATTEMPTS = 3
// An edit that never reached AniList stops being worth sending: the same list is editable
// from other devices, and replaying a day-old change would overwrite whatever happened since.
const MAX_QUEUE_AGE_MS = 24 * 60 * 60 * 1000

// queuedAt rides along for the age check; saveBulkEntries reads the known fields by name and
// ignores it.
export type QueuedUpdate = PendingUpdate & { queuedAt: number }

// The stored queue, stamped with the account that made the edits. Entry ids are
// account-scoped, so this is what stops one account's queue being replayed under another's
// token — see the ownership check in flushAllPendingUpdates.
type StoredQueue = { userId?: number; updates: [number, Partial<QueuedUpdate>][] }

const currentUserId = (): number | undefined => load<{ id?: number }>("user")?.id

let debounceTimer: ReturnType<typeof setTimeout> | null = null
const pendingUpdates = new Map<number, QueuedUpdate>()
// Whose edits are sitting in pendingUpdates. Tracked in memory as well as in storage, because
// initSyncQueue restores the queue before handleAuthRedirect has stored the new viewer.
let queueUserId: number | undefined

// Held separately for the length of a request: pendingUpdates is cleared before the await, so
// without this a list load landing mid-flush would read an empty queue and skip the overlay.
let inFlightUpdates = new Map<number, QueuedUpdate>()
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

let retryTimer: ReturnType<typeof setTimeout> | null = null
let flushFailures = 0

// The debounce timer only ever covers a flush that hasn't happened yet. A flush that failed —
// offline, rate-limited — needs its own follow-up, or the batch sits there until the tab is
// backgrounded or another edit comes in.
function armRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  if (pendingUpdates.size === 0) return
  const delay = Math.min(RETRY_BASE_MS * 2 ** flushFailures, RETRY_MAX_MS)
  retryTimer = setTimeout(flushAllPendingUpdates, delay)
}

// Wakes the service worker to retry once no page is left to run the timer above. Unsupported on
// Safari/iOS, which is why it's an extra layer rather than the mechanism.
async function registerBackgroundSync(): Promise<void> {
  if (!("serviceWorker" in navigator)) return
  try {
    const registration = await navigator.serviceWorker.ready
    if ("sync" in registration) await (registration as any).sync.register(BACKGROUND_SYNC_TAG)
  } catch {
    // Unsupported, or the user blocked background activity for the site.
  }
}

function persistPendingUpdates(): void {
  if (pendingUpdates.size === 0) {
    remove("pendingUpdates")
    writeSyncMirror(null)
    return
  }
  const updates = Array.from(pendingUpdates.entries())
  save("pendingUpdates", { userId: queueUserId, updates } satisfies StoredQueue)

  // Mirrored on every persist so a worker woken with no page open always has a current copy.
  // Only ever alongside a live token: the mirror is the one store a background task can still
  // reach once no page is left, so a credential in it has to end when the session does.
  const token = load<string>("accessToken")
  writeSyncMirror(token ? { token, updates } : null)
}

// Everything the queue owns, in both stores. Used when the queue turns out to belong to an
// account that is no longer the one signed in.
function discardPendingUpdates(): void {
  pendingUpdates.clear()
  failedAttempts.clear()
  queueUserId = undefined
  remove("pendingUpdates")
  writeSyncMirror(null)
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
  // Signed out: the queue stays put rather than being dropped, and flushes once the account
  // that made these edits signs back in.
  if (!token) return

  // A queue left behind by a different account can only be rejected here — its entry ids
  // belong to that account's list — so it would burn three attempts per entry before giving
  // up. Drop it instead. An unstamped queue predates the stamp and is treated the same way.
  if (queueUserId !== currentUserId()) {
    console.warn("[syncQueue] Discarding a queue that belongs to a different account")
    discardPendingUpdates()
    return
  }

  const updatesToFlush = new Map(pendingUpdates)
  inFlightUpdates = updatesToFlush
  pendingUpdates.clear()

  try {
    const result = await saveBulkEntries(token, updatesToFlush)
    reportSynced(result?.data)
    for (const id of updatesToFlush.keys()) failedAttempts.delete(id)
    flushFailures = 0
    // Not a plain remove: edits queued while the request was in flight need persisting too.
    persistPendingUpdates()
    armRetryTimer()
  } catch (error) {
    console.error("[syncQueue] Failed to flush updates, will retry later:", error)

    const landed = reportSynced(error instanceof AniListRequestError ? error.data : null)

    // A dead token shares the 400 of a rejected edit, so it has to be excluded first —
    // otherwise every queued edit burns an attempt and is dropped.
    const authFailed = isInvalidTokenError(error)

    // Only a request AniList rejected as invalid counts against an entry. Everything else —
    // offline, a dead token, a rate limit, and the 403 AniList answers with while its API is
    // temporarily disabled — says nothing about the edit, so it retries until it ages out.
    const isPermanentRejection =
      !authFailed &&
      error instanceof AniListRequestError &&
      (error.status === 400 || error.status === 404)

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

    // Every failed flush schedules its own follow-up, independent of the debounce timer, the
    // visibility listener, or another edit coming in.
    flushFailures += 1
    armRetryTimer()
    registerBackgroundSync()

    // Only once the queue is safely mirrored: retrying a dead token just burns requests until
    // the age-out, so drop the session and let the app prompt a re-login instead.
    if (authFailed) clearInvalidSession()
  } finally {
    // After the catch, so anything re-queued is already back in pendingUpdates.
    // Guarded because this function is re-entrant — the retry timer, the debounce, and the
    // visibilitychange/pagehide listeners all call it without awaiting, so a later flush may
    // already own the slot and clearing it would hide its batch from getPendingUpdates.
    if (inFlightUpdates === updatesToFlush) inFlightUpdates = new Map()
  }
}

// The UI's optimistic state is React-only, so a reload falls back to the server value while an
// edit is still queued. This is the durable copy of the same intent, for a fresh mount to
// re-apply over the fetched list. Copied so callers can't mutate the live queue.
export function getPendingUpdates(): Map<number, QueuedUpdate> {
  const merged = new Map(inFlightUpdates)
  // pendingUpdates last: an edit made during the request supersedes the one being sent.
  for (const [id, data] of pendingUpdates) merged.set(id, data)
  return merged
}

export function queueUpdate(payload: { entryId: number } & PendingUpdate): void {
  const { entryId, progress, score, status } = payload

  queueUserId = currentUserId()

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
  // armRetryTimer alongside each, since a backgrounded tab still runs timers (throttled) and
  // the flush these trigger can fail with nothing left to notice.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      flushAllPendingUpdates()
      armRetryTimer()
    }
  })
  window.addEventListener("pagehide", () => {
    flushAllPendingUpdates()
    armRetryTimer()
  })

  const saved = load<StoredQueue>("pendingUpdates")
  if (saved?.updates?.length) {
    queueUserId = saved.userId
    for (const [id, data] of saved.updates) {
      // Anything persisted before queuedAt existed gets a fresh window rather than being
      // treated as infinitely old and thrown away.
      pendingUpdates.set(id, { ...data, queuedAt: data.queuedAt ?? Date.now() })
    }
    // Re-mirrors the restored queue against whatever token is current, which the last session
    // may not have had when it wrote it.
    persistPendingUpdates()
    flushAllPendingUpdates()
  } else if (saved) {
    // Unreadable or empty — an old shape from before the stamp, most likely.
    remove("pendingUpdates")
    writeSyncMirror(null)
  }
}
