import React, { createContext, useState, useContext, useCallback } from "react"

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

  // Empties the cached list too, so a stale render can't flash old entries
  // while the refetch triggered by the dirty flag is in flight.
  const markDirty = useCallback((key: ListKey) => {
    setLists((prev) => ({ ...prev, [key]: [] }))
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
