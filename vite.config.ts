import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

// Served from a project page, so everything sits under the repo name rather than the root.
// `id` and `start_url` have to move with it: `id` is the key a browser uses to decide whether
// an install is the same app, so it has to match the URL the app is actually served from.
const BASE = "/AniPortable-PWA/"

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // injectManifest, not generateSW: src/sw.ts owns a `sync` handler and a hand-rolled
      // cache for AniList's POST-only GraphQL endpoint, neither of which is expressible as
      // generateSW config.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      includeAssets: ["icons/icon1024.png"],
      manifest: {
        name: "AniPortable",
        short_name: "AniPortable",
        description: "Track and update your AniList anime & manga on the go.",
        id: BASE,
        start_url: BASE,
        display: "standalone",
        background_color: "#12162a",
        theme_color: "#242538",
        icons: [
          { src: "icons/icon128.png", sizes: "128x128", type: "image/png" },
          { src: "icons/icon1024.png", sizes: "1024x1024", type: "image/png" },
          { src: "icons/icon1024.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"]
      }
    })
  ],
  server: {
    port: 5173
  }
})
