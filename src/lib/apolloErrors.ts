import type { ApolloError } from "@apollo/client"

// AniList reports these failures with a non-GraphQL body, so Apollo surfaces
// them as networkError rather than graphQLErrors.
export function getErrorMessage(error: ApolloError | undefined, fallback: string): string {
  const networkError = error?.networkError as any
  const statusCode = networkError?.statusCode

  if (statusCode === 429) {
    return "AniList's API rate limit has been reached. Please wait a moment and try again."
  }

  if (statusCode === 400) {
    // AniList reports an expired or revoked token as 400, not 401. The client's error link
    // clears the session on this, so it usually shows for a moment before LoginPage replaces it.
    const bodyMessage: string | undefined = networkError?.result?.errors?.[0]?.message
    if (bodyMessage?.toLowerCase().includes("invalid token")) {
      return "Your AniList session has expired. Please log in again."
    }
    return fallback
  }

  if (statusCode === 403) {
    // 403 covers both outages and real permission failures, so only the known
    // outage wording gets the friendlier message.
    const bodyMessage: string | undefined = networkError?.result?.errors?.[0]?.message
    if (bodyMessage?.toLowerCase().includes("temporarily disabled")) {
      return "AniList's API is temporarily disabled due to stability issues on their end. Check their Discord for updates, or try again later."
    }
    return fallback
  }

  if (typeof statusCode === "number" && statusCode >= 500) {
    return "AniList's servers appear to be down. Please try again later."
  }

  if (networkError && statusCode === undefined) {
    // No statusCode means the fetch itself failed — never got a response.
    const offline = typeof navigator !== "undefined" && navigator.onLine === false
    return offline
      ? "You appear to be offline. Check your internet connection and try again."
      : "Unable to reach AniList. Their service may be down — please try again later."
  }

  return fallback
}
