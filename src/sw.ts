/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core"
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching"
import { NavigationRoute, registerRoute } from "workbox-routing"
import { saveBulkEntries } from "./lib/anilist"
import { readSyncMirror, writeSyncMirror } from "./lib/syncMirror"

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (string | { url: string; revision: string | null })[]
}

type SyncEvent = ExtendableEvent & { tag: string }

const ANILIST_URL = "https://graphql.anilist.co"
const COVER_URL = "https://s4.anilist.co/"
const ANILIST_CACHE = "anilist-api"
const COVER_CACHE = "anilist-covers"
// ~400 covers at the 140KB size the grid asks for.
const COVER_CACHE_LIMIT = 400
const NETWORK_TIMEOUT_MS = 4000
const BACKGROUND_SYNC_TAG = "flush-pending-updates"

precacheAndRoute(self.__WB_MANIFEST)

// An offline reload asks for a URL that was never a built file — serve the app shell rather
// than failing the navigation.
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")))

// registerType: "autoUpdate" expects the worker to take over without waiting to be asked.
self.addEventListener("install", () => self.skipWaiting())
clientsClaim()

const isReadOperation = (body: string): boolean => {
  try {
    return !/^\s*mutation\b/.test(JSON.parse(body).query ?? "")
  } catch {
    return false
  }
}

// Network-first, hand-rolled rather than Workbox's NetworkFirst: the Cache API can't store a
// POST at all, so each query is keyed by a synthetic GET URL built from its body.
async function networkFirstAniList(request: Request): Promise<Response> {
  const body = await request.clone().text()

  // Only reads are cacheable. Answering a mutation from cache would report an edit as saved
  // when it never left the device — the sync queue is what makes an edit durable, not this.
  if (!isReadOperation(body)) return fetch(request)

  const cache = await caches.open(ANILIST_CACHE)
  const key = `${ANILIST_URL}/__cached?body=${encodeURIComponent(body)}`

  const network = fetch(request)
  // Kept as its own chain so a response that arrives after the timeout still refreshes the
  // cache, and so a rejected fetch is never left unhandled.
  const settled = network.then(
    (response) => {
      if (response.ok) cache.put(key, response.clone()).catch(() => {})
      return response
    },
    () => null
  )

  const raced = await Promise.race([
    settled,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS))
  ])

  // A real 4xx/5xx is the truth and gets passed through — only a timeout or a dead network
  // falls back to the last-known response.
  if (raced) return raced
  return (await cache.match(key)) ?? network
}

// Covers are the bulk of what this app downloads and a URL's image never changes, so a flaky
// connection only has to win once per cover — and the grid still paints on a cold offline launch.
async function cacheFirstCover(request: Request): Promise<Response> {
  const cache = await caches.open(COVER_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit

  // Refetched as cors rather than forwarding the <img> element's no-cors request: an opaque
  // response hides its status, and caching one would pin a transient 5xx as if it were the cover.
  const response = await fetch(request.url, { mode: "cors", credentials: "omit" }).catch(() => null)
  if (!response) return fetch(request)

  if (response.ok) {
    await cache.put(request, response.clone())
    // keys() is insertion-ordered, so the front of the list is the oldest cover.
    const keys = await cache.keys()
    if (keys.length > COVER_CACHE_LIMIT) {
      await Promise.all(keys.slice(0, keys.length - COVER_CACHE_LIMIT).map((key) => cache.delete(key)))
    }
  }
  return response
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method === "POST" && request.url.startsWith(ANILIST_URL)) {
    event.respondWith(networkFirstAniList(request))
  } else if (request.method === "GET" && request.url.startsWith(COVER_URL)) {
    event.respondWith(cacheFirstCover(request))
  }
})

// The page keeps its own copy in localStorage and flushes again on the next open, so an edit
// sent here can be sent a second time. The mutations set absolute values, so a replay inside
// the queue's 24h window is a no-op rather than a double increment.
async function flushMirroredUpdates(): Promise<void> {
  const mirror = await readSyncMirror()
  if (!mirror) return

  // Left to reject on failure: that's the signal for the browser to retry the sync on its own
  // backoff, which is the whole reason this path exists.
  await saveBulkEntries(mirror.token, new Map(mirror.updates))
  await writeSyncMirror(null)
}

self.addEventListener("sync", ((event: SyncEvent) => {
  if (event.tag === BACKGROUND_SYNC_TAG) event.waitUntil(flushMirroredUpdates())
}) as EventListener)
