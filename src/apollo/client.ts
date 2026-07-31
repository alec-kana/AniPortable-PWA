import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client"
import { setContext } from "@apollo/client/link/context"
import { onError } from "@apollo/client/link/error"
import { clearInvalidSession } from "../lib/authChannel"
import { load } from "../lib/storage"

const httpLink = createHttpLink({
  uri: "https://graphql.anilist.co"
})

const authLink = setContext((_, { headers }) => {
  const token = load<string>("accessToken")
  return {
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  }
})

// The sync queue only clears a dead token while flushing, which needs a queued edit to run at
// all — so opening the app with an expired token would just sit on an error screen. Observing
// it here covers every operation and drops the user on LoginPage instead. An app load fires
// several queries at once; clearInvalidSession latches, so only the first one does any work.
const authErrorLink = onError(({ networkError }) => {
  const serverError = networkError as { statusCode?: number; result?: any } | null
  const bodyMessage: string | undefined = serverError?.result?.errors?.[0]?.message

  // Strictly 400 + "Invalid token". Being logged out is a 401 "Unauthorized." instead, so this
  // can't misfire behind LoginPage, where SettingsContext's Viewer query runs regardless of auth.
  if (serverError?.statusCode !== 400) return
  if (!bodyMessage?.toLowerCase().includes("invalid token")) return

  clearInvalidSession()
})

export const client = new ApolloClient({
  // Error link first, so it observes failures from everything downstream. It only observes —
  // the error still reaches useQuery, so each tab's StateMessage renders as before.
  link: authErrorLink.concat(authLink).concat(httpLink),
  cache: new InMemoryCache()
})
