import React, { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@apollo/client"
import type { DocumentNode } from "graphql"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, AlertCircle, type LucideIcon } from "lucide-react"
import { MediaCard } from "./MediaCard"
import { StateMessage } from "./StateMessage"
import { useSettings } from "../contexts/SettingsContext"
import { useAniListData, type ListKey } from "../contexts/AniListDataContext"
import { queueUpdate } from "../lib/syncQueue"
import { useStableOrder } from "../hooks/useStableOrder"
import { getErrorMessage } from "../lib/apolloErrors"
import { VIEWER_QUERY } from "../lib/queries"
import type { MediaEntry } from "../lib/types"

// Anime with nothing left to watch, manga with nothing left to read.
type Category = "behind" | "caughtUp"

export type MediaListConfig = {
  listQuery: DocumentNode
  listKey: ListKey
  statsKey: ListKey
  unitsOf: (media: any) => { totalUnits: number | null; nextAiringEpisode: number | null }
  isCaughtUp: (entry: MediaEntry) => boolean
  emptyIcon: LucideIcon
  labels: {
    all: string
    behind: string
    caughtUp: string
    loading: string
    error: string
    emptyTitle: string
    emptyMessage: string
  }
}

type OpenEntryState = { id: number; category: Category }

export const MediaListTab: React.FC<{ config: MediaListConfig }> = ({ config }) => {
  const {
    profileColor,
    titleLanguage,
    displayAdultContent,
    scoreFormat,
    rowOrder,
    manualCompletion,
    separateEntries
  } = useSettings()

  const { lists, dirty, setList, markDirty, clearDirty } = useAniListData()
  const cachedList = lists[config.listKey]
  const isDirty = dirty[config.listKey]

  const [openEntry, setOpenEntry] = useState<OpenEntryState | null>(null)
  const [exitingId, setExitingId] = useState<OpenEntryState | null>(null)
  const exitTimeoutRef = useRef<number | null>(null)

  // Finishing a series drops it from the list, but not until the overlay is closed: pulling
  // the card out mid-interaction leaves the overlay morphing back into a card that has already
  // left, and strands the wheel on a stale value so the edit can't be undone.
  const [pendingRemovalId, setPendingRemovalId] = useState<number | null>(null)

  // The only card allowed to animate into place. It expires on its own so a card touched
  // earlier can never still hold the privilege when the next update reshuffles the list.
  const [animatingTargetId, setAnimatingTargetId] = useState<number | null>(null)
  const targetTimeoutRef = useRef<number | null>(null)

  const markAnimatingTarget = (entryId: number) => {
    setAnimatingTargetId(entryId)
    if (targetTimeoutRef.current !== null) {
      window.clearTimeout(targetTimeoutRef.current)
    }
    targetTimeoutRef.current = window.setTimeout(() => setAnimatingTargetId(null), 500)
  }

  const { data: viewerData, loading: viewerLoading, error: viewerError } = useQuery(VIEWER_QUERY)
  const userId = viewerData?.Viewer?.id

  const { data, loading, error, refetch } = useQuery(config.listQuery, {
    variables: { userId },
    skip: !userId
  })

  useEffect(() => {
    return () => {
      if (exitTimeoutRef.current !== null) {
        window.clearTimeout(exitTimeoutRef.current)
        exitTimeoutRef.current = null
      }
      if (targetTimeoutRef.current !== null) {
        window.clearTimeout(targetTimeoutRef.current)
        targetTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    if (cachedList && !isDirty) return

    refetch().then((res) => {
      setList(config.listKey, res.data?.MediaListCollection?.lists?.[0]?.entries ?? [])
      clearDirty(config.listKey)
    })
  }, [userId, isDirty, refetch, setList, clearDirty, config.listKey])

  const rawEntries = cachedList ?? data?.MediaListCollection?.lists?.[0]?.entries ?? []

  const entries = useMemo<MediaEntry[]>(() => {
    return rawEntries.map((entry: any) => ({
      id: entry.id,
      title: entry.media.title[titleLanguage.toLowerCase()],
      cover: entry.media.coverImage.extraLarge ?? entry.media.coverImage.large,
      progress: entry.progress,
      score: entry.score || 0,
      isAdult: entry.media.isAdult,
      updatedAt: entry.updatedAt,
      ...config.unitsOf(entry.media)
    }))
  }, [rawEntries, titleLanguage, config])

  const filtered = useMemo(() => {
    return entries.filter((entry) => displayAdultContent || !entry.isAdult)
  }, [entries, displayAdultContent])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
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
  }, [filtered, rowOrder])

  const orderedSorted = useStableOrder(sorted, openEntry !== null)

  // An open card keeps its category, so editing can't move it mid-interaction.
  const categoryOf = (entry: MediaEntry): Category =>
    openEntry && openEntry.id === entry.id
      ? openEntry.category
      : config.isCaughtUp(entry)
        ? "caughtUp"
        : "behind"

  const willEntryMove = (entryId: number, category: Category) => {
    // A card queued for removal is leaving its slot either way, so it never morphs back.
    if (pendingRemovalId === entryId) return true

    const live = sorted.find((entry) => entry.id === entryId)
    if (!live) return false

    // Category only decides placement while the sections are split; with one combined grid
    // becoming caught up moves nothing.
    if (separateEntries && (config.isCaughtUp(live) ? "caughtUp" : "behind") !== category) return true

    // Compared within the grid the card is rendered in, not across the combined list:
    // when the sections are split, jumping over entries of the other category changes the
    // combined index without moving the card on screen.
    const sameGrid = (entry: MediaEntry) =>
      !separateEntries || (config.isCaughtUp(entry) ? "caughtUp" : "behind") === category

    return (
      orderedSorted.filter(sameGrid).findIndex((entry) => entry.id === entryId) !==
      sorted.filter(sameGrid).findIndex((entry) => entry.id === entryId)
    )
  }

  const openEntryPositionWillChange = useMemo(() => {
    if (!openEntry) return false
    return willEntryMove(openEntry.id, openEntry.category)
  }, [openEntry, orderedSorted, sorted, pendingRemovalId])

  const visible = useMemo(() => {
    return orderedSorted.filter((entry) => entry.id !== exitingId?.id)
  }, [orderedSorted, exitingId?.id])

  const caughtUp = useMemo(() => {
    return separateEntries ? visible.filter((entry) => categoryOf(entry) === "caughtUp") : []
  }, [separateEntries, visible, categoryOf])

  const behind = useMemo(() => {
    return separateEntries ? visible.filter((entry) => categoryOf(entry) === "behind") : visible
  }, [separateEntries, visible, categoryOf])

  const handleOpenChange = (entryId: number, isOpen: boolean) => {
    // Re-armed on both edges: the list only reshuffles on close, so the timer has to be
    // running from that moment, not from whenever the overlay happened to open.
    markAnimatingTarget(entryId)

    if (isOpen) {
      setOpenEntry((prev) => {
        if (prev?.id === entryId) return prev
        const entry = sorted.find((item) => item.id === entryId)
        if (!entry) return prev
        return { id: entryId, category: config.isCaughtUp(entry) ? "caughtUp" : "behind" }
      })
      return
    }

    if (pendingRemovalId === entryId) {
      removeFromLocalList(entryId)
      markDirty(config.statsKey)
      setPendingRemovalId(null)
      // Leaving the list is its own exit animation — no need to hide the slot first.
      setOpenEntry((prev) => (prev?.id === entryId ? null : prev))
      return
    }

    setOpenEntry((prev) => {
      if (prev?.id !== entryId) return prev

      if (willEntryMove(entryId, prev.category)) {
        setExitingId({ id: entryId, category: prev.category })
        if (exitTimeoutRef.current !== null) {
          window.clearTimeout(exitTimeoutRef.current)
        }
        exitTimeoutRef.current = window.setTimeout(() => {
          setExitingId((cur) => (cur?.id === entryId ? null : cur))
        }, 150)
      }

      return null
    })
  }

  if (viewerLoading || loading) return <StateMessage icon={Loader2} spin message={config.labels.loading} />
  if (viewerError || error)
    return (
      <StateMessage icon={AlertCircle} tone="error" message={getErrorMessage(viewerError || error, config.labels.error)} />
    )

  const updateLocalList = (entryId: number, updates: Record<string, unknown>) => {
    if (cachedList) {
      setList(
        config.listKey,
        cachedList.map((entry) => (entry.id === entryId ? { ...entry, ...updates } : entry))
      )
    }
  }

  const removeFromLocalList = (entryId: number) => {
    if (cachedList) {
      setList(
        config.listKey,
        cachedList.filter((entry) => entry.id !== entryId)
      )
    }
  }

  const handleProgressChange = (entry: MediaEntry, newProgress: number) => {
    markAnimatingTarget(entry.id)
    const clampedProgress = Math.min(Math.max(0, newProgress), entry.totalUnits || 9999)
    const finished = entry.totalUnits && clampedProgress >= entry.totalUnits

    updateLocalList(entry.id, { progress: clampedProgress })
    // Re-evaluated on every commit, so scrolling back below the total calls the removal off.
    setPendingRemovalId(finished && !manualCompletion ? entry.id : null)

    queueUpdate({ entryId: entry.id, progress: clampedProgress })

    if (finished && manualCompletion) {
      queueUpdate({ entryId: entry.id, status: "CURRENT" })
    }
  }

  const handleScoreChange = (entry: MediaEntry, score: number) => {
    markAnimatingTarget(entry.id)
    updateLocalList(entry.id, { score })
    queueUpdate({ entryId: entry.id, score })
  }

  const handleMarkCompleted = (entry: MediaEntry) => {
    markAnimatingTarget(entry.id)
    removeFromLocalList(entry.id)
    markDirty(config.statsKey)
    queueUpdate({ entryId: entry.id, status: "COMPLETED" })
  }

  const renderGrid = (list: MediaEntry[], title: string, category: Category | null) => {
    const hasVisibleContent = list.length > 0 || exitingId?.category === category

    return (
      <div className={hasVisibleContent ? "mb-6" : "hidden"}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg text-gray font-medium">
            {title} ({list.length})
          </h3>
        </div>
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {list.map((entry) => {
              const willMove = openEntry?.id === entry.id && openEntryPositionWillChange
              const isTarget = entry.id === animatingTargetId

              return (
                <motion.div
                  key={entry.id}
                  initial={isTarget ? { opacity: 0, y: -50, zIndex: 10 } : false}
                  animate={
                    isTarget
                      ? {
                          opacity: 1,
                          y: 0,
                          zIndex: 10,
                          transition: {
                            opacity: { duration: 0.15, ease: "easeOut" },
                            y: { duration: 0.25, ease: "easeOut", delay: 0.15 },
                            zIndex: { duration: 0 }
                          }
                        }
                      : { opacity: 1, y: 0, zIndex: 10, transition: { duration: 0 } }
                  }
                  exit={{
                    opacity: 0,
                    y: -36,
                    transition: { duration: willMove ? 0.2 : 0.18, ease: "easeIn" }
                  }}
                  transition={{ duration: 0 }}
                >
                  <MediaCard
                    entry={entry}
                    profileColor={profileColor}
                    scoreFormat={scoreFormat}
                    displayAdultContent={displayAdultContent}
                    onProgressChange={(progress) => handleProgressChange(entry, progress)}
                    onScoreChange={(score) => handleScoreChange(entry, score)}
                    onMarkCompleted={() => handleMarkCompleted(entry)}
                    onOpenChange={(isOpen) => handleOpenChange(entry.id, isOpen)}
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

  return (
    <div className="px-5 py-4 flex-1 flex flex-col">
      {sorted.length === 0 ? (
        <StateMessage
          icon={config.emptyIcon}
          title={config.labels.emptyTitle}
          message={config.labels.emptyMessage}
        />
      ) : separateEntries ? (
        <>
          {renderGrid(behind, config.labels.behind, "behind")}
          {renderGrid(caughtUp, config.labels.caughtUp, "caughtUp")}
        </>
      ) : (
        renderGrid(visible, config.labels.all, null)
      )}
    </div>
  )
}
