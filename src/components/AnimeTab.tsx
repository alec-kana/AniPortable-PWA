import React from "react"
import { gql } from "@apollo/client"
import { Tv } from "lucide-react"
import { MediaListTab, type MediaListConfig } from "./MediaListTab"

const WATCHING_LIST_QUERY = gql`
  query ($userId: Int) {
    MediaListCollection(userId: $userId, type: ANIME, status: CURRENT) {
      lists {
        entries {
          media {
            id
            title {
              english
              native
              romaji
            }
            nextAiringEpisode {
              episode
            }
            coverImage {
              extraLarge
              large
            }
            episodes
            isAdult
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

const animeConfig: MediaListConfig = {
  listQuery: WATCHING_LIST_QUERY,
  listKey: "anime",
  statsKey: "animeStats",
  unitsOf: (media) => ({
    totalUnits: media.episodes,
    nextAiringEpisode: media.nextAiringEpisode?.episode || null
  }),
  // Caught up either by finishing the show or by watching the latest episode
  // that has actually aired.
  isCaughtUp: (entry) =>
    !!(
      (entry.totalUnits && entry.progress === entry.totalUnits) ||
      (entry.nextAiringEpisode && entry.progress >= entry.nextAiringEpisode - 1)
    ),
  emptyIcon: Tv,
  labels: {
    all: "Watching",
    behind: "Behind",
    caughtUp: "Caught-Up",
    loading: "Loading your anime list...",
    error: "Error loading anime list.",
    emptyTitle: "No Anime In Progress",
    emptyMessage: "Anime you're currently watching will show up here."
  }
}

export const AnimeTab: React.FC = () => <MediaListTab config={animeConfig} />
