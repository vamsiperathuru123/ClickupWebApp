import type { ClickUpUser } from '@/types/clickup'
import { isBlockedTask, isDoneTask, isOnHoldTask, latestDueDate, uniqueUsers } from './aggregate'
import { flattenTaskRows } from './resourceStats'
import { audienceForTask, rollupStatusGroup, type AudienceFilter, type StatusGroupFilter } from './taskGroups'
import type { RoadmapDeliverable, RoadmapGoal, RoadmapTaskRow } from './types'

export type FilterFieldKey =
  | 'goal'
  | 'deliverable'
  | 'status'
  | 'priority'
  | 'functionTag'
  | 'sprint'
  | 'metricCategory'
  | 'impactedMetric'
  | 'outcome'
  | 'assigneeId'
  | 'developerId'
  | 'implementationOwnerId'
  | 'deliveryManagerId'

/** ClickUp-style filter state: each field is either `null` (no filter pill shown for
 * it) or a string[] of selected values (`[]` means the pill is shown — the user added
 * the field — but hasn't picked a value yet, so it doesn't restrict anything). User
 * fields store the user id as a string so every field shares one value type. */
export type RoadmapFilters = Record<FilterFieldKey, string[] | null>

export const EMPTY_FILTERS: RoadmapFilters = {
  goal: null,
  deliverable: null,
  status: null,
  priority: null,
  functionTag: null,
  sprint: null,
  metricCategory: null,
  impactedMetric: null,
  outcome: null,
  assigneeId: null,
  developerId: null,
  implementationOwnerId: null,
  deliveryManagerId: null,
}

/** True once at least one field has a value selected — i.e. filtering actually has
 * an effect on the data, as opposed to a pill just being present with nothing picked. */
export function hasActiveFilters(filters: RoadmapFilters): boolean {
  return Object.values(filters).some((v) => v !== null && v.length > 0)
}

/** True once at least one filter pill is shown, whether or not it has values picked
 * yet — used to decide whether "Clear all" has anything to do. */
export function hasAnyFilterField(filters: RoadmapFilters): boolean {
  return Object.values(filters).some((v) => v !== null)
}

export interface FilterOptions {
  goals: string[]
  deliverables: string[]
  statuses: string[]
  priorities: string[]
  functionTags: string[]
  sprints: string[]
  metricCategories: string[]
  impactedMetrics: string[]
  outcomes: string[]
  assignees: ClickUpUser[]
  developers: ClickUpUser[]
  implementationOwners: ClickUpUser[]
  deliveryManagers: ClickUpUser[]
}

function sortedUnique(values: Array<string | null | undefined>): string[] {
  const set = new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

function sortedUniqueUsers(users: Array<ClickUpUser | null>): ClickUpUser[] {
  const byId = new Map<number, ClickUpUser>()
  for (const user of users) if (user && !byId.has(user.id)) byId.set(user.id, user)
  return Array.from(byId.values()).sort((a, b) => a.username.localeCompare(b.username))
}

/** Distinct values across the full (unfiltered) dataset, used to populate every
 * filter's value picker so it never offers an option the data can't actually match. */
export function computeFilterOptions(goals: RoadmapGoal[]): FilterOptions {
  const tasks = flattenTaskRows(goals).map((r) => r.task)
  return {
    goals: sortedUnique(goals.map((g) => g.name)),
    deliverables: sortedUnique(goals.flatMap((g) => g.deliverables.map((d) => d.name))),
    statuses: sortedUnique(tasks.map((t) => t.status)),
    priorities: sortedUnique(tasks.map((t) => t.priority)),
    functionTags: sortedUnique(tasks.map((t) => t.functionTag)),
    sprints: sortedUnique(tasks.map((t) => t.sprintName)),
    metricCategories: sortedUnique(tasks.map((t) => t.metricCategory)),
    impactedMetrics: sortedUnique(tasks.map((t) => t.impactedMetric)),
    outcomes: sortedUnique(tasks.map((t) => t.outcome)),
    assignees: sortedUniqueUsers(tasks.flatMap((t) => t.assignees)),
    developers: sortedUniqueUsers(tasks.map((t) => t.developer)),
    implementationOwners: sortedUniqueUsers(tasks.map((t) => t.implementationOwner)),
    deliveryManagers: sortedUniqueUsers(tasks.map((t) => t.deliveryManager)),
  }
}

function matchesText(selected: string[] | null, actual: string | null | undefined): boolean {
  if (!selected || selected.length === 0) return true
  return actual != null && selected.includes(actual)
}

function matchesUser(selected: string[] | null, user: ClickUpUser | null): boolean {
  if (!selected || selected.length === 0) return true
  return user != null && selected.includes(String(user.id))
}

function matchesAnyUser(selected: string[] | null, users: ClickUpUser[]): boolean {
  if (!selected || selected.length === 0) return true
  return users.some((u) => selected.includes(String(u.id)))
}

/** A task matches a field once it matches ANY of that field's selected values (OR
 * within a field); a row must match every field that has values selected (AND across
 * fields) — the same combination ClickUp's own filter bar uses. */
function taskMatches(row: RoadmapTaskRow, goalName: string, deliverableName: string, filters: RoadmapFilters): boolean {
  const t = row.task
  return (
    matchesText(filters.goal, goalName) &&
    matchesText(filters.deliverable, deliverableName) &&
    matchesText(filters.status, t.status) &&
    matchesText(filters.priority, t.priority) &&
    matchesText(filters.functionTag, t.functionTag) &&
    matchesText(filters.sprint, t.sprintName) &&
    matchesText(filters.metricCategory, t.metricCategory) &&
    matchesText(filters.impactedMetric, t.impactedMetric) &&
    matchesText(filters.outcome, t.outcome) &&
    matchesAnyUser(filters.assigneeId, t.assignees) &&
    matchesUser(filters.developerId, t.developer) &&
    matchesUser(filters.implementationOwnerId, t.implementationOwner) &&
    matchesUser(filters.deliveryManagerId, t.deliveryManager)
  )
}

function recomputeDeliverable(deliverable: RoadmapDeliverable, tasks: RoadmapTaskRow[]): RoadmapDeliverable {
  const rawTasks = tasks.map((r) => r.task)
  return {
    ...deliverable,
    tasks,
    totalHours: tasks.reduce((sum, r) => sum + r.hoursSpent, 0),
    totalCost: tasks.reduce((sum, r) => sum + r.cost, 0),
    doneCount: rawTasks.filter(isDoneTask).length,
    totalCount: rawTasks.length,
    blockedCount: rawTasks.filter(isBlockedTask).length,
    onHoldCount: rawTasks.filter(isOnHoldTask).length,
    eta: latestDueDate(rawTasks),
    implementationOwners: uniqueUsers(rawTasks, (t) => t.implementationOwner),
    deliveryManagers: uniqueUsers(rawTasks, (t) => t.deliveryManager),
  }
}

function recomputeGoal(goal: RoadmapGoal, deliverables: RoadmapDeliverable[]): RoadmapGoal {
  const rawTasks = deliverables.flatMap((d) => d.tasks.map((r) => r.task))
  return {
    ...goal,
    deliverables,
    totalHours: deliverables.reduce((sum, d) => sum + d.totalHours, 0),
    totalCost: deliverables.reduce((sum, d) => sum + d.totalCost, 0),
    doneCount: rawTasks.filter(isDoneTask).length,
    totalCount: rawTasks.length,
    blockedCount: rawTasks.filter(isBlockedTask).length,
    onHoldCount: rawTasks.filter(isOnHoldTask).length,
    eta: latestDueDate(rawTasks),
  }
}

/** Shared Goal → Deliverable → Task recompute-and-prune core: keeps only the task
 * rows a predicate accepts, rebuilds deliverable/goal totals from what's left, and
 * drops any deliverable/goal left with nothing in it — used by both the general
 * filter bar and the Audience/Status-group tabs below. */
function filterRoadmapGoalsByRowPredicate(
  goals: RoadmapGoal[],
  predicate: (row: RoadmapTaskRow, goalName: string, deliverableName: string) => boolean
): RoadmapGoal[] {
  const result: RoadmapGoal[] = []
  for (const goal of goals) {
    const deliverables: RoadmapDeliverable[] = []
    for (const deliverable of goal.deliverables) {
      const tasks = deliverable.tasks.filter((row) => predicate(row, goal.name, deliverable.name))
      if (tasks.length === 0) continue
      deliverables.push(recomputeDeliverable(deliverable, tasks))
    }
    if (deliverables.length === 0) continue
    result.push(recomputeGoal(goal, deliverables))
  }
  return result
}

/** Filters the Goal → Deliverable → Task hierarchy down to tasks matching every
 * active filter, rebuilding deliverable/goal totals from what's left. Deliverables
 * and goals with nothing left after filtering are dropped rather than shown empty. */
export function filterRoadmapGoals(goals: RoadmapGoal[], filters: RoadmapFilters): RoadmapGoal[] {
  if (!hasActiveFilters(filters)) return goals
  return filterRoadmapGoalsByRowPredicate(goals, (row, goalName, deliverableName) => taskMatches(row, goalName, deliverableName, filters))
}

/** Filters by team (from task tags, via the Audience tabs) only — used to scope
 * data down to one team before computing that team's own per-status-group stats. */
export function filterRoadmapGoalsByAudience(goals: RoadmapGoal[], audience: AudienceFilter): RoadmapGoal[] {
  if (audience === 'all') return goals
  return filterRoadmapGoalsByRowPredicate(goals, (row) => audienceForTask(row.task) === audience)
}

/** Free-text search across task, deliverable and goal names — for a plain search
 * box, as opposed to the structured filter pills above. A task matches if its own
 * name does, or either ancestor's does, so searching a goal or deliverable name
 * still surfaces every task under it rather than requiring the exact task title. */
export function filterRoadmapGoalsByText(goals: RoadmapGoal[], query: string): RoadmapGoal[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return goals
  return filterRoadmapGoalsByRowPredicate(
    goals,
    (row, goalName, deliverableName) =>
      row.task.name.toLowerCase().includes(needle) ||
      goalName.toLowerCase().includes(needle) ||
      deliverableName.toLowerCase().includes(needle)
  )
}

/** Filters by team, then keeps only whole goals whose overall rollup (same
 * priority rule the Overall Health cards use — see `rollupStatusGroup`) matches
 * the selected group; a matching goal keeps every one of its tasks intact rather
 * than pruning down to just the tasks with that literal status. Used by both the
 * Goals tab and Roadmap Health's Budget Utilisation list, so a goal that's mostly
 * done but has one blocked task shows once, in full, under Blocked/On Hold — never
 * split with partial totals under two different tabs/cards. `statusGroup: 'all'`
 * skips the status filter entirely. */
export function filterRoadmapGoalsByAudienceAndGoalStatusGroup(
  goals: RoadmapGoal[],
  audience: AudienceFilter,
  statusGroup: StatusGroupFilter
): RoadmapGoal[] {
  const audienceGoals = filterRoadmapGoalsByAudience(goals, audience)
  if (statusGroup === 'all') return audienceGoals
  return audienceGoals.filter((g) => rollupStatusGroup(g.deliverables.flatMap((d) => d.tasks.map((r) => r.task))) === statusGroup)
}
