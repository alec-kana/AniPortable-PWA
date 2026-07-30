import { fetchViewer } from "./anilist"
import { load, save, remove } from "./storage"
import { flushAllPendingUpdates } from "./syncQueue"

const CLIENT_ID = import.meta.env.VITE_ANILIST_CLIENT_ID as string | undefined
const OAUTH_STATE_KEY = "aniportable_oauth_state"

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

export function login(): void {
  if (!CLIENT_ID) {
    throw new Error(
      "Missing VITE_ANILIST_CLIENT_ID. Copy .env.example to .env.development (or .env.production) and set your AniList client_id."
    )
  }

  const authUrl = new URL("https://anilist.co/api/v2/oauth/authorize")
  authUrl.searchParams.append("client_id", CLIENT_ID)
  authUrl.searchParams.append("response_type", "token")

  const state = crypto.randomUUID()
  authUrl.searchParams.append("state", state)
  sessionStorage.setItem(OAUTH_STATE_KEY, state)

  window.location.href = authUrl.toString()
}

// Call once on boot, before deciding whether to show the login page. No-op
// unless the current URL is an OAuth redirect carrying a token in its hash.
export async function handleAuthRedirect(): Promise<any | null> {
  const hash = window.location.hash
  if (!hash || !hash.includes("access_token")) return null

  const params = new URLSearchParams(hash.slice(1))
  const accessToken = params.get("access_token")
  const returnedState = params.get("state")
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)

  // Strip the token out of the visible URL/history regardless of outcome.
  history.replaceState(null, "", window.location.pathname + window.location.search)

  if (!accessToken) return null
  if (expectedState && returnedState !== expectedState) {
    console.error("[auth] OAuth state mismatch, discarding token")
    return null
  }

  const response = await fetchViewer(accessToken)
  const user = response?.data?.Viewer

  save("accessToken", accessToken)
  save("user", user)

  broadcastAuthChange()
  return user
}

export async function logout(): Promise<void> {
  // Flush first — the flush still needs the access token.
  await flushAllPendingUpdates()
  remove("accessToken")
  remove("user")
  broadcastAuthChange()
}

export function checkAuth(): { token: string | null; user: any | null } {
  return { token: load<string>("accessToken"), user: load<any>("user") }
}
