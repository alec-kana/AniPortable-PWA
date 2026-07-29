import React from "react"
import { Rows3, List, LayoutGrid } from "lucide-react"
import type { CardDensity } from "../contexts/SettingsContext"

type Props = {
  value: CardDensity
  onChange: (density: CardDensity) => void
  profileColor: string
}

const OPTIONS: { value: CardDensity; Icon: typeof Rows3; label: string }[] = [
  { value: "list", Icon: Rows3, label: "List view" },
  { value: "compact", Icon: List, label: "Compact list view" },
  { value: "grid", Icon: LayoutGrid, label: "Grid view" }
]

// AniList-style view switcher, meant to sit in the page's top-right corner
// rather than buried in Settings — same persisted setting either way
// (SettingsContext + Storage), just a faster place to reach it from.
export const DensitySwitcher: React.FC<Props> = ({ value, onChange, profileColor }) => {
  return (
    <div className="flex items-center border border-gray/30 rounded-lg bg-white-100 p-[3px] gap-0.5">
      {OPTIONS.map(({ value: optionValue, Icon, label }) => (
        <button
          key={optionValue}
          type="button"
          aria-label={label}
          onClick={() => onChange(optionValue)}
          className="w-7 h-7 flex items-center justify-center rounded-md transition-colors duration-200"
          style={{
            backgroundColor: value === optionValue ? profileColor : "transparent",
            color: value === optionValue ? "#ffffff" : "#677b94"
          }}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  )
}
