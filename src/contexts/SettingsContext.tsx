import React, { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useQuery, gql, type ApolloError } from "@apollo/client"
import { load, save } from "../lib/storage"
import { useAuth } from "../hooks/useAuth"

const SETTINGS_QUERY = gql`
  query ($userId: Int) {
    User(id: $userId) {
      options {
        profileColor
        titleLanguage
        displayAdultContent
      }
      mediaListOptions {
        scoreFormat
        rowOrder
      }
    }
  }
`

const PROFILE_COLORS: Record<string, string> = {
  pink: '#e85fb2',
  blue: '#3db4f2',
  purple: '#b368e6',
  green: '#4abd4e',
  orange: '#ef881a',
  red: '#e13333',
  gray: '#677b94'
}

type TabVisibility = 'both' | 'anime' | 'manga'

interface SettingsContextType {
  profileColor: string
  titleLanguage: string
  displayAdultContent: boolean
  scoreFormat: string
  rowOrder: string
  manualCompletion: boolean
  separateEntries: boolean
  tabVisibility: TabVisibility
  showAnimeStats: boolean
  showMangaStats: boolean
  setProfileColor: (color: string) => void
  setTitleLanguage: (language: string) => void
  setDisplayAdultContent: (display: boolean) => void
  setScoreFormat: (format: string) => void
  setRowOrder: (order: string) => void
  setManualCompletion: (manual: boolean) => void
  setSeparateEntries: (separate: boolean) => void
  setTabVisibility: (visibility: TabVisibility) => void
  setShowAnimeStats: (show: boolean) => void
  setShowMangaStats: (show: boolean) => void
  loading: boolean
  error: ApolloError | undefined
}

const SettingsContext = createContext<SettingsContextType | null>(null)

// Settings read straight from localStorage on first render and write back on every change.
// seedFromStorage is how the AniList-owned five opt out of the cache when it belongs to a
// different account.
function usePersistedState<T>(key: string, fallback: T, seedFromStorage = true) {
  const [value, setValue] = useState<T>(() => (seedFromStorage ? load<T>(key) ?? fallback : fallback))

  const set = (next: T) => {
    setValue(next)
    save(key, next)
  }

  return [value, set] as const
}

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Login already stored the viewer, so the id is local. Querying it instead put a
  // round trip in front of every request that needs it — the whole first wave.
  const { user } = useAuth()
  const userId = user?.id

  // AniList owns the five below, but they're mirrored locally so the next open paints them
  // instead of the defaults. The mirror is stamped with the account it came from, so a second
  // account on this device never inherits them — a cached score format renders visibly wrong
  // numbers. Read once: the provider only ever mounts with the user already resolved.
  const [ownsCachedPrefs] = useState(() => load<number>('prefsUserId') === userId)

  const [profileColor, setProfileColor] = usePersistedState('profileColor', 'blue', ownsCachedPrefs)
  const [titleLanguage, setTitleLanguage] = usePersistedState('titleLanguage', 'ROMAJI', ownsCachedPrefs)
  const [displayAdultContent, setDisplayAdultContent] = usePersistedState('displayAdultContent', false, ownsCachedPrefs)
  const [scoreFormat, setScoreFormat] = usePersistedState('scoreFormat', 'POINT_10', ownsCachedPrefs)
  const [rowOrder, setRowOrder] = usePersistedState('rowOrder', 'score', ownsCachedPrefs)

  const [manualCompletion, setManualCompletion] = usePersistedState('manualCompletion', false)
  const [separateEntries, setSeparateEntries] = usePersistedState('separateEntries', false)
  const [tabVisibility, setTabVisibilityValue] = usePersistedState<TabVisibility>('tabVisibility', 'both')
  const [showAnimeStats, setShowAnimeStats] = usePersistedState('showAnimeStats', true)
  const [showMangaStats, setShowMangaStats] = usePersistedState('showMangaStats', true)

  const { data: settingsData, loading, error } = useQuery(SETTINGS_QUERY, {
    variables: { userId },
    skip: !userId
  })

  // The server's answer always wins over the mirror, and re-stamps it with the owning account.
  useEffect(() => {
    if (!settingsData?.User?.options || !userId) return
    const { options, mediaListOptions } = settingsData.User
    setProfileColor(options.profileColor || 'blue')
    setTitleLanguage(options.titleLanguage || 'ROMAJI')
    setDisplayAdultContent(options.displayAdultContent || false)
    setScoreFormat(mediaListOptions.scoreFormat || 'POINT_10')
    setRowOrder(mediaListOptions.rowOrder || 'score')
    save('prefsUserId', userId)
  }, [settingsData, userId])

  const setTabVisibility = (visibility: TabVisibility) => {
    setTabVisibilityValue(visibility)
    // A hidden tab implies that list isn't being tracked, so its stats default
    // to matching — still individually re-enablable in Settings.
    setShowAnimeStats(visibility !== 'manga')
    setShowMangaStats(visibility !== 'anime')
  }

  return (
    <SettingsContext.Provider value={{
      profileColor: PROFILE_COLORS[profileColor] ?? profileColor,
      titleLanguage,
      displayAdultContent,
      scoreFormat,
      rowOrder,
      manualCompletion,
      separateEntries,
      tabVisibility,
      showAnimeStats,
      showMangaStats,
      setProfileColor,
      setTitleLanguage,
      setDisplayAdultContent,
      setScoreFormat,
      setRowOrder,
      setManualCompletion,
      setSeparateEntries,
      setTabVisibility,
      setShowAnimeStats,
      setShowMangaStats,
      loading,
      error
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
