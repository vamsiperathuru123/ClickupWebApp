import type { ClickUpUser } from '@/types/clickup'
import type { RoadmapGoal, RoadmapTaskRow } from './types'

export function flattenTaskRows(goals: RoadmapGoal[]): RoadmapTaskRow[] {
  return goals.flatMap((g) => g.deliverables.flatMap((d) => d.tasks))
}

export interface PersonContribution {
  user: ClickUpUser
  /** Number of tasks this person is an assignee on. */
  taskCount: number
  /** Real logged hours by this person, from time-tracking entries. */
  hours: number
  cost: number
}

/**
 * Roster is the union of every task's assignees and everyone who's actually logged
 * time — a person can appear here even if they logged time on a task they weren't
 * formally assigned to, since that's still real recorded work.
 */
export function computeContributionByPerson(rows: RoadmapTaskRow[], avgCostPerHour: number): PersonContribution[] {
  const byId = new Map<number, PersonContribution>()

  function ensure(user: ClickUpUser): PersonContribution {
    if (!byId.has(user.id)) byId.set(user.id, { user, taskCount: 0, hours: 0, cost: 0 })
    return byId.get(user.id)!
  }

  for (const row of rows) {
    for (const assignee of row.task.assignees) ensure(assignee).taskCount += 1
    for (const { user, hours } of row.hoursByPerson) ensure(user).hours += hours
  }

  for (const person of byId.values()) person.cost = person.hours * avgCostPerHour

  return Array.from(byId.values()).sort((a, b) => b.taskCount - a.taskCount || b.hours - a.hours)
}
