import { AniList } from "./anilist"
import { Storage } from "./storage"
import { flushAllPendingUpdates } from "./syncQueue"

// Ported from the extension's Auth class (background.ts). chrome.identity
// .launchWebAuthFlow has no PWA equivalent, so login is a full-page redirect
// to AniList's implicit-grant endpoint instead of an extension-managed popup
// window; the token comes back in window.location.hash on the next page
// load rather than in a resolved redirectUrl string, and is parsed the same
// way (fragment -> URLSearchParams -> access_token).
const CLIENT_ID = import.meta.env.VITE_ANILIST_CLIENT_ID as string | undefined
const OAUTH_STATE_KEY = "aniportable_oauth_state"

const authChannel = new BroadcastChannel("aniportable-auth")
// BroadcastChannel never delivers a message back to the object that sent it,
// and authChannel is a single module-level instance shared by every
// importer — so a same-tab broadcast (e.g. AppContent's useAuth vs.
// SettingsTab's useAuth, two separate hook instances) would otherwise never
// reach its own page. Local listeners handle same-tab sync directly; the
// channel is still needed for cross-tab sync.
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
  // We own the whole redirect round trip here (unlike the extension, which
  // only used `state` to cache-bust a Chrome quirk), so it's cheap to also
  // validate it on return as real CSRF protection.
  sessionStorage.setItem(OAUTH_STATE_KEY, state)

  window.location.href = authUrl.toString()
}

// Call once on app boot, before deciding whether to show the login page.
// If the current URL is an OAuth redirect (has a token in the hash),
// completes the login and cleans the URL; otherwise this is a no-op.
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

  const response = await new AniList(accessToken).user()
  const user = response?.data?.Viewer

  await Promise.all([
    Storage.set(Storage.DATA.ACCESS_TOKEN, accessToken),
    Storage.set(Storage.DATA.USER, user)
  ])

  broadcastAuthChange()
  return user
}

export async function logout(): Promise<void> {
  // Flush before clearing storage — the flush still needs the access token.
  await flushAllPendingUpdates()
  await Promise.all([Storage.remove(Storage.DATA.ACCESS_TOKEN), Storage.remove(Storage.DATA.USER)])
  broadcastAuthChange()
}

export async function checkAuth(): Promise<{ token: string | null; user: any | null }> {
  const [token, user] = await Promise.all([
    Storage.get<string>(Storage.DATA.ACCESS_TOKEN),
    Storage.get<any>(Storage.DATA.USER)
  ])
  return { token, user }
}
