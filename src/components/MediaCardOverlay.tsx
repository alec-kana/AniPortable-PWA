import React, { useEffect, useRef } from "react"
import { flushSync } from "react-dom"
import { motion } from "framer-motion"
import { Check } from "lucide-react"
import { NumberWheel, type NumberWheelHandle } from "./NumberWheel"
import { getMaxScore, getScoreStep, type MediaEntry } from "../lib/types"

// Pinning the body holds the page still; clipping <html>, which is what scrolls here, would
// clamp its offset to 0 and jump the page to the top. Pinning zeroes that offset too, and
// Framer reads it both when it snapshots the card and when it measures the overlay — so the
// lock is taken in the card's click handler, before the snapshot, and released on unmount.
let pinnedScrollY: number | null = null
let previousHtmlStyle: string | null = null
let previousBodyStyle: string | null = null

export function lockPageScroll(): void {
  if (pinnedScrollY !== null) return

  const { documentElement: html, body } = document
  const scrollbarWidth = window.innerWidth - html.clientWidth
  pinnedScrollY = window.scrollY
  previousHtmlStyle = html.getAttribute("style")
  previousBodyStyle = body.getAttribute("style")

  html.style.overflow = "hidden"
  body.style.position = "fixed"
  body.style.top = `-${pinnedScrollY}px`
  body.style.left = "0"
  body.style.width = "100%"
  body.style.paddingRight = `${scrollbarWidth}px`
}

function unlockPageScroll(): void {
  if (pinnedScrollY === null) return

  const restore = (el: HTMLElement, previous: string | null) => {
    if (previous === null) el.removeAttribute("style")
    else el.setAttribute("style", previous)
  }

  restore(document.documentElement, previousHtmlStyle)
  restore(document.body, previousBodyStyle)
  window.scrollTo(0, pinnedScrollY)
  pinnedScrollY = null
}

type Props = {
  layoutId: string
  entry: MediaEntry
  profileColor: string
  scoreFormat: string
  positionWillChange?: boolean
  onProgressChange: (progress: number) => void
  onScoreChange: (score: number) => void
  onMarkCompleted: () => void
  onClose: () => void
}

export const MediaCardOverlay: React.FC<Props> = ({
  layoutId,
  entry,
  profileColor,
  scoreFormat,
  positionWillChange = false,
  onProgressChange,
  onScoreChange,
  onMarkCompleted,
  onClose
}) => {
  const progressWheel = useRef<NumberWheelHandle>(null)
  const scoreWheel = useRef<NumberWheelHandle>(null)

  useEffect(() => {
    lockPageScroll()
    return unlockPageScroll
  }, [])

  // Synchronous so positionWillChange reflects the committed value before onClose reads it.
  const closeAfterCommit = () => {
    flushSync(() => {
      progressWheel.current?.flush()
      scoreWheel.current?.flush()
    })
    onClose()
  }

  const maxScore = getMaxScore(scoreFormat)
  const scoreStep = getScoreStep(scoreFormat)
  // No known total (ongoing series) — give the wheel an open-ended range.
  const maxProgress = Math.max(entry.totalUnits ?? 9999, entry.progress)
  const showCompletionButton = entry.totalUnits !== null && entry.progress >= entry.totalUnits

  // Scrolling stops at the latest aired episode, but only as a cap on *increases*.
  const latestReleasedEpisode = entry.nextAiringEpisode !== null ? entry.nextAiringEpisode - 1 : null
  const progressMaxSelectable =
    latestReleasedEpisode !== null
      ? Math.max(Math.min(latestReleasedEpisode, maxProgress), entry.progress)
      : undefined

  const cardChildren = (
    <>
      {showCompletionButton && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onMarkCompleted()
          }}
          className="absolute top-3 left-3 right-3 flex items-center justify-center gap-1.5 text-white-100 px-2 py-2 rounded-lg text-sm font-medium shadow-lg"
          style={{ backgroundColor: profileColor }}
        >
          <Check size={16} />
          Mark as Completed
        </button>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-4">
        <h4 className="font-medium text-sm leading-snug mb-3 text-white line-clamp-2">{entry.title}</h4>

        <div className="flex items-end justify-between">
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wide text-white/60 mb-1">
              Progress{entry.totalUnits ? ` / ${entry.totalUnits}` : ""}
            </span>
            <NumberWheel
              ref={progressWheel}
              value={entry.progress}
              min={0}
              max={maxProgress}
              maxSelectable={progressMaxSelectable}
              step={1}
              onChange={onProgressChange}
              color={profileColor}
              width={64}
            />
          </div>

          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wide text-white/60 mb-1">Score / {maxScore}</span>
            <NumberWheel
              ref={scoreWheel}
              value={entry.score}
              min={0}
              max={maxScore}
              step={scoreStep}
              onChange={onScoreChange}
              color={profileColor}
              width={64}
              formatValue={(v) => (scoreStep === 0.1 ? v.toFixed(1) : v.toString())}
            />
          </div>
        </div>
      </div>
    </>
  )

  const cardClassName =
    "relative z-10 w-full max-w-[300px] sm:max-w-[380px] md:max-w-[460px] lg:max-w-[560px] xl:max-w-[640px] max-h-[85vh] aspect-[3/4] overflow-hidden rounded-xl shadow-2xl"
  const cardStyle = {
    backgroundImage: `url(${entry.cover})`,
    backgroundSize: "cover",
    backgroundPosition: "center"
  } as const

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, pointerEvents: "none" }}
    >
      <motion.div
        className="absolute inset-0 bg-black/70"
        onClick={closeAfterCommit}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, pointerEvents: "none" }}
      />

      {/* One element whichever way it leaves — swapping between two mid-interaction remounts the
          shared-layout node and replays the opening morph. `exit` only runs on the way out, so a
          card leaving its slot lifts away instead of morphing back into nothing. */}
      <motion.div
        layoutId={layoutId}
        onClick={(e) => e.stopPropagation()}
        className={cardClassName}
        style={cardStyle}
        exit={positionWillChange ? { opacity: 0, y: -24, transition: { duration: 0.125, ease: "easeIn" } } : undefined}
      >
        {cardChildren}
      </motion.div>
    </motion.div>
  )
}
