import React, { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, gql } from "@apollo/client"
import { motion, AnimatePresence } from "framer-motion"
import { MediaCard } from "./MediaCard"
import { StateMessage } from "./StateMessage"
import { useSettings } from "../contexts/SettingsContext"
import { useAniListData } from "../contexts/AniListDataContext"
import { queueUpdate } from "../lib/syncQueue"
import { useStableOrder } from "../hooks/useStableOrder"
import { Loader2, AlertCircle, Tv } from "lucide-react"
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

const WATCHING_LIST_QUERY = gql`
  query ($userId: Int) {
    MediaListCollection(userId: $userId, type: ANIME, status: CURRENT) {
      lists {
        entries {
          media {
            id
            title {
              english
              native
              romaji
            }
            nextAiringEpisode {
              episode
            }
            coverImage {
              extraLarge
              large
            }
            episodes
            isAdult
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

type AnimeListEntry = MediaEntry & { nextAiringEpisode: number | null }
type OpenEntryState = { id: number; category: "behind" | "caughtUp" }

export const AnimeTab: React.FC = () => {
  const {
    profileColor,
    titleLanguage,
    displayAdultContent,
    scoreFormat,
    rowOrder,
    manualCompletion,
    separateEntries
  } = useSettings()

  const { animeList, animeDirty, setAnimeList, markStatsDirty, clearAnimeDirty } = useAniListData()

  const [openEntry, setOpenEntry] = useState<OpenEntryState | null>(null)
  const [exitingId, setExitingId] = useState<OpenEntryState | null>(null)
  const exitTimeoutRef = useRef<number | null>(null)

  const { data: viewerData, loading: viewerLoading, error: viewerError } = useQuery(VIEWER_QUERY)
  const userId = viewerData?.Viewer?.id

  const { data, loading, error, refetch } = useQuery(WATCHING_LIST_QUERY, {
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
    if (animeList && !animeDirty) return

    refetch().then((res) => {
      const fetched = res.data?.MediaListCollection?.lists?.[0]?.entries ?? []
      setAnimeList(fetched)
      clearAnimeDirty()
    })
  }, [userId, animeDirty, refetch, setAnimeList, clearAnimeDirty])

  const watchingList = animeList ?? data?.MediaListCollection?.lists?.[0]?.entries ?? []

  const transformedAnime = useMemo<AnimeListEntry[]>(() => {
    return watchingList.map((entry: any) => ({
      id: entry.id,
      title: entry.media.title[titleLanguage.toLowerCase()],
      cover: entry.media.coverImage.extraLarge ?? entry.media.coverImage.large,
      progress: entry.progress,
      score: entry.score || 0,
      nextAiringEpisode: entry.media.nextAiringEpisode?.episode || null,
      totalUnits: entry.media.episodes,
      isAdult: entry.media.isAdult,
      updatedAt: entry.updatedAt,
      mediaId: entry.media.id
    }))
  }, [watchingList, titleLanguage])

  const filteredAnime = useMemo(() => {
    return transformedAnime.filter((anime) => displayAdultContent || !anime.isAdult)
  }, [transformedAnime, displayAdultContent])

  const sortedAnime = useMemo(() => {
    return [...filteredAnime].sort((a, b) => {
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
  }, [filteredAnime, rowOrder])

  const orderedSortedAnime = useStableOrder(sortedAnime, openEntry !== null)

  const isLiveCaughtUp = (anime: AnimeListEntry) =>
    !!(
      (anime.totalUnits && anime.progress === anime.totalUnits) ||
      (anime.nextAiringEpisode && anime.progress >= anime.nextAiringEpisode - 1)
    )

  const isCaughtUp = (anime: AnimeListEntry) =>
    openEntry && openEntry.id === anime.id ? openEntry.category === "caughtUp" : isLiveCaughtUp(anime)

  const openEntryPositionWillChange = useMemo(() => {
    if (!openEntry) return false

    const liveAnime = sortedAnime.find((entry) => entry.id === openEntry.id)
    if (!liveAnime) return false

    const categoryChanged = (isLiveCaughtUp(liveAnime) ? "caughtUp" : "behind") !== openEntry.category
    const orderChanged =
      orderedSortedAnime.findIndex((entry) => entry.id === openEntry.id) !==
      sortedAnime.findIndex((entry) => entry.id === openEntry.id)

    return categoryChanged || orderChanged
  }, [openEntry, orderedSortedAnime, sortedAnime])

  const visibleSortedAnime = useMemo(() => {
    return orderedSortedAnime.filter((anime) => anime.id !== exitingId?.id)
  }, [orderedSortedAnime, exitingId?.id])

  const caughtUpAnime = useMemo(() => {
    return separateEntries ? visibleSortedAnime.filter(isCaughtUp) : []
  }, [separateEntries, visibleSortedAnime, isCaughtUp])

  const behindAnime = useMemo(() => {
    return separateEntries ? visibleSortedAnime.filter((anime) => !isCaughtUp(anime)) : visibleSortedAnime
  }, [separateEntries, visibleSortedAnime, isCaughtUp])

  const handleOpenChange = (animeId: number, isOpen: boolean) => {
    if (isOpen) {
      setOpenEntry((prev) => {
        if (prev?.id === animeId) return prev
        const anime = sortedAnime.find((entry) => entry.id === animeId)
        if (!anime) return prev
        return { id: animeId, category: isLiveCaughtUp(anime) ? "caughtUp" : "behind" }
      })
      return
    }

    setOpenEntry((prev) => {
      if (prev?.id !== animeId) return prev

      const liveAnime = sortedAnime.find((entry) => entry.id === animeId)
      if (liveAnime) {
        const categoryChanged = (isLiveCaughtUp(liveAnime) ? "caughtUp" : "behind") !== prev.category
        const orderChanged =
          orderedSortedAnime.findIndex((entry) => entry.id === animeId) !==
          sortedAnime.findIndex((entry) => entry.id === animeId)

        if (categoryChanged || orderChanged) {
          setExitingId({ id: animeId, category: prev.category })
          if (exitTimeoutRef.current !== null) {
            window.clearTimeout(exitTimeoutRef.current)
          }
          exitTimeoutRef.current = window.setTimeout(() => {
            setExitingId((cur) => (cur?.id === animeId ? null : cur))
          }, 150)
        }
      }

      return null
    })
  }

  if (viewerLoading || loading) return <StateMessage icon={Loader2} spin message="Loading your anime list..." />
  if (viewerError || error)
    return (
      <StateMessage
        icon={AlertCircle}
        tone="error"
        message={getErrorMessage(viewerError || error, "Error loading anime list.")}
      />
    )

  const updateLocalList = (entryId: number, updates: Partial<any>) => {
    if (animeList) {
      const updated = animeList.map((entry) => (entry.id === entryId ? { ...entry, ...updates } : entry))
      setAnimeList(updated)
    }
  }

  const handleProgressChange = (anime: AnimeListEntry, newProgress: number) => {
    const maxEpisodes = anime.totalUnits || 9999
    const clampedProgress = Math.min(Math.max(0, newProgress), maxEpisodes)
    const finished = anime.totalUnits && clampedProgress >= anime.totalUnits

    if (finished && !manualCompletion) {
      if (animeList) {
        setAnimeList(animeList.filter((item) => item.id !== anime.id))
      }
      markStatsDirty()
    } else {
      updateLocalList(anime.id, { progress: clampedProgress })
    }

    queueUpdate({ entryId: anime.id, progress: clampedProgress })

    if (finished && manualCompletion) {
      queueUpdate({ entryId: anime.id, status: "CURRENT" })
    }
  }

  const handleScoreChange = (anime: AnimeListEntry, score: number) => {
    updateLocalList(anime.id, { score })
    queueUpdate({ entryId: anime.id, score })
  }

  const handleMarkCompleted = (anime: AnimeListEntry) => {
    if (animeList) {
      setAnimeList(animeList.filter((item) => item.id !== anime.id))
    }
    markStatsDirty()
    queueUpdate({ entryId: anime.id, status: "COMPLETED" })
  }

  const renderAnimeGrid = (list: AnimeListEntry[], title: string, category: "behind" | "caughtUp" | null) => {
    const hasVisibleContent = list.length > 0 || exitingId?.category === category

    return (
      <div className={hasVisibleContent ? "mb-6" : "hidden"}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg text-gray font-medium">
            {title} ({list.length})
          </h3>
        </div>
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
          <AnimatePresence mode="popLayout" initial={false} onExitComplete={() => setExitingId((cur) => (cur && (category === null || cur.category === category) ? null : cur))}>
            {list.map((anime) => {
              const willMove = openEntry?.id === anime.id && openEntryPositionWillChange
              const isExiting = exitingId?.id === anime.id
              const motionKey = `${anime.id}-${isExiting ? "exiting" : "live"}`
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
                    entry={anime}
                    profileColor={profileColor}
                    scoreFormat={scoreFormat}
                    displayAdultContent={displayAdultContent}
                    onProgressChange={(progress) => handleProgressChange(anime, progress)}
                    onScoreChange={(score) => handleScoreChange(anime, score)}
                    onMarkCompleted={() => handleMarkCompleted(anime)}
                    onOpenChange={(isOpen) => handleOpenChange(anime.id, isOpen)}
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

  const isEmpty = sortedAnime.length === 0

  return (
    <div className="px-5 py-4 flex-1 flex flex-col">
      {isEmpty ? (
        <StateMessage
          icon={Tv}
          title="No Anime In Progress"
          message="Anime you're currently watching will show up here."
        />
      ) : separateEntries ? (
        <>
          {renderAnimeGrid(behindAnime, "Behind", "behind")}
          {renderAnimeGrid(caughtUpAnime, "Caught-Up", "caughtUp")}
        </>
      ) : (
        renderAnimeGrid(visibleSortedAnime, "Watching", null)
      )}
    </div>
  )
}
