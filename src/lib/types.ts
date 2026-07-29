// Shared shape for both anime (episodes) and manga (chapters) list entries.
// The extension's equivalent types both called this field `totalEpisodes`
// even for manga chapters — renamed here to avoid that leak now that anime
// and manga entries share one card/overlay implementation.
export type MediaEntry = {
  id: number
  title: string
  cover: string
  progress: number
  score: number
  totalUnits: number | null
  nextAiringEpisode: number | null
  isAdult: boolean
  updatedAt: string
  mediaId: number
}

export function getMaxScore(scoreFormat: string): number {
  switch (scoreFormat) {
    case "POINT_100":
      return 100
    case "POINT_10_DECIMAL":
      return 10
    case "POINT_10":
      return 10
    case "POINT_5":
      return 5
    case "POINT_3":
      return 3
    default:
      return 100
  }
}

export function getScoreStep(scoreFormat: string): number {
  return scoreFormat === "POINT_10_DECIMAL" ? 0.1 : 1
}
