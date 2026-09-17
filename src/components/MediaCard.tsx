import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence, useIsPresent } from "framer-motion"
import { Check } from "lucide-react"
import { MediaCardOverlay } from "./MediaCardOverlay"
import { notifyCardOpened, notifyCardClosed } from "../lib/syncQueue"
import type { MediaEntry } from "../lib/types"

// Covers already fetched this session, so a card remounting into a slot it has held before
// paints from the first render instead of blanking for a frame.
const loadedCovers = new Set<string>()

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
  const [cover, setCover] = useState(() => (loadedCovers.has(entry.cover) ? entry.cover : null))
  const slotRef = useRef<HTMLDivElement>(null)
  const [morphing, setMorphing] = useState(false)
  const [closing, setClosing] = useState(false)
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

  // The grid renders every entry, so left to the background-image a long list asks for every
  // cover at once and iOS drops the ones it can't keep up with — and a background-image that
  // failed never asks again, leaving the slot blank until the card is opened. Hold each request
  // until the card is near the viewport, and retry the ones that do fail.
  useEffect(() => {
    const slot = slotRef.current
    if (!entry.cover || !slot) return

    let cancelled = false
    let attempt = 0
    let retryTimer = 0

    const load = () => {
      const img = new Image()
      img.onload = () => {
        if (cancelled) return
        loadedCovers.add(entry.cover)
        setCover(entry.cover)
      }
      img.onerror = () => {
        if (cancelled || ++attempt >= 3) return
        retryTimer = window.setTimeout(load, attempt * 1000)
      }
      img.src = entry.cover
    }

    const observer = new IntersectionObserver(
      ([slotEntry]) => {
        if (!slotEntry.isIntersecting) return
        observer.disconnect()
        load()
      },
      { rootMargin: "600px" }
    )
    observer.observe(slot)

    return () => {
      cancelled = true
      observer.disconnect()
      window.clearTimeout(retryTimer)
    }
  }, [entry.cover])

  // Layout animation is only wanted for the morph to/from the overlay — left on, it would also
  // slide the card across a list reorder. A card already moving has no morph back to protect.
  useEffect(() => {
    if (positionWillChange) setMorphing(false)
    else if (isOpen) setMorphing(true)
  }, [isOpen, positionWillChange])

  if (entry.isAdult && !displayAdultContent) {
    return null
  }

  const showCompletionButton = entry.totalUnits !== null && entry.progress >= entry.totalUnits
  // Taking the cover back before the overlay has left remounts the shared-layout element, and
  // the overlay morphs back into the slot for a frame.
  const hideCover =
    isOpen || (closing && positionWillChange) || (!isPresent && wasOpenBeforeExit.current)

  return (
    <>
      {hideCover ? (
        <div ref={slotRef} className="w-full aspect-[3/4]" aria-hidden />
      ) : (
        <motion.div
          ref={slotRef}
          layoutId={layoutId}
          transition={morphing && !positionWillChange ? undefined : { layout: { duration: 0 } }}
          onLayoutAnimationComplete={() => setMorphing(false)}
          onClick={() => isPresent && setIsOpen(true)}
          className="relative w-full aspect-[3/4] overflow-hidden rounded-lg shadow-md cursor-pointer"
          style={{
            backgroundImage: cover ? `url(${cover})` : undefined,
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
        <AnimatePresence onExitComplete={() => setClosing(false)}>
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
                setClosing(true)
                setIsOpen(false)
              }}
              onClose={() => {
                setClosing(true)
                setIsOpen(false)
              }}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
