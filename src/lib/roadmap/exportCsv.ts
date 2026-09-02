import { formatShortDate } from '@/lib/dates'
import { computeContributionByPerson, flattenTaskRows } from './resourceStats'
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUS_ORDER,
  computeAttentionGoals,
  computeDueToday,
  computeOverdue,
  computeSpendByStatus,
  computeStatusMatrix,
  daysOverdue,
  groupRowsByField,
  isDueTodayTask,
  isOverdueTask,
  reportBucketForTask,
  reportBucketForTasks,
  type MetricGroup,
} from './overallReport'
import { NO_FUNCTION_TAG_LABEL } from './functionTagStats'
import type { SpilloverTaskRow } from './spillover'
import type { RoadmapGoal } from './types'

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function row(values: Array<string | number | null | undefined>): string {
  return values.map(csvCell).join(',')
}

function statusSummary(doneCount: number, totalCount: number): string {
  return `${doneCount}/${totalCount} done`
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '0%'
}

const TASK_COLUMNS = [
  'Goal',
  'Goal Status',
  'Goal Bucket',
  'Deliverable',
  'Deliverable Status',
  'Task',
  'Task Status',
  'Task Bucket',
  'Assignees',
  'Developer',
  'Priority',
  'Sprint',
  'Function Tag',
  'Metric Category',
  'Impacted Metric',
  'Outcome',
  'Implementation Owner',
  'Delivery Manager',
  'Hours Spent (Task)',
  'Cost (Task)',
  'Hours Spent (Deliverable)',
  'Cost (Deliverable)',
  'Hours Spent (Goal)',
  'Cost (Goal)',
  'Due Date',
  'Beta Due Date',
  'Overdue',
  'Days Overdue',
  'Due Today',
]

function metricGroupSection(title: string, groups: MetricGroup[], totalCost: number, totalHours: number): string[] {
  const lines = [
    '',
    row([title]),
    row(['Name', 'Tasks', 'Completed', 'Overdue', 'Due Today', 'Hours', '% of Hours', 'Cost', '% of Cost']),
  ]
  for (const group of groups) {
    lines.push(
      row([
        group.key,
        group.taskCount,
        group.doneCount,
        group.overdueCount,
        group.dueTodayCount,
        group.totalHours.toFixed(2),
        pct(group.totalHours, totalHours),
        group.totalCost.toFixed(2),
        pct(group.totalCost, totalCost),
      ])
    )
  }
  return lines
}

export interface RoadmapCsvInput {
  goals: RoadmapGoal[]
  avgCostPerHour: number
  totalWorkingHours: number
  scopeNames: string[]
  spilloverRows: SpilloverTaskRow[]
  spilloverSprintNames: string[]
  previousSprintCount: number
}

/**
 * One workbook-style CSV covering everything the Roadmap Status report shows:
 * headline numbers, the status matrix, the full Goal → Deliverable → Task dump,
 * every breakdown (function tag, impacted metric, metric category, person,
 * status), the attention list, and the spillover rows. Sections are separated by a
 * blank line and a title row so a spreadsheet opens it as readable blocks.
 */
export function buildRoadmapCsv(input: RoadmapCsvInput): string {
  const { goals, avgCostPerHour, totalWorkingHours, scopeNames, spilloverRows } = input
  const now = Date.now()
  const rows = flattenTaskRows(goals)

  const totalCost = goals.reduce((sum, g) => sum + g.totalCost, 0)
  const totalHours = goals.reduce((sum, g) => sum + g.totalHours, 0)
  const totalBudget = avgCostPerHour * totalWorkingHours
  const deliverableCount = goals.reduce((sum, g) => sum + g.deliverables.length, 0)
  const taskCount = goals.reduce((sum, g) => sum + g.totalCount, 0)
  const overdue = computeOverdue(goals, now)
  const dueToday = computeDueToday(goals, now)

  const lines: string[] = []

  lines.push(row(['Roadmap Status Report']))
  lines.push(row(['Generated', new Date().toLocaleString()]))
  lines.push(row(['Scope', scopeNames.join('; ') || '—']))
  lines.push(row(['Avg Cost Per Hour', avgCostPerHour]))
  lines.push(row(['Total Working Hours', totalWorkingHours]))
  lines.push(row(['Total Budget', totalBudget.toFixed(2)]))

  lines.push('')
  lines.push(row(['Summary']))
  lines.push(row(['Metric', 'Value', '% of Total']))
  lines.push(row(['Goals', goals.length, '']))
  lines.push(row(['Deliverables', deliverableCount, '']))
  lines.push(row(['Tasks', taskCount, '']))
  lines.push(row(['Cost Used', totalCost.toFixed(2), pct(totalCost, totalBudget)]))
  lines.push(row(['Hours Used', totalHours.toFixed(2), pct(totalHours, totalWorkingHours)]))
  lines.push(row(['Overdue Tasks', overdue.tasks, pct(overdue.tasks, taskCount)]))
  lines.push(row(['Overdue Deliverables', overdue.deliverables, pct(overdue.deliverables, deliverableCount)]))
  lines.push(row(['Overdue Goals', overdue.goals, pct(overdue.goals, goals.length)]))
  lines.push(row(['Due Today Tasks', dueToday.tasks, pct(dueToday.tasks, taskCount)]))
  lines.push(row(['Due Today Deliverables', dueToday.deliverables, pct(dueToday.deliverables, deliverableCount)]))
  lines.push(row(['Due Today Goals', dueToday.goals, pct(dueToday.goals, goals.length)]))

  lines.push('')
  lines.push(row(['Status Matrix']))
  lines.push(row(['Level', 'Total', ...REPORT_STATUS_ORDER.flatMap((b) => [REPORT_STATUS_LABELS[b], '%'])]))
  for (const matrixRow of computeStatusMatrix(goals)) {
    lines.push(
      row([
        matrixRow.label,
        matrixRow.total,
        ...REPORT_STATUS_ORDER.flatMap((b) => [matrixRow.counts[b], pct(matrixRow.counts[b], matrixRow.total)]),
      ])
    )
  }

  lines.push(...metricGroupSection('By Function Tag', groupRowsByField(rows, (t) => t.functionTag, NO_FUNCTION_TAG_LABEL, now), totalCost, totalHours))
  lines.push(...metricGroupSection('By Impacted Metric', groupRowsByField(rows, (t) => t.impactedMetric, '(No Impacted Metric)', now), totalCost, totalHours))
  lines.push(...metricGroupSection('By Metric Category', groupRowsByField(rows, (t) => t.metricCategory, '(No Metric Category)', now), totalCost, totalHours))

  lines.push('')
  lines.push(row(['By Person']))
  lines.push(row(['Person', 'Tasks', 'Hours', '% of Hours', 'Cost', '% of Cost']))
  for (const person of computeContributionByPerson(rows, avgCostPerHour)) {
    lines.push(
      row([
        person.user.username,
        person.taskCount,
        person.hours.toFixed(2),
        pct(person.hours, totalHours),
        person.cost.toFixed(2),
        pct(person.cost, totalCost),
      ])
    )
  }

  lines.push('')
  lines.push(row(['By Status']))
  lines.push(row(['Status', 'Tasks', 'Hours', '% of Hours', 'Cost', '% of Cost']))
  for (const entry of computeSpendByStatus(rows)) {
    lines.push(
      row([
        REPORT_STATUS_LABELS[entry.bucket],
        entry.taskCount,
        entry.totalHours.toFixed(2),
        pct(entry.totalHours, totalHours),
        entry.totalCost.toFixed(2),
        pct(entry.totalCost, totalCost),
      ])
    )
  }

  lines.push('')
  lines.push(row(['Needs Attention']))
  lines.push(row(['Goal', 'Blocked', 'On Hold', 'Overdue', 'Max Days Overdue', 'Due Today', 'Not Started']))
  const attention = computeAttentionGoals(goals, now)
  if (attention.length === 0) lines.push(row(['Nothing blocked, on hold, overdue, due today, or not started']))
  for (const item of attention) {
    lines.push(
      row([
        item.name,
        item.blockedCount,
        item.onHoldCount,
        item.overdueCount,
        item.maxDaysOverdue,
        item.dueTodayCount,
        item.notStartedCount,
      ])
    )
  }

  lines.push('')
  lines.push(row(['Goal Summary']))
  lines.push(row(['Goal', 'Bucket', 'Deliverables', 'Tasks', 'Done', '% Done', 'Blocked', 'On Hold', 'Overdue', 'Due Today', 'Hours', 'Cost', 'ETA']))
  for (const goal of goals) {
    const goalTasks = goal.deliverables.flatMap((d) => d.tasks)
    const bucket = reportBucketForTasks(goalTasks.map((r) => r.task))
    lines.push(
      row([
        goal.name,
        bucket ? REPORT_STATUS_LABELS[bucket] : '',
        goal.deliverables.length,
        goal.totalCount,
        goal.doneCount,
        pct(goal.doneCount, goal.totalCount),
        goal.blockedCount,
        goal.onHoldCount,
        goalTasks.filter((r) => isOverdueTask(r.task, now)).length,
        goalTasks.filter((r) => isDueTodayTask(r.task, now)).length,
        goal.totalHours.toFixed(2),
        goal.totalCost.toFixed(2),
        formatShortDate(goal.eta),
      ])
    )
  }

  lines.push('')
  lines.push(row(['Tasks']))
  lines.push(row(TASK_COLUMNS))
  for (const goal of goals) {
    const goalBucket = reportBucketForTasks(goal.deliverables.flatMap((d) => d.tasks).map((r) => r.task))
    for (const deliverable of goal.deliverables) {
      for (const taskRow of deliverable.tasks) {
        const task = taskRow.task
        const bucket = reportBucketForTask(task)
        const isOverdue = isOverdueTask(task, now)
        lines.push(
          row([
            goal.name,
            statusSummary(goal.doneCount, goal.totalCount),
            goalBucket ? REPORT_STATUS_LABELS[goalBucket] : '',
            deliverable.name,
            statusSummary(deliverable.doneCount, deliverable.totalCount),
            task.name,
            task.status,
            bucket ? REPORT_STATUS_LABELS[bucket] : '',
            task.assignees.map((a) => a.username).join('; '),
            task.developer?.username ?? '',
            task.priority ?? '',
            task.sprintName ?? '',
            task.functionTag ?? '',
            task.metricCategory ?? '',
            task.impactedMetric ?? '',
            taskRow.outcome ?? task.outcome ?? '',
            task.implementationOwner?.username ?? '',
            task.deliveryManager?.username ?? '',
            taskRow.hoursSpent.toFixed(2),
            taskRow.cost.toFixed(2),
            deliverable.totalHours.toFixed(2),
            deliverable.totalCost.toFixed(2),
            goal.totalHours.toFixed(2),
            goal.totalCost.toFixed(2),
            formatShortDate(task.dueDate),
            formatShortDate(task.betaDueDate),
            isOverdue ? 'Yes' : 'No',
            isOverdue ? daysOverdue(task, now) : '',
            isDueTodayTask(task, now) ? 'Yes' : 'No',
          ])
        )
      }
    }
  }

  lines.push('')
  lines.push(row(['Spill Over']))
  lines.push(row(['Previous Sprints Checked', input.previousSprintCount]))
  lines.push(row(['Spillover Sprints', input.spilloverSprintNames.join('; ') || '—']))
  if (input.previousSprintCount === 0) {
    lines.push(row(['No. of Previous Sprints is not entered']))
  } else if (spilloverRows.length === 0) {
    lines.push(row(['Spillover Data is empty']))
  } else {
    lines.push(
      row([
        'Task',
        'Bucket',
        'Team',
        'Goal',
        'Deliverable',
        'Status',
        'Assignees',
        'Developer',
        'Spillover Sprint',
        'Completed Sprint',
        'Completion Date',
        'Due Date',
        'Hours',
        'Cost',
        'TAT (days)',
      ])
    )
    for (const spillRow of spilloverRows) {
      lines.push(
        row([
          spillRow.task.name,
          spillRow.bucket,
          spillRow.audience,
          spillRow.task.goal ?? '',
          spillRow.task.deliverable ?? '',
          spillRow.task.status,
          spillRow.task.assignees.map((a) => a.username).join('; '),
          spillRow.task.developer?.username ?? '',
          spillRow.spilloverSprintName,
          spillRow.currentSprintName ?? '',
          spillRow.completedAt ? formatShortDate(spillRow.completedAt) : '',
          formatShortDate(spillRow.task.dueDate),
          spillRow.hoursSpent.toFixed(2),
          (spillRow.hoursSpent * avgCostPerHour).toFixed(2),
          spillRow.tatMs == null ? '' : (spillRow.tatMs / (1000 * 60 * 60 * 24)).toFixed(1),
        ])
      )
    }
  }

  return lines.join('\n')
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
