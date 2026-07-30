import React from "react"
import { gql } from "@apollo/client"
import { BookOpen } from "lucide-react"
import { MediaListTab, type MediaListConfig } from "./MediaListTab"

const READING_LIST_QUERY = gql`
  query ($userId: Int) {
    MediaListCollection(userId: $userId, type: MANGA, status: CURRENT) {
      lists {
        entries {
          media {
            id
            title {
              english
              native
              romaji
            }
            isAdult
            coverImage {
              extraLarge
              large
            }
            chapters
          }
          progress
          score
          id
          updatedAt
        }
      }
    }
  }
`

const mangaConfig: MediaListConfig = {
  listQuery: READING_LIST_QUERY,
  listKey: "manga",
  statsKey: "mangaStats",
  unitsOf: (media) => ({
    totalUnits: media.chapters,
    nextAiringEpisode: null
  }),
  isCaughtUp: (entry) => !!(entry.totalUnits && entry.progress >= entry.totalUnits),
  emptyIcon: BookOpen,
  labels: {
    all: "Reading",
    behind: "Reading",
    caughtUp: "Completed",
    loading: "Loading your manga list...",
    error: "Error loading manga list.",
    emptyTitle: "No Manga In Progress",
    emptyMessage: "Manga you're currently reading will show up here."
  }
}

export const MangaTab: React.FC = () => <MediaListTab config={mangaConfig} />
