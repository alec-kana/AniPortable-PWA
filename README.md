# AniPortable PWA

_A mobile-first Progressive Web App for managing your AniList anime and manga lists — a touch-friendly rebuild of the AniPortable browser extension._

## Overview

AniPortable PWA brings the extension's core idea — tracking and updating your AniList lists without leaving what you're doing — to your phone. The extension's update UI relied on hovering a card to reveal steppers, which doesn't exist on a touchscreen, so this rebuild replaces it with a tap-to-zoom card and swipeable number pickers designed for one-handed use.

## Features

- **Tap-to-edit cards** — tap a card to zoom into a focused view with scroll-snap pickers for progress and score; tap outside to close. Updates are debounced and batched into a single API call, even across rapid edits or bulk mark-as-completed taps
- **Release-aware progress picker** — for a currently-airing show, the progress wheel still shows the full episode count but won't let you scroll past the latest episode that's actually aired
- **Dynamic lists** — split Watching lists into **Behind** and **Caught-Up**, so you always know what needs attention
- **Visual stats** — anime and manga stats as bar charts, with year/season filters for anime
- **Flexible completion** — enable manual completion to keep entries in your list after finishing (handy for reviews/screenshots), then mark them complete with one tap
- **Installable** — add it to your home screen like a native app (PWA manifest + service worker via `vite-plugin-pwa`)
- **Works offline** — the service worker serves your last-loaded lists and stats when the network is gone, and edits made offline are queued, retried with backoff, and flushed via Background Sync once you reconnect

## Getting Started

1. Clone the repository and run `npm install`.
2. Register an app with the [AniList API](https://anilist.co/settings/developer), setting its **Redirect URL** to `http://localhost:5173/`, and copy the `client_id`.
3. Copy `.env.example` to `.env.development` and set `VITE_ANILIST_CLIENT_ID` to that `client_id`. `.env.development`/`.env.production` are gitignored.
4. `npm run dev` and open `http://localhost:5173`.

Unlike the extension (which needs one AniList app per browser target), this only needs one app per **deployment**: the dev app above, plus a separate one for production once you deploy, with its Redirect URL set to your real domain and its `client_id` placed in `.env.production`.

### Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Typecheck, then build the production PWA to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Typecheck only |

## Deploying

The build is a static bundle — any static host with HTTPS works (the service worker won't
register without it). Deploy at the **root** of a domain: `start_url` and `scope` are `/`, and a
project subpath would need Vite's `base` changed to match or installability breaks silently.

1. Register a second AniList app with its **Redirect URL** set to your exact final origin
   (`https://yourdomain.com/` — the match is exact-string, so a trailing-slash mismatch fails
   silently), and put its `client_id` in `.env.production`.
2. `npm run build` and deploy `dist/`.
3. CSP headers ship with the repo: `public/_headers` for Netlify/Cloudflare Pages, `vercel.json`
   for Vercel. Whichever host you use, the other file is inert.

## Privacy

There is no backend. Everything the app stores stays on your device in `localStorage` — your
AniList access token, the settings AniList owns (mirrored so the app paints instantly instead of
flashing defaults), your device-only preferences, and any edits still queued for sync. The only
network requests it makes are to AniList's own GraphQL API (`graphql.anilist.co`) and to
AniList's CDN for cover art. Nothing is sent anywhere else, and there is no analytics or
tracking of any kind. Logging out clears the token, the stored viewer, and the offline cache of
your lists.

## Tech Stack

- **[Vite](https://vitejs.dev/)** + **React** + **TypeScript**
- **[Apollo Client](https://www.apollographql.com/docs/react/)** — AniList GraphQL API
- **[Tailwind CSS](https://tailwindcss.com/)** — styling
- **[Framer Motion](https://www.framer.com/motion/)** — the card-to-overlay shared-layout transition
- **[vite-plugin-pwa](https://vite-pwa-org.netlify.app/)** — installability and offline asset caching
- **[Recharts](https://recharts.org/)** — stats charts

## Acknowledgements

- **[AniList](https://anilist.co)** — for the GraphQL API this whole app is built on
- The original **AniPortable** browser extension, which this project ports and redesigns for mobile
