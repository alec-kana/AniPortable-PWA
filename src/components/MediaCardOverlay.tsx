import React from "react"
import { motion } from "framer-motion"
import { Check } from "lucide-react"
import { NumberWheel } from "./NumberWheel"
import { getMaxScore, getScoreStep, type MediaEntry } from "../lib/types"

type Props = {
  layoutId: string
  entry: MediaEntry
  profileColor: string
  scoreFormat: string
  positionWillChange?: boolean
  onProgressChange: (progress: number) => void
  onScoreChange: (score: number) => void
  onMarkCompleted: () => void
  onClose: () => void
  maxProgressFallback?: number
}

export const MediaCardOverlay: React.FC<Props> = ({
  layoutId,
  entry,
  profileColor,
  scoreFormat,
  positionWillChange = false,
  onProgressChange,
  onScoreChange,
  onMarkCompleted,
  onClose,
  maxProgressFallback = 9999
}) => {
  const maxScore = getMaxScore(scoreFormat)
  const scoreStep = getScoreStep(scoreFormat)
  const maxProgress = entry.totalUnits ?? maxProgressFallback
  const showCompletionButton = entry.totalUnits !== null && entry.progress >= entry.totalUnits

  const latestReleasedEpisode = entry.nextAiringEpisode !== null ? entry.nextAiringEpisode - 1 : null
  const progressMaxSelectable =
    latestReleasedEpisode !== null ? Math.min(latestReleasedEpisode, maxProgress) : undefined

  const cardChildren = (
    <>
      {showCompletionButton && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onMarkCompleted()
          }}
          className="absolute top-3 left-3 right-3 flex items-center justify-center gap-1.5 text-white-100 px-2 py-2 rounded-lg text-sm font-medium shadow-lg"
          style={{ backgroundColor: profileColor }}
        >
          <Check size={16} />
          Mark as Completed
        </button>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-4">
        <h4 className="font-medium text-sm leading-snug mb-3 text-white line-clamp-2">{entry.title}</h4>

        <div className="flex items-end justify-between">
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wide text-white/60 mb-1">
              Progress{entry.totalUnits ? ` / ${entry.totalUnits}` : ""}
            </span>
            <NumberWheel
              value={entry.progress}
              min={0}
              max={maxProgress}
              maxSelectable={progressMaxSelectable}
              step={1}
              onChange={onProgressChange}
              color={profileColor}
              width={64}
            />
          </div>

          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-wide text-white/60 mb-1">Score / {maxScore}</span>
            <NumberWheel
              value={entry.score}
              min={0}
              max={maxScore}
              step={scoreStep}
              onChange={onScoreChange}
              color={profileColor}
              width={64}
              formatValue={(v) => (scoreStep === 0.1 ? v.toFixed(1) : v.toString())}
            />
          </div>
        </div>
      </div>
    </>
  )

  const cardClassName =
    "relative z-10 w-full max-w-[300px] sm:max-w-[380px] md:max-w-[460px] lg:max-w-[560px] xl:max-w-[640px] max-h-[85vh] aspect-[3/4] overflow-hidden rounded-xl shadow-2xl"
  const cardStyle = {
    backgroundImage: `url(${entry.cover})`,
    backgroundSize: "cover",
    backgroundPosition: "center"
  } as const

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, pointerEvents: "none" }}
    >
      <motion.div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, pointerEvents: "none" }}
      />

      {positionWillChange ? (
        <motion.div
          key="moving"
          onClick={(e) => e.stopPropagation()}
          className={cardClassName}
          style={cardStyle}
          exit={{ opacity: 0, y: -24, transition: { duration: 0.125, ease: "easeIn" } }}
        >
          {cardChildren}
        </motion.div>
      ) : (
        <motion.div key="normal" layoutId={layoutId} onClick={(e) => e.stopPropagation()} className={cardClassName} style={cardStyle}>
          {cardChildren}
        </motion.div>
      )}
    </motion.div>
  )
}
