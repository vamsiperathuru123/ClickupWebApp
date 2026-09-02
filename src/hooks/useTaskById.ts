import { useCacheStore } from '@/store/cacheStore'
import type { AppTask } from '@/types/clickup'

export function useTaskById(taskId: string | null): AppTask | null {
  return useCacheStore((s) => {
    if (!taskId) return null
    for (const entry of Object.values(s.tasks)) {
      const found = entry.data.find((t) => t.id === taskId)
      if (found) return found
    }
    return null
  })
}
