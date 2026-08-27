import React, { useEffect, useState } from "react"
import { CloudOff } from "lucide-react"

// Lists still render from the service worker's cache while offline, so without this a stale
// list and an edit that hasn't been sent yet both look like the app simply working.
export const OfflineNotice: React.FC = () => {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener("online", update)
    window.addEventListener("offline", update)
    return () => {
      window.removeEventListener("online", update)
      window.removeEventListener("offline", update)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+3.75rem)] left-0 right-0 z-50 flex items-center justify-center gap-2 px-5 py-2 bg-[#242538] text-white/70 text-xs font-medium">
      <CloudOff size={14} />
      Offline — your changes are saved and will sync when you reconnect.
    </div>
  )
}
