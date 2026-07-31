import React, { useMemo, useState, useEffect } from "react"
import { useQuery, gql } from "@apollo/client"
import { useSettings } from "../contexts/SettingsContext"
import { useAniListData, type ListKey } from "../contexts/AniListDataContext"
import { ScoreChart } from "./ScoreChart"
import { CustomSelect } from "./CustomSelect"
import { MonitorCheck, BookOpen, Percent, BarChart3, Loader2, AlertCircle, XCircle, type LucideIcon } from "lucide-react"
import * as Slider from "@radix-ui/react-slider"
import { StateMessage } from "./StateMessage"
import { getErrorMessage } from "../lib/apolloErrors"
import { useAuth } from "../hooks/useAuth"

const COMPLETED_ANIME_QUERY = gql`
  query ($userId: Int) {
    MediaListCollection(userId: $userId, type: ANIME) {
      lists {
        entries {
          media {
            season
            seasonYear
            isAdult
            title {
              romaji
            }
          }
          score
        }
      }
    }
  }
`

const COMPLETED_MANGA_QUERY = gql`
  query ($userId: Int) {
    MediaListCollection(userId: $userId, type: MANGA) {
      lists {
        entries {
          media {
            isAdult
            title {
              romaji
            }
          }
          score
        }
      }
    }
  }
`

const distinctScores = (entries: any[]): number[] =>
  Array.from(new Set(entries.filter((entry) => entry.score).map((entry) => entry.score as number))).sort((a, b) => a - b)

const scoreCounts = (entries: any[]) => {
  const counts: Record<number, number> = {}
  entries.forEach((entry) => entry.score && (counts[entry.score] = (counts[entry.score] || 0) + 1))
  return Object.entries(counts).map(([score, count]) => ({ score: Number(score), count }))
}

const mean = (entries: any[]) =>
  entries.length ? entries.reduce((sum, entry) => sum + (entry.score || 0), 0) / entries.length : 0

const StatTile: React.FC<{ icon: LucideIcon; value: string | number; label: string; color: string }> = ({
  icon: Icon,
  value,
  label,
  color
}) => (
  <div className="flex space-x-4 items-center justify-center">
    <div className="flex justify-center items-center w-10 h-10 rounded-full bg-white-100 shadow-lg">
      <Icon size={20} className="text-gray" />
    </div>
    <div className="text-start">
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-sm text-gray tracking-wide font-semibold">{label}</div>
    </div>
  </div>
)

export const StatsTab: React.FC = () => {
  const { profileColor, displayAdultContent, showAnimeStats, showMangaStats } = useSettings()
  const { lists, dirty, setList, clearDirty } = useAniListData()

  const [year, setYear] = useState<number | null>(null)
  const [sliderValue, setSliderValue] = useState<number>(0)
  const [season, setSeason] = useState<string>("All")
  const [isSliderActive, setIsSliderActive] = useState(false)

  // Login already stored the viewer, so the id is local — see SettingsContext.
  const { user } = useAuth()
  const userId = user?.id

  const { data: animeData, loading: animeLoading, error: animeError, refetch: refetchAnime } = useQuery(
    COMPLETED_ANIME_QUERY,
    { variables: { userId }, skip: !userId }
  )

  const { data: mangaData, loading: mangaLoading, error: mangaError, refetch: refetchManga } = useQuery(
    COMPLETED_MANGA_QUERY,
    { variables: { userId }, skip: !userId }
  )

  // Flattens every status list (CURRENT, COMPLETED, ...) into one array and
  // keeps only scored entries, which are all the charts care about.
  const cacheScoredEntries = (key: ListKey, payload: any) => {
    const entries = (payload?.MediaListCollection?.lists ?? []).flatMap((list: any) => list.entries ?? [])
    setList(key, entries.filter((entry: any) => entry.score > 0))
  }

  // Same as the list tabs: the hook's own fetch covers a cold load, so only a dirty flag
  // needs a request of its own.
  const syncStats = (key: ListKey, isDirty: boolean, data: any, refetch: () => Promise<any>) => {
    if (isDirty) {
      refetch()
        .then((res) => {
          cacheScoredEntries(key, res.data)
          clearDirty(key)
        })
        // refetch() rejects on a network error. Stays dirty so the next mount retries;
        // useQuery's own error already drives the StateMessage.
        .catch((err) => console.error(`[StatsTab] ${key} refetch failed:`, err))
    } else if (data) {
      cacheScoredEntries(key, data)
    }
  }

  useEffect(() => {
    if (!userId) return
    if (lists.animeStats && !dirty.animeStats) return
    syncStats("animeStats", dirty.animeStats, animeData, refetchAnime)
  }, [userId, dirty.animeStats, animeData])

  useEffect(() => {
    if (!userId) return
    if (lists.mangaStats && !dirty.mangaStats) return
    syncStats("mangaStats", dirty.mangaStats, mangaData, refetchManga)
  }, [userId, dirty.mangaStats, mangaData])

  const animeEntries = lists.animeStats ?? []
  const mangaEntries = lists.mangaStats ?? []

  const animeAllScores = useMemo(() => distinctScores(animeEntries), [animeEntries])
  const mangaAllScores = useMemo(() => distinctScores(mangaEntries), [mangaEntries])

  const years = useMemo(() => {
    const set = new Set<number>()
    animeEntries.forEach((e: any) => e.media.seasonYear && set.add(e.media.seasonYear))
    return Array.from(set).sort((a, b) => a - b)
  }, [animeEntries])

  const filteredAnime = useMemo(() => {
    return animeEntries.filter((e: any) => {
      const matchYear = year ? e.media.seasonYear === year : true
      const matchSeason = season !== "All" ? e.media.season === season : true
      const matchAdult = displayAdultContent ? true : !e.media.isAdult
      return matchYear && matchSeason && matchAdult
    })
  }, [animeEntries, year, season, displayAdultContent])

  const filteredManga = useMemo(() => {
    return mangaEntries.filter((e: any) => (displayAdultContent ? true : !e.media.isAdult))
  }, [mangaEntries, displayAdultContent])

  const animeScoreData = useMemo(() => scoreCounts(filteredAnime), [filteredAnime])
  const mangaScoreData = useMemo(() => scoreCounts(filteredManga), [filteredManga])

  if (!showAnimeStats && !showMangaStats) {
    return (
      <StateMessage
        icon={BarChart3}
        title="No Stats Selected"
        message='Enable "Show in Stats" for Anime or Manga in Settings to view your statistics here.'
      />
    )
  }

  if (animeLoading || mangaLoading)
    return <StateMessage icon={Loader2} spin message="Loading your stats..." />
  if (animeError || mangaError)
    return (
      <StateMessage
        icon={AlertCircle}
        tone="error"
        message={getErrorMessage(animeError || mangaError, "Error loading stats.")}
      />
    )

  return (
    <div className="p-2 flex-1 flex flex-col">

      {showAnimeStats && (
      <div className="mb-8 mt-4">
        <h3 className="text-xl text-gray font-bold text-center mb-2">Anime Stats</h3>

        <div className="flex justify-center gap-[114px] m-4 -translate-x-2">
          <StatTile icon={MonitorCheck} value={filteredAnime.length} label="Total Anime" color={profileColor} />
          <StatTile icon={Percent} value={mean(filteredAnime).toFixed(2)} label="Mean Score" color={profileColor} />
        </div>

        <div className="pl-6 pr-6 flex justify-between items-start">
          <div className="flex-1">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-gray">Year</span>
              {year && (
                <div className="flex items-center gap-1">
                  <button onClick={() => { setYear(null); setSliderValue(0) }} className="text-gray leading-none">
                    <XCircle size={16} />
                  </button>
                  <span className="text-medium text-gray">{year}</span>
                </div>
              )}
            </div>
            <Slider.Root
              className="relative flex items-center select-none touch-none w-full h-8"
              min={0}
              max={years.length}
              step={1}
              value={[sliderValue]}
              onValueChange={(values) => {
                const i = values[0]
                setSliderValue(i)
                setYear(i === 0 ? null : years[i - 1])
              }}
              onPointerDown={() => setIsSliderActive(true)}
              onPointerUp={() => setIsSliderActive(false)}
            >
              <Slider.Track className="bg-white-100 relative grow rounded-full h-1.5">
                <Slider.Range className="absolute rounded-full h-full" style={{ background: profileColor }} />
              </Slider.Track>
              <Slider.Thumb
                className="block w-4 h-4 bg-white-100 shadow-lg border-2 rounded-full hover:w-5 hover:h-5 transition-all duration-200 cursor-pointer"
                style={{ borderColor: profileColor }}
                aria-label="Year"
              >
                <div className={`flex items-center justify-center absolute min-w-14 min-h-8 -top-10 left-1/2 transform -translate-x-1/2 bg-[#242538] text-white text-xs px-2 py-1 rounded transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10
                    ${isSliderActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {sliderValue === 0 ? "All Years" : years[sliderValue - 1]}
                  </div>
              </Slider.Thumb>
            </Slider.Root>
          </div>

          <div className="ml-10 min-w-[170px]">
            <h3 className="text-sm font-medium mb-1 text-gray ml-1">Season</h3>
            <CustomSelect
              options={[
                { name: "Any", value: "All"},
                { name: "Winter", value: "WINTER"},
                { name: "Spring", value: "SPRING"},
                { name: "Summer", value: "SUMMER"},
                { name: "Fall", value: "FALL"}
              ]}
              value={season}
              onChange={setSeason}
              profileColor={profileColor}
            />
          </div>
        </div>

        <div className="-mt-2">
          <ScoreChart data={animeScoreData} allScores={animeAllScores} />
        </div>
      </div>
      )}

      {showMangaStats && (
      <div>
        <h3 className="text-xl text-gray font-bold text-center mb-2">Manga Stats</h3>

        <div className="flex justify-center gap-[114px] m-4 -translate-x-2">
          <StatTile icon={BookOpen} value={filteredManga.length} label="Total Manga" color={profileColor} />
          <StatTile icon={Percent} value={mean(filteredManga).toFixed(2)} label="Mean Score" color={profileColor} />
        </div>

        <div className="mt-6">
          <ScoreChart data={mangaScoreData} allScores={mangaAllScores} />
        </div>
      </div>
      )}
    </div>
  )
}
