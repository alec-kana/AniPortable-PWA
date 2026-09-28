import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { initSyncQueue } from "./lib/syncQueue"
import "./styles/index.css"

initSyncQueue()

// Cached covers are the one thing here that's expensive to replace, and storage a browser hasn't
// been asked to keep is fair game to clear under pressure. Granted without a prompt for an
// installed app; Safari has no persist() and exempts home-screen apps from its own eviction.
navigator.storage?.persist?.()?.catch(() => {})

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
