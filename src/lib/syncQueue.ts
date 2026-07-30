import { saveBulkEntries, type PendingUpdate } from "./anilist"
import { load, save, remove } from "./storage"

const FLUSH_DEBOUNCE_MS = 5000

let debounceTimer: ReturnType<typeof setTimeout> | null = null
const pendingUpdates = new Map<number, PendingUpdate>()
let initialized = false

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

function persistPendingUpdates(): void {
  save("pendingUpdates", Array.from(pendingUpdates.entries()))
}

export async function flushAllPendingUpdates(): Promise<void> {
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
    await saveBulkEntries(token, updatesToFlush)
    remove("pendingUpdates")
  } catch (error) {
    console.error("[syncQueue] Failed to flush updates, will retry later:", error)
    // Re-queue, letting edits that arrived during the failed request win.
    for (const [id, data] of updatesToFlush) {
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
    ...(status !== undefined && { status })
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

  const saved = load<[number, PendingUpdate][]>("pendingUpdates")
  if (saved?.length) {
    for (const [id, data] of saved) {
      pendingUpdates.set(id, data)
    }
    flushAllPendingUpdates()
  }
}
