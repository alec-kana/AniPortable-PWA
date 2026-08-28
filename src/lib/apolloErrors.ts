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
    // Every 403, whatever the body. AniList's documented outage response is
    // GraphQL-shaped, but a Cloudflare block page or an empty body arrives as a
    // ServerParseError with no .result to read — matching on wording left those
    // showing the generic error. Auth failures are 401 or 400, never 403.
    return "AniList's API is temporarily disabled due to stability issues on their end. Check their Discord for updates, or try again later."
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
