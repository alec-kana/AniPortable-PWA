import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"

export type NumberWheelHandle = { flush: () => void }

type Props = {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  color: string
  disabled?: boolean
  formatValue?: (value: number) => string
  width?: number
  // Caps how far scrolling can reach, independent of `max`: an airing show
  // renders all 12 episode rows but can't scroll past the 4 that have aired.
  maxSelectable?: number
}

const ROW_HEIGHT = 30
const VISIBLE_ROWS = 3
const SETTLE_DELAY_MS = 120
// Rows kept mounted either side of the current position — ranges run up to
// 9999, so only a window around scrollIndex is ever in the DOM.
const WINDOW_RADIUS = 20

function decimalsOf(step: number): number {
  const str = step.toString()
  const dot = str.indexOf(".")
  return dot === -1 ? 0 : str.length - dot - 1
}

// Scrolling number picker with tap-to-type for large jumps. Built on native
// CSS scroll-snap, so momentum comes free — we only read where it settles.
export const NumberWheel = forwardRef<NumberWheelHandle, Props>(function NumberWheel(
  { value, min, max, step = 1, onChange, color, disabled, formatValue, width = 56, maxSelectable },
  ref
) {
  const decimals = useMemo(() => decimalsOf(step), [step])
  const values = useMemo(() => {
    const count = Math.round((max - min) / step) + 1
    return Array.from({ length: count }, (_, i) => +(min + i * step).toFixed(decimals))
  }, [min, max, step, decimals])

  const indexOf = (v: number) => {
    const idx = Math.round((v - min) / step)
    return Math.min(Math.max(idx, 0), values.length - 1)
  }

  const maxSelectableIndex =
    maxSelectable !== undefined ? Math.min(indexOf(maxSelectable), values.length - 1) : values.length - 1

  const containerRef = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingIndex = useRef<number | null>(null)
  const isProgrammaticScroll = useRef(false)
  const [scrollIndex, setScrollIndex] = useState(indexOf(value))
  const [editing, setEditing] = useState(false)
  const [tempValue, setTempValue] = useState(value.toString())

  const scrollToIndex = (idx: number, smooth: boolean) => {
    const el = containerRef.current
    if (!el) return
    isProgrammaticScroll.current = true
    el.scrollTo({ top: idx * ROW_HEIGHT, behavior: smooth ? "smooth" : "instant" })
    // Some browsers fire a scroll event even for "instant" — release next frame.
    requestAnimationFrame(() => {
      isProgrammaticScroll.current = false
    })
  }

  // Resync when `value` changes from outside (e.g. the tap-to-type input).
  useEffect(() => {
    const idx = indexOf(value)
    setScrollIndex(idx)
    scrollToIndex(idx, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Commits whatever the wheel last landed on, cancelling the settle wait. Callers
  // closing the overlay use this so the edit is in state before they act on it.
  const commitPending = () => {
    if (settleTimer.current) {
      clearTimeout(settleTimer.current)
      settleTimer.current = null
    }
    const idx = pendingIndex.current
    pendingIndex.current = null
    if (idx === null) return
    const settledValue = values[idx]
    if (settledValue !== value) onChange(settledValue)
  }

  const commitPendingRef = useRef(commitPending)
  commitPendingRef.current = commitPending

  useImperativeHandle(ref, () => ({ flush: () => commitPendingRef.current() }), [])

  const handleScroll = () => {
    if (isProgrammaticScroll.current) return
    const el = containerRef.current
    if (!el) return
    // Clamped to maxSelectableIndex, not values.length-1 — scrolling past
    // an unreleased episode just snaps back to the latest one you can
    // actually be caught up to.
    const idx = Math.min(Math.max(Math.round(el.scrollTop / ROW_HEIGHT), 0), maxSelectableIndex)
    setScrollIndex(idx)
    pendingIndex.current = idx

    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      scrollToIndex(idx, true)
      commitPendingRef.current()
    }, SETTLE_DELAY_MS)
  }

  useEffect(() => {
    return () => commitPendingRef.current()
  }, [])

  const startEditing = () => {
    if (disabled) return
    setTempValue(value.toString())
    setEditing(true)
  }

  const commitEdit = () => {
    const parsed = parseFloat(tempValue)
    if (!isNaN(parsed)) {
      // Capped at the same row scrolling stops on, not `max` — typing was the one
      // way past an unreleased episode.
      const clamped = Math.min(Math.max(parsed, min), values[maxSelectableIndex])
      const snapped = +(Math.round((clamped - min) / step) * step + min).toFixed(decimals)
      if (snapped !== value) onChange(snapped)
    }
    setEditing(false)
  }

  const cancelEdit = () => {
    setTempValue(value.toString())
    setEditing(false)
  }

  const display = (v: number) => (formatValue ? formatValue(v) : v.toString())

  const windowStart = Math.max(0, scrollIndex - WINDOW_RADIUS)
  const windowEnd = Math.min(values.length - 1, scrollIndex + WINDOW_RADIUS)

  return (
    <div
      className="relative select-none"
      style={{ height: ROW_HEIGHT * VISIBLE_ROWS, width }}
    >
      {/* Fades the top/bottom rows out, drawing the eye to the centered value */}
      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          maskImage: "linear-gradient(to bottom, transparent, black 35%, black 65%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 35%, black 65%, transparent)"
        }}
      />
      {/* Center-row highlight band */}
      <div
        className="pointer-events-none absolute left-0 right-0 rounded-md"
        style={{
          top: ROW_HEIGHT,
          height: ROW_HEIGHT,
          backgroundColor: `${color}26`
        }}
      />
      <div
        ref={containerRef}
        onScroll={handleScroll}
        onClick={(e) => {
          // A tap that didn't cause a drag lands here — treat it as
          // "edit this value" regardless of which row was tapped.
          e.stopPropagation()
          startEditing()
        }}
        className={`h-full overflow-y-auto no-scrollbar ${disabled ? "pointer-events-none opacity-50" : ""}`}
        style={{
          scrollSnapType: "y mandatory",
          touchAction: "pan-y",
          overscrollBehavior: "contain",
          visibility: editing ? "hidden" : "visible"
        }}
      >
        {/* Sized to the full range so scrollHeight/scrollbar math stays
            correct, but only the windowed rows below are actually mounted. */}
        <div style={{ position: "relative", height: (values.length + 2) * ROW_HEIGHT }}>
          {Array.from({ length: windowEnd - windowStart + 1 }, (_, offset) => {
            const i = windowStart + offset
            const v = values[i]
            const isUnreleased = i > maxSelectableIndex
            return (
              <div
                key={v}
                className="absolute left-0 right-0 flex items-center justify-center transition-opacity"
                style={{
                  top: (i + 1) * ROW_HEIGHT,
                  height: ROW_HEIGHT,
                  scrollSnapAlign: "center",
                  fontSize: i === scrollIndex ? 15 : 12,
                  fontWeight: i === scrollIndex ? 700 : 400,
                  // Unreleased episodes stay visible (so the wheel still
                  // hints at the real total) but read as clearly disabled —
                  // muted gray instead of white, and dimmer than a normal
                  // off-center row.
                  color: isUnreleased ? "rgba(255,255,255,0.35)" : "#ffffff",
                  opacity: isUnreleased ? 1 : i === scrollIndex ? 1 : 0.55
                }}
              >
                {display(v)}
              </div>
            )
          })}
        </div>
      </div>

      {editing && (
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit()
            else if (e.key === "Escape") cancelEdit()
          }}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 right-0 z-20 bg-transparent text-center text-white text-base font-semibold border-b outline-none"
          style={{ top: ROW_HEIGHT, height: ROW_HEIGHT, borderBottomColor: color }}
        />
      )}
    </div>
  )
})
