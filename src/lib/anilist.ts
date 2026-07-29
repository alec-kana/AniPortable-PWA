const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co"

export type PendingUpdate = { progress?: number; score?: number; status?: string }

export class AniList {
  #accessToken: string

  constructor(token: string) {
    this.#accessToken = token
  }

  #headers(): Headers {
    const headers = new Headers()
    headers.append("Content-Type", "application/json")
    headers.append("Accept", "application/json")
    if (this.#accessToken) {
      headers.append("Authorization", `Bearer ${this.#accessToken}`)
    }
    return headers
  }

  async #request(query: string, variables?: Record<string, unknown>) {
    const response = await fetch(ANILIST_GRAPHQL_URL, {
      method: "POST",
      headers: this.#headers(),
      body: JSON.stringify({ query, variables })
    })
    return response.json()
  }

  async user(): Promise<any> {
    return this.#request(`
      query {
        Viewer {
          id
          name
          avatar { medium }
        }
      }
    `)
  }

  async saveMediaListEntry(variables: { id: number; progress?: number; score?: number; status?: string }) {
    return this.#request(
      `
      mutation ($id: Int, $progress: Int, $score: Float, $status: MediaListStatus) {
        SaveMediaListEntry(id: $id, progress: $progress, score: $score, status: $status) {
          id
        }
      }
    `,
      variables
    )
  }

  // Builds one aliased multi-mutation from a Map<entryId, PendingUpdate> so
  // an arbitrary number of queued edits flush as a single HTTP request —
  // this is what keeps rapid bulk edits (e.g. marking several entries
  // completed in a row) from hitting AniList's per-request rate limit.
  async saveBulkMediaListEntries(entries: Map<number, PendingUpdate>) {
    const mutationParts = Array.from(entries.entries()).map(([id, data]) => {
      const args = [`id: ${id}`]
      if (data.progress !== undefined) args.push(`progress: ${data.progress}`)
      if (data.score !== undefined) args.push(`score: ${data.score}`)
      if (data.status !== undefined) args.push(`status: ${data.status}`)
      return `m${id}: SaveMediaListEntry(${args.join(", ")}) { id }`
    })

    const query = `mutation { ${mutationParts.join("\n")} }`

    const response = await fetch(ANILIST_GRAPHQL_URL, {
      method: "POST",
      headers: this.#headers(),
      body: JSON.stringify({ query })
    })

    return response.json()
  }
}
