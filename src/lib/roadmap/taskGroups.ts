import type { AppTask } from '@/types/clickup'
import { flattenTaskRows } from './resourceStats'
import type { RoadmapDeliverable, RoadmapGoal } from './types'

export type TeamAudience = 'dev' | 'da' | 'pm' | 'design' | 'pedagogy'
export type AudienceFilter = 'all' | TeamAudience

export const AUDIENCE_LABELS: Record<AudienceFilter, string> = {
  all: 'All',
  dev: 'Dev',
  da: 'DA',
  pm: 'PM',
  design: 'Design',
  pedagogy: 'Pedagogy',
}

export const AUDIENCE_ORDER: AudienceFilter[] = ['all', 'dev', 'da', 'pm', 'design', 'pedagogy']

/** A task's owning team, from its tags — "da task" / "pm task" / "design task" /
 * "pedagogy task" identify each team explicitly (tags are already lowercased by
 * mapTask.ts); anything without one of those tags defaults to Dev. Checked in a
 * fixed priority order in case a task somehow carries more than one. */
export function audienceForTask(task: AppTask): TeamAudience {
  if (task.tags.includes('da task')) return 'da'
  if (task.tags.includes('pm task')) return 'pm'
  if (task.tags.includes('design task')) return 'design'
  if (task.tags.includes('pedagogy task')) return 'pedagogy'
  return 'dev'
}

export function tasksForAudience(tasks: AppTask[], audience: AudienceFilter): AppTask[] {
  return audience === 'all' ? tasks : tasks.filter((t) => audienceForTask(t) === audience)
}

export type StatusGroup = 'completed' | 'inProgressOpen' | 'blocked' | 'notStarted'

export const STATUS_GROUP_LABELS: Record<StatusGroup, string> = {
  completed: 'Completed',
  inProgressOpen: 'In Progress & Open',
  blocked: 'Blocked/On Hold',
  notStarted: 'Not Started',
}

export const STATUS_GROUP_ORDER: StatusGroup[] = ['completed', 'inProgressOpen', 'blocked', 'notStarted']

const COMPLETED_STATUSES = new Set(['closed', 'completed', 'tracking', 'under release', 'discarded'])
const IN_PROGRESS_OPEN_STATUSES = new Set([
  'in progress',
  'in review',
  'testing by dev',
  'testing by pjm',
  'testing by pm',
  'to deploy',
  'deploy to prod',
  'testing',
])
const BLOCKED_STATUSES = new Set(['blocked', 'on hold'])
const NOT_STARTED_STATUSES = new Set(['backlog', 'in progress by pm', 'design', 'pm review', 'approved', 'to do', 'todo'])

/**
 * Which of the four workflow-stage groups a task's live status belongs to — an
 * explicit status-name classification matching this workspace's actual workflow,
 * not ClickUp's generic status type. Returns null for a status matching none of
 * the four (rather than guessing), so an unrecognized status simply doesn't show
 * under any of the four tabs instead of being silently miscounted.
 */
export function statusGroupForTask(task: AppTask): StatusGroup | null {
  const s = task.status.trim().toLowerCase()
  if (COMPLETED_STATUSES.has(s)) return 'completed'
  if (IN_PROGRESS_OPEN_STATUSES.has(s)) return 'inProgressOpen'
  if (BLOCKED_STATUSES.has(s)) return 'blocked'
  if (NOT_STARTED_STATUSES.has(s)) return 'notStarted'
  return null
}

export function countByStatusGroup(tasks: AppTask[]): Record<StatusGroup, number> {
  const counts: Record<StatusGroup, number> = { completed: 0, inProgressOpen: 0, blocked: 0, notStarted: 0 }
  for (const task of tasks) {
    const group = statusGroupForTask(task)
    if (group) counts[group] += 1
  }
  return counts
}

/** Both the Goals tab's status tabs and Roadmap Health's status cards additionally
 * offer "All" (no status filtering) alongside the four real workflow-stage groups. */
export type StatusGroupFilter = 'all' | StatusGroup

export const STATUS_GROUP_FILTER_LABELS: Record<StatusGroupFilter, string> = {
  all: 'All',
  ...STATUS_GROUP_LABELS,
}

export const STATUS_GROUP_FILTER_ORDER: StatusGroupFilter[] = ['all', ...STATUS_GROUP_ORDER]

export interface StatusGroupBreakdown {
  taskCount: number
  taskPct: number
  goalCount: number
  goalPct: number
  deliverableCount: number
  deliverablePct: number
}

/**
 * Rolls a set of tasks up into a single workflow-stage group, by priority rather
 * than requiring 100% uniformity — every goal/deliverable with at least one
 * recognized-status task lands in exactly one group, so per-group goal/deliverable
 * counts always sum to the grand total:
 *   1. Every task Completed → Completed.
 *   2. Else any task Blocked/On Hold → Blocked/On Hold (a blocker is worth
 *      surfacing even if the rest of the work is done or moving).
 *   3. Else every task Not Started → Not Started.
 *   4. Otherwise → In Progress & Open (covers literal in-progress/open tasks, and
 *      any other genuine mix — e.g. part done, part not started yet — since the
 *      goal as a whole is neither fully done nor untouched).
 * Returns null only when none of the tasks have a recognized status at all.
 */
export function rollupStatusGroup(tasks: AppTask[]): StatusGroup | null {
  if (tasks.length === 0) return null
  const groups = tasks.map(statusGroupForTask)
  if (!groups.some((g) => g !== null)) return null
  if (groups.every((g) => g === 'completed')) return 'completed'
  if (groups.some((g) => g === 'blocked')) return 'blocked'
  if (groups.every((g) => g === 'notStarted')) return 'notStarted'
  return 'inProgressOpen'
}

/**
 * For each of the four workflow-stage groups: how many tasks are in it (and what
 * share of all tasks that is), plus how many goals/deliverables roll up to that
 * group overall (via `rollupStatusGroup`) — every goal/deliverable lands in exactly
 * one group, so goal/deliverable counts across the four cards always add up to the
 * grand total. `goals` should already be scoped to whatever Audience tab is selected.
 */
export function computeStatusGroupBreakdowns(goals: RoadmapGoal[]): Record<StatusGroup, StatusGroupBreakdown> {
  const rows = flattenTaskRows(goals)
  const totalTasks = rows.length
  const totalGoals = goals.length
  const totalDeliverables = goals.reduce((sum, g) => sum + g.deliverables.length, 0)

  const deliverableGroup = new Map<RoadmapDeliverable, StatusGroup | null>()
  const goalGroup = new Map<RoadmapGoal, StatusGroup | null>()
  for (const g of goals) {
    for (const d of g.deliverables) {
      deliverableGroup.set(d, rollupStatusGroup(d.tasks.map((r) => r.task)))
    }
    goalGroup.set(g, rollupStatusGroup(g.deliverables.flatMap((d) => d.tasks.map((r) => r.task))))
  }

  const result = {} as Record<StatusGroup, StatusGroupBreakdown>
  for (const group of STATUS_GROUP_ORDER) {
    const taskCount = rows.filter((r) => statusGroupForTask(r.task) === group).length
    const deliverableCount = goals.reduce(
      (sum, g) => sum + g.deliverables.filter((d) => deliverableGroup.get(d) === group).length,
      0
    )
    const goalCount = goals.filter((g) => goalGroup.get(g) === group).length

    result[group] = {
      taskCount,
      taskPct: totalTasks > 0 ? taskCount / totalTasks : 0,
      goalCount,
      goalPct: totalGoals > 0 ? goalCount / totalGoals : 0,
      deliverableCount,
      deliverablePct: totalDeliverables > 0 ? deliverableCount / totalDeliverables : 0,
    }
  }
  return result
}

/** Same as `computeStatusGroupBreakdowns`, plus an "All" entry (100% of
 * everything) — for the card view's "All" option, which shows every task/goal/
 * deliverable with no status filtering. */
export function computeStatusGroupFilterBreakdowns(goals: RoadmapGoal[]): Record<StatusGroupFilter, StatusGroupBreakdown> {
  const totalTasks = flattenTaskRows(goals).length
  const totalGoals = goals.length
  const totalDeliverables = goals.reduce((sum, g) => sum + g.deliverables.length, 0)
  return {
    all: {
      taskCount: totalTasks,
      taskPct: totalTasks > 0 ? 1 : 0,
      goalCount: totalGoals,
      goalPct: totalGoals > 0 ? 1 : 0,
      deliverableCount: totalDeliverables,
      deliverablePct: totalDeliverables > 0 ? 1 : 0,
    },
    ...computeStatusGroupBreakdowns(goals),
  }
}
