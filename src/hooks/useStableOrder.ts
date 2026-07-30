import { useEffect, useState } from "react"

export function useStableOrder<T extends { id: number }>(liveList: T[], frozen: boolean): T[] {
  const liveIds = liveList.map((item) => item.id)
  const liveKey = liveIds.join(",")
  const [frozenIds, setFrozenIds] = useState<number[]>(liveIds)

  useEffect(() => {
    if (!frozen) {
      setFrozenIds(liveIds)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, frozen])

  if (!frozen) {
    return liveList
  }

  const byId = new Map(liveList.map((item) => [item.id, item]))
  const liveIndexById = new Map(liveIds.map((id, index) => [id, index]))
  const frozenSet = new Set(frozenIds)

  const result = frozenIds.filter((id) => byId.has(id)).map((id) => byId.get(id)!)
  const newOnes = liveList.filter((item) => !frozenSet.has(item.id))

  for (const item of newOnes) {
    const liveIndex = liveIndexById.get(item.id)!
    const insertAt = result.findIndex((existing) => liveIndexById.get(existing.id)! > liveIndex)
    if (insertAt === -1) {
      result.push(item)
    } else {
      result.splice(insertAt, 0, item)
    }
  }

  return result
}
