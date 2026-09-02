import type { AppTask, ClickUpUser, TaskTimeSummary } from '@/types/clickup'
import { NO_DELIVERABLE_LABEL, NO_GOAL_LABEL, type RoadmapDeliverable, type RoadmapGoal, type RoadmapTaskRow } from './types'

export function isDoneTask(task: AppTask): boolean {
  return task.statusType === 'done' || task.statusType === 'closed'
}

export function isBlockedTask(task: AppTask): boolean {
  return task.status.trim().toLowerCase() === 'blocked'
}

export function isOnHoldTask(task: AppTask): boolean {
  return task.status.trim().toLowerCase() === 'on hold'
}

/** Returns the single value shared by every entry, or null if any entry is missing
 * it or they disagree — used to decide whether an Outcome hoists up a level instead
 * of repeating on every task underneath. */
function uniformValue(values: Array<string | null>): string | null {
  if (values.length === 0) return null
  const first = values[0]
  if (first == null) return null
  return values.every((v) => v === first) ? first : null
}

export function latestDueDate(tasks: AppTask[]): number | null {
  const dates = tasks.map((t) => t.dueDate).filter((d): d is number => d != null)
  return dates.length ? Math.max(...dates) : null
}

/** Deduped by user id, in first-seen order — used to roll up "who's involved" fields
 * (Implementation Owner, Delivery Manager) across a group of tasks. */
export function uniqueUsers(tasks: AppTask[], pick: (task: AppTask) => ClickUpUser | null): ClickUpUser[] {
  const byId = new Map<number, ClickUpUser>()
  for (const task of tasks) {
    const user = pick(task)
    if (user && !byId.has(user.id)) byId.set(user.id, user)
  }
  return Array.from(byId.values())
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return map
}

/**
 * Builds the Goal → Deliverable → Task hierarchy from real ClickUp tasks, using the
 * "Goal" and "Deliverable" text custom fields. Tasks missing either field are
 * grouped under an explicit "(No Goal)" / "(No Deliverable)" bucket rather than
 * silently dropped, so the report never hides real data.
 *
 * Outcome hoisting: if every task in a deliverable shares the same Outcome, it's
 * shown once on the deliverable instead of repeated per task; if every deliverable
 * in a goal ends up with that same hoisted Outcome, it hoists again to the goal.
 */
export function buildRoadmap(
  tasks: AppTask[],
  timeSummaries: Map<string, TaskTimeSummary>,
  avgCostPerHour: number
): RoadmapGoal[] {
  const byGoal = groupBy(tasks, (t) => t.goal?.trim() || NO_GOAL_LABEL)

  const goals: RoadmapGoal[] = Array.from(byGoal.entries()).map(([goalName, goalTasks]) => {
    const byDeliverable = groupBy(goalTasks, (t) => t.deliverable?.trim() || NO_DELIVERABLE_LABEL)

    const deliverables: RoadmapDeliverable[] = Array.from(byDeliverable.entries()).map(([deliverableName, deliverableTasks]) => {
      const deliverableOutcome = uniformValue(deliverableTasks.map((t) => t.outcome))

      const rows: RoadmapTaskRow[] = deliverableTasks.map((task) => {
        const summary = timeSummaries.get(task.id)
        const hoursSpent = summary?.totalHours ?? 0
        return {
          task,
          hoursSpent,
          hoursByPerson: summary?.byPerson ?? [],
          cost: hoursSpent * avgCostPerHour,
          outcome: deliverableOutcome ? null : task.outcome,
        }
      })

      return {
        name: deliverableName,
        outcome: deliverableOutcome,
        tasks: rows,
        totalHours: rows.reduce((sum, r) => sum + r.hoursSpent, 0),
        totalCost: rows.reduce((sum, r) => sum + r.cost, 0),
        doneCount: deliverableTasks.filter(isDoneTask).length,
        totalCount: deliverableTasks.length,
        blockedCount: deliverableTasks.filter(isBlockedTask).length,
        onHoldCount: deliverableTasks.filter(isOnHoldTask).length,
        eta: latestDueDate(deliverableTasks),
        implementationOwners: uniqueUsers(deliverableTasks, (t) => t.implementationOwner),
        deliveryManagers: uniqueUsers(deliverableTasks, (t) => t.deliveryManager),
      }
    })

    // If every deliverable hoisted the same outcome, hoist once more to the goal
    // and clear it from the deliverables so it isn't shown twice.
    const goalOutcome = uniformValue(deliverables.map((d) => d.outcome))
    if (goalOutcome) {
      deliverables.forEach((d) => {
        d.outcome = null
      })
    }

    return {
      name: goalName,
      outcome: goalOutcome,
      deliverables,
      totalHours: deliverables.reduce((sum, d) => sum + d.totalHours, 0),
      totalCost: deliverables.reduce((sum, d) => sum + d.totalCost, 0),
      doneCount: goalTasks.filter(isDoneTask).length,
      totalCount: goalTasks.length,
      blockedCount: goalTasks.filter(isBlockedTask).length,
      onHoldCount: goalTasks.filter(isOnHoldTask).length,
      eta: latestDueDate(goalTasks),
    }
  })

  return goals.sort((a, b) => (a.name === NO_GOAL_LABEL ? 1 : b.name === NO_GOAL_LABEL ? -1 : a.name.localeCompare(b.name)))
}

/**
 * Builds the same Goal → Deliverable → Task hierarchy as `buildRoadmap`, but from
 * already-known per-task hours (e.g. spillover tasks, or a merge of "current" +
 * spillover tasks) instead of a fresh time-entries fetch. `hoursByPerson` is
 * optional per row (defaults to empty) — callers that only need goal/deliverable
 * totals (Roadmap Health) can omit it, while callers that roll up per-person
 * contribution (Resources) should pass the real split through.
 */
export function buildRoadmapFromTaskRows(
  rows: Array<{ task: AppTask; hoursSpent: number; hoursByPerson?: Array<{ user: ClickUpUser; hours: number }> }>,
  avgCostPerHour: number
): RoadmapGoal[] {
  const tasks = rows.map((r) => r.task)
  const timeSummaries = new Map<string, TaskTimeSummary>(
    rows.map((r) => [r.task.id, { totalHours: r.hoursSpent, byPerson: r.hoursByPerson ?? [] }])
  )
  return buildRoadmap(tasks, timeSummaries, avgCostPerHour)
}

/** Dedupes task rows by task id, keeping the first occurrence — used when merging
 * "current" and spillover task rows for Roadmap Health's "With Spill Over" mode, so
 * a task present in both (e.g. shared via Tasks in Multiple Lists) isn't counted
 * twice. */
export function dedupeTaskRowsById<T extends { task: AppTask }>(rows: T[]): T[] {
  const byId = new Map<string, T>()
  for (const row of rows) if (!byId.has(row.task.id)) byId.set(row.task.id, row)
  return Array.from(byId.values())
}
