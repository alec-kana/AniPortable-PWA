import React from "react"
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList } from "recharts"
import { Star, Frown, Meh, Smile } from "lucide-react"
import { useSettings } from "../contexts/SettingsContext"

type Props = {
  data: { score: number; count: number }[]
  allScores: number[]
}

const POINT_3_ICONS = [Frown, Meh, Smile]

// Renders the score axis in whatever notation the user's score format uses:
// stars, smileys, or plain numbers.
const CustomXAxisTick = ({ x, y, payload, scoreFormat }: any) => {
  const score = parseInt(payload.value)

  if (scoreFormat === 'POINT_5') {
    return (
      <g transform={`translate(${x},${y})`}>
        {[...Array(5)].map((_, index) => (
          <Star
            key={index}
            size={12}
            x={-30 + (index * 12)}
            y={0}
            fill={index < score ? '#fbbf24' : 'none'}
            strokeWidth={0.6}
          />
        ))}
      </g>
    )
  }

  if (scoreFormat === 'POINT_3') {
    const IconComponent = POINT_3_ICONS[score - 1] ?? Meh
    return (
      <g transform={`translate(${x},${y})`}>
        <IconComponent
          size={16}
          x={-8}
          y={-2}
        />
      </g>
    )
  }

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={10}
        textAnchor="middle"
        fill="#5c728a"
        fontSize={12}
        fontWeight="bold"
      >
        {payload.value}
      </text>
    </g>
  )
}

export const ScoreChart: React.FC<Props> = ({ data, allScores }) => {
  const { profileColor, scoreFormat } = useSettings()

  // Scores become strings so recharts treats the axis as categorical.
  const completeData = allScores.map(score => ({
    score: score.toString(),
    count: data.find(item => item.score === score)?.count ?? 0
  }))

  const calculatedWidth = Math.max(100, allScores.length * 40)
  const shouldScroll = allScores.length > 11
  const maxCount = completeData.length ? Math.max(...completeData.map(d => d.count)) : 0

  return (
    <div className="border rounded-xl border-white bg-white-100 m-4 shadow-lg overflow-hidden">
      <div className={`${shouldScroll ? 'overflow-x-auto' : ''}`}>
        <div className={`bg-white-100`}>
          <ResponsiveContainer
            width={shouldScroll ? calculatedWidth : "100%"}
            height={200}
          >
            <BarChart
              data={completeData}
              margin={{ top: 10, right: 10, bottom: 0, left: 10 }}
              style={{ outline: 'none', pointerEvents: 'none' }}
            >
              <YAxis
                allowDecimals={false}
                tick={false}
                axisLine={false}
                tickLine={false}
                width={0}
                // Floor of 1 so an all-zero filter (e.g. a year with no entries) doesn't
                // collapse the axis to [0, 0]
                domain={[0, Math.max(1, maxCount + Math.ceil(maxCount * 0.2))]}
              />
              <Bar
                dataKey="count"
                fill={profileColor}
                maxBarSize={25}
                radius={[5, 5, 0, 0]}
              >
                <LabelList
                  dataKey="count"
                  position="top"
                  offset={10}
                  textAnchor="middle"
                  formatter={(value: any) => value > 0 ? value : ''}
                  style={{ fill: '#5c728a', fontSize: 12, fontWeight: 'bold' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Separate chart so the axis labels can sit on their own gray band */}
        <div
          className="bg-[#e8edf3]"
          style={{ width: shouldScroll ? `${calculatedWidth}px` : '100%' }}
        >
          <ResponsiveContainer
            width={shouldScroll ? calculatedWidth : "100%"}
            height={35}
          >
            <BarChart
              data={completeData}
              margin={{ top: 0, right: 10, bottom: 0, left: 10 }}
              style={{ outline: 'none', pointerEvents: 'none' }}
            >
              <XAxis
                dataKey="score"
                type="category"
                axisLine={false}
                tickLine={false}
                tick={(props) => <CustomXAxisTick {...props} scoreFormat={scoreFormat} />}
              />
              {/* Invisible bars keep the label spacing aligned with the chart above */}
              <Bar
                dataKey="count"
                fill="transparent"
                maxBarSize={25}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
