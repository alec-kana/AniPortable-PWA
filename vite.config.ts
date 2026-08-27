import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
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
        id: "/",
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
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"]
      }
    })
  ],
  server: {
    port: 5173
  }
})
