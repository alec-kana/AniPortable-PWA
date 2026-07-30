import React, { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useQuery, gql, type ApolloError } from "@apollo/client"
import { load, save } from "../lib/storage"
import { VIEWER_QUERY } from "../lib/queries"

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

// Local-only settings (the ones AniList doesn't store) read straight from
// localStorage on first render and write back on every change.
function usePersistedState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => load<T>(key) ?? fallback)

  const set = (next: T) => {
    setValue(next)
    save(key, next)
  }

  return [value, set] as const
}

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profileColor, setProfileColor] = useState('blue')
  const [titleLanguage, setTitleLanguage] = useState('ROMAJI')
  const [displayAdultContent, setDisplayAdultContent] = useState(false)
  const [scoreFormat, setScoreFormat] = useState('POINT_10')
  const [rowOrder, setRowOrder] = useState('score')

  const [manualCompletion, setManualCompletion] = usePersistedState('manualCompletion', false)
  const [separateEntries, setSeparateEntries] = usePersistedState('separateEntries', false)
  const [tabVisibility, setTabVisibilityValue] = usePersistedState<TabVisibility>('tabVisibility', 'both')
  const [showAnimeStats, setShowAnimeStats] = usePersistedState('showAnimeStats', true)
  const [showMangaStats, setShowMangaStats] = usePersistedState('showMangaStats', true)

  const { data: viewerData, error: viewerError } = useQuery(VIEWER_QUERY)
  const userId = viewerData?.Viewer?.id

  const { data: settingsData, loading, error: settingsError } = useQuery(SETTINGS_QUERY, {
    variables: { userId },
    skip: !userId
  })

  useEffect(() => {
    if (!settingsData?.User?.options) return
    const { options, mediaListOptions } = settingsData.User
    setProfileColor(options.profileColor || 'blue')
    setTitleLanguage(options.titleLanguage || 'ROMAJI')
    setDisplayAdultContent(options.displayAdultContent || false)
    setScoreFormat(mediaListOptions.scoreFormat || 'POINT_10')
    setRowOrder(mediaListOptions.rowOrder || 'score')
  }, [settingsData])

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
      error: viewerError || settingsError
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
