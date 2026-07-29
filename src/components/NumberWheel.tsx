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
}

const ROW_HEIGHT = 30
const VISIBLE_ROWS = 3
const SETTLE_DELAY_MS = 120

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
  width = 56
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
    const idx = Math.min(Math.max(Math.round(el.scrollTop / ROW_HEIGHT), 0), values.length - 1)
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
        className={`h-full overflow-y-auto ${disabled ? "pointer-events-none opacity-50" : ""}`}
        style={{
          scrollSnapType: "y mandatory",
          touchAction: "pan-y",
          overscrollBehavior: "contain",
          visibility: editing ? "hidden" : "visible"
        }}
      >
        <div style={{ height: ROW_HEIGHT }} />
        {values.map((v, i) => (
          <div
            key={v}
            className="flex items-center justify-center text-white transition-opacity"
            style={{
              height: ROW_HEIGHT,
              scrollSnapAlign: "center",
              fontSize: i === scrollIndex ? 15 : 12,
              fontWeight: i === scrollIndex ? 700 : 400,
              opacity: i === scrollIndex ? 1 : 0.55
            }}
          >
            {display(v)}
          </div>
        ))}
        <div style={{ height: ROW_HEIGHT }} />
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
