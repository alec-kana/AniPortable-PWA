import React, { useEffect } from "react"
import { useQuery, gql } from "@apollo/client"
import { MediaCard } from "./MediaCard"
import { MediaListRow } from "./MediaListRow"
import { DensitySwitcher } from "./DensitySwitcher"
import { StateMessage } from "./StateMessage"
import { useSettings } from "../contexts/SettingsContext"
import { useAniListData } from "../contexts/AniListDataContext"
import { queueUpdate } from "../lib/syncQueue"
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

export const MangaTab: React.FC = () => {
  const {
    profileColor,
    titleLanguage,
    displayAdultContent,
    scoreFormat,
    rowOrder,
    manualCompletion,
    separateEntries,
    mangaCardDensity,
    setMangaCardDensity
  } = useSettings()

  const {
    mangaList,
    mangaDirty,
    setMangaList,
    markMangaStatsDirty,
    clearMangaDirty
  } = useAniListData()

  const { data: viewerData, loading: viewerLoading, error: viewerError } = useQuery(VIEWER_QUERY)
  const userId = viewerData?.Viewer?.id

  const { data, loading, error, refetch } = useQuery(READING_LIST_QUERY, {
    variables: { userId },
    skip: !userId
  })

  useEffect(() => {
    if (!userId) return
    if (mangaList && !mangaDirty) return
    refetch().then((res) => {
      const fetched = res.data?.MediaListCollection?.lists?.[0]?.entries ?? []
      setMangaList(fetched)
      clearMangaDirty()
    })
  }, [userId, mangaDirty])

  const readingList = mangaList ?? data?.MediaListCollection?.lists?.[0]?.entries ?? []

  const transformedManga: MediaEntry[] = readingList.map((entry: any) => ({
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

  const filteredManga = transformedManga.filter((manga) => displayAdultContent || !manga.isAdult)

  const sortedManga = [...filteredManga].sort((a, b) => {
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

  const completedManga = separateEntries
    ? sortedManga.filter((manga) => manga.totalUnits && manga.progress >= manga.totalUnits)
    : []

  const readingManga = separateEntries
    ? sortedManga.filter((manga) => !completedManga.includes(manga))
    : sortedManga

  if (viewerLoading || loading)
    return <StateMessage icon={Loader2} spin message="Loading your manga list..." />
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

  const renderMangaGrid = (list: MediaEntry[], title: string, showSwitcher = false) => (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg text-gray font-medium">
          {title} ({list.length})
        </h3>
        {showSwitcher && (
          <DensitySwitcher value={mangaCardDensity} onChange={setMangaCardDensity} profileColor={profileColor} />
        )}
      </div>
      {mangaCardDensity === "list" || mangaCardDensity === "compact" ? (
        <div className={`flex flex-col ${mangaCardDensity === "compact" ? "gap-1" : "gap-2"}`}>
          {list.map((manga) => (
            <MediaListRow
              key={manga.id}
              entry={manga}
              profileColor={profileColor}
              scoreFormat={scoreFormat}
              displayAdultContent={displayAdultContent}
              onProgressChange={(progress) => handleProgressChange(manga, progress)}
              onScoreChange={(score) => handleScoreChange(manga, score)}
              onMarkCompleted={() => handleMarkCompleted(manga)}
              showImage={mangaCardDensity === "list"}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
          {list.map((manga) => (
            <MediaCard
              key={manga.id}
              entry={manga}
              profileColor={profileColor}
              scoreFormat={scoreFormat}
              displayAdultContent={displayAdultContent}
              onProgressChange={(progress) => handleProgressChange(manga, progress)}
              onScoreChange={(score) => handleScoreChange(manga, score)}
              onMarkCompleted={() => handleMarkCompleted(manga)}
            />
          ))}
        </div>
      )}
    </div>
  )

  const isEmpty = separateEntries
    ? readingManga.length === 0 && completedManga.length === 0
    : sortedManga.length === 0

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
          {readingManga.length > 0 && completedManga.length > 0 ? (
            <>
              {renderMangaGrid(readingManga, "Reading", true)}
              {renderMangaGrid(completedManga, "Completed")}
            </>
          ) : readingManga.length > 0 ? (
            renderMangaGrid(readingManga, "Reading", true)
          ) : (
            renderMangaGrid(completedManga, "Completed", true)
          )}
        </>
      ) : (
        renderMangaGrid(sortedManga, "Reading", true)
      )}
    </div>
  )
}
