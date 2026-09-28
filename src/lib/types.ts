// Shared shape for both anime (episodes) and manga (chapters) list entries.
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
}

const MAX_SCORES: Record<string, number> = {
  POINT_100: 100,
  POINT_10_DECIMAL: 10,
  POINT_10: 10,
  POINT_5: 5,
  POINT_3: 3
}

export function getMaxScore(scoreFormat: string): number {
  return MAX_SCORES[scoreFormat] ?? 100
}

export function getScoreStep(scoreFormat: string): number {
  return scoreFormat === "POINT_10_DECIMAL" ? 0.1 : 1
}
