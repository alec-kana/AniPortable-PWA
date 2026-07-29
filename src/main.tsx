import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { initSyncQueue } from "./lib/syncQueue"
import "./styles/index.css"

initSyncQueue()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
