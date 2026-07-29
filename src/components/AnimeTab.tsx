import React, { useEffect } from "react"
import { useQuery, gql } from "@apollo/client"
import { MediaCard } from "./MediaCard"
import { MediaListRow } from "./MediaListRow"
import { DensitySwitcher } from "./DensitySwitcher"
import { StateMessage } from "./StateMessage"
import { useSettings } from "../contexts/SettingsContext"
import { useAniListData } from "../contexts/AniListDataContext"
import { queueUpdate } from "../lib/syncQueue"
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

export const AnimeTab: React.FC = () => {
  const {
    profileColor,
    titleLanguage,
    displayAdultContent,
    scoreFormat,
    rowOrder,
    manualCompletion,
    separateEntries,
    animeCardDensity,
    setAnimeCardDensity
  } = useSettings()

  const {
    animeList,
    animeDirty,
    setAnimeList,
    markStatsDirty,
    clearAnimeDirty
  } = useAniListData()

  const { data: viewerData, loading: viewerLoading, error: viewerError } = useQuery(VIEWER_QUERY)
  const userId = viewerData?.Viewer?.id

  const { data, loading, error, refetch } = useQuery(WATCHING_LIST_QUERY, {
    variables: { userId },
    skip: !userId
  })

  // Only refetch if there's no cache or it's marked dirty
  useEffect(() => {
    if (!userId) return
    if (animeList && !animeDirty) return
    refetch().then((res) => {
      const fetched = res.data?.MediaListCollection?.lists?.[0]?.entries ?? []
      setAnimeList(fetched)
      clearAnimeDirty()
    })
  }, [userId, animeDirty])

  const watchingList = animeList ?? data?.MediaListCollection?.lists?.[0]?.entries ?? []

  type AnimeListEntry = MediaEntry & { nextAiringEpisode: number | null }

  const transformedAnime: AnimeListEntry[] = watchingList.map((entry: any) => ({
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

  const filteredAnime = transformedAnime.filter((anime) => displayAdultContent || !anime.isAdult)

  const sortedAnime = [...filteredAnime].sort((a, b) => {
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

  const caughtUpAnime = separateEntries
    ? sortedAnime.filter(
        (anime) =>
          (anime.totalUnits && anime.progress === anime.totalUnits) ||
          (anime.nextAiringEpisode && anime.progress >= anime.nextAiringEpisode - 1)
      )
    : []

  const behindAnime = separateEntries
    ? sortedAnime.filter((anime) => !caughtUpAnime.includes(anime))
    : sortedAnime

  if (viewerLoading || loading)
    return <StateMessage icon={Loader2} spin message="Loading your anime list..." />
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

  const renderAnimeGrid = (list: AnimeListEntry[], title: string, showSwitcher = false) => (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg text-gray font-medium">
          {title} ({list.length})
        </h3>
        {showSwitcher && (
          <DensitySwitcher value={animeCardDensity} onChange={setAnimeCardDensity} profileColor={profileColor} />
        )}
      </div>
      {animeCardDensity === "list" || animeCardDensity === "compact" ? (
        <div className={`flex flex-col ${animeCardDensity === "compact" ? "gap-1" : "gap-2"}`}>
          {list.map((anime) => (
            <MediaListRow
              key={anime.id}
              entry={anime}
              profileColor={profileColor}
              scoreFormat={scoreFormat}
              displayAdultContent={displayAdultContent}
              onProgressChange={(progress) => handleProgressChange(anime, progress)}
              onScoreChange={(score) => handleScoreChange(anime, score)}
              onMarkCompleted={() => handleMarkCompleted(anime)}
              showImage={animeCardDensity === "list"}
            />
          ))}
        </div>
      ) : (
        // Fixed column counts (not auto-fit) so a row with fewer cards than
        // the count doesn't stretch them to fill the row — each card stays
        // its normal size instead. lg:6 anchors to a 1024px viewport (iPad
        // Pro), stepped out both directions so every breakpoint from the
        // smallest phone up to a wide desktop gets a whole number of cards.
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
          {list.map((anime) => (
            <MediaCard
              key={anime.id}
              entry={anime}
              profileColor={profileColor}
              scoreFormat={scoreFormat}
              displayAdultContent={displayAdultContent}
              onProgressChange={(progress) => handleProgressChange(anime, progress)}
              onScoreChange={(score) => handleScoreChange(anime, score)}
              onMarkCompleted={() => handleMarkCompleted(anime)}
            />
          ))}
        </div>
      )}
    </div>
  )

  const isEmpty = separateEntries
    ? behindAnime.length === 0 && caughtUpAnime.length === 0
    : sortedAnime.length === 0

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
          {behindAnime.length > 0 && caughtUpAnime.length > 0 ? (
            <>
              {renderAnimeGrid(behindAnime, "Behind", true)}
              {renderAnimeGrid(caughtUpAnime, "Caught-Up")}
            </>
          ) : behindAnime.length > 0 ? (
            renderAnimeGrid(behindAnime, "Behind", true)
          ) : (
            renderAnimeGrid(caughtUpAnime, "Caught-Up", true)
          )}
        </>
      ) : (
        renderAnimeGrid(sortedAnime, "Watching", true)
      )}
    </div>
  )
}
