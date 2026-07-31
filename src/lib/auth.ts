import { fetchViewer } from "./anilist"
import { broadcastAuthChange } from "./authChannel"
import { load, save, remove } from "./storage"
import { flushAllPendingUpdates } from "./syncQueue"

const CLIENT_ID = import.meta.env.VITE_ANILIST_CLIENT_ID as string | undefined
const OAUTH_STATE_KEY = "aniportable_oauth_state"

export { broadcastAuthChange, subscribeAuthChange } from "./authChannel"

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

  // App calls this with .finally(), so a rejection here would surface as an unhandled one.
  // Treating a failed lookup as "not signed in" leaves the login page up to try again.
  let user: any
  try {
    const response = await fetchViewer(accessToken)
    user = response?.data?.Viewer
  } catch (error) {
    console.error("[auth] Could not load the viewer after the OAuth redirect", error)
    return null
  }

  save("accessToken", accessToken)
  save("user", user)

  // A session that expired with edits still queued leaves them in storage, and initSyncQueue's
  // boot flush already ran with no token to send them. Not awaited — the login shouldn't wait
  // on a mutation round trip.
  flushAllPendingUpdates()

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
