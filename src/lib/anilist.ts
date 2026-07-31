const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co"

export type PendingUpdate = { progress?: number; score?: number; status?: string }

export class AniListRequestError extends Error {
  readonly status: number
  // An aliased multi-mutation can partly succeed, so the payload still names which entries
  // landed even though the request as a whole failed.
  readonly data: unknown
  // AniList's first error message, unwrapped — it answers both a rejected edit and a dead
  // token with 400, and only the body tells them apart.
  readonly detail: string | undefined

  constructor(message: string, status: number, data: unknown, detail?: string) {
    super(message)
    this.name = "AniListRequestError"
    this.status = status
    this.data = data
    this.detail = detail
  }
}

// An expired or revoked token, which AniList reports as 400 rather than 401.
export const isInvalidTokenError = (error: unknown): boolean =>
  error instanceof AniListRequestError &&
  error.status === 400 &&
  !!error.detail?.toLowerCase().includes("invalid token")

async function request(token: string, query: string, variables?: Record<string, unknown>) {
  const response = await fetch(ANILIST_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ query, variables })
  })

  const json = await response.json().catch(() => null)

  // fetch only rejects on network failure, and AniList answers 4xx — rate limits especially —
  // with a perfectly valid JSON body. Both have to be raised here or callers read a failed
  // request as a successful one.
  if (!response.ok) {
    const detail = json?.errors?.[0]?.message
    throw new AniListRequestError(
      `AniList request failed with ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
      json?.data,
      detail
    )
  }
  if (json?.errors?.length) {
    throw new AniListRequestError(
      json.errors.map((error: { message?: string }) => error.message).join("; "),
      response.status,
      json?.data,
      json.errors[0]?.message
    )
  }

  return json
}

export async function fetchViewer(token: string) {
  return request(
    token,
    `query {
      Viewer {
        id
        name
        avatar { medium }
      }
    }`
  )
}

// One aliased multi-mutation so any number of queued edits flush as a single
// request, keeping bulk edits under AniList's per-request rate limit.
export async function saveBulkEntries(token: string, entries: Map<number, PendingUpdate>) {
  const mutations = Array.from(entries.entries()).map(([id, data]) => {
    const args = [`id: ${id}`]
    if (data.progress !== undefined) args.push(`progress: ${data.progress}`)
    if (data.score !== undefined) args.push(`score: ${data.score}`)
    if (data.status !== undefined) args.push(`status: ${data.status}`)
    // updatedAt comes back so the locally predicted stamp can be replaced with the
    // authoritative one without a second request.
    return `m${id}: SaveMediaListEntry(${args.join(", ")}) { id updatedAt }`
  })

  return request(token, `mutation { ${mutations.join("\n")} }`)
}
