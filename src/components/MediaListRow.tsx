import React, { useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence } from "framer-motion"
import { Check } from "lucide-react"
import { MediaCardOverlay } from "./MediaCardOverlay"
import type { MediaEntry } from "../lib/types"

type Props = {
  entry: MediaEntry
  profileColor: string
  scoreFormat: string
  displayAdultContent: boolean
  onProgressChange: (progress: number) => void
  onScoreChange: (score: number) => void
  onMarkCompleted: () => void
  maxProgressFallback?: number
}

// The "List" density option: title/progress/score only, no cover image.
// Tapping a row opens the same MediaCardOverlay used by MediaCard — there's
// no shared element to zoom from here, so the overlay's cover just fades in
// on open rather than growing out of a thumbnail, which reads as intentional
// rather than as a missing transition.
export const MediaListRow: React.FC<Props> = ({
  entry,
  profileColor,
  scoreFormat,
  displayAdultContent,
  onProgressChange,
  onScoreChange,
  onMarkCompleted,
  maxProgressFallback
}) => {
  const [isOpen, setIsOpen] = useState(false)

  if (entry.isAdult && !displayAdultContent) {
    return null
  }

  const showCompletionButton = entry.totalUnits !== null && entry.progress >= entry.totalUnits

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-white-100 shadow-sm cursor-pointer"
      >
        <span className="text-sm font-medium text-gray truncate flex-1">{entry.title}</span>
        <span className="text-xs whitespace-nowrap" style={{ color: profileColor }}>
          {entry.progress}
          {entry.totalUnits && `/${entry.totalUnits}`}
          {"  ·  "}
          {entry.score > 0 ? entry.score : "–"}
        </span>
        {showCompletionButton && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMarkCompleted()
            }}
            className="w-6 h-6 flex items-center justify-center rounded-full text-white-100 shrink-0"
            style={{ backgroundColor: profileColor }}
            aria-label="Mark as completed"
          >
            <Check size={13} />
          </button>
        )}
      </div>

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <MediaCardOverlay
              layoutId={`media-row-${entry.id}`}
              entry={entry}
              profileColor={profileColor}
              scoreFormat={scoreFormat}
              onProgressChange={onProgressChange}
              onScoreChange={onScoreChange}
              onMarkCompleted={() => {
                onMarkCompleted()
                setIsOpen(false)
              }}
              onClose={() => setIsOpen(false)}
              maxProgressFallback={maxProgressFallback}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
