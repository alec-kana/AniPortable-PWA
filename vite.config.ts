import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon1024.png"],
      manifest: {
        name: "AniPortable",
        short_name: "AniPortable",
        description: "Track and update your AniList anime & manga on the go.",
        start_url: "/",
        display: "standalone",
        background_color: "#12162a",
        theme_color: "#242538",
        icons: [
          { src: "icons/icon128.png", sizes: "128x128", type: "image/png" },
          { src: "icons/icon1024.png", sizes: "1024x1024", type: "image/png" },
          { src: "icons/icon1024.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        // Sync-queue durability is handled in-page (src/lib/syncQueue.ts) via
        // localStorage + visibilitychange/pagehide, not by this service
        // worker — this SW only precaches static assets for installability.
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"]
      }
    })
  ],
  server: {
    port: 5173
  }
})
