import React, { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence } from "framer-motion"
import { Check } from "lucide-react"
import { MediaCardOverlay } from "./MediaCardOverlay"
import { notifyCardOpened, notifyCardClosed } from "../lib/syncQueue"
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
  // false for the "Compact" density — same row, minus the cover thumbnail,
  // so it takes noticeably less vertical space per entry.
  showImage?: boolean
}

// The "List"/"Compact" density options, styled after AniList's own mobile
// app. Rows are a fixed height (h-20 with an image, sized around the cover
// art's natural 2:3 portrait aspect so it's never cropped; h-11 without one)
// so the list reads as a consistent grid regardless of title length — long
// titles truncate with an ellipsis instead of wrapping and stretching that
// row taller than its neighbors. Compact drops the thumbnail and uses
// smaller text/tighter row height for a denser list, matching AniList's own
// compact view.
export const MediaListRow: React.FC<Props> = ({
  entry,
  profileColor,
  scoreFormat,
  displayAdultContent,
  onProgressChange,
  onScoreChange,
  onMarkCompleted,
  maxProgressFallback,
  showImage = true
}) => {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    notifyCardOpened()
    return () => notifyCardClosed()
  }, [isOpen])

  if (entry.isAdult && !displayAdultContent) {
    return null
  }

  const showCompletionButton = entry.totalUnits !== null && entry.progress >= entry.totalUnits

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className={`relative flex items-center gap-2.5 bg-white-100 rounded-xl overflow-hidden pr-3 shadow-sm cursor-pointer ${
          // Row height/padding unchanged from before (75px row, 5px top,
          // bottom, and left) — the more aggressive crop below is absorbed
          // by enlarging the image's width instead of resizing its frame.
          showImage ? "h-[75px] pl-[5px]" : "h-11 pl-3"
        }`}
      >
        {showImage && (
          // Base cover box is 48x72 (2:3). Trimming 10% off the top and
          // 10% off the bottom crops it to an effective 48x57.6 (5:6)
          // slice; scaling that proportionally back up to the same 65px
          // target height as before (so the row/padding stay identical)
          // gives width = 65 * (48/57.6) ≈ 54px — wider than the original
          // 48px, since a more zoomed-in crop needs more width to fill the
          // same height at its new aspect ratio.
          <img src={entry.cover} alt="" className="w-[54px] h-[65px] rounded-md object-cover shrink-0" />
        )}

        {/* pr-6 reserves room for the mark-completed checkmark, but only
            when it's actually showing — most rows never display it, and
            reserving that space unconditionally left a large dead gap
            after "Progress: …" on every other row. */}
        <div className={`flex-1 min-w-0 ${showCompletionButton ? "pr-6" : "pr-0"}`}>
          {/* List: reserve a fixed 2-line box (h-10) regardless of actual
              line count, so a short title and a long one leave the meta
              line sitting at the same offset. Centering the actual text
              within that box needs a real flex container (justify-center on
              a column flex) — line-clamp's own -webkit-box only behaves
              like a flex container while it's actively clamping (2 lines);
              for shorter titles Chrome computes it as a plain block instead
              (confirmed via computed `display: flow-root`), silently
              ignoring -webkit-box-pack, so that approach doesn't work for
              exactly the case we need it for. Compact stays single-line
              truncate, it's the dense mode. */}
          <div className={showImage ? "h-10 flex flex-col justify-center" : undefined}>
            <h4
              className={
                showImage
                  ? "font-semibold text-gray leading-tight line-clamp-2 text-base"
                  : "font-semibold text-gray truncate text-xs"
              }
            >
              {entry.title}
            </h4>
          </div>
          <div className={`flex items-center text-gray/70 ${showImage ? "text-sm mt-1.5" : "text-[10px] mt-0.5"}`}>
            {entry.score > 0 && (
              <span>
                Score: <span style={{ color: profileColor }}>{entry.score}</span>
              </span>
            )}
            {/* ml-auto (not justify-between) so Progress stays pinned to
                the right edge even when Score is the only other item, or
                absent entirely — justify-between would otherwise collapse
                a lone child to the left, shifting Progress's position
                depending on whether a score is set. */}
            <span className="ml-auto whitespace-nowrap">
              Progress:{" "}
              {/* Left-aligned within a reserved min-width slot — a single
                  space always separates "Progress:" from the value, and any
                  leftover slot width just becomes trailing blank space to
                  the right (acceptable) instead of pushing the value away
                  from the label like right-aligning it did. */}
              <span className="inline-block min-w-[2.75em]" style={{ color: profileColor }}>
                {entry.progress}
                {entry.totalUnits && `/${entry.totalUnits}`}
              </span>
            </span>
          </div>
        </div>

        {showCompletionButton && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMarkCompleted()
            }}
            className="absolute top-1/2 -translate-y-1/2 right-2.5 w-6 h-6 flex items-center justify-center rounded-full text-white-100 shrink-0"
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
