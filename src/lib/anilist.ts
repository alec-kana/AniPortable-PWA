const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co"

export type PendingUpdate = { progress?: number; score?: number; status?: string }

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
    throw new Error(`AniList request failed with ${response.status}${detail ? `: ${detail}` : ""}`)
  }
  if (json?.errors?.length) {
    throw new Error(json.errors.map((error: { message?: string }) => error.message).join("; "))
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
