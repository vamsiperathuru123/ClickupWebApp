import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { fetchTask, fetchStatusHistory } from '@/lib/mcp/clickupService'
import { callMcpTool } from '@/lib/mcp/mcpClient'
import { TOOLS } from '@/lib/mcp/toolNames'
import { computeContributionByPerson } from '@/lib/roadmap/resourceStats'
import { fetchSpilloverData } from '@/lib/roadmap/spillover'
import {
  REPORT_STATUS_LABELS,
  computeSpendByStatus,
  daysOverdue,
  groupRowsByField,
  isDueTodayTask,
  isOverdueTask,
  reportBucketForTask,
} from '@/lib/roadmap/overallReport'
import { NO_FUNCTION_TAG_LABEL } from '@/lib/roadmap/functionTagStats'
import { formatCurrency, formatHours } from '@/lib/roadmap/format'
import { formatShortDate } from '@/lib/dates'
import type { RoadmapTaskRow } from '@/lib/roadmap/types'
import type { BrainUiContext } from '@/lib/brain/types'
import type { ScopeDigest } from '../context/digest.js'

export interface ToolDeps {
  token: string
  workspaceId: string
  digest: ScopeDigest
  context: BrainUiContext
  /** Lets the transport surface "looked up X" progress to the UI. */
  onToolUse?: (name: string, summary: string) => void
}

const BUCKETS = ['completed', 'inProgressOpen', 'blocked', 'onHold', 'notStarted'] as const

function describeRow(row: RoadmapTaskRow, now: number): string {
  const t = row.task
  const bucket = reportBucketForTask(t)
  const marks = [
    isOverdueTask(t, now) ? `overdue ${daysOverdue(t, now)}d` : null,
    isDueTodayTask(t, now) ? 'due today' : null,
  ].filter(Boolean)
  return [
    `id=${t.id}`,
    `name=${t.name}`,
    `goal=${t.goal ?? '(none)'}`,
    `deliverable=${t.deliverable ?? '(none)'}`,
    `status=${t.status}`,
    `bucket=${bucket ? REPORT_STATUS_LABELS[bucket] : 'unknown'}`,
    `assignees=${t.assignees.map((a) => a.username).join('/') || 'unassigned'}`,
    `developer=${t.developer?.username ?? 'none'}`,
    `functionTag=${t.functionTag ?? '(none)'}`,
    `hours=${formatHours(row.hoursSpent)}`,
    `cost=${formatCurrency(row.cost)}`,
    `due=${t.dueDate ? formatShortDate(t.dueDate) : 'none'}`,
    marks.length ? marks.join('+') : null,
  ]
    .filter(Boolean)
    .join(' | ')
}

export function buildTools(deps: ToolDeps) {
  const { digest, token, workspaceId, context } = deps
  const now = digest.builtAt
  const report = (name: string, summary: string) => deps.onToolUse?.(name, summary)

  const searchTasks = tool(
    async ({ query, bucket, assignee, goal, functionTag, onlyOverdue, onlyDueToday, limit }) => {
      let rows = digest.rows
      const needle = query?.toLowerCase().trim()
      if (needle) rows = rows.filter((r) => r.task.name.toLowerCase().includes(needle))
      if (bucket) rows = rows.filter((r) => reportBucketForTask(r.task) === bucket)
      if (assignee) {
        const who = assignee.toLowerCase()
        rows = rows.filter(
          (r) =>
            r.task.assignees.some((a) => a.username.toLowerCase().includes(who)) ||
            r.task.developer?.username.toLowerCase().includes(who)
        )
      }
      if (goal) {
        const g = goal.toLowerCase()
        rows = rows.filter((r) => (r.task.goal ?? '').toLowerCase().includes(g))
      }
      if (functionTag) {
        const f = functionTag.toLowerCase()
        rows = rows.filter((r) => (r.task.functionTag ?? NO_FUNCTION_TAG_LABEL).toLowerCase().includes(f))
      }
      if (onlyOverdue) rows = rows.filter((r) => isOverdueTask(r.task, now))
      if (onlyDueToday) rows = rows.filter((r) => isDueTodayTask(r.task, now))

      const capped = rows.slice(0, limit ?? 25)
      report('search_tasks', `${rows.length} match${rows.length === 1 ? '' : 'es'}`)
      if (capped.length === 0) return 'No tasks in this scope match those filters.'
      const header = `${rows.length} matching task(s)${rows.length > capped.length ? `, showing ${capped.length}` : ''}:`
      return [header, ...capped.map((r) => describeRow(r, now))].join('\n')
    },
    {
      name: 'search_tasks',
      description:
        'Find tasks within the current scope by name, status bucket, assignee, goal, function tag, or ' +
        'overdue/due-today flags. Use this for anything the digest omits, including completed tasks.',
      schema: z.object({
        query: z.string().optional().describe('Case-insensitive substring of the task name'),
        bucket: z.enum(BUCKETS).optional(),
        assignee: z.string().optional().describe('Substring of an assignee or developer username'),
        goal: z.string().optional(),
        functionTag: z.string().optional(),
        onlyOverdue: z.boolean().optional(),
        onlyDueToday: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    }
  )

  const getTaskDetail = tool(
    async ({ taskId }) => {
      report('get_task_detail', taskId)
      const task = await fetchTask(token, taskId)
      const row = digest.rows.find((r) => r.task.id === taskId)
      return [
        `name: ${task.name}`,
        `status: ${task.status}`,
        `goal: ${task.goal ?? '(none)'}`,
        `deliverable: ${task.deliverable ?? '(none)'}`,
        `assignees: ${task.assignees.map((a) => a.username).join(', ') || 'unassigned'}`,
        `developer: ${task.developer?.username ?? 'none'}`,
        `priority: ${task.priority ?? 'none'}`,
        `due date: ${task.dueDate ? formatShortDate(task.dueDate) : 'none'}`,
        `sprint: ${task.sprintName ?? 'unknown'}`,
        `function tag: ${task.functionTag ?? '(none)'}`,
        `metric category: ${task.metricCategory ?? '(none)'}`,
        `impacted metric: ${task.impactedMetric ?? '(none)'}`,
        `implementation owner: ${task.implementationOwner?.username ?? '(none)'}`,
        `delivery manager: ${task.deliveryManager?.username ?? '(none)'}`,
        `outcome: ${task.outcome ?? '(none)'}`,
        row ? `hours logged: ${formatHours(row.hoursSpent)} (cost ${formatCurrency(row.cost)})` : 'hours: not in scope',
        task.description ? `description: ${task.description.slice(0, 1500)}` : 'description: (none)',
      ].join('\n')
    },
    {
      name: 'get_task_detail',
      description:
        'Full detail for one task by id, including the long impacted-metric text and description that the ' +
        'digest deliberately leaves out.',
      schema: z.object({ taskId: z.string() }),
    }
  )

  const getStatusHistory = tool(
    async ({ taskId }) => {
      report('get_task_status_history', taskId)
      const history = await fetchStatusHistory(token, taskId)
      if (history.length === 0) return 'No status history available for this task.'
      return history.map((h) => `${h.status} since ${formatShortDate(h.enteredAt)}`).join('\n')
    },
    {
      name: 'get_task_status_history',
      description: 'How long a task has sat in each status - use for "how long has this been blocked" questions.',
      schema: z.object({ taskId: z.string() }),
    }
  )

  const getPersonWorkload = tool(
    async ({ username }) => {
      const people = computeContributionByPerson(digest.rows, context.settings.avgCostPerHour)
      const filtered = username
        ? people.filter((p) => p.user.username.toLowerCase().includes(username.toLowerCase()))
        : people
      report('get_person_workload', username ?? `${filtered.length} people`)
      if (filtered.length === 0) return `No logged work found for "${username}" in this scope.`
      return [
        'Committed scope only - spill over is NOT included here:',
        ...filtered.map(
          (p) => `${p.user.username}: ${p.taskCount} tasks, ${formatHours(p.hours)}, ${formatCurrency(p.cost)}`
        ),
      ].join('\n')
    },
    {
      name: 'get_person_workload',
      description: 'Tasks, hours and cost per person for the committed scope. Omit username for everyone.',
      schema: z.object({ username: z.string().optional() }),
    }
  )

  const getReportMetrics = tool(
    async ({ groupBy }) => {
      report('get_report_metrics', groupBy)
      if (groupBy === 'status') {
        return computeSpendByStatus(digest.rows)
          .map(
            (e) =>
              `${REPORT_STATUS_LABELS[e.bucket]}: ${e.taskCount} tasks, ${formatHours(e.totalHours)}, ` +
              `${formatCurrency(e.totalCost)}`
          )
          .join('\n')
      }
      const fieldOf =
        groupBy === 'functionTag'
          ? (t: { functionTag?: string | null }) => t.functionTag
          : groupBy === 'metricCategory'
            ? (t: { metricCategory?: string | null }) => t.metricCategory
            : (t: { impactedMetric?: string | null }) => t.impactedMetric
      const unset =
        groupBy === 'functionTag'
          ? NO_FUNCTION_TAG_LABEL
          : groupBy === 'metricCategory'
            ? '(No Metric Category)'
            : '(No Impacted Metric)'
      return groupRowsByField(digest.rows, fieldOf as never, unset, now)
        .map(
          (g) =>
            `${g.key}: ${g.doneCount}/${g.taskCount} done, ${formatHours(g.totalHours)}, ` +
            `${formatCurrency(g.totalCost)}, ${g.overdueCount} overdue, ${g.dueTodayCount} due today`
        )
        .join('\n')
    },
    {
      name: 'get_report_metrics',
      description: 'Hours, cost and completion grouped by status, function tag, metric category, or impacted metric.',
      schema: z.object({ groupBy: z.enum(['status', 'functionTag', 'metricCategory', 'impactedMetric']) }),
    }
  )

  const getSpillover = tool(
    async () => {
      const previousSprintCount = context.settings.previousSprintCount
      if (previousSprintCount <= 0) {
        return 'No. of previous sprints is not set in the Spill Over tab, so there is no spill over data to read.'
      }
      report('get_spillover', `${previousSprintCount} previous sprint(s)`)
      const result = await fetchSpilloverData(token, workspaceId, context.scope, previousSprintCount)
      if (result.rows.length === 0) return 'Spill over data is empty for this scope.'
      const byBucket = new Map<string, number>()
      for (const row of result.rows) byBucket.set(row.bucket, (byBucket.get(row.bucket) ?? 0) + 1)
      const hours = result.rows.reduce((sum, r) => sum + r.hoursSpent, 0)
      return [
        `Carried over from ${result.spilloverSprintNames.join(', ') || 'previous sprints'}:`,
        `${result.rows.length} tasks, ${formatHours(hours)} logged.`,
        ...[...byBucket.entries()].map(([bucket, count]) => `${bucket}: ${count}`),
        '',
        'Tasks:',
        ...result.rows
          .slice(0, 40)
          .map(
            (r) =>
              `id=${r.task.id} | ${r.task.name} | ${r.task.status} | bucket=${r.bucket} | ` +
              `from=${r.spilloverSprintName} | hours=${formatHours(r.hoursSpent)}`
          ),
      ].join('\n')
    },
    {
      name: 'get_spillover',
      description:
        'Work carried over from previous sprints, classified as completed, still open, blocked/on hold, or ' +
        'completed in an upcoming sprint. Separate from the committed figures.',
      schema: z.object({}),
    }
  )

  const getTaskComments = tool(
    async ({ taskId }) => {
      report('get_task_comments', taskId)
      const raw = (await callMcpTool(token, TOOLS.getTaskComments, {
        task_id: taskId,
        taskId,
      })) as { comments?: Array<{ user?: { username?: string }; comment_text?: string; date?: string }> }
      const comments = raw?.comments ?? []
      if (comments.length === 0) return 'No comments on this task.'
      return comments
        .slice(0, 20)
        .map((c) => `${c.user?.username ?? 'unknown'}: ${(c.comment_text ?? '').slice(0, 500)}`)
        .join('\n---\n')
    },
    {
      name: 'get_task_comments',
      description: 'Comment thread on a task - use for "why is this blocked" questions where the reason is discussed.',
      schema: z.object({ taskId: z.string() }),
    }
  )

  return [
    searchTasks,
    getTaskDetail,
    getStatusHistory,
    getPersonWorkload,
    getReportMetrics,
    getSpillover,
    getTaskComments,
  ]
}
