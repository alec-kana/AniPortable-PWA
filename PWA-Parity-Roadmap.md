# AniPortable-PWA: Parity & Reliability Roadmap

**Method:** Diffed the actual source of `alec-kana/AniPortable` (extension, v1.6.5) against `alec-kana/AniPortable-PWA` (v0.1.0), file by file — `background.ts`, the sync queue, auth, settings, contexts, and components — rather than relying on commit messages (GitHub blocks crawling `/commits` and the public API was rate-limited when this was written). Every item below is backed by a specific line of code or comment in one or both repos, referenced inline.

Items are ordered by impact: **P0 \= active bug**, **P1 \= reliability gap**, **P2 \= offline/PWA-native gap**, **P3 \= polish**. A "Do Not Port" section is included at the end for extension code that solves an extension-only problem.

---

## P0 — Dirty-refresh flashes "0" / "no entries" instead of loading

**This is the highest priority item — it's a regression of a bug the extension already found and fixed.**

### What the extension does

`AniPortable/contexts/AniListDataContext.tsx` marks a list dirty *without* touching its cached data:

```ts
// The flag alone drives the refetch. Blanking the list too made the refetch
// window render as an empty list — "0 / 0.00" in Stats reads as a real answer.
const markAnimeDirty = useCallback(() => setAnimeDirty(true), [])
```

That comment documents a bug they hit and fixed: if you clear the cached list when marking it dirty, the UI renders the *empty* state (or `0`/`0.00` stat tiles) for the entire round-trip of the refetch, and a user reading the screen has no way to tell "genuinely zero" apart from "still loading."

### What the PWA does

`AniPortable-PWA/src/contexts/AniListDataContext.tsx` does the opposite on purpose:

```ts
// Empties the cached list too, so a stale render can't flash old entries
// while the refetch triggered by the dirty flag is in flight.
const markDirty = useCallback((key: ListKey) => {
  setLists((prev) => ({ ...prev, [key]: [] }))
  setDirty((prev) => ({ ...prev, [key]: true }))
}, [])
```

This solves a different problem (stale data flashing) but reintroduces the one the extension already ruled out — because in both `MediaListTab.tsx` and `StatsTab.tsx`, the loading spinner is gated on Apollo's own `useQuery` `loading` flag, which is **`false` during a manual `.refetch()`**:

```ts
// MediaListTab.tsx
const rawEntries = cachedList ?? data?.MediaListCollection?.lists?.[0]?.entries ?? []
...
if (loading) return <StateMessage icon={Loader2} spin message={config.labels.loading} />
...
{sorted.length === 0 ? (<StateMessage ... />) : ...}
```

```ts
// StatsTab.tsx
if (animeLoading || mangaLoading)
  return <StateMessage icon={Loader2} spin message="Loading your stats..." />
```

Walk the sequence: an edit on the Anime tab calls `markDirty("mangaStats")` → `lists.mangaStats` becomes `[]` → you switch to Stats → `animeLoading`/`mangaLoading` are `false` (this is a `refetch()`, not a cold `useQuery`) → the tab renders **"Total Anime: 0", "Mean Score: 0.00"** for the length of that network round-trip, then snaps to the real numbers. Same mechanism makes `MediaListTab` briefly show its "no entries" empty state instead of a spinner.

### Step-by-step fix

1. Open `src/contexts/AniListDataContext.tsx`.  
2. Stop blanking the list in `markDirty` — just flip the flag, matching the extension:

```ts
const markDirty = useCallback((key: ListKey) => {
  setDirty((prev) => ({ ...prev, [key]: true }))
}, [])
```

3. That reopens the "stale data flashes while refetching" problem the PWA's version was trying to avoid — but that's a much smaller cosmetic issue than showing wrong numbers as if they were real. Solve it properly instead, in `MediaListTab.tsx` and `StatsTab.tsx`: treat `dirty` as loading too.

```ts
// MediaListTab.tsx
if (loading || isDirty) return <StateMessage icon={Loader2} spin message={config.labels.loading} />
```

```ts
// StatsTab.tsx — do this for whichever side is dirty
if (animeLoading || mangaLoading || dirty.animeStats || dirty.mangaStats)
  return <StateMessage icon={Loader2} spin message="Loading your stats..." />
```

4. Re-test the exact repro: open Anime tab, bump an episode (which should mark Manga/Stats dirty per the existing `markXDirty()` calls), switch tabs immediately, confirm you see the spinner — never a `0` or an empty-state card — until the refetch resolves.  
5. Since `MediaListTab.tsx`'s `rawEntries = cachedList ?? ...` relied on `cachedList` being `[]` (truthy) rather than `null` to prefer the cache, double check that logic still behaves once `cachedList` can be `null` again on a first load — it already falls through to `data?.MediaListCollection...` correctly via `??`, so no change needed there.

---

## P1 — Sync queue has no retry loop once the app is open and a flush fails

### What the extension does

The extension's queue is backed by `chrome.alarms`, which keeps retrying **indefinitely, with exponential backoff, whether or not the popup is open**:

```ts
// background.ts
const FLUSH_ALARM = "flush-pending-updates"
const FLUSH_RETRY_MINUTES = 0.5 // 30s, the floor Chrome clamps an alarm to
const MAX_FLUSH_RETRY_MINUTES = 30

function armFlushAlarm(): void {
  const minutes = Math.min(FLUSH_RETRY_MINUTES * 2 ** flushFailures, MAX_FLUSH_RETRY_MINUTES)
  chrome.alarms.create(FLUSH_ALARM, { delayInMinutes: minutes })
}
```

Every failed flush increments `flushFailures`, doubling the wait (capped at 30 min), and the alarm fires that function again regardless of what the popup is doing.

### What the PWA does

`src/lib/syncQueue.ts` only re-arms anything from `queueUpdate()` (a new edit) or `notifyCardOpened/Closed()` (opening/closing a card overlay). After a failed `flushAllPendingUpdates()`, the failed batch goes back into `pendingUpdates` and is persisted — but **nothing schedules another attempt**. The only remaining triggers are:

- `visibilitychange` → fires when you background the tab  
- `pagehide` → fires when you close/navigate away  
- `initSyncQueue()`'s one-shot flush on boot, if there's a saved queue

If you're offline with the app open and idle (a very normal state — you queued an edit on the subway, say), the failed batch just sits there. It'll flush the moment you background the tab or make another edit, but there's no active retry while you're sitting on the page. There's also no backoff at all — every trigger just calls `flushAllPendingUpdates()` once.

### Step-by-step fix

1. Add a foreground retry timer to `src/lib/syncQueue.ts`, mirroring the alarm's backoff:

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

2. In `flushAllPendingUpdates()`'s success path, reset `flushFailures = 0` and clear `retryTimer` (nothing left to retry).  
3. In the `catch` block, increment `flushFailures += 1` and call `armRetryTimer()` after `persistPendingUpdates()`, so a failed flush always schedules its own follow-up — independent of the debounce timer, the visibility listener, or another edit coming in.  
4. Also call `armRetryTimer()` (in addition to the existing `flushAllPendingUpdates()` call) inside the `visibilitychange`/`pagehide` handlers, in case the flush they trigger itself fails silently in the background (a backgrounded tab can still run timers, just throttled — good enough for this).  
5. This closes the foreground gap without touching the closed-app gap below — they're separate problems with separate fixes.

---

## P1 — No retry once the tab/app is fully closed (the Background Sync gap)

### What the extension does

Because the popup itself has almost no lifetime, the extension's real reliability comes from the worker surviving independently: `chrome.alarms` wakes the MV3 service worker even with the popup closed, so a queued edit keeps retrying for up to the 24h age-out with nobody looking at the screen. `CLAUDE.md` calls this out explicitly:

> "The close flush can't be the last word... So `persistPendingUpdates()` arms a `chrome.alarms` wake-up (`FLUSH_ALARM`) whenever the queue is non-empty... that alarm is the only thing that retries a failed or interrupted flush with no popup open."

### What the PWA does

This is called out directly in the PWA's own `vite.config.ts`:

```ts
workbox: {
  // Sync-queue durability is handled in-page (src/lib/syncQueue.ts) via
  // localStorage + visibilitychange/pagehide, not by this service
  // worker — this SW only precaches static assets for installability.
  globPatterns: ["**/*.{js,css,html,png,svg,ico}"]
}
```

There is currently no web equivalent of `chrome.alarms`. If the PWA is closed (tab closed, or the installed app is swiped away) while a flush is failing, nothing retries until the app is reopened — at which point `initSyncQueue()`'s one-shot boot flush picks it up. That's *usually* fine, but it means an edit made just before closing, while offline, sits unsent until the next open rather than the moment connectivity returns.

### Step-by-step fix

This needs the web **Background Sync API**, registered from a real service worker (Workbox's `injectManifest` mode, not the current `generateSW` mode, since you need to write custom `sync` event handling).

1. Switch the plugin to `injectManifest` mode so you can own the service worker file:

```ts
// vite.config.ts
VitePWA({
  strategies: "injectManifest",
  srcDir: "src",
  filename: "sw.ts",
  registerType: "autoUpdate",
  injectManifest: {
    globPatterns: ["**/*.{js,css,html,png,svg,ico}"]
  },
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

   The service worker can't import your React app's in-memory `pendingUpdates` map directly — it needs its own minimal flush routine that reads `localStorage` (or better, migrate the queue to IndexedDB, which is reliably available to service workers; `localStorage` is not spec-guaranteed inside a SW in all browsers). A pragmatic first step: keep `localStorage` for the main thread, and have the SW's `flushFromServiceWorker()` read the same `pendingUpdates` key via the \[Storage Access API from a client message\] or, more simply, `postMessage` the queue to the SW on every `persistPendingUpdates()` call so the SW always has a current copy to act on if it wakes up alone.

   

3. From `src/lib/syncQueue.ts`, register a sync whenever a flush fails and the queue is non-empty:

```ts
async function registerBackgroundSync(): Promise<void> {
  if (!("serviceWorker" in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    if ("sync" in reg) await (reg as any).sync.register("flush-pending-updates")
  } catch {
    // Background Sync isn't supported (notably: no Safari/iOS support as of writing) —
    // the foreground retry timer from the previous section is the fallback there.
  }
}
```

4. Call `registerBackgroundSync()` from the `catch` block in `flushAllPendingUpdates()`, right alongside `armRetryTimer()`.  
5. **Know the limitation going in:** Background Sync is unsupported on Safari/iOS. Since this is a PWA that will very likely be installed on phones, keep the P1 foreground-retry fix above as the baseline for all platforms, and treat Background Sync as a "best effort, extra reliability on Chromium" layer on top — not a replacement.

---

## P2 — No offline data at all (Workbox only caches the app shell)

### What the extension has

Not applicable in the same way — the extension always runs inside a browser with a live connection to the page you're on, so "offline" isn't really a state it designs for. This is really a **PWA-native opportunity** rather than a strict port, but it's directly related to the point above (an installable app that goes blank without a network connection undercuts the whole pitch of installing it).

### What the PWA does

`vite.config.ts`'s Workbox config only has `globPatterns` for the static build output (JS/CSS/HTML/icons). There is no `runtimeCaching` entry for the AniList GraphQL endpoint, so:

- The app shell loads offline (you see the UI chrome).  
- Every list, every stat, and login state resolution all hang or error, because `apollo/client.ts` has no cache-first behavior and there's no cached response to fall back to.

### Step-by-step fix

1. Once you're on `injectManifest` mode (from the Background Sync section — the two changes share the same SW file), add a runtime route for AniList:

```ts
// src/sw.ts
import { registerRoute } from "workbox-routing"
import { NetworkFirst } from "workbox-strategies"

registerRoute(
  ({ url }) => url.href === "https://graphql.anilist.co/",
  new NetworkFirst({
    cacheName: "anilist-api",
    networkTimeoutSeconds: 4
  }),
  "POST" // AniList's GraphQL endpoint is POST-only; Workbox needs the method declared explicitly
)
```

   `NetworkFirst` is deliberate here over `CacheFirst` or `StaleWhileRevalidate` — you always want the live list if the network answers within the timeout, and only fall back to the last-known response if it doesn't.

   

2. Apollo's in-memory cache is cleared on every reload already (`popup`/`App` remounts fresh, per the extension's own architecture notes about the popup), so the Workbox cache is what actually survives a reload offline — Apollo's cache alone won't.  
3. Add a lightweight "offline" indicator in `StateMessage` or a toast when `navigator.onLine` is `false`, so a user looking at slightly-stale cached data understands why an edit they just queued hasn't shown as synced.  
4. Test by loading the app once online, then using Chrome DevTools → Network → Offline, reloading, and confirming the last-fetched lists render instead of an error/blank screen.

---

## P2 — No local "paint cache" for AniList-derived settings

### What the extension does

The extension mirrors the AniList-sourced preferences (profile color, title language, adult-content toggle, score format, row order) into `chrome.storage.local`, stamped with the account they came from, specifically so the *next* open can paint instantly instead of defaulting:

```ts
// SettingsContext.tsx
useEffect(() => {
  if (settingsData?.User?.options) {
    ...
    // Mirrored so the next open paints these instead of the defaults
    chrome.storage.local.set({ ...prefs, prefsUserId: userId })
  }
}, [settingsData])

useEffect(() => {
  if (!userId) return
  chrome.storage.local.get([...], (result) => {
    // Stamped with the account they came from, so another user never inherits
    // them — a cached score format would render visibly wrong numbers.
    if (serverPrefsRef.current || result.prefsUserId !== userId) return
    setProfileColorState(result.profileColor || 'blue')
    ...
  })
}, [userId])
```

### What the PWA does

`src/contexts/SettingsContext.tsx` initializes these five fields to hardcoded defaults every time and only ever updates them once the `SETTINGS_QUERY` resolves:

```ts
const [profileColor, setProfileColor] = useState('blue')
const [titleLanguage, setTitleLanguage] = useState('ROMAJI')
const [displayAdultContent, setDisplayAdultContent] = useState(false)
const [scoreFormat, setScoreFormat] = useState('POINT_10')
const [rowOrder, setRowOrder] = useState('score')
```

Note that `usePersistedState` (the local `localStorage`\-backed helper already defined in the same file) is used for the *device-only* settings (`manualCompletion`, `separateEntries`, `tabVisibility`, stats toggles) but not for these five AniList-backed ones. Practical effect: every cold load — and especially every offline load, once the fix above is in place — flashes the default blue theme and `POINT_10` score format for a moment (or indefinitely, if offline and the settings query never resolves), even for a returning user whose real profile color is, say, purple.

### Step-by-step fix

1. In `src/contexts/SettingsContext.tsx`, seed these five with the same `usePersistedState` pattern already used for the device-only settings, but stamp/check the owning user like the extension does:

```ts
const [prefsUserId, setPrefsUserId] = usePersistedState<number | null>('prefsUserId', null)
const [profileColor, setProfileColorRaw] = usePersistedState('profileColor', 'blue')
const [titleLanguage, setTitleLanguageRaw] = usePersistedState('titleLanguage', 'ROMAJI')
const [displayAdultContent, setDisplayAdultContentRaw] = usePersistedState('displayAdultContent', false)
const [scoreFormat, setScoreFormatRaw] = usePersistedState('scoreFormat', 'POINT_10')
const [rowOrder, setRowOrderRaw] = usePersistedState('rowOrder', 'score')
```

2. On login (or whenever `userId` changes), if `prefsUserId !== userId`, reset these five to their defaults before the query resolves — otherwise a second account on the same device would briefly paint with the first account's colors/format, which is exactly the bug the extension's stamping comment warns about.  
3. When `settingsData` resolves, write through to both state and `prefsUserId`:

```ts
useEffect(() => {
  if (!settingsData?.User?.options || !userId) return
  const { options, mediaListOptions } = settingsData.User
  setProfileColorRaw(options.profileColor || 'blue')
  setTitleLanguageRaw(options.titleLanguage || 'ROMAJI')
  setDisplayAdultContentRaw(options.displayAdultContent || false)
  setScoreFormatRaw(mediaListOptions.scoreFormat || 'POINT_10')
  setRowOrderRaw(mediaListOptions.rowOrder || 'score')
  setPrefsUserId(userId)
}, [settingsData, userId])
```

4. This pairs naturally with the offline runtime-caching fix above: once AniList's GraphQL response can be served from cache, this paint cache ensures the *UI* doesn't default to blue/POINT\_10 while that cached response loads.

---

## P3 — Score chart is an unwanted keyboard tab stop

### What the extension does

`CLAUDE.md` documents a specific fix:

> "`ScoreChart` passes `accessibilityLayer={false}`; recharts 3 defaults it on, which makes a display-only chart a tab stop."

### What the PWA does

`src/components/ScoreChart.tsx`'s two `<BarChart>` elements don't set this prop, so — assuming the PWA is also on recharts 3.x (check `package.json`) — tabbing through the Stats page will stop on both bar charts for no visible reason, since they're purely decorative (`pointerEvents: 'none'` is already set on both, confirming they were never meant to be interactive).

### Step-by-step fix

1. Confirm the recharts major version in `package.json` — this only matters on v3+.  
2. In `src/components/ScoreChart.tsx`, add `accessibilityLayer={false}` to both `<BarChart>` elements (the main chart and the label-only axis chart underneath it):

```
<BarChart
  data={completeData}
  margin={{ top: 10, right: 10, bottom: 0, left: 10 }}
  style={{ outline: 'none', pointerEvents: 'none' }}
  accessibilityLayer={false}
>
```

3. Tab through the Stats page afterward and confirm focus skips straight from the year slider to the season dropdown (or whatever's next) without pausing on the chart.

---

## Do Not Port

Two extension-only pieces solve problems that don't exist for the PWA. Porting them would add real complexity for zero benefit:

- **`components/EdgeHandle.tsx`** — a hand-built draggable scrollbar replacement. It exists solely because of a Chrome *extension popup* quirk: `CLAUDE.md` explains the popup window is sized to its document and Chrome "won't narrow it again," and there's no true overlay scrollbar to fall back on, so the native scrollbar had to be hidden and replaced. A PWA running in a normal tab or an installed standalone window has an ordinary resizable viewport with a normal (or platform-native overlay) scrollbar. None of the sizing problem exists, so none of the 200+ lines of drag/reveal/hide logic are needed.  
- **`gridColumns` / `gridColumnsSetting` split in `SettingsContext.tsx`, and `components/Tabs.tsx`** — the extension's "layout only ever widens this session" behavior is a workaround for the same popup-can't-shrink constraint, and the top-tab bar is a desktop/hover-era layout choice. The PWA already made the right call replacing this with `BottomNav.tsx` and a single mobile-first column; there's no gap to close here, just don't reach for the extension's version if these files are used as a reference during future work.

---

## Suggested order of work

1. **P0** dirty-refresh fix — smallest diff, actively wrong behavior, no dependencies on anything else here.  
2. **P1** foreground retry timer — self-contained change to `syncQueue.ts`, no new infrastructure.  
3. **P2** settings paint cache — self-contained change to `SettingsContext.tsx`, immediately noticeable UX improvement.  
4. **P2** offline runtime caching \+ **P1** Background Sync — bundle these two, since both require the `injectManifest` service-worker migration; do the SW rewrite once and land both features off the back of it.  
5. **P3** chart accessibility fix — trivial, do it whenever, but don't let it block anything above.

