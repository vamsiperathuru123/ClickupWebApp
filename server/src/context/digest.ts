import { fetchRoadmapData } from '@/lib/roadmap/loadRoadmap'
import { aggregateTimeEntries } from '@/lib/roadmap/timeAggregation'
import { buildRoadmap } from '@/lib/roadmap/aggregate'
import { flattenTaskRows, computeContributionByPerson } from '@/lib/roadmap/resourceStats'
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUS_ORDER,
  computeAttentionGoals,
  computeDueToday,
  computeOverdue,
  computeSharedTaskMeta,
  computeStatusMatrix,
  countDueToday,
  countOverdue,
  daysOverdue,
  isDueTodayTask,
  isOverdueTask,
  reportBucketForTask,
  reportBucketForTasks,
} from '@/lib/roadmap/overallReport'
import { groupByFunctionTag } from '@/lib/roadmap/functionTagStats'
import { formatCurrency, formatHours, formatPercent } from '@/lib/roadmap/format'
import { formatShortDate } from '@/lib/dates'
import type { RoadmapGoal, RoadmapTaskRow } from '@/lib/roadmap/types'
import type { BrainUiContext } from '@/lib/brain/types'
import type { TimeEntriesRestriction } from '@/lib/mcp/clickupService'
import { config } from '../config.js'

export interface ScopeDigest {
  /** The compact markdown that goes into the model's system prompt. */
  markdown: string
  /** Kept in memory for the tools to query — never handed to the model wholesale. */
  goals: RoadmapGoal[]
  rows: RoadmapTaskRow[]
  builtAt: number
  timeRestriction: TimeEntriesRestriction
}

/**
 * Goal and deliverable names in this workspace are frequently full paragraphs - the
 * longest measured is 546 characters - and three of them cost more context than the
 * entire per-person breakdown. Names are truncated for the prompt only; tools return
 * them in full when a question turns on the wording.
 */
const NAME_LIMIT = 140

function short(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim()
  return clean.length > NAME_LIMIT ? `${clean.slice(0, NAME_LIMIT)}...` : clean
}

const cache = new Map<string, { at: number; promise: Promise<ScopeDigest> }>()

function cacheKey(token: string, workspaceId: string, context: BrainUiContext): string {
  const scope = context.scope
    .map((s) => `${s.type}:${s.id}`)
    .sort()
    .join(',')
  // Keyed by token because two users see different tasks for the same scope; only
  // the tail is used so the full secret never sits in a map key.
  return [token.slice(-8), workspaceId, scope, context.settings.avgCostPerHour].join('|')
}

/**
 * Cached per scope for a few minutes — a follow-up question should not re-pull the
 * whole workspace, and ClickUp rate-limits hard on folder-wide task fetches (this
 * project has already hit 429s doing exactly that).
 */
export function loadScopeDigest(
  token: string,
  workspaceId: string,
  context: BrainUiContext
): Promise<ScopeDigest> {
  const key = cacheKey(token, workspaceId, context)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < config.digestCacheMs) return hit.promise

  const promise = buildScopeDigest(token, workspaceId, context)
  promise.catch(() => cache.delete(key))
  cache.set(key, { at: Date.now(), promise })
  return promise
}

export function clearDigestCache(): void {
  cache.clear()
}

async function buildScopeDigest(
  token: string,
  workspaceId: string,
  context: BrainUiContext
): Promise<ScopeDigest> {
  const { avgCostPerHour, totalWorkingHours } = context.settings
  const { tasks, timeEntries, timeRestriction } = await fetchRoadmapData(token, workspaceId, context.scope)
  const timeSummaries = aggregateTimeEntries(timeEntries)
  const goals = buildRoadmap(tasks, timeSummaries, avgCostPerHour)
  const rows = flattenTaskRows(goals)
  const now = Date.now()

  return {
    markdown: renderDigest(goals, rows, context, now, totalWorkingHours, avgCostPerHour, timeRestriction),
    goals,
    rows,
    builtAt: now,
    timeRestriction,
  }
}

function renderDigest(
  goals: RoadmapGoal[],
  rows: RoadmapTaskRow[],
  context: BrainUiContext,
  now: number,
  totalWorkingHours: number,
  avgCostPerHour: number,
  timeRestriction: TimeEntriesRestriction
): string {
  const out: string[] = []
  const totalHours = goals.reduce((sum, g) => sum + g.totalHours, 0)
  const totalCost = goals.reduce((sum, g) => sum + g.totalCost, 0)
  const totalBudget = totalWorkingHours * avgCostPerHour
  const matrix = computeStatusMatrix(goals)
  const overdue = computeOverdue(goals, now)
  const dueToday = computeDueToday(goals, now)

  out.push('## Scope')
  out.push(`Sprints/folders in scope: ${context.scope.map((s) => `${s.name} (${s.type})`).join(', ') || 'none'}`)
  out.push(
    `Settings: avg cost/hour ${formatCurrency(avgCostPerHour)}, total working hours ${totalWorkingHours}, ` +
      `budget ${formatCurrency(totalBudget)}, previous sprints counted for spill over ` +
      `${context.settings.previousSprintCount}`
  )
  if (timeRestriction === 'permission') {
    out.push(
      'CAVEAT: ClickUp refused the all-members time filter for part of this scope (token lacks Owner/Admin ' +
        'permission), so some hours may only reflect the calling user own logged time. Say so explicitly if ' +
        'hours are central to the answer.'
    )
  } else if (timeRestriction === 'error') {
    out.push(
      'CAVEAT: the all-members time request failed transiently (rate limit or a temporary error, not a ' +
        'permissions issue) for part of this scope, so some hours may only reflect the calling user own ' +
        'logged time. Say so explicitly if hours are central to the answer.'
    )
  }

  out.push('')
  out.push('## Headline')
  for (const row of matrix) {
    const parts = REPORT_STATUS_ORDER.map(
      (b) =>
        `${REPORT_STATUS_LABELS[b]} ${row.counts[b]} ` +
        `(${formatPercent(row.total > 0 ? row.counts[b] / row.total : 0)})`
    )
    out.push(`${row.label}: ${row.total} total — ${parts.join(' · ')}`)
  }
  out.push(
    `Hours logged ${formatHours(totalHours)} of ${totalWorkingHours}h capacity ` +
      `(${formatPercent(totalWorkingHours > 0 ? totalHours / totalWorkingHours : 0)})`
  )
  out.push(
    `Cost ${formatCurrency(totalCost)} of ${formatCurrency(totalBudget)} ` +
      `(${formatPercent(totalBudget > 0 ? totalCost / totalBudget : 0)})`
  )
  out.push(`Overdue: ${overdue.tasks} tasks, ${overdue.deliverables} deliverables, ${overdue.goals} goals`)
  out.push(`Due today: ${dueToday.tasks} tasks, ${dueToday.deliverables} deliverables, ${dueToday.goals} goals`)

  const attention = computeAttentionGoals(goals, now)
  out.push('')
  out.push(`## Needs attention (${attention.length} goals)`)
  if (attention.length === 0) out.push('Nothing blocked, on hold, overdue, due today, or not started.')
  for (const item of attention) {
    const flags = [
      item.blockedCount > 0 ? `${item.blockedCount} blocked` : null,
      item.onHoldCount > 0 ? `${item.onHoldCount} on hold` : null,
      item.overdueCount > 0 ? `${item.overdueCount} overdue (worst ${item.maxDaysOverdue}d)` : null,
      item.dueTodayCount > 0 ? `${item.dueTodayCount} due today` : null,
      item.notStartedCount > 0 ? `${item.notStartedCount} not started` : null,
    ].filter(Boolean)
    const people = item.people.map((p) => p.username).join(', ')
    out.push(`- ${short(item.name)} — ${flags.join(', ')}${people ? ` · people: ${people}` : ''}`)
  }

  out.push('')
  out.push('## Goals, deliverables and tasks')
  for (const goal of goals) {
    const goalTasks = goal.deliverables.flatMap((d) => d.tasks)
    const bucket = reportBucketForTasks(goalTasks.map((r) => r.task))
    const goalOverdue = countOverdue(goalTasks, now)
    const goalDueToday = countDueToday(goalTasks, now)
    const goalFlags = [
      goal.blockedCount > 0 ? `${goal.blockedCount} blocked` : null,
      goal.onHoldCount > 0 ? `${goal.onHoldCount} on hold` : null,
      goalOverdue > 0 ? `${goalOverdue} overdue` : null,
      goalDueToday > 0 ? `${goalDueToday} due today` : null,
    ].filter(Boolean)
    out.push(
      `### ${short(goal.name)} [${bucket ? REPORT_STATUS_LABELS[bucket] : 'unknown'}] ` +
        `${goal.doneCount}/${goal.totalCount} done, ${formatHours(goal.totalHours)}, ` +
        `${formatCurrency(goal.totalCost)}${goalFlags.length ? `, ${goalFlags.join(', ')}` : ''}` +
        `${goal.eta ? `, ETA ${formatShortDate(goal.eta)}` : ''}`
    )
    if (goal.outcome) out.push(`  outcome: ${short(goal.outcome)}`)

    for (const deliverable of goal.deliverables) {
      const dBucket = reportBucketForTasks(deliverable.tasks.map((r) => r.task))
      const shared = computeSharedTaskMeta(deliverable.tasks.map((r) => r.task))
      const sharedBits: string[] = []
      if (shared.metricCategory.state === 'uniform') sharedBits.push(`metric category: ${shared.metricCategory.value}`)
      if (shared.metricCategory.state === 'varies') sharedBits.push('metric category: varies by task')
      if (shared.implementationOwner.state === 'uniform')
        sharedBits.push(`implementation owner: ${shared.implementationOwner.value.username}`)
      if (shared.implementationOwner.state === 'varies') sharedBits.push('implementation owner: varies by task')
      if (shared.deliveryManager.state === 'uniform')
        sharedBits.push(`delivery manager: ${shared.deliveryManager.value.username}`)
      if (shared.deliveryManager.state === 'varies') sharedBits.push('delivery manager: varies by task')
      // The impacted metric is the one field long enough to blow the context budget
      // (up to ~1400 chars each), so only its presence is noted; get_task_detail
      // returns the text when a question actually needs it.
      if (shared.impactedMetric.state === 'uniform')
        sharedBits.push('impacted metric: set (call get_task_detail for the text)')
      if (shared.impactedMetric.state === 'varies') sharedBits.push('impacted metric: varies by task')

      out.push(
        `- ${short(deliverable.name)} [${dBucket ? REPORT_STATUS_LABELS[dBucket] : 'unknown'}] ` +
          `${deliverable.doneCount}/${deliverable.totalCount}, ${formatHours(deliverable.totalHours)}, ` +
          `${formatCurrency(deliverable.totalCost)}${sharedBits.length ? ` — ${sharedBits.join('; ')}` : ''}`
      )
      // Completed tasks are omitted line-by-line: they are already counted above,
      // and questions are almost always about work that is still moving. search_tasks
      // reaches them when a question genuinely needs one.
      const liveRows = deliverable.tasks.filter((r) => reportBucketForTask(r.task) !== 'completed')
      const doneCount = deliverable.tasks.length - liveRows.length
      if (doneCount > 0) out.push(`  (${doneCount} completed task(s) not listed; use search_tasks)`)
      for (const row of liveRows) {
        const t = row.task
        const marks = [
          isOverdueTask(t, now) ? `overdue ${daysOverdue(t, now)}d` : null,
          isDueTodayTask(t, now) ? 'due today' : null,
        ].filter(Boolean)
        const who = t.assignees.map((a) => a.username).join('/') || 'unassigned'
        out.push(
          `  · ${short(t.name)} [${t.status}] ${who}, ${formatHours(row.hoursSpent)}` +
            `${t.dueDate ? `, due ${formatShortDate(t.dueDate)}` : ', no due date'}` +
            `${marks.length ? `, ${marks.join(', ')}` : ''} (id ${t.id})`
        )
      }
    }
  }

  const byPerson = computeContributionByPerson(rows, avgCostPerHour)
  out.push('')
  out.push('## Hours and cost by person (committed scope only, spill over excluded)')
  for (const p of byPerson) {
    out.push(`- ${p.user.username}: ${p.taskCount} tasks, ${formatHours(p.hours)}, ${formatCurrency(p.cost)}`)
  }

  const byTag = groupByFunctionTag(rows)
  out.push('')
  out.push('## By function tag')
  for (const tag of byTag) {
    out.push(
      `- ${tag.name}: ${tag.doneCount}/${tag.totalCount} done, ${formatHours(tag.totalHours)}, ` +
        `${formatCurrency(tag.totalCost)}${tag.blockedCount > 0 ? `, ${tag.blockedCount} blocked` : ''}` +
        `${tag.onHoldCount > 0 ? `, ${tag.onHoldCount} on hold` : ''}`
    )
  }

  const notStarted = rows.filter((r) => reportBucketForTask(r.task) === 'notStarted').length
  out.push('')
  out.push(`(Digest built ${new Date(now).toISOString()}; ${rows.length} tasks, ${notStarted} not started.)`)

  return out.join('\n')
}
