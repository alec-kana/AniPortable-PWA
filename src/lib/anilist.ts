const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co"

export type PendingUpdate = { progress?: number; score?: number; status?: string }

export class AniListRequestError extends Error {
  readonly status: number
  // An aliased multi-mutation can partly succeed, so the payload still names which entries
  // landed even though the request as a whole failed.
  readonly data: unknown

  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.name = "AniListRequestError"
    this.status = status
    this.data = data
  }
}

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
      json?.data
    )
  }
  if (json?.errors?.length) {
    throw new AniListRequestError(
      json.errors.map((error: { message?: string }) => error.message).join("; "),
      response.status,
      json?.data
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
