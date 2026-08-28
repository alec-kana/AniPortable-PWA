import React, { createContext, useState, useContext, useCallback, useEffect } from "react"
import { setEntriesSyncedHandler } from "../lib/syncQueue"

export type ListKey = "anime" | "manga" | "animeStats" | "mangaStats"

type AniListDataContextType = {
  lists: Record<ListKey, any[] | null>
  dirty: Record<ListKey, boolean>
  // The subset of dirty whose *meaning* changed, not just its contents — see markDirty.
  rescaled: Record<ListKey, boolean>
  setList: (key: ListKey, data: any[]) => void
  markDirty: (key: ListKey, options?: { rescaled?: boolean }) => void
  clearDirty: (key: ListKey) => void
  resetData: () => void
}

const AniListDataContext = createContext<AniListDataContextType | null>(null)

const NO_LISTS: Record<ListKey, any[] | null> = {
  anime: null,
  manga: null,
  animeStats: null,
  mangaStats: null
}

const NO_FLAGS: Record<ListKey, boolean> = {
  anime: false,
  manga: false,
  animeStats: false,
  mangaStats: false
}

export const AniListDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lists, setLists] = useState(NO_LISTS)
  const [dirty, setDirty] = useState(NO_FLAGS)
  const [rescaled, setRescaled] = useState(NO_FLAGS)

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

  // The flag alone drives the refetch. Blanking the list too made the refetch window render
  // as an empty list — "0 / 0.00" in Stats reads as a real answer.
  //
  // `rescaled` separates the two reasons a list goes stale. Completing an entry leaves the
  // cached copy a hair out of date — one off the count — so it stays on screen and corrects
  // itself. A score format change rescales every score, so the cached copy is not slightly
  // old but wrong on its face: an 8 rendered under POINT_100. Only that gets a spinner.
  const markDirty = useCallback((key: ListKey, options?: { rescaled?: boolean }) => {
    setDirty((prev) => ({ ...prev, [key]: true }))
    if (options?.rescaled) setRescaled((prev) => ({ ...prev, [key]: true }))
  }, [])

  const clearDirty = useCallback((key: ListKey) => {
    setDirty((prev) => ({ ...prev, [key]: false }))
    setRescaled((prev) => (prev[key] ? { ...prev, [key]: false } : prev))
  }, [])

  // Back to the state a fresh load starts in. The page outlives a logout, so without this
  // the next account reads the previous one's lists until every query has answered.
  const resetData = useCallback(() => {
    setLists(NO_LISTS)
    setDirty(NO_FLAGS)
    setRescaled(NO_FLAGS)
  }, [])

  return (
    <AniListDataContext.Provider value={{ lists, dirty, rescaled, setList, markDirty, clearDirty, resetData }}>
      {children}
    </AniListDataContext.Provider>
  )
}

export const useAniListData = () => {
  const ctx = useContext(AniListDataContext)
  if (!ctx) throw new Error("useAniListData must be used within AniListDataProvider")
  return ctx
}
