import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, useIsPresent } from "framer-motion"
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
  onOpenChange?: (isOpen: boolean) => void
  positionWillChange?: boolean
}

export const MediaCard: React.FC<Props> = ({
  entry,
  profileColor,
  scoreFormat,
  displayAdultContent,
  onProgressChange,
  onScoreChange,
  onMarkCompleted,
  onOpenChange,
  positionWillChange = false
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [morphing, setMorphing] = useState(false)
  const layoutId = `media-card-${entry.id}`
  const isPresent = useIsPresent()

  const wasOpenBeforeExit = useRef(isOpen)
  if (isPresent) {
    wasOpenBeforeExit.current = isOpen
  }

  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  useEffect(() => {
    return () => onOpenChangeRef.current?.(false)
  }, [])

  useEffect(() => {
    onOpenChange?.(isOpen)
    if (!isOpen) return

    notifyCardOpened()
    return () => notifyCardClosed()
  }, [isOpen])

  // Layout animation is only wanted while this card morphs to/from its overlay; outside that
  // it would also animate the card across a list reorder, which should be instant.
  useEffect(() => {
    if (isOpen) setMorphing(true)
  }, [isOpen])

  if (entry.isAdult && !displayAdultContent) {
    return null
  }

  const showCompletionButton = entry.totalUnits !== null && entry.progress >= entry.totalUnits
  const hideCover = isOpen || (!isPresent && wasOpenBeforeExit.current)

  return (
    <>
      {hideCover ? (
        <div className="w-full aspect-[3/4]" aria-hidden />
      ) : (
        <motion.div
          layoutId={layoutId}
          transition={morphing && !positionWillChange ? undefined : { layout: { duration: 0 } }}
          onLayoutAnimationComplete={() => setMorphing(false)}
          onClick={() => isPresent && setIsOpen(true)}
          className="relative w-full aspect-[3/4] overflow-hidden rounded-lg shadow-md cursor-pointer"
          style={{
            backgroundImage: `url(${entry.cover})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            pointerEvents: isPresent ? "auto" : "none"
          }}
        >
          {showCompletionButton && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (isPresent) onMarkCompleted()
              }}
              className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-white-100 shadow-lg"
              style={{ backgroundColor: profileColor }}
              aria-label="Mark as completed"
            >
              <Check size={15} />
            </button>
          )}

          <div className="absolute bottom-0 left-0 right-0 bg-black/65 p-2.5">
            <h4 className="font-medium text-xs leading-tight mb-1 text-white line-clamp-2">{entry.title}</h4>
            <div className="flex items-center justify-between text-xs" style={{ color: profileColor }}>
              <span>
                {entry.progress}
                {entry.totalUnits && `/${entry.totalUnits}`}
              </span>
              {entry.score > 0 && <span>{entry.score}</span>}
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
              positionWillChange={positionWillChange}
              onProgressChange={onProgressChange}
              onScoreChange={onScoreChange}
              onMarkCompleted={() => {
                onMarkCompleted()
                setIsOpen(false)
              }}
              onClose={() => setIsOpen(false)}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
