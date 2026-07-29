import React, { Suspense, lazy, useEffect, useState } from "react"
import { ApolloProvider } from "@apollo/client"
import { client } from "./apollo/client"
import { SettingsProvider, useSettings } from "./contexts/SettingsContext"
import { AniListDataProvider } from "./contexts/AniListDataContext"
import { AnimeTab } from "./components/AnimeTab"
import { MangaTab } from "./components/MangaTab"
import { SettingsTab } from "./components/SettingsTab"
import { LoginPage } from "./components/LoginPage"
import { BottomNav, type TabKey } from "./components/BottomNav"
import { useAuth } from "./hooks/useAuth"
import { handleAuthRedirect } from "./lib/auth"
import { SquareArrowOutUpRight, Loader2 } from "lucide-react"

// recharts (pulled in by StatsTab) is the single biggest contributor to the
// bundle — split it into its own chunk so it only loads once someone
// actually opens the Stats tab, keeping the initial mobile load light.
const StatsTab = lazy(() => import("./components/StatsTab").then((m) => ({ default: m.StatsTab })))

const TAB_DEFS: { key: TabKey; Component: React.FC }[] = [
  { key: "anime", Component: AnimeTab },
  { key: "manga", Component: MangaTab },
  { key: "stats", Component: StatsTab },
  { key: "settings", Component: SettingsTab }
]

function AppContent() {
  const [selectedKey, setSelectedKey] = useState<TabKey>("anime")
  const { user } = useAuth()
  const { profileColor, tabVisibility } = useSettings()

  const visibleTabs = TAB_DEFS.filter(({ key }) => {
    if (key === "anime") return tabVisibility !== "manga"
    if (key === "manga") return tabVisibility !== "anime"
    return true
  })

  useEffect(() => {
    if (!visibleTabs.some(({ key }) => key === selectedKey)) {
      setSelectedKey(visibleTabs[0].key)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabVisibility])

  if (!user) {
    return <LoginPage />
  }

  const SelectedComponent = visibleTabs.find(({ key }) => key === selectedKey)?.Component

  return (
    <div className="min-h-screen flex flex-col">
      <div
        className="flex items-end justify-between pt-[calc(env(safe-area-inset-top)+1.25rem)] px-5 bg-gradient-to-b from-[#242538] to-[#12162a]"
      >
        <div className="flex items-end space-x-3 min-w-0 flex-1 pr-3">
          {user.avatar?.medium && (
            <img src={user.avatar.medium} alt="Avatar" className="w-14 h-14 rounded-sm object-cover shrink-0" />
          )}
          {user.name && (
            // mb-3 only on the text, not the avatar — the avatar should
            // still touch the bottom edge, but the text sitting right on
            // that same line reads as cramped, so it gets its own gap.
            <p className="text-white font-bold tracking-wide text-sm break-words min-w-0 leading-none mb-3">{user.name}</p>
          )}
        </div>

        <a
          href="https://anilist.co"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white flex items-center space-x-1.5 group transition-colors duration-200 shrink-0 whitespace-nowrap mb-3"
          style={{ '--profile-color': profileColor } as React.CSSProperties}
        >
          <span className="text-sm font-medium">AniList</span>
          <SquareArrowOutUpRight
            className="group-hover:[color:var(--profile-color)] transition-colors duration-200"
            size={15}
          />
        </a>
      </div>

      <div className="bg-white flex-1 flex flex-col pb-20">
        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-gray" size={24} /></div>}>
          {SelectedComponent && <SelectedComponent />}
        </Suspense>
      </div>

      <BottomNav
        tabs={visibleTabs.map(({ key }) => key)}
        selected={selectedKey}
        onSelect={setSelectedKey}
      />
    </div>
  )
}

function App() {
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    handleAuthRedirect().finally(() => setAuthChecked(true))
  }, [])

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="animate-spin text-gray" size={28} />
      </div>
    )
  }

  return (
    <ApolloProvider client={client}>
      <SettingsProvider>
        <AniListDataProvider>
          <AppContent />
        </AniListDataProvider>
      </SettingsProvider>
    </ApolloProvider>
  )
}

export default App
