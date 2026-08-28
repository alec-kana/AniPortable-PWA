import { remove } from "./storage"
import { writeSyncMirror } from "./syncMirror"

// Kept out of auth.ts so syncQueue.ts can clear a dead session without importing it:
// auth.ts already imports flushAllPendingUpdates from there, and the pair would cycle.

const authChannel = new BroadcastChannel("aniportable-auth")
// BroadcastChannel never delivers back to the sender, so same-tab listeners
// (AppContent's useAuth vs. SettingsTab's) are notified directly; the channel
// only covers other tabs.
const localListeners = new Set<() => void>()

export function broadcastAuthChange(): void {
  localListeners.forEach((callback) => callback())
  authChannel.postMessage({ type: "AUTH_CHANGED" })
}

export function subscribeAuthChange(callback: () => void): () => void {
  localListeners.add(callback)
  const listener = (event: MessageEvent) => {
    if (event.data?.type === "AUTH_CHANGED") callback()
  }
  authChannel.addEventListener("message", listener)
  return () => {
    localListeners.delete(callback)
    authChannel.removeEventListener("message", listener)
  }
}

// Latched because both callers can fire on the same expiry: an app load runs several queries at
// once, and the sync queue may hit the dead token alongside them. login() navigates away, so the
// load after a re-login starts fresh.
let sessionCleared = false

// Deliberately not logout(): that flushes first, and the flush is what just failed. Leaves
// pendingUpdates alone so nothing queued is lost — those edits flush once a valid token is back.
export function clearInvalidSession(): void {
  if (sessionCleared) return
  sessionCleared = true

  console.warn("[auth] AniList rejected the stored token; clearing session")
  remove("accessToken")
  remove("user")
  // Retrying a dead token in the background just burns requests until the age-out, and the
  // mirror is the only place one could outlive the page. The queue itself survives in
  // localStorage and flushes once a valid token is back.
  writeSyncMirror(null)
  broadcastAuthChange()
}
