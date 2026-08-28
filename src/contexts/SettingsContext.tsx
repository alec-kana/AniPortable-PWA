import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react"
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

// Device-local settings: read straight from localStorage on first render, written back on
// every change. AniList never sees these.
function usePersistedState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => load<T>(key) ?? fallback)

  const set = (next: T) => {
    setValue(next)
    save(key, next)
  }

  return [value, set] as const
}

// The five AniList owns. Mirrored locally so an open paints them instead of the defaults,
// but the mirror is stamped with the account it came from — a second account on this device
// must never inherit them, since a cached score format renders visibly wrong numbers.
type ServerPrefs = {
  profileColor: string
  titleLanguage: string
  displayAdultContent: boolean
  scoreFormat: string
  rowOrder: string
}

const PREF_DEFAULTS: ServerPrefs = {
  profileColor: 'blue',
  titleLanguage: 'ROMAJI',
  displayAdultContent: false,
  scoreFormat: 'POINT_10',
  rowOrder: 'score'
}

const readMirroredPrefs = (userId?: number): ServerPrefs => {
  if (!userId || load<number>('prefsUserId') !== userId) return PREF_DEFAULTS
  return {
    profileColor: load<string>('profileColor') ?? PREF_DEFAULTS.profileColor,
    titleLanguage: load<string>('titleLanguage') ?? PREF_DEFAULTS.titleLanguage,
    displayAdultContent: load<boolean>('displayAdultContent') ?? PREF_DEFAULTS.displayAdultContent,
    scoreFormat: load<string>('scoreFormat') ?? PREF_DEFAULTS.scoreFormat,
    rowOrder: load<string>('rowOrder') ?? PREF_DEFAULTS.rowOrder
  }
}

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Login already stored the viewer, so the id is local. Querying it instead put a
  // round trip in front of every request that needs it — the whole first wave.
  const { user } = useAuth()
  const userId = user?.id

  const [prefs, setPrefs] = useState(() => readMirroredPrefs(userId))

  // The page outlives a logout, so unlike the extension's popup this provider is still
  // mounted when the account changes — re-seed rather than carry the old account's five.
  const seededFor = useRef(userId)
  useEffect(() => {
    if (seededFor.current === userId) return
    seededFor.current = userId
    setPrefs(readMirroredPrefs(userId))
  }, [userId])

  const setPref = <K extends keyof ServerPrefs>(key: K, value: ServerPrefs[K]) => {
    setPrefs((prev) => ({ ...prev, [key]: value }))
    // Written through, or the mirror would serve the pre-edit value until the next
    // successful settings query.
    save(key, value)
  }

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
    const next: ServerPrefs = {
      profileColor: options.profileColor || PREF_DEFAULTS.profileColor,
      titleLanguage: options.titleLanguage || PREF_DEFAULTS.titleLanguage,
      displayAdultContent: options.displayAdultContent || PREF_DEFAULTS.displayAdultContent,
      scoreFormat: mediaListOptions.scoreFormat || PREF_DEFAULTS.scoreFormat,
      rowOrder: mediaListOptions.rowOrder || PREF_DEFAULTS.rowOrder
    }
    setPrefs(next)
    for (const [key, value] of Object.entries(next)) save(key, value)
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
      profileColor: PROFILE_COLORS[prefs.profileColor] ?? prefs.profileColor,
      titleLanguage: prefs.titleLanguage,
      displayAdultContent: prefs.displayAdultContent,
      scoreFormat: prefs.scoreFormat,
      rowOrder: prefs.rowOrder,
      manualCompletion,
      separateEntries,
      tabVisibility,
      showAnimeStats,
      showMangaStats,
      setProfileColor: (color: string) => setPref('profileColor', color),
      setTitleLanguage: (language: string) => setPref('titleLanguage', language),
      setDisplayAdultContent: (display: boolean) => setPref('displayAdultContent', display),
      setScoreFormat: (format: string) => setPref('scoreFormat', format),
      setRowOrder: (order: string) => setPref('rowOrder', order),
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
