import React, { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { useQuery, gql, type ApolloError } from "@apollo/client"
import { Storage } from "../lib/storage"

const VIEWER_QUERY = gql`
  query {
    Viewer {
      id
    }
  }
`

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

// 'list' = rows with a cover thumbnail, 'compact' = same rows without one
// (shorter, denser), 'grid' = the card grid.
export type CardDensity = 'grid' | 'list' | 'compact'

interface SettingsContextType {
  profileColor: string
  titleLanguage: string
  displayAdultContent: boolean
  scoreFormat: string
  rowOrder: string
  manualCompletion: boolean
  separateEntries: boolean
  tabVisibility: 'both' | 'anime' | 'manga'
  showAnimeStats: boolean
  showMangaStats: boolean
  // Anime and manga each remember their own display density independently
  // — switching one doesn't affect the other, and hiding a tab via
  // tabVisibility doesn't reset or lose its density setting.
  animeCardDensity: CardDensity
  mangaCardDensity: CardDensity
  setProfileColor: (color: string) => void
  setTitleLanguage: (language: string) => void
  setDisplayAdultContent: (display: boolean) => void
  setScoreFormat: (format: string) => void
  setRowOrder: (order: string) => void
  setManualCompletion: (manual: boolean) => void
  setSeparateEntries: (separate: boolean) => void
  setTabVisibility: (visibility: 'both' | 'anime' | 'manga') => void
  setShowAnimeStats: (show: boolean) => void
  setShowMangaStats: (show: boolean) => void
  setAnimeCardDensity: (density: CardDensity) => void
  setMangaCardDensity: (density: CardDensity) => void
  loading: boolean
  error: ApolloError | undefined
}

const SettingsContext = createContext<SettingsContextType | null>(null)

// Color mapping function
const getColorValue = (color: string): string => {
  const colorMap: { [key: string]: string } = {
    'pink': '#e85fb2',
    'blue': '#3db4f2',
    'purple': '#b368e6',
    'green': '#4abd4e',
    'orange': '#ef881a',
    'red': '#e13333',
    'gray': '#677b94',
  }
  return colorMap[color] || color
}

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profileColor, setProfileColorState] = useState<string>('blue')
  const [titleLanguage, setTitleLanguageState] = useState<string>('ROMAJI')
  const [displayAdultContent, setDisplayAdultContentState] = useState<boolean>(false)
  const [scoreFormat, setScoreFormatState] = useState<string>('POINT_10')
  const [rowOrder, setRowOrderState] = useState<string>('score')
  const [manualCompletion, setManualCompletionState] = useState<boolean>(false)
  const [separateEntries, setSeparateEntriesState] = useState<boolean>(false)
  const [tabVisibility, setTabVisibilityState] = useState<'both' | 'anime' | 'manga'>('both')
  const [showAnimeStats, setShowAnimeStatsState] = useState<boolean>(true)
  const [showMangaStats, setShowMangaStatsState] = useState<boolean>(true)
  const [animeCardDensity, setAnimeCardDensityState] = useState<CardDensity>('list')
  const [mangaCardDensity, setMangaCardDensityState] = useState<CardDensity>('list')

  // Get user ID first
  const { data: viewerData, error: viewerError } = useQuery(VIEWER_QUERY)
  const userId = viewerData?.Viewer?.id

  // Get user settings
  const { data: settingsData, loading, error: settingsError } = useQuery(SETTINGS_QUERY, {
    variables: { userId },
    skip: !userId
  })

  const error = viewerError || settingsError

  // Update state when settings are fetched
  useEffect(() => {
    if (settingsData?.User?.options) {
      const options = settingsData.User.options
      const mediaListOptions = settingsData.User.mediaListOptions
      setProfileColorState(options.profileColor || 'blue')
      setTitleLanguageState(options.titleLanguage || 'ROMAJI')
      setDisplayAdultContentState(options.displayAdultContent || false)
      setScoreFormatState(mediaListOptions.scoreFormat || 'POINT_10')
      setRowOrderState(mediaListOptions.rowOrder || 'score')
    }
  }, [settingsData])

  // Load local-only settings once on mount
  useEffect(() => {
    Promise.all([
      Storage.get<boolean>('manualCompletion'),
      Storage.get<boolean>('separateEntries'),
      Storage.get<'both' | 'anime' | 'manga'>('tabVisibility'),
      Storage.get<boolean>('showAnimeStats'),
      Storage.get<boolean>('showMangaStats'),
      Storage.get<CardDensity>('animeCardDensity'),
      Storage.get<CardDensity>('mangaCardDensity')
    ]).then(([manual, separate, visibility, showAnime, showManga, animeDensity, mangaDensity]) => {
      setManualCompletionState(manual ?? false)
      setSeparateEntriesState(separate ?? false)
      setTabVisibilityState(visibility ?? 'both')
      setShowAnimeStatsState(showAnime ?? true)
      setShowMangaStatsState(showManga ?? true)
      setAnimeCardDensityState(animeDensity ?? 'list')
      setMangaCardDensityState(mangaDensity ?? 'list')
    })
  }, [])

  const setProfileColor = async (color: string) => {
    setProfileColorState(color)
  }
  const setTitleLanguage = async (language: string) => {
    setTitleLanguageState(language)
  }
  const setDisplayAdultContent = async (display: boolean) => {
    setDisplayAdultContentState(display)
  }
  const setScoreFormat = async (format: string) => {
    setScoreFormatState(format)
  }
  const setRowOrder = async (order: string) => {
    setRowOrderState(order)
  }
  const setManualCompletion = async (manual: boolean) => {
    setManualCompletionState(manual)
    Storage.set('manualCompletion', manual)
  }
  const setSeparateEntries = async (separate: boolean) => {
    setSeparateEntriesState(separate)
    Storage.set('separateEntries', separate)
  }
  const setTabVisibility = async (visibility: 'both' | 'anime' | 'manga') => {
    setTabVisibilityState(visibility)
    Storage.set('tabVisibility', visibility)

    // Default the stats visibility to match, since a hidden tab implies the
    // user isn't tracking that list — they can still re-enable it below.
    const showAnime = visibility !== 'manga'
    const showManga = visibility !== 'anime'
    setShowAnimeStatsState(showAnime)
    setShowMangaStatsState(showManga)
    Storage.set('showAnimeStats', showAnime)
    Storage.set('showMangaStats', showManga)
  }
  const setShowAnimeStats = async (show: boolean) => {
    setShowAnimeStatsState(show)
    Storage.set('showAnimeStats', show)
  }
  const setShowMangaStats = async (show: boolean) => {
    setShowMangaStatsState(show)
    Storage.set('showMangaStats', show)
  }
  const setAnimeCardDensity = async (density: CardDensity) => {
    setAnimeCardDensityState(density)
    Storage.set('animeCardDensity', density)
  }
  const setMangaCardDensity = async (density: CardDensity) => {
    setMangaCardDensityState(density)
    Storage.set('mangaCardDensity', density)
  }

  return (
    <SettingsContext.Provider value={{
      profileColor: getColorValue(profileColor), // Return the mapped hex color
      titleLanguage,
      displayAdultContent,
      scoreFormat,
      rowOrder,
      manualCompletion,
      separateEntries,
      tabVisibility,
      showAnimeStats,
      showMangaStats,
      animeCardDensity,
      mangaCardDensity,
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
      setAnimeCardDensity,
      setMangaCardDensity,
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
