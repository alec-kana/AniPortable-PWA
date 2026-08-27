import React, { createContext, useState, useContext, useCallback, useEffect } from "react"
import { setEntriesSyncedHandler } from "../lib/syncQueue"

export type ListKey = "anime" | "manga" | "animeStats" | "mangaStats"

type AniListDataContextType = {
  lists: Record<ListKey, any[] | null>
  dirty: Record<ListKey, boolean>
  setList: (key: ListKey, data: any[]) => void
  markDirty: (key: ListKey) => void
  clearDirty: (key: ListKey) => void
}

const AniListDataContext = createContext<AniListDataContextType | null>(null)

export const AniListDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lists, setLists] = useState<Record<ListKey, any[] | null>>({
    anime: null,
    manga: null,
    animeStats: null,
    mangaStats: null
  })
  const [dirty, setDirty] = useState<Record<ListKey, boolean>>({
    anime: false,
    manga: false,
    animeStats: false,
    mangaStats: false
  })

  const setList = useCallback((key: ListKey, data: any[]) => {
    setLists((prev) => ({ ...prev, [key]: data }))
  }, [])

  // Edits stamp a predicted updatedAt locally so a "Last Updated" ordering reacts straight
  // away; once the queue flushes, the authoritative stamp replaces it.
  useEffect(() => {
    setEntriesSyncedHandler((synced) => {
      const stampById = new Map(synced.map((entry) => [entry.id, entry.updatedAt]))

      setLists((prev) => {
        let next = prev

        for (const key of ["anime", "manga"] as const) {
          const list = prev[key]
          if (!list) continue

          let listChanged = false
          const patched = list.map((entry) => {
            const updatedAt = stampById.get(entry.id)
            if (updatedAt === undefined || entry.updatedAt === updatedAt) return entry
            listChanged = true
            return { ...entry, updatedAt }
          })

          if (listChanged) next = { ...next, [key]: patched }
        }

        return next
      })
    })

    return () => setEntriesSyncedHandler(null)
  }, [])

  // The flag alone drives the refetch, and consumers treat it as loading. Blanking the list
  // too made the refetch window render as an empty list — "0 / 0.00" in Stats reads as a
  // real answer.
  const markDirty = useCallback((key: ListKey) => {
    setDirty((prev) => ({ ...prev, [key]: true }))
  }, [])

  const clearDirty = useCallback((key: ListKey) => {
    setDirty((prev) => ({ ...prev, [key]: false }))
  }, [])

  return (
    <AniListDataContext.Provider value={{ lists, dirty, setList, markDirty, clearDirty }}>
      {children}
    </AniListDataContext.Provider>
  )
}

export const useAniListData = () => {
  const ctx = useContext(AniListDataContext)
  if (!ctx) throw new Error("useAniListData must be used within AniListDataProvider")
  return ctx
}
