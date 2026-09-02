import { isBlockedTask, isDoneTask, isOnHoldTask } from './aggregate'
import type { RoadmapGoal, RoadmapTaskRow } from './types'

export const NO_FUNCTION_TAG_LABEL = '(No Function Tag)'

export interface FunctionTagGroup {
  name: string
  totalCount: number
  doneCount: number
  blockedCount: number
  onHoldCount: number
  totalHours: number
  totalCost: number
}

/** Groups already-aggregated Roadmap task rows by the "Function Tag" custom field,
 * for the report's Health/Cost/Hours-by-function breakdown. */
export function groupByFunctionTag(rows: RoadmapTaskRow[]): FunctionTagGroup[] {
  const byTag = new Map<string, FunctionTagGroup>()

  for (const row of rows) {
    const key = row.task.functionTag?.trim() || NO_FUNCTION_TAG_LABEL
    if (!byTag.has(key)) {
      byTag.set(key, { name: key, totalCount: 0, doneCount: 0, blockedCount: 0, onHoldCount: 0, totalHours: 0, totalCost: 0 })
    }
    const group = byTag.get(key)!
    group.totalCount += 1
    if (isDoneTask(row.task)) group.doneCount += 1
    if (isBlockedTask(row.task)) group.blockedCount += 1
    if (isOnHoldTask(row.task)) group.onHoldCount += 1
    group.totalHours += row.hoursSpent
    group.totalCost += row.cost
  }

  return Array.from(byTag.values()).sort((a, b) => {
    if (a.name === NO_FUNCTION_TAG_LABEL) return 1
    if (b.name === NO_FUNCTION_TAG_LABEL) return -1
    return a.name.localeCompare(b.name)
  })
}

export interface FunctionTagGoalBreakdown {
  name: string
  goalCount: number
  goalDoneCount: number
  goalBlockedCount: number
  goalOnHoldCount: number
}

/** Groups whole goals by every "Function Tag" their tasks touch (a goal with tasks
 * spanning more than one tag counts toward each of them — unlike a workflow status,
 * a task's function tag isn't mutually exclusive with another task's in the same
 * goal), for the Health-by-Function-Tag view's goal-level completion stats. A goal
 * counts as "done" for this purpose only when every one of its tasks is done
 * (goal.doneCount === goal.totalCount), same definition used everywhere else in the
 * report. */
export function computeFunctionTagGoalBreakdowns(goals: RoadmapGoal[]): FunctionTagGoalBreakdown[] {
  const byTag = new Map<string, FunctionTagGoalBreakdown>()

  for (const goal of goals) {
    const tasks = goal.deliverables.flatMap((d) => d.tasks.map((r) => r.task))
    const tagsInGoal = new Set(tasks.map((t) => t.functionTag?.trim() || NO_FUNCTION_TAG_LABEL))
    const isGoalDone = goal.totalCount > 0 && goal.doneCount === goal.totalCount

    for (const tag of tagsInGoal) {
      if (!byTag.has(tag)) byTag.set(tag, { name: tag, goalCount: 0, goalDoneCount: 0, goalBlockedCount: 0, goalOnHoldCount: 0 })
      const entry = byTag.get(tag)!
      entry.goalCount += 1
      if (isGoalDone) entry.goalDoneCount += 1
      if (goal.blockedCount > 0) entry.goalBlockedCount += 1
      if (goal.onHoldCount > 0) entry.goalOnHoldCount += 1
    }
  }

  return Array.from(byTag.values()).sort((a, b) => {
    if (a.name === NO_FUNCTION_TAG_LABEL) return 1
    if (b.name === NO_FUNCTION_TAG_LABEL) return -1
    return a.name.localeCompare(b.name)
  })
}
