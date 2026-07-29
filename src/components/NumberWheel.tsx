import React, { useEffect, useMemo, useRef, useState } from "react"

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
  // Caps how far scrolling can actually reach, independent of `max` — e.g.
  // an airing show with 12 total episodes but only 4 released: `max` stays
  // 12 so all rows still render (context on what's coming), but scrolling
  // can't go past 4. Rows beyond it render dimmed. Defaults to `max` (no
  // separate cap) when omitted.
  maxSelectable?: number
}

const ROW_HEIGHT = 30
const VISIBLE_ROWS = 3
const SETTLE_DELAY_MS = 120
// How many rows to keep mounted on either side of the current position.
// Ranges can be huge (e.g. progress falls back to a 0-9999 range for an
// ongoing series with no known total, or a long-running manga's real
// chapter count), so only a small window around scrollIndex is ever
// rendered — the full `values` array stays a cheap number array, never DOM.
const WINDOW_RADIUS = 20

function decimalsOf(step: number): number {
  const str = step.toString()
  const dot = str.indexOf(".")
  return dot === -1 ? 0 : str.length - dot - 1
}

// A vertically scrolling number picker (tap-scrub for fine adjustment) with
// tap-to-type as a fallback for large jumps. Built on native CSS scroll-snap
// rather than hand-rolled drag physics — momentum/inertia comes for free
// from the browser, we only need to read where it settles.
export const NumberWheel: React.FC<Props> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  color,
  disabled,
  formatValue,
  width = 56,
  maxSelectable
}) => {
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
  const isProgrammaticScroll = useRef(false)
  const [scrollIndex, setScrollIndex] = useState(indexOf(value))
  const [editing, setEditing] = useState(false)
  const [tempValue, setTempValue] = useState(value.toString())

  const scrollToIndex = (idx: number, smooth: boolean) => {
    const el = containerRef.current
    if (!el) return
    isProgrammaticScroll.current = true
    el.scrollTo({ top: idx * ROW_HEIGHT, behavior: smooth ? "smooth" : "instant" })
    // scrollTo with behavior:"instant" still fires a scroll event on some
    // browsers — release the guard on the next frame either way.
    requestAnimationFrame(() => {
      isProgrammaticScroll.current = false
    })
  }

  // Keep the wheel synced when `value` changes from outside (e.g. the
  // tap-to-type input, or another client updating the same entry) — but not
  // while the user is actively mid-scroll.
  useEffect(() => {
    const idx = indexOf(value)
    setScrollIndex(idx)
    scrollToIndex(idx, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handleScroll = () => {
    if (isProgrammaticScroll.current) return
    const el = containerRef.current
    if (!el) return
    // Clamped to maxSelectableIndex, not values.length-1 — scrolling past
    // an unreleased episode just snaps back to the latest one you can
    // actually be caught up to.
    const idx = Math.min(Math.max(Math.round(el.scrollTop / ROW_HEIGHT), 0), maxSelectableIndex)
    setScrollIndex(idx)

    if (settleTimer.current) clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(() => {
      scrollToIndex(idx, true)
      const settledValue = values[idx]
      if (settledValue !== value) onChange(settledValue)
    }, SETTLE_DELAY_MS)
  }

  useEffect(() => {
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current)
    }
  }, [])

  const startEditing = () => {
    if (disabled) return
    setTempValue(value.toString())
    setEditing(true)
  }

  const commitEdit = () => {
    const parsed = parseFloat(tempValue)
    if (!isNaN(parsed)) {
      const clamped = Math.min(Math.max(parsed, min), max)
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
}
