import type { AppTask } from '@/types/clickup'
import { isBlockedTask, isDoneTask } from './aggregate'
import type { RoadmapDeliverable, RoadmapGoal } from './types'

export interface OverallHealth {
  totalCount: number
  doneCount: number
  blockedCount: number
  inProgressCount: number
  totalHours: number
  weightedCompletion: number
}

export function computeOverallHealth(goals: RoadmapGoal[]): OverallHealth {
  const totalCount = goals.reduce((sum, g) => sum + g.totalCount, 0)
  const doneCount = goals.reduce((sum, g) => sum + g.doneCount, 0)
  const blockedCount = goals.reduce((sum, g) => sum + g.blockedCount, 0)
  const totalHours = goals.reduce((sum, g) => sum + g.totalHours, 0)
  return {
    totalCount,
    doneCount,
    blockedCount,
    inProgressCount: Math.max(0, totalCount - doneCount - blockedCount),
    totalHours,
    weightedCompletion: totalCount > 0 ? doneCount / totalCount : 0,
  }
}

export interface GroupCompletionStats {
  totalCount: number
  completedCount: number
  inProgressCount: number
  completedPct: number
  inProgressPct: number
}

function summarizeGroupCompletion(groups: Array<{ doneCount: number; totalCount: number }>): GroupCompletionStats {
  const totalCount = groups.length
  const completedCount = groups.filter((g) => g.totalCount > 0 && g.doneCount === g.totalCount).length
  const inProgressCount = totalCount - completedCount
  return {
    totalCount,
    completedCount,
    inProgressCount,
    completedPct: totalCount > 0 ? completedCount / totalCount : 0,
    inProgressPct: totalCount > 0 ? inProgressCount / totalCount : 0,
  }
}

export function computeGoalCompletionStats(goals: RoadmapGoal[]): GroupCompletionStats {
  return summarizeGroupCompletion(goals)
}

export function computeDeliverableCompletionStats(goals: RoadmapGoal[]): GroupCompletionStats {
  const deliverables: RoadmapDeliverable[] = goals.flatMap((g) => g.deliverables)
  return summarizeGroupCompletion(deliverables)
}

const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low'] as const

export function computePriorityDistribution(tasks: AppTask[]): Array<{ priority: string; count: number }> {
  const counts = new Map<string, number>()
  for (const task of tasks) {
    const key = task.priority ?? 'none'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...PRIORITY_ORDER, 'none']
    .filter((p) => counts.has(p))
    .map((priority) => ({ priority, count: counts.get(priority)! }))
}

// Re-exported so Executive/Resources components don't need to reach into aggregate.ts directly.
export { isBlockedTask, isDoneTask }
