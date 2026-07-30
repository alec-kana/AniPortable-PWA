import React, { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, gql } from "@apollo/client"
import { motion, AnimatePresence } from "framer-motion"
import { MediaCard } from "./MediaCard"
import { StateMessage } from "./StateMessage"
import { useSettings } from "../contexts/SettingsContext"
import { useAniListData } from "../contexts/AniListDataContext"
import { queueUpdate } from "../lib/syncQueue"
import { useStableOrder } from "../hooks/useStableOrder"
import { Loader2, AlertCircle, BookOpen } from "lucide-react"
import { getErrorMessage } from "../lib/apolloErrors"
import type { MediaEntry } from "../lib/types"

const VIEWER_QUERY = gql`
  query {
    Viewer {
      id
      name
      avatar {
        medium
      }
    }
  }
`

const READING_LIST_QUERY = gql`
  query ($userId: Int) {
    MediaListCollection(userId: $userId, type: MANGA, status: CURRENT) {
      lists {
        entries {
          media {
            id
            title {
              english
              native
              romaji
            }
            isAdult
            coverImage {
              extraLarge
              large
            }
            chapters
          }
          progress
          score
          id
          updatedAt
        }
      }
    }
  }
`

type OpenEntryState = { id: number; category: "reading" | "completed" }

export const MangaTab: React.FC = () => {
  const {
    profileColor,
    titleLanguage,
    displayAdultContent,
    scoreFormat,
    rowOrder,
    manualCompletion,
    separateEntries
  } = useSettings()

  const { mangaList, mangaDirty, setMangaList, markMangaStatsDirty, clearMangaDirty } = useAniListData()

  const [openEntry, setOpenEntry] = useState<OpenEntryState | null>(null)
  const [exitingId, setExitingId] = useState<OpenEntryState | null>(null)
  const exitTimeoutRef = useRef<number | null>(null)

  const { data: viewerData, loading: viewerLoading, error: viewerError } = useQuery(VIEWER_QUERY)
  const userId = viewerData?.Viewer?.id

  const { data, loading, error, refetch } = useQuery(READING_LIST_QUERY, {
    variables: { userId },
    skip: !userId
  })

  useEffect(() => {
    return () => {
      if (exitTimeoutRef.current !== null) {
        window.clearTimeout(exitTimeoutRef.current)
        exitTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    if (mangaList && !mangaDirty) return

    refetch().then((res) => {
      const fetched = res.data?.MediaListCollection?.lists?.[0]?.entries ?? []
      setMangaList(fetched)
      clearMangaDirty()
    })
  }, [userId, mangaDirty, refetch, setMangaList, clearMangaDirty])

  const readingList = mangaList ?? data?.MediaListCollection?.lists?.[0]?.entries ?? []

  const transformedManga = useMemo<MediaEntry[]>(() => {
    return readingList.map((entry: any) => ({
      id: entry.id,
      title: entry.media.title[titleLanguage.toLowerCase()],
      cover: entry.media.coverImage.extraLarge ?? entry.media.coverImage.large,
      progress: entry.progress,
      score: entry.score || 0,
      totalUnits: entry.media.chapters,
      nextAiringEpisode: null,
      isAdult: entry.media.isAdult,
      updatedAt: entry.updatedAt,
      mediaId: entry.media.id
    }))
  }, [readingList, titleLanguage])

  const filteredManga = useMemo(() => {
    return transformedManga.filter((manga) => displayAdultContent || !manga.isAdult)
  }, [transformedManga, displayAdultContent])

  const sortedManga = useMemo(() => {
    return [...filteredManga].sort((a, b) => {
      switch (rowOrder) {
        case "score":
          return b.score - a.score || a.title.localeCompare(b.title)
        case "title":
          return a.title.localeCompare(b.title)
        case "updatedAt":
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        default:
          return a.id - b.id
      }
    })
  }, [filteredManga, rowOrder])

  const orderedSortedManga = useStableOrder(sortedManga, openEntry !== null)

  const isLiveCompleted = (manga: MediaEntry) => !!(manga.totalUnits && manga.progress >= manga.totalUnits)

  const isCompleted = (manga: MediaEntry) =>
    openEntry && openEntry.id === manga.id ? openEntry.category === "completed" : isLiveCompleted(manga)

  const openEntryPositionWillChange = useMemo(() => {
    if (!openEntry) return false

    const liveManga = sortedManga.find((entry) => entry.id === openEntry.id)
    if (!liveManga) return false

    const categoryChanged = (isLiveCompleted(liveManga) ? "completed" : "reading") !== openEntry.category
    const orderChanged =
      orderedSortedManga.findIndex((entry) => entry.id === openEntry.id) !==
      sortedManga.findIndex((entry) => entry.id === openEntry.id)

    return categoryChanged || orderChanged
  }, [openEntry, orderedSortedManga, sortedManga])

  const visibleSortedManga = useMemo(() => {
    return orderedSortedManga.filter((manga) => manga.id !== exitingId?.id)
  }, [orderedSortedManga, exitingId?.id])

  const completedManga = useMemo(() => {
    return separateEntries ? visibleSortedManga.filter(isCompleted) : []
  }, [separateEntries, visibleSortedManga, isCompleted])

  const readingManga = useMemo(() => {
    return separateEntries ? visibleSortedManga.filter((manga) => !isCompleted(manga)) : visibleSortedManga
  }, [separateEntries, visibleSortedManga, isCompleted])

  const handleOpenChange = (mangaId: number, isOpen: boolean) => {
    if (isOpen) {
      setOpenEntry((prev) => {
        if (prev?.id === mangaId) return prev
        const manga = sortedManga.find((entry) => entry.id === mangaId)
        if (!manga) return prev
        return { id: mangaId, category: isLiveCompleted(manga) ? "completed" : "reading" }
      })
      return
    }

    setOpenEntry((prev) => {
      if (prev?.id !== mangaId) return prev

      const liveManga = sortedManga.find((entry) => entry.id === mangaId)
      if (liveManga) {
        const categoryChanged = (isLiveCompleted(liveManga) ? "completed" : "reading") !== prev.category
        const orderChanged =
          orderedSortedManga.findIndex((entry) => entry.id === mangaId) !==
          sortedManga.findIndex((entry) => entry.id === mangaId)

        if (categoryChanged || orderChanged) {
          setExitingId({ id: mangaId, category: prev.category })
          if (exitTimeoutRef.current !== null) {
            window.clearTimeout(exitTimeoutRef.current)
          }
          exitTimeoutRef.current = window.setTimeout(() => {
            setExitingId((cur) => (cur?.id === mangaId ? null : cur))
          }, 150)
        }
      }

      return null
    })
  }

  if (viewerLoading || loading) return <StateMessage icon={Loader2} spin message="Loading your manga list..." />
  if (viewerError || error)
    return (
      <StateMessage
        icon={AlertCircle}
        tone="error"
        message={getErrorMessage(viewerError || error, "Error loading manga list.")}
      />
    )

  const updateLocalList = (entryId: number, updates: Partial<any>) => {
    if (mangaList) {
      const updated = mangaList.map((entry) => (entry.id === entryId ? { ...entry, ...updates } : entry))
      setMangaList(updated)
    }
  }

  const handleProgressChange = (manga: MediaEntry, newProgress: number) => {
    const maxChapters = manga.totalUnits || 9999
    const clampedProgress = Math.min(Math.max(0, newProgress), maxChapters)
    const finished = manga.totalUnits && clampedProgress >= manga.totalUnits

    if (finished && !manualCompletion) {
      if (mangaList) {
        setMangaList(mangaList.filter((item) => item.id !== manga.id))
      }
      markMangaStatsDirty()
    } else {
      updateLocalList(manga.id, { progress: clampedProgress })
    }

    queueUpdate({ entryId: manga.id, progress: clampedProgress })

    if (finished && manualCompletion) {
      queueUpdate({ entryId: manga.id, status: "CURRENT" })
    }
  }

  const handleScoreChange = (manga: MediaEntry, score: number) => {
    updateLocalList(manga.id, { score })
    queueUpdate({ entryId: manga.id, score })
  }

  const handleMarkCompleted = (manga: MediaEntry) => {
    if (mangaList) {
      setMangaList(mangaList.filter((item) => item.id !== manga.id))
    }
    markMangaStatsDirty()
    queueUpdate({ entryId: manga.id, status: "COMPLETED" })
  }

  const renderMangaGrid = (list: MediaEntry[], title: string, category: "reading" | "completed" | null) => {
    const hasVisibleContent = list.length > 0 || exitingId?.category === category

    return (
      <div className={hasVisibleContent ? "mb-6" : "hidden"}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg text-gray font-medium">
            {title} ({list.length})
          </h3>
        </div>
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
          <AnimatePresence
            mode="popLayout"
            initial={false}
            onExitComplete={() => {
              setExitingId((cur) => (cur && (category === null || cur.category === category) ? null : cur))
            }}
          >
            {list.map((manga) => {
              const willMove = openEntry?.id === manga.id && openEntryPositionWillChange
              const isExiting = exitingId?.id === manga.id
              const motionKey = `${manga.id}-${isExiting ? "exiting" : "live"}`
              const handleExitComplete = () => {
                if (!isExiting) return
                if (exitTimeoutRef.current !== null) {
                  window.clearTimeout(exitTimeoutRef.current)
                  exitTimeoutRef.current = null
                }
                setExitingId((cur) => (cur && (category === null || cur.category === category) ? null : cur))
              }

              return (
                <motion.div
                  key={motionKey}
                  layout
                  initial={{ opacity: 0, y: -50, zIndex: 10 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    zIndex: 10,
                    transition: {
                      opacity: { duration: 0.15, ease: "easeOut" },
                      y: { duration: 0.25, ease: "easeOut", delay: 0.15 },
                      zIndex: { duration: 0 }
                    }
                  }}
                  exit={{
                    opacity: 0,
                    y: -24,
                    transition: { duration: willMove ? 0.2 : 0.18, ease: "easeIn" }
                  }}
                  onAnimationComplete={handleExitComplete}
                  transition={{ duration: 0 }}
                >
                  <MediaCard
                    entry={manga}
                    profileColor={profileColor}
                    scoreFormat={scoreFormat}
                    displayAdultContent={displayAdultContent}
                    onProgressChange={(progress) => handleProgressChange(manga, progress)}
                    onScoreChange={(score) => handleScoreChange(manga, score)}
                    onMarkCompleted={() => handleMarkCompleted(manga)}
                    onOpenChange={(isOpen) => handleOpenChange(manga.id, isOpen)}
                    positionWillChange={willMove}
                  />
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
    )
  }

  const isEmpty = sortedManga.length === 0

  return (
    <div className="px-5 py-4 flex-1 flex flex-col">
      {isEmpty ? (
        <StateMessage
          icon={BookOpen}
          title="No Manga In Progress"
          message="Manga you're currently reading will show up here."
        />
      ) : separateEntries ? (
        <>
          {renderMangaGrid(readingManga, "Reading", "reading")}
          {renderMangaGrid(completedManga, "Completed", "completed")}
        </>
      ) : (
        renderMangaGrid(visibleSortedManga, "Reading", null)
      )}
    </div>
  )
}
