import { AniList, type PendingUpdate } from "./anilist"
import { Storage } from "./storage"

// Ported from the extension's background.ts debounced sync queue. There's no
// background service worker here, so this lives in-page: a page reload can
// lose the in-memory queue the same way an MV3 worker restart could, hence
// the same persist-on-every-change + restore-and-flush-on-load pattern.
// visibilitychange/pagehide replace the old popup-port-disconnect flush.

const FLUSH_DEBOUNCE_MS = 5000

let debounceTimer: ReturnType<typeof setTimeout> | null = null
const pendingUpdates = new Map<number, PendingUpdate>()
let initialized = false

// How many card overlays are currently open. While this is > 0 the flush
// timer is paused entirely (not just extended) — otherwise sitting on an
// open card for a few seconds without touching the wheel would still flush
// mid-adjustment. Cleared to schedule fresh once the last card closes.
let openCardCount = 0

function armOrPauseFlushTimer(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (openCardCount === 0 && pendingUpdates.size > 0) {
    debounceTimer = setTimeout(() => {
      flushAllPendingUpdates()
    }, FLUSH_DEBOUNCE_MS)
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

async function persistPendingUpdates(): Promise<void> {
  await Storage.set(Storage.DATA.PENDING_UPDATES, Array.from(pendingUpdates.entries()))
}

export async function flushAllPendingUpdates(): Promise<void> {
  if (pendingUpdates.size === 0) return

  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  const token = await Storage.get<string>(Storage.DATA.ACCESS_TOKEN)
  if (!token) return

  const updatesToFlush = new Map(pendingUpdates)
  pendingUpdates.clear()

  try {
    const api = new AniList(token)
    await api.saveBulkMediaListEntries(updatesToFlush)
    await Storage.remove(Storage.DATA.PENDING_UPDATES)
  } catch (error) {
    console.error("[syncQueue] Failed to flush updates, will retry later:", error)
    // Re-queue so the update isn't lost; newer edits that arrived during the
    // failed request take precedence over the stale failed data.
    for (const [id, data] of updatesToFlush) {
      pendingUpdates.set(id, { ...data, ...pendingUpdates.get(id) })
    }
    await persistPendingUpdates()
  }
}

export async function queueUpdate(payload: { entryId: number } & PendingUpdate): Promise<void> {
  const { entryId, progress, score, status } = payload

  const existing = pendingUpdates.get(entryId) || {}
  pendingUpdates.set(entryId, {
    ...existing,
    ...(progress !== undefined && { progress }),
    ...(score !== undefined && { score }),
    ...(status !== undefined && { status })
  })
  await persistPendingUpdates()
  armOrPauseFlushTimer()
}

async function restorePendingUpdates(): Promise<void> {
  const saved = await Storage.get<[number, PendingUpdate][]>(Storage.DATA.PENDING_UPDATES)
  if (!saved || saved.length === 0) return

  for (const [id, data] of saved) {
    pendingUpdates.set(id, data)
  }

  // Flush what survived the reload instead of waiting for the next edit.
  flushAllPendingUpdates()
}

// Safety-net flush points: tab backgrounded or the page is being unloaded.
// Idempotent — flushAllPendingUpdates() is a no-op once the queue is empty,
// so it's safe for both to fire for the same close.
function registerLifecycleFlushListeners() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushAllPendingUpdates()
  })
  window.addEventListener("pagehide", () => {
    flushAllPendingUpdates()
  })
}

export function initSyncQueue(): void {
  if (initialized) return
  initialized = true
  registerLifecycleFlushListeners()
  restorePendingUpdates()
}
