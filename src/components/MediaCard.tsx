import React, { useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
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

// Replaces the extension's hover-driven AnimeCard: tap opens a centered,
// backdropped overlay (MediaCardOverlay) via a Framer Motion shared layoutId
// transition instead of relying on :hover, which doesn't exist on touch.
// Mark-completed stays a directly-tappable button on the closed card itself
// (not gated behind opening the overlay), since it's the one action users
// are likely to repeat rapidly across many entries in a row.
export const MediaCard: React.FC<Props> = ({
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
  const layoutId = `media-card-${entry.id}`

  if (entry.isAdult && !displayAdultContent) {
    return null
  }

  const showCompletionButton = entry.totalUnits !== null && entry.progress >= entry.totalUnits

  return (
    <>
      {isOpen ? (
        <div className="w-full aspect-[3/4]" aria-hidden />
      ) : (
        <motion.div
          layoutId={layoutId}
          onClick={() => setIsOpen(true)}
          className="relative w-full aspect-[3/4] overflow-hidden rounded-lg shadow-md cursor-pointer"
          style={{
            backgroundImage: `url(${entry.cover})`,
            backgroundSize: "cover",
            backgroundPosition: "center"
          }}
        >
          {showCompletionButton && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMarkCompleted()
              }}
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-white-100 shadow-lg"
              style={{ backgroundColor: profileColor }}
              aria-label="Mark as completed"
            >
              <Check size={15} />
            </button>
          )}

          <div className="absolute bottom-0 left-0 right-0 bg-black/65 p-2.5">
            <h4 className="font-medium text-xs leading-tight mb-1 text-white line-clamp-2">
              {entry.title}
            </h4>
            <div className="flex items-center justify-between text-xs" style={{ color: profileColor }}>
              <span>
                {entry.progress}
                {entry.totalUnits && `/${entry.totalUnits}`}
              </span>
              <span>{entry.score > 0 ? entry.score : "–"}</span>
            </div>
          </div>
        </motion.div>
      )}

      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <MediaCardOverlay
              layoutId={layoutId}
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
