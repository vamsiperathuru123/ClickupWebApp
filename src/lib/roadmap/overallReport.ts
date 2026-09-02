import type { AppTask, ClickUpUser } from '@/types/clickup'
import { isBlockedTask, isOnHoldTask } from './aggregate'
import { statusGroupForTask } from './taskGroups'
import { flattenTaskRows } from './resourceStats'
import type { RoadmapGoal, RoadmapTaskRow } from './types'

/**
 * Five mutually-exclusive workflow buckets — the same classification the rest of
 * the report uses, except Blocked and On Hold are kept apart instead of collapsed
 * into one "Blocked/On Hold" group, so the Overall Report can show them as their
 * own columns. `null` for a status matching none of them, same as
 * `statusGroupForTask`, rather than guessing.
 */
export type ReportStatusBucket = 'completed' | 'inProgressOpen' | 'blocked' | 'onHold' | 'notStarted'

export const REPORT_STATUS_ORDER: ReportStatusBucket[] = [
  'completed',
  'inProgressOpen',
  'blocked',
  'onHold',
  'notStarted',
]

export const REPORT_STATUS_LABELS: Record<ReportStatusBucket, string> = {
  completed: 'Completed',
  inProgressOpen: 'In Progress & Open',
  blocked: 'Blocked',
  onHold: 'On Hold',
  notStarted: 'Not Started',
}

export function reportBucketForTask(task: AppTask): ReportStatusBucket | null {
  // Checked before the shared status-group lookup, which deliberately folds both
  // of these into one "blocked" group.
  if (isBlockedTask(task)) return 'blocked'
  if (isOnHoldTask(task)) return 'onHold'
  const group = statusGroupForTask(task)
  if (group === 'completed') return 'completed'
  if (group === 'inProgressOpen') return 'inProgressOpen'
  if (group === 'notStarted') return 'notStarted'
  return null
}

/** Rolls a set of tasks up to one bucket by the same priority rule
 * `rollupStatusGroup` uses, with Blocked ranked above On Hold — so a goal that is
 * mostly done but has one blocked task still surfaces as Blocked. */
export function reportBucketForTasks(tasks: AppTask[]): ReportStatusBucket | null {
  if (tasks.length === 0) return null
  const buckets = tasks.map(reportBucketForTask)
  if (!buckets.some((b) => b !== null)) return null
  if (buckets.every((b) => b === 'completed')) return 'completed'
  if (buckets.some((b) => b === 'blocked')) return 'blocked'
  if (buckets.some((b) => b === 'onHold')) return 'onHold'
  if (buckets.every((b) => b === 'notStarted')) return 'notStarted'
  return 'inProgressOpen'
}

const DAY_MS = 1000 * 60 * 60 * 24

/** Local midnight for a timestamp — due dates are compared whole days apart, so a
 * task due at 9am today isn't "overdue" by 5pm the same day. */
function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Due on an earlier calendar day than today and not resolved — work that finished
 * late isn't overdue any more, so completed tasks never count here. A task due
 * today is `isDueTodayTask`, not this. */
export function isOverdueTask(task: AppTask, now: number): boolean {
  if (task.dueDate == null) return false
  if (reportBucketForTask(task) === 'completed') return false
  return startOfDay(task.dueDate) < startOfDay(now)
}

/** Due today and still open — the last-call bucket that sits between on-track and
 * overdue. */
export function isDueTodayTask(task: AppTask, now: number): boolean {
  if (task.dueDate == null) return false
  if (reportBucketForTask(task) === 'completed') return false
  return startOfDay(task.dueDate) === startOfDay(now)
}

export function daysOverdue(task: AppTask, now: number): number {
  if (task.dueDate == null) return 0
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(task.dueDate)) / DAY_MS))
}

function emptyCounts(): Record<ReportStatusBucket, number> {
  return { completed: 0, inProgressOpen: 0, blocked: 0, onHold: 0, notStarted: 0 }
}

export interface StatusMatrixRow {
  label: string
  total: number
  counts: Record<ReportStatusBucket, number>
}

/** Goals / Deliverables / Tasks × the five buckets. Tasks are counted by their own
 * status; goals and deliverables by their rollup, so each lands in exactly one
 * bucket and every row's buckets add up to its total. */
export function computeStatusMatrix(goals: RoadmapGoal[]): StatusMatrixRow[] {
  const taskCounts = emptyCounts()
  for (const row of flattenTaskRows(goals)) {
    const bucket = reportBucketForTask(row.task)
    if (bucket) taskCounts[bucket] += 1
  }

  const goalCounts = emptyCounts()
  const deliverableCounts = emptyCounts()
  let deliverableTotal = 0
  let taskTotal = 0

  for (const goal of goals) {
    for (const deliverable of goal.deliverables) {
      deliverableTotal += 1
      const bucket = reportBucketForTasks(deliverable.tasks.map((r) => r.task))
      if (bucket) deliverableCounts[bucket] += 1
    }
    taskTotal += goal.totalCount
    const bucket = reportBucketForTasks(goal.deliverables.flatMap((d) => d.tasks.map((r) => r.task)))
    if (bucket) goalCounts[bucket] += 1
  }

  return [
    { label: 'Goals', total: goals.length, counts: goalCounts },
    { label: 'Deliverables', total: deliverableTotal, counts: deliverableCounts },
    { label: 'Tasks', total: taskTotal, counts: taskCounts },
  ]
}

export interface OverdueSummary {
  tasks: number
  deliverables: number
  goals: number
}

/** A deliverable/goal is overdue when anything under it is — the same "any child"
 * rule the blocked/on-hold rollups use. */
export function computeOverdue(goals: RoadmapGoal[], now: number): OverdueSummary {
  let tasks = 0
  let deliverables = 0
  let overdueGoals = 0

  for (const goal of goals) {
    let goalHasOverdue = false
    for (const deliverable of goal.deliverables) {
      let deliverableHasOverdue = false
      for (const row of deliverable.tasks) {
        if (isOverdueTask(row.task, now)) {
          tasks += 1
          deliverableHasOverdue = true
        }
      }
      if (deliverableHasOverdue) {
        deliverables += 1
        goalHasOverdue = true
      }
    }
    if (goalHasOverdue) overdueGoals += 1
  }

  return { tasks, deliverables, goals: overdueGoals }
}

export function countOverdue(rows: RoadmapTaskRow[], now: number): number {
  return rows.filter((r) => isOverdueTask(r.task, now)).length
}

export function countDueToday(rows: RoadmapTaskRow[], now: number): number {
  return rows.filter((r) => isDueTodayTask(r.task, now)).length
}

/** Same "any child counts" rollup as `computeOverdue`, for work due today. */
export function computeDueToday(goals: RoadmapGoal[], now: number): OverdueSummary {
  let tasks = 0
  let deliverables = 0
  let dueTodayGoals = 0

  for (const goal of goals) {
    let goalHas = false
    for (const deliverable of goal.deliverables) {
      let deliverableHas = false
      for (const row of deliverable.tasks) {
        if (isDueTodayTask(row.task, now)) {
          tasks += 1
          deliverableHas = true
        }
      }
      if (deliverableHas) {
        deliverables += 1
        goalHas = true
      }
    }
    if (goalHas) dueTodayGoals += 1
  }

  return { tasks, deliverables, goals: dueTodayGoals }
}

/**
 * Whether one descriptive field is the same across a set of tasks.
 *
 * `uniform` carries the single value plus how many tasks actually set it, so a
 * field that one task leaves blank can still be reported once at the deliverable
 * level with an honest "3 of 4" qualifier instead of being pushed back down to
 * every task row.
 */
export type SharedField<T> =
  | { state: 'empty' }
  | { state: 'uniform'; value: T; presentCount: number; totalCount: number }
  | { state: 'varies'; distinctCount: number }

export interface SharedTaskMeta {
  metricCategory: SharedField<string>
  impactedMetric: SharedField<string>
  implementationOwner: SharedField<ClickUpUser>
  deliveryManager: SharedField<ClickUpUser>
}

function sharedText(tasks: AppTask[], pick: (task: AppTask) => string | null | undefined): SharedField<string> {
  const values = tasks.map((t) => pick(t)?.trim()).filter((v): v is string => !!v)
  const distinct = Array.from(new Set(values))
  if (distinct.length === 0) return { state: 'empty' }
  if (distinct.length > 1) return { state: 'varies', distinctCount: distinct.length }
  return { state: 'uniform', value: distinct[0], presentCount: values.length, totalCount: tasks.length }
}

function sharedUser(tasks: AppTask[], pick: (task: AppTask) => ClickUpUser | null | undefined): SharedField<ClickUpUser> {
  const users = tasks.map(pick).filter((u): u is ClickUpUser => !!u)
  const byId = new Map(users.map((u) => [u.id, u]))
  if (byId.size === 0) return { state: 'empty' }
  if (byId.size > 1) return { state: 'varies', distinctCount: byId.size }
  return { state: 'uniform', value: users[0], presentCount: users.length, totalCount: tasks.length }
}

/**
 * Rolls the four descriptive fields up to whatever level owns these tasks. A
 * deliverable whose tasks agree on a field states it once beside its name; a field
 * they disagree on stays down on the individual task rows, which is the only place
 * it can be stated truthfully.
 */
export function computeSharedTaskMeta(tasks: AppTask[]): SharedTaskMeta {
  return {
    metricCategory: sharedText(tasks, (t) => t.metricCategory),
    impactedMetric: sharedText(tasks, (t) => t.impactedMetric),
    implementationOwner: sharedUser(tasks, (t) => t.implementationOwner),
    deliveryManager: sharedUser(tasks, (t) => t.deliveryManager),
  }
}

/** True when this field still has to be shown per task. */
export function fieldVaries(field: SharedField<unknown>): boolean {
  return field.state === 'varies'
}

export interface MetricGroup {
  key: string
  taskCount: number
  doneCount: number
  overdueCount: number
  dueTodayCount: number
  totalHours: number
  totalCost: number
}

/** Generic "group task rows by one text field" used for both the Function Tag and
 * Impacted Metric breakdowns — biggest spend first, with the unset bucket pinned
 * last so it never crowds out real values. */
export function groupRowsByField(
  rows: RoadmapTaskRow[],
  fieldOf: (task: AppTask) => string | null | undefined,
  unsetLabel: string,
  now: number
): MetricGroup[] {
  const byKey = new Map<string, MetricGroup>()

  for (const row of rows) {
    const key = fieldOf(row.task)?.trim() || unsetLabel
    if (!byKey.has(key)) {
      byKey.set(key, { key, taskCount: 0, doneCount: 0, overdueCount: 0, dueTodayCount: 0, totalHours: 0, totalCost: 0 })
    }
    const group = byKey.get(key)!
    group.taskCount += 1
    if (reportBucketForTask(row.task) === 'completed') group.doneCount += 1
    if (isOverdueTask(row.task, now)) group.overdueCount += 1
    if (isDueTodayTask(row.task, now)) group.dueTodayCount += 1
    group.totalHours += row.hoursSpent
    group.totalCost += row.cost
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.key === unsetLabel) return 1
    if (b.key === unsetLabel) return -1
    return b.totalCost - a.totalCost || b.taskCount - a.taskCount || a.key.localeCompare(b.key)
  })
}

export interface StatusSpend {
  bucket: ReportStatusBucket
  taskCount: number
  totalHours: number
  totalCost: number
}

export function computeSpendByStatus(rows: RoadmapTaskRow[]): StatusSpend[] {
  const byBucket = new Map<ReportStatusBucket, StatusSpend>()
  for (const bucket of REPORT_STATUS_ORDER) {
    byBucket.set(bucket, { bucket, taskCount: 0, totalHours: 0, totalCost: 0 })
  }
  for (const row of rows) {
    const bucket = reportBucketForTask(row.task)
    if (!bucket) continue
    const entry = byBucket.get(bucket)!
    entry.taskCount += 1
    entry.totalHours += row.hoursSpent
    entry.totalCost += row.cost
  }
  return REPORT_STATUS_ORDER.map((b) => byBucket.get(b)!)
}

export interface AttentionGoal {
  name: string
  blockedCount: number
  onHoldCount: number
  overdueCount: number
  dueTodayCount: number
  notStartedCount: number
  maxDaysOverdue: number
  /** Just the tasks that earned this goal its place in the list, so the panel can
   * expand into them instead of sending the reader off to the ledger to work out
   * which ones are actually a problem. */
  rows: RoadmapTaskRow[]
  /** Everyone on the hook for those tasks — assignees plus the Developer field,
   * deduped, in first-seen order. */
  people: ClickUpUser[]
}

/** A task is worth surfacing when it's blocked, on hold, already late, due today,
 * or not started yet. */
export function isAttentionTask(task: AppTask, now: number): boolean {
  return attentionFlagsForTask(task, now).length > 0
}

export type AttentionFlag = 'blocked' | 'onHold' | 'overdue' | 'dueToday' | 'notStarted'
export type AttentionFilter = 'all' | AttentionFlag

export const ATTENTION_FILTER_LABELS: Record<AttentionFilter, string> = {
  all: 'All',
  blocked: 'Blocked',
  onHold: 'On hold',
  overdue: 'Overdue',
  dueToday: 'Due today',
  notStarted: 'Not started',
}

export const ATTENTION_FLAG_ORDER: AttentionFlag[] = ['blocked', 'onHold', 'overdue', 'dueToday', 'notStarted']

/** Which attention flags a task carries. More than one can apply at once — an
 * overdue task can also be blocked — which is why these are collected rather than
 * resolved to a single bucket. */
export function attentionFlagsForTask(task: AppTask, now: number): AttentionFlag[] {
  const flags: AttentionFlag[] = []
  const bucket = reportBucketForTask(task)
  if (bucket === 'blocked') flags.push('blocked')
  if (bucket === 'onHold') flags.push('onHold')
  if (bucket === 'notStarted') flags.push('notStarted')
  if (isOverdueTask(task, now)) flags.push('overdue')
  if (isDueTodayTask(task, now)) flags.push('dueToday')
  return flags
}

export function taskMatchesAttentionFilter(task: AppTask, now: number, filter: AttentionFilter): boolean {
  if (filter === 'all') return isAttentionTask(task, now)
  return attentionFlagsForTask(task, now).includes(filter)
}

/** Every goal carrying a blocker, a hold, an overdue task, something due today, or
 * work not started yet — worst first, so the panel leads with whatever needs
 * looking at soonest. */
export function computeAttentionGoals(goals: RoadmapGoal[], now: number): AttentionGoal[] {
  const items: AttentionGoal[] = []

  for (const goal of goals) {
    const rows = goal.deliverables.flatMap((d) => d.tasks).filter((r) => isAttentionTask(r.task, now))
    if (rows.length === 0) continue

    const tasks = rows.map((r) => r.task)
    const overdue = tasks.filter((t) => isOverdueTask(t, now))

    const byId = new Map<number, ClickUpUser>()
    for (const task of tasks) {
      for (const assignee of task.assignees) if (!byId.has(assignee.id)) byId.set(assignee.id, assignee)
      if (task.developer && !byId.has(task.developer.id)) byId.set(task.developer.id, task.developer)
    }

    items.push({
      name: goal.name,
      blockedCount: tasks.filter((t) => reportBucketForTask(t) === 'blocked').length,
      onHoldCount: tasks.filter((t) => reportBucketForTask(t) === 'onHold').length,
      overdueCount: overdue.length,
      dueTodayCount: tasks.filter((t) => isDueTodayTask(t, now)).length,
      notStartedCount: tasks.filter((t) => reportBucketForTask(t) === 'notStarted').length,
      maxDaysOverdue: overdue.reduce((max, t) => Math.max(max, daysOverdue(t, now)), 0),
      rows,
      people: Array.from(byId.values()),
    })
  }

  return items.sort(
    (a, b) =>
      b.blockedCount - a.blockedCount ||
      b.onHoldCount - a.onHoldCount ||
      b.maxDaysOverdue - a.maxDaysOverdue ||
      b.dueTodayCount - a.dueTodayCount ||
      b.notStartedCount - a.notStartedCount ||
      a.name.localeCompare(b.name)
  )
}
