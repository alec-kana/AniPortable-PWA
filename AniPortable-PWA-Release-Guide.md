# AniPortable PWA — Release Guide

Everything that should happen between "it works on my machine" and "it's live at a real domain," in one place. Part 1 is the code-level parity/reliability work (diffed directly against `alec-kana/AniPortable`, the extension). Part 2 is everything else release-shaped that isn't about the extension at all. Part 3 is the domain/hosting question. Part 4 is the whole thing collapsed into one checklist you can work down top to bottom.

**Method note:** Part 1 is grounded in a direct file-by-file diff of `alec-kana/AniPortable` (v1.6.5) against `alec-kana/AniPortable-PWA` (v0.1.0) — `background.ts`, the sync queue, auth, settings, contexts, components. GitHub blocks crawling `/commits` and the public API was rate-limited when this research was done, so this isn't a commit-by-commit history — it's a comparison of the current state of both codebases, which is what actually matters for closing the gap.

---

## Part 1 — Code Parity & Reliability

Ordered by impact: **P0 \= active bug, P1 \= reliability gap, P2 \= offline/PWA-native gap, P3 \= polish.**

### P0 — Dirty-refresh flashes "0" / "no entries" instead of loading

**Highest priority — this is a regression of a bug the extension already found and fixed.**

The extension marks a list dirty *without* touching its cached data:

```ts
// AniPortable/contexts/AniListDataContext.tsx
// The flag alone drives the refetch. Blanking the list too made the refetch
// window render as an empty list — "0 / 0.00" in Stats reads as a real answer.
const markAnimeDirty = useCallback(() => setAnimeDirty(true), [])
```

That comment documents a bug they hit and fixed. The PWA's `AniListDataContext.tsx` does the opposite on purpose:

```ts
// AniPortable-PWA/src/contexts/AniListDataContext.tsx
// Empties the cached list too, so a stale render can't flash old entries
// while the refetch triggered by the dirty flag is in flight.
const markDirty = useCallback((key: ListKey) => {
  setLists((prev) => ({ ...prev, [key]: [] }))
  setDirty((prev) => ({ ...prev, [key]: true }))
}, [])
```

This solves a different problem (stale data flashing) but reintroduces the one the extension already ruled out — because in both `MediaListTab.tsx` and `StatsTab.tsx`, the loading spinner is gated on Apollo's `useQuery` `loading` flag, which is **`false` during a manual `.refetch()`**. Walk it through: an edit on the Anime tab calls `markDirty("mangaStats")` → `lists.mangaStats` becomes `[]` → you switch to Stats → `mangaLoading` is `false` (it's a refetch, not a cold query) → the tab renders **"Total Anime: 0", "Mean Score: 0.00"** for the length of that round-trip. Same mechanism makes `MediaListTab` briefly show its "no entries" empty state instead of a spinner.

**Fix:**

1. In `src/contexts/AniListDataContext.tsx`, stop blanking the list in `markDirty` — just flip the flag, matching the extension:

```ts
const markDirty = useCallback((key: ListKey) => {
  setDirty((prev) => ({ ...prev, [key]: true }))
}, [])
```

2. That reopens the "stale data flashes while refetching" problem the PWA's version was trying to avoid — but that's a much smaller cosmetic issue than showing wrong numbers as if they were real. Solve it in the consumers instead: treat `dirty` as loading too.

```ts
// MediaListTab.tsx
if (loading || isDirty) return <StateMessage icon={Loader2} spin message={config.labels.loading} />
```

```ts
// StatsTab.tsx
if (animeLoading || mangaLoading || dirty.animeStats || dirty.mangaStats)
  return <StateMessage icon={Loader2} spin message="Loading your stats..." />
```

3. Re-test the exact repro: open Anime tab, bump an episode, switch tabs immediately — confirm you see the spinner, never a `0` or an empty-state card, until the refetch resolves.

---

### P1 — Sync queue has no retry loop once the app is open and a flush fails

The extension's queue is backed by `chrome.alarms`, retrying **indefinitely with exponential backoff**, whether or not the popup is open:

```ts
// background.ts
const FLUSH_RETRY_MINUTES = 0.5 // 30s floor
const MAX_FLUSH_RETRY_MINUTES = 30
function armFlushAlarm(): void {
  const minutes = Math.min(FLUSH_RETRY_MINUTES * 2 ** flushFailures, MAX_FLUSH_RETRY_MINUTES)
  chrome.alarms.create(FLUSH_ALARM, { delayInMinutes: minutes })
}
```

`src/lib/syncQueue.ts` only re-arms anything from `queueUpdate()` (a new edit) or `notifyCardOpened/Closed()`. After a failed `flushAllPendingUpdates()`, the batch is re-queued and persisted — but **nothing schedules another attempt**. If you're offline with the app open and idle, the failed batch just sits there until you background the tab, close it, or make another edit. There's also no backoff at all — every trigger just calls the flush once.

**Fix**, in `src/lib/syncQueue.ts`:

```ts
const RETRY_BASE_MS = 30_000        // 30s floor, matches the extension's alarm clamp
const RETRY_MAX_MS = 30 * 60_000    // 30 min ceiling, matches MAX_FLUSH_RETRY_MINUTES

let retryTimer: ReturnType<typeof setTimeout> | null = null
let flushFailures = 0

function armRetryTimer(): void {
  if (retryTimer) clearTimeout(retryTimer)
  if (pendingUpdates.size === 0) return
  const delay = Math.min(RETRY_BASE_MS * 2 ** flushFailures, RETRY_MAX_MS)
  retryTimer = setTimeout(flushAllPendingUpdates, delay)
}
```

- On the success path: `flushFailures = 0`, clear `retryTimer`.  
- In the `catch` block: `flushFailures += 1`, then call `armRetryTimer()` after `persistPendingUpdates()`.  
- Also call `armRetryTimer()` from the `visibilitychange`/`pagehide` handlers, in case the flush they trigger fails silently in a backgrounded (throttled but still running) tab.

---

### P1 — No retry once the tab/app is fully closed (Background Sync gap)

This one is called out directly in the PWA's own `vite.config.ts`:

```ts
workbox: {
  // Sync-queue durability is handled in-page (src/lib/syncQueue.ts) via
  // localStorage + visibilitychange/pagehide, not by this service
  // worker — this SW only precaches static assets for installability.
  globPatterns: ["**/*.{js,css,html,png,svg,ico}"]
}
```

There's currently no web equivalent of `chrome.alarms`. If the app is closed while a flush is failing, nothing retries until it's reopened.

**Fix** — needs the web Background Sync API, which needs a hand-written service worker (`injectManifest` mode instead of `generateSW`):

1. Switch modes:

```ts
// vite.config.ts
VitePWA({
  strategies: "injectManifest",
  srcDir: "src",
  filename: "sw.ts",
  registerType: "autoUpdate",
  injectManifest: { globPatterns: ["**/*.{js,css,html,png,svg,ico}"] },
  manifest: { /* unchanged */ }
})
```

2. Create `src/sw.ts`:

```ts
import { precacheAndRoute } from "workbox-precaching"
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener("sync", (event: any) => {
  if (event.tag === "flush-pending-updates") {
    event.waitUntil(flushFromServiceWorker())
  }
})
```

   The service worker can't reach into the page's in-memory queue directly. `localStorage` isn't spec-guaranteed inside a SW either, so the pragmatic path is `postMessage`\-ing the current queue to the SW on every `persistPendingUpdates()` call, so the SW always has a current copy to act on if it wakes up alone. (A cleaner long-term fix is migrating the queue to IndexedDB, which both contexts can read reliably — worth doing if you find yourself fighting the `postMessage` approach.)

   

3. From `src/lib/syncQueue.ts`, register a sync on every failed flush:

```ts
async function registerBackgroundSync(): Promise<void> {
  if (!("serviceWorker" in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    if ("sync" in reg) await (reg as any).sync.register("flush-pending-updates")
  } catch {
    // Unsupported (notably: no Safari/iOS support) — the P1 foreground
    // retry timer above is the fallback there.
  }
}
```

4. Call it from the `catch` block in `flushAllPendingUpdates()`, alongside `armRetryTimer()`.  
5. **Know the limitation going in:** Background Sync doesn't exist on Safari/iOS. Keep the foreground-retry fix as the baseline for every platform; treat this as an extra reliability layer on Chromium, not a replacement.

---

### P2 — No offline data at all (Workbox only caches the app shell)

`vite.config.ts`'s Workbox config only precaches static build output. No `runtimeCaching` for the AniList GraphQL endpoint means the app shell loads offline, but every list/stat/login-state resolution hangs or errors — there's nothing cached to fall back to.

**Fix**, once on `injectManifest` mode (shares the SW file with the item above):

```ts
// src/sw.ts
import { registerRoute } from "workbox-routing"
import { NetworkFirst } from "workbox-strategies"

registerRoute(
  ({ url }) => url.href === "https://graphql.anilist.co/",
  new NetworkFirst({ cacheName: "anilist-api", networkTimeoutSeconds: 4 }),
  "POST" // AniList's GraphQL endpoint is POST-only; Workbox needs the method declared explicitly
)
```

`NetworkFirst`, not `CacheFirst`/`StaleWhileRevalidate` — you always want the live list if the network answers within the timeout, falling back to the last-known response only if it doesn't. Apollo's in-memory cache doesn't survive a reload on its own, so this Workbox cache is what actually persists offline. Add a lightweight offline indicator (check `navigator.onLine`) so a user looking at slightly-stale cached data understands why a just-queued edit hasn't shown as synced. Test with DevTools → Network → Offline, reload, confirm last-fetched lists render instead of a blank/error screen.

---

### P2 — No local "paint cache" for AniList-derived settings

The extension mirrors AniList-sourced prefs (profile color, title language, adult-content toggle, score format, row order) into storage, stamped with the owning account, specifically so the *next* open paints instantly instead of defaulting:

```ts
// SettingsContext.tsx
useEffect(() => {
  if (settingsData?.User?.options) {
    // Mirrored so the next open paints these instead of the defaults
    chrome.storage.local.set({ ...prefs, prefsUserId: userId })
  }
}, [settingsData])
```

`src/contexts/SettingsContext.tsx` initializes these five fields to hardcoded defaults every time and only updates them once `SETTINGS_QUERY` resolves — `usePersistedState` (already used for device-only settings like `manualCompletion`) isn't used for these. Every cold load — and especially every offline load, once the item above is fixed — flashes the default blue theme and `POINT_10` format for a moment, even for a returning user whose real profile color is purple.

**Fix**, in `src/contexts/SettingsContext.tsx`:

```ts
const [prefsUserId, setPrefsUserId] = usePersistedState<number | null>('prefsUserId', null)
const [profileColor, setProfileColorRaw] = usePersistedState('profileColor', 'blue')
const [titleLanguage, setTitleLanguageRaw] = usePersistedState('titleLanguage', 'ROMAJI')
const [displayAdultContent, setDisplayAdultContentRaw] = usePersistedState('displayAdultContent', false)
const [scoreFormat, setScoreFormatRaw] = usePersistedState('scoreFormat', 'POINT_10')
const [rowOrder, setRowOrderRaw] = usePersistedState('rowOrder', 'score')
```

- If `prefsUserId !== userId` on login, reset these five to defaults *before* the query resolves — otherwise a second account on the same device briefly paints with the first account's colors, exactly what the extension's stamping guards against.  
- On `settingsData` resolving, write through to state and `prefsUserId` together (same pattern as the extension's write-through effect).  
- This pairs with the offline caching fix above: once AniList's response can be served from cache, this paint cache keeps the *UI* from defaulting to blue/POINT\_10 while that cached response loads.

---

### P3 — Score chart is an unwanted keyboard tab stop

Documented fix in the extension's `CLAUDE.md`: `ScoreChart` passes `accessibilityLayer={false}` because recharts 3 defaults it on, making a purely decorative chart a tab stop. `src/components/ScoreChart.tsx`'s two `<BarChart>` elements don't set this (both already have `pointerEvents: 'none'`, confirming they were never meant to be interactive).

**Fix:** add `accessibilityLayer={false}` to both `<BarChart>` elements in `ScoreChart.tsx`. Tab through the Stats page afterward and confirm focus skips both charts entirely.

---

### Do Not Port

Two extension-only pieces solve problems that don't exist for the PWA — porting them adds complexity for nothing:

- **`components/EdgeHandle.tsx`** — a hand-built draggable scrollbar, built solely because a Chrome *extension popup* window is sized to its document and "won't narrow it again" (per `CLAUDE.md`), with no native overlay scrollbar to fall back on. A PWA in a normal tab or installed standalone window has an ordinary resizable viewport with a normal scrollbar. None of the underlying problem exists.  
- **`gridColumns`/`gridColumnsSetting` split in `SettingsContext.tsx`, and `components/Tabs.tsx`** — same popup-can't-shrink workaround, plus a desktop/hover-era top-tab layout. The PWA already made the right call with `BottomNav.tsx` and a single mobile-first column; there's nothing to close here.

---

## Part 2 — Pre-Launch Checklist

Everything here is independent of Part 1 and applies regardless of how much of the parity work is done first.

### Legal / repo hygiene

- [ ] **Add a `LICENSE` file.** The extension has MIT; the PWA repo has none. No license file defaults to "all rights reserved," which is very likely not what you want for a public AniList client.  
- [ ] **Add a short privacy note** (a paragraph in the README is enough for a project this size): what's stored (AniList access token \+ your own preferences, all client-side in `localStorage`), that there's no backend and nothing is sent anywhere except directly to AniList's API. Worth having in writing once strangers — not just you — are logging in through it.

### Platform polish (manifest \+ iOS)

- [ ] **iOS meta tags.** `index.html` currently only has `apple-touch-icon` at 128×128 and no standalone-mode tags. Add:

```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="AniPortable" />
<link rel="apple-touch-icon" sizes="180x180" href="/icons/icon180.png" />
```

      Without the first tag, "Add to Home Screen" on iOS opens inside Safari's chrome instead of standalone. You'll need to export a 180×180 icon (Apple's expected size) rather than relying on the browser to downscale the 128px one.

      

- [ ] **Manifest polish (optional but cheap):** add a `screenshots` array (powers the richer install prompt Chrome shows on desktop/Android) and an `id` field. Neither is required for installability, both improve the install prompt.  
- [ ] **Basic social/SEO tags** if this'll ever be linked publicly: `<meta name="description">`, and Open Graph tags (`og:title`, `og:image`). Optional, but a bare `<title>AniPortable</title>` with nothing else looks unfinished if someone shares the link.

### AniList OAuth (blocking — do this before deploying)

- [ ] **Register a production AniList app** with the redirect URL set to your *exact* final domain (`https://yourdomain.com/`, matching whatever path your app actually serves from).  
- [ ] Put that `client_id` in `.env.production` — confirm it's the production one, not the one you've been using for `localhost` dev.  
- [ ] **Test the full login round-trip against the real deployed domain**, not just `localhost`. The redirect URL match is exact-string, not fuzzy — a trailing slash mismatch alone will fail silently.

### Deployment configuration

- [ ] **Decide root domain vs. subpath, and don't mix them up.** If you deploy to a project subpath (e.g. `you.github.io/AniPortable-PWA/`) rather than a domain root, `start_url`/`scope` in the manifest and Vite's `base` config all need to agree, or the service worker registers against the wrong scope and installability breaks silently. Deploying at the root of your own domain sidesteps this entirely — simplest option if you're already buying a domain (see Part 3).  
- [ ] **HTTPS is non-negotiable** — the service worker won't register without it. Any of Netlify/Vercel/Cloudflare Pages give you this automatically on their free tiers with zero config.  
- [ ] **Set a `Content-Security-Policy` header** at the hosting layer (e.g. a `_headers` file on Netlify, `vercel.json` headers on Vercel) restricting `script-src` to your own origin. The access token lives in `localStorage`, which any injected script on your origin can read — unlike the extension, where `chrome.storage.local` isn't reachable from web content at all. A basic CSP is your front-line defense against XSS on a now-public site.

### QA before flipping it live

- [ ] **Run a Lighthouse PWA audit** against the deployed build (not `localhost`) — catches manifest/scope/installability issues automatically, including the subpath problem above.  
- [ ] **Manually verify the offline path** once Part 1's caching fix is in: load once online, go offline in DevTools, reload, confirm cached lists render.  
- [ ] **Manually verify cross-tab auth sync**: log in in one tab, confirm a second open tab picks up the session via `BroadcastChannel` without a manual refresh (and the reverse for logout).  
- [ ] **Force an expired/invalid token** (easiest: manually corrupt the stored token in DevTools) and confirm the app cleanly drops to the login page rather than getting stuck on an error screen — this exercises the exact `isInvalidTokenError` path the sync queue and Apollo error link both depend on.

### Update experience

- [ ] **Consider a visible "Update available" prompt** instead of `registerType: "autoUpdate"`'s silent swap-and-reload. A silent reload mid-edit is *safe* (the sync queue persists to `localStorage` regardless), but a small toast with a manual "Refresh" button is a friendlier experience than the page changing under someone unannounced.

---

## Part 3 — Domain & Hosting

Domains are the cheapest part of this whole project. For a personal/hobby-scale app, expect:

| TLD | Typical price/year | Notes |
| :---- | :---- | :---- |
| `.com` / `.net` | \~$10–20 | Safest, most recognizable — check availability of your exact name first |
| `.app` | \~$10–15 | Google-run; HTTPS is *mandatory* by registry policy, which you need anyway for the service worker — a nice technical and thematic fit for something literally called "AniPortable" |
| `.moe` | \~$13–25 | Niche TLD associated with anime/otaku fan sites — on-brand for an anime tracker if you want that flavor |

- WHOIS privacy is bundled free at most registrars now (Namecheap, Porkbun, etc.) — no extra line item needed.  
- Hosting a static Vite build like this is free on Netlify/Vercel/Cloudflare Pages' free tiers.  
- **Realistic total annual cost to run this publicly: just the \~$10–25 domain registration.** Nothing else in this stack costs money at this scale.  
- Check name availability *before* registering the production AniList OAuth app (Part 2\) — the redirect URL has to match whatever domain you land on, so pick the domain first, then register the app against it, not the other way around.

---

## Part 4 — Launch Order

If you want one sequence to work through, this is it — each step only depends on the ones above it:

1. **P0 fix** (Part 1\) — smallest diff, actively wrong behavior, no dependencies.  
2. **Pick and register the domain** (Part 3\) — needed before the next step.  
3. **Register the production AniList OAuth app** against that domain (Part 2).  
4. **P1 foreground retry timer** (Part 1\) — self-contained.  
5. **P2 settings paint cache** (Part 1\) — self-contained, immediately noticeable improvement.  
6. **`injectManifest` migration**, landing **P2 offline caching \+ P1 Background Sync** together (Part 1\) — one SW rewrite, two features.  
7. **Legal \+ platform polish**: LICENSE, iOS meta tags, manifest screenshots (Part 2).  
8. **Deploy to the real domain** with CSP headers set (Part 2).  
9. **Full QA pass** on the live deployment: Lighthouse audit, offline test, cross-tab auth test, expired-token test (Part 2).  
10. **P3 chart accessibility fix** (Part 1\) — trivial, do it whenever, don't let it block anything above.

