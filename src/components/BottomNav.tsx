import React from "react"
import { Tv, BookOpen, BarChart3, Settings } from "lucide-react"
import { useSettings } from "../contexts/SettingsContext"

export type TabKey = "anime" | "manga" | "stats" | "settings"

const ICONS: Record<TabKey, React.ElementType> = {
  anime: Tv,
  manga: BookOpen,
  stats: BarChart3,
  settings: Settings
}

const LABELS: Record<TabKey, string> = {
  anime: "Anime",
  manga: "Manga",
  stats: "Stats",
  settings: "Settings"
}

type Props = {
  tabs: TabKey[]
  selected: TabKey
  onSelect: (key: TabKey) => void
}

export const BottomNav: React.FC<Props> = ({ tabs, selected, onSelect }) => {
  const { profileColor } = useSettings()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex bg-[#12162a] border-t border-white/10 pb-[env(safe-area-inset-bottom)]"
      style={{ '--profile-color': profileColor } as React.CSSProperties}
    >
      {tabs.map((key) => {
        const Icon = ICONS[key]
        const isSelected = selected === key
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors duration-200 ${
              isSelected ? '[color:var(--profile-color)]' : 'text-white/50'
            }`}
          >
            <Icon size={20} />
            {LABELS[key]}
          </button>
        )
      })}
    </nav>
  )
}
