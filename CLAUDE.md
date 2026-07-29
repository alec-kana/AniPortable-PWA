# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AniPortable-PWA is a mobile-first Progressive Web App port of [AniPortable](../AniPortable) (a Manifest V3 browser extension) for tracking/updating AniList anime & manga lists. Same purpose as the extension, but rebuilt for touch: the extension's hover-driven update UI (steppers that only appeared on `:hover`) doesn't work on a phone, so this port replaces it with a tap-to-zoom card overlay and scroll-snap number pickers. Built with Vite + React + TypeScript + Apollo Client (GraphQL) + Tailwind + `vite-plugin-pwa`.

## Commands

- `npm install` — install dependencies
- `npm run dev` — Vite dev server at `http://localhost:5173` (port is explicit in `vite.config.ts`, not just Vite's default — see OAuth note below)
- `npm run build` — runs `tsc --noEmit` then `vite build`; outputs to `dist/` (gitignored, delete after local builds — don't leave it committed)
- `npm run typecheck` — `tsc --noEmit` only
- `npm run preview` — serve the production build locally

**Local setup requirement:** copy `.env.example` to `.env.development` and set `VITE_ANILIST_CLIENT_ID` (from https://anilist.co/settings/developer). Unlike the extension, this needs its own AniList app registration — the extension's client IDs are registered against extension-specific redirect URLs (`chromiumapp.org` / `extensions.allizom.org`) that don't exist in a browser tab. Register the dev app's Redirect URL as `http://localhost:5173/` (must match exactly what `npm run dev` actually serves — if 5173 is ever in use, Vite silently falls back to the next port, breaking the redirect match; that's why the port is pinned explicitly in `vite.config.ts` rather than left implicit). A separate prod app + `.env.production` (gitignored) is needed before deploying, with the Redirect URL set to the real deployed origin.

## Architecture

**No extension APIs — everything chrome.* depended on has a web-native replacement:**

| Concern | Lives in | Replaces (extension) |
|---|---|---|
| GraphQL client (fetch-based, bulk mutation aliasing) | `src/lib/anilist.ts` | ported ~unchanged from `background.ts`'s `AniList` class |
| `localStorage`-backed key/value store | `src/lib/storage.ts` | `chrome.storage.local` wrapper |
| OAuth (full-page redirect, not `chrome.identity.launchWebAuthFlow`) | `src/lib/auth.ts` | `Auth` class in `background.ts` |
| Debounced sync queue (5s quiet timer, persisted, bulk-flushes) | `src/lib/syncQueue.ts` | the queue in `background.ts` |
| Apollo Client (auth header injected per-request) | `src/apollo/client.ts` | same shape, reads from `storage.ts` instead of `chrome.storage.local` |

There is no background service worker and no popup/background message passing — UI components call the `lib/*` functions directly. `vite-plugin-pwa`'s generated service worker (`dist/sw.js`) is unrelated to any of this; it only precaches static assets for installability, nothing about sync durability depends on it.

**Sync queue durability without a background worker:** `queueUpdate()` persists the pending-updates map to `localStorage` on every merge and restores-and-flushes it on page load (covers a reload mid-queue, same reasoning as the extension's worker-restart recovery). `visibilitychange`/`pagehide` listeners are the safety-net flush points (replacing the extension's popup-port-disconnect flush). **The debounce timer is fully paused (not just extended) while any card overlay is open** — `notifyCardOpened()`/`notifyCardClosed()` in `syncQueue.ts`, called from `MediaCard`'s `isOpen` effect — so idling on an open card can't trigger a flush mid-adjustment; the countdown only starts once the last open card closes. This is easy to accidentally break by adding a new place that opens the overlay without wiring these calls.

**Card interaction** (`MediaCard.tsx` + `MediaCardOverlay.tsx` + `NumberWheel.tsx`): tap opens a centered overlay via a Framer Motion `layoutId` shared-layout transition (portaled to `document.body`, `AnimatePresence` for the exit animation). `NumberWheel` is a CSS `scroll-snap` picker, **virtualized** — only renders ~41 DOM rows (`WINDOW_RADIUS = 20`) around the current position regardless of range size. This is load-bearing: an unbounded progress range (ongoing anime with no known episode total falls back to 0–9999; a long-running manga can have 1000+ real chapters) would otherwise render thousands of DOM nodes and freeze the UI for ~2s on open. Don't remove the windowing to "simplify" the component.

**Release-date capping** (`NumberWheel`'s `maxSelectable` prop, wired from `MediaCardOverlay`): for an airing show, the progress wheel still *displays* rows up to the full episode total, but scrolling can't go past `nextAiringEpisode - 1` (the latest episode actually out) — rows beyond that render dimmed. Only applies to anime (manga entries always have `nextAiringEpisode: null`) and only constrains the wheel; the tap-to-type fallback is intentionally left unrestricted.

**Card grid only** (`AnimeTab`/`MangaTab`'s `renderAnimeGrid`/`renderMangaGrid`): fixed-column card grid, breakpoint-anchored at `lg:6` columns for a 1024px/iPad-Pro viewport, stepping from 2 columns at the smallest phones up to 8 on wide screens — see the `xs: 360px` custom Tailwind breakpoint added specifically for this. An earlier version of this app also had AniList-style `list`/`compact` row density options (`MediaListRow` + `DensitySwitcher`, with independent per-tab `localStorage` persistence); these were deliberately removed — on an actual phone viewport, `compact` didn't render meaningfully more entries per screen than the card grid, so the extra density modes were paying for touch-target-driven row heights without the scan-density benefit they have on AniList's desktop site. Don't re-add per-tab density switching without that benefit actually re-materializing (e.g. a very different row layout that's meaningfully shorter than a card).

## Known gotchas

- **`repeat(auto-fit, minmax(...))` vs `repeat(N, 1fr)` for the card grid:** `auto-fit` collapses unused tracks and redistributes their space to existing items — great for filling a row, but it means a section with fewer cards than columns (e.g. a lone "Caught-Up" entry) stretches that single card to fill the *entire* row width, which looks broken. `renderAnimeGrid`/`renderMangaGrid` use fixed `grid-cols-N` per breakpoint specifically so a card always renders at its normal size regardless of how many siblings are in that particular section.
- **CommonJS config files need `.cjs`, not `.js`** — `package.json` has `"type": "module"`, so `tailwind.config.js`/`postcss.config.js` using `module.exports` fail at build time with `ReferenceError: module is not defined`. They're named `tailwind.config.cjs`/`postcss.config.cjs` here; don't rename them back to `.js`.
- **`npm run build` leaves `dist/` behind** — it's gitignored but not auto-cleaned; remove it after local verification builds so it doesn't linger.
- `@apollo/client` is pinned to `3.8.10` (via `dependencies` + `resolutions`/`overrides`), carried over from the extension's pin — not re-verified independently for this project, so don't bump without testing.
- `recharts` (pulled in by `StatsTab`, used for the score-distribution chart) is lazy-loaded (`React.lazy` in `App.tsx`) since it was the single largest contributor to the bundle (~350KB) — don't change `StatsTab`'s import back to a static one without checking the bundle size impact.
