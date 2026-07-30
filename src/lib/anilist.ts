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
  return response.json()
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
    return `m${id}: SaveMediaListEntry(${args.join(", ")}) { id }`
  })

  return request(token, `mutation { ${mutations.join("\n")} }`)
}
