import { Fragment, useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Avatar } from '@/components/common/Avatar'
import { StatusBadge } from '@/components/common/Badges'
import { formatShortDate } from '@/lib/dates'
import { formatCurrency, formatHours, formatPercent } from '@/lib/roadmap/format'
import {
  REPORT_STATUS_LABELS,
  computeSharedTaskMeta,
  countDueToday,
  countOverdue,
  daysOverdue,
  fieldVaries,
  isDueTodayTask,
  isOverdueTask,
  reportBucketForTasks,
  type ReportStatusBucket,
  type SharedField,
  type SharedTaskMeta,
} from '@/lib/roadmap/overallReport'
import type { AppTask, ClickUpUser } from '@/types/clickup'
import type { RoadmapDeliverable, RoadmapGoal, RoadmapTaskRow } from '@/lib/roadmap/types'

/** Every place that renders this ledger (Overall Report, and now Function Tag)
 * lines its five columns up under the same header, so the column widths live in
 * one place rather than being retyped per call site. */
export const LEDGER_GRID_TEMPLATE = '1fr 90px 70px 90px 170px'

/** The column header row above a list of `GoalLedgerRow`s. */
export function GoalLedgerHeader() {
  return (
    <div
      className="grid gap-2 pb-1.5 text-[11px] uppercase tracking-wide text-gray-500"
      style={{ gridTemplateColumns: LEDGER_GRID_TEMPLATE }}
    >
      <div>Goal / deliverable / task</div>
      <div className="text-right">Done</div>
      <div className="text-right">Hours</div>
      <div className="text-right">Cost</div>
      <div className="text-right">Flags</div>
    </div>
  )
}

/** Text color per bucket — shared with the status-matrix breakdown in
 * OverallReportTab, so the same bucket always reads in the same color everywhere. */
export const BUCKET_TEXT: Record<ReportStatusBucket, string> = {
  completed: 'text-green-400',
  inProgressOpen: 'text-accent-400',
  blocked: 'text-red-400',
  onHold: 'text-yellow-400',
  notStarted: 'text-gray-400',
}

export function Flags({
  blocked,
  onHold,
  overdue,
  dueToday,
  notStarted = 0,
  maxDays,
}: {
  blocked: number
  onHold: number
  overdue: number
  dueToday: number
  /** Only the Needs-attention list passes this — in the goal ledger nearly every
   * row would carry it, which drowns out the flags that actually need action. */
  notStarted?: number
  maxDays?: number
}) {
  if (blocked === 0 && onHold === 0 && overdue === 0 && dueToday === 0 && notStarted === 0) {
    return <span className="text-gray-600 text-[11px]">—</span>
  }
  return (
    <span className="flex items-center justify-end gap-1 flex-wrap">
      {blocked > 0 && (
        <span className="rounded bg-red-500/15 text-red-400 text-[10px] px-1.5 py-0.5">{blocked} blocked</span>
      )}
      {onHold > 0 && (
        <span className="rounded bg-yellow-500/15 text-yellow-400 text-[10px] px-1.5 py-0.5">{onHold} on hold</span>
      )}
      {overdue > 0 && (
        <span className="rounded bg-orange-500/15 text-orange-400 text-[10px] px-1.5 py-0.5">
          {overdue} overdue{maxDays ? ` · ${maxDays}d` : ''}
        </span>
      )}
      {dueToday > 0 && (
        <span className="rounded bg-blue-500/15 text-blue-400 text-[10px] px-1.5 py-0.5">{dueToday} due today</span>
      )}
      {notStarted > 0 && (
        <span className="rounded bg-gray-500/15 text-gray-400 text-[10px] px-1.5 py-0.5">
          {notStarted} not started
        </span>
      )}
    </span>
  )
}

/** The fields this task's siblings disagree on, stated for this task alone.
 *
 * Only the differing ones appear — the rest are settled once on the deliverable
 * above, and no field is ever stated at both levels. Every field that does appear
 * is labelled, whether one differs or all four, so a task panel always reads the
 * same way and never has to be interpreted from its position. */
function TaskMetaPanel({ task, shared }: { task: AppTask; shared: SharedTaskMeta }) {
  const rows: Array<{ label: string; value?: string | null; user?: ClickUpUser | null; wrap?: boolean }> = []
  if (fieldVaries(shared.metricCategory)) rows.push({ label: 'Metric category', value: task.metricCategory })
  if (fieldVaries(shared.impactedMetric)) rows.push({ label: 'Impacted metric', value: task.impactedMetric, wrap: true })
  if (fieldVaries(shared.implementationOwner)) rows.push({ label: 'Implementation owner', user: task.implementationOwner })
  if (fieldVaries(shared.deliveryManager)) rows.push({ label: 'Delivery manager', user: task.deliveryManager })
  if (rows.length === 0) return null

  return (
    <div className="ml-6 mt-1 mb-0.5 rounded border border-surface-border/60 bg-surface-100 px-2.5 py-1.5">
      <div
        className="grid gap-x-2.5 gap-y-1 text-[11px] items-baseline"
        style={{ gridTemplateColumns: '118px minmax(0,1fr)' }}
      >
        {rows.map((r) => (
          <Fragment key={r.label}>
            <span className="text-gray-600">{r.label}</span>
            {r.user ? (
              <span className="flex items-center gap-1.5 min-w-0">
                <Avatar user={r.user} size={14} />
                <span className="truncate text-gray-300">{r.user.username}</span>
              </span>
            ) : r.value ? (
              // Long metric text carries its own line breaks from ClickUp, so it
              // reads as the sentences it was written as rather than one block.
              <span className={clsx('min-w-0 text-gray-300', r.wrap && 'whitespace-pre-line')}>{r.value}</span>
            ) : (
              // An explicit dash, not a blank: this field varies across the
              // deliverable, so "unset here" is a real answer worth showing.
              <span className="text-gray-600">—</span>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/** One value of the deliverable-level rollup: the shared value, an amber "varies"
 * pointer down to the task rows, or an explicit dash when no task sets it. */
function SharedValue({ field, wrap }: { field: SharedField<string | ClickUpUser>; wrap?: boolean }) {
  if (field.state === 'varies') {
    return <span className="text-amber-500/90">varies · {field.distinctCount} ↓</span>
  }
  if (field.state === 'empty') return <span className="text-gray-600">—</span>
  const user = typeof field.value === 'object' ? (field.value as ClickUpUser) : null
  const partial = field.presentCount < field.totalCount
  return (
    <span className="flex items-baseline gap-1.5 min-w-0">
      {user ? (
        <span className="flex items-center gap-1.5 min-w-0">
          <Avatar user={user} size={14} />
          <span className="truncate text-gray-300">{user.username}</span>
        </span>
      ) : (
        // ClickUp's own line breaks are preserved — the long metrics are written
        // as several sentences and read far better kept that way.
        <span className={clsx('min-w-0 text-gray-300', wrap && 'whitespace-pre-line')}>{String(field.value)}</span>
      )}
      {partial && (
        <span className="shrink-0 text-gray-600" title={`Set on ${field.presentCount} of ${field.totalCount} tasks`}>
          {field.presentCount}/{field.totalCount}
        </span>
      )}
    </span>
  )
}

/**
 * The four descriptive fields for a deliverable, stated once for all its tasks.
 *
 * The three short ones sit in fixed columns so they land at the same x position on
 * every deliverable and can be scanned straight down the ledger; the impacted
 * metric gets its own full-width line, since it's the only one long enough to need
 * it (median 15 characters, but the tail runs past 1300). All four labels always
 * render, so the layout never shifts between deliverables.
 */
function DeliverableMetaGrid({ meta }: { meta: SharedTaskMeta }) {
  return (
    // Same panel treatment as the task-level block, so a reader recognises "these
    // four fields" as one object at either level; the indent is what separates them.
    <div className="ml-6 mr-1 mb-1.5 mt-0.5 rounded border border-surface-border/60 bg-surface-100 px-2.5 py-1.5">
      <div
        className="grid gap-x-3 gap-y-0.5 text-[11px]"
        style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}
      >
        <span className="text-gray-600">Metric category</span>
        <span className="text-gray-600">Implementation owner</span>
        <span className="text-gray-600">Delivery manager</span>
        <SharedValue field={meta.metricCategory} />
        <SharedValue field={meta.implementationOwner} />
        <SharedValue field={meta.deliveryManager} />
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-surface-border/40 text-[11px]">
        <span className="text-gray-600">Impacted metric</span>
        <div className="mt-0.5">
          <SharedValue field={meta.impactedMetric} wrap />
        </div>
      </div>
    </div>
  )
}

/** Same 5-column grid as the goal/deliverable rows above it, so every level of the
 * ledger lines up under one header. Status and Impacted Metric ride under the task
 * name rather than taking columns of their own, which would squeeze the name out. */
function TaskLedgerRow({ row, now, shared }: { row: RoadmapTaskRow; now: number; shared: SharedTaskMeta }) {
  const overdue = isOverdueTask(row.task, now)
  const dueToday = isDueTodayTask(row.task, now)
  return (
    // data-search-task is read by the standalone HTML export's search box.
    <div data-search-task={row.task.name} className="py-0.5">
      <div className="grid gap-2 items-center py-0.5 text-xs" style={{ gridTemplateColumns: LEDGER_GRID_TEMPLATE }}>
        <div className="min-w-0 pl-6 flex items-center gap-2">
          <span className="truncate text-gray-300 hover:text-accent-400 transition-colors" title={row.task.name}>
            {row.task.name}
          </span>
          <span className="shrink-0">
            <StatusBadge status={row.task.status} statusType={row.task.statusType} statusColor={row.task.statusColor} />
          </span>
        </div>
        <span className="text-right text-gray-600">—</span>
        <span className="text-right text-gray-400">{row.hoursSpent > 0 ? formatHours(row.hoursSpent) : '—'}</span>
        <span className="text-right text-gray-300">{row.cost > 0 ? formatCurrency(row.cost) : '—'}</span>
        <span
          className={clsx(
            'text-right text-[11px]',
            overdue ? 'text-orange-400' : dueToday ? 'text-blue-400' : 'text-gray-500'
          )}
        >
          {row.task.dueDate ? `due ${formatShortDate(row.task.dueDate)}` : '—'}
          {overdue && ` · ${daysOverdue(row.task, now)}d over`}
          {dueToday && ' · today'}
        </span>
      </div>
      <TaskMetaPanel task={row.task} shared={shared} />
    </div>
  )
}

function DeliverableLedgerRow({
  deliverable,
  now,
  forceExpanded,
  renderTasks,
}: {
  deliverable: RoadmapDeliverable
  now: number
  forceExpanded?: boolean
  /** Overrides how the expanded task list renders — Function Tag's "Task Details"
   * card keeps the pre-existing wide TaskTable at task level rather than adopting
   * this ledger's compact TaskLedgerRow, while still getting the goal/deliverable
   * styling (collapsed by default, the boxed meta grid) from this component. */
  renderTasks?: (deliverable: RoadmapDeliverable, shared: SharedTaskMeta) => ReactNode
}) {
  const [openState, setOpen] = useState(false)
  const open = forceExpanded ?? openState
  const progress = deliverable.totalCount > 0 ? deliverable.doneCount / deliverable.totalCount : 0
  const overdue = countOverdue(deliverable.tasks, now)
  const dueToday = countDueToday(deliverable.tasks, now)
  const shared = useMemo(() => computeSharedTaskMeta(deliverable.tasks.map((r) => r.task)), [deliverable.tasks])

  return (
    // data-search-deliverable is read by the standalone HTML export's search box.
    <div data-search-deliverable={deliverable.name} className="border-t border-surface-border/40">
      <button
        onClick={() => setOpen((o) => !o)}
        data-toggle
        className="w-full grid gap-2 items-center py-1.5 text-xs text-left hover:bg-surface-100/40"
        style={{ gridTemplateColumns: LEDGER_GRID_TEMPLATE }}
      >
        <span className="truncate text-gray-300 pl-3 hover:text-accent-400 transition-colors" title={deliverable.name}>
          <span data-caret className="text-gray-600 mr-1">
            {open ? '▾' : '▸'}
          </span>
          {deliverable.name}
        </span>
        <span className="text-right text-gray-400">
          {deliverable.doneCount}/{deliverable.totalCount} · {formatPercent(progress)}
        </span>
        <span className="text-right text-gray-400">{formatHours(deliverable.totalHours)}</span>
        <span className="text-right text-gray-300">{formatCurrency(deliverable.totalCost)}</span>
        <Flags blocked={deliverable.blockedCount} onHold={deliverable.onHoldCount} overdue={overdue} dueToday={dueToday} />
      </button>
      {/* Outside the toggle button on purpose: the metric text is meant to be read
          and selected, and clicking it shouldn't collapse the row. */}
      <DeliverableMetaGrid meta={shared} />
      {/* Always rendered and hidden with a style, never conditionally mounted — the
          standalone HTML export has no React, so its script toggles this instead. */}
      <div data-toggle-body className="pb-1" style={{ display: open ? 'block' : 'none' }}>
        {renderTasks
          ? renderTasks(deliverable, shared)
          : deliverable.tasks.map((row) => <TaskLedgerRow key={row.task.id} row={row} now={now} shared={shared} />)}
      </div>
    </div>
  )
}

/**
 * One goal in the ledger: collapsed it's a single row of totals; expanded it drills
 * down through deliverables to individual tasks, four descriptive fields settled at
 * whichever level every task under them agrees (see `DeliverableMetaGrid`). Shared
 * by the Overall Report tab's Goal ledger and the Function Tag tab's per-tag detail
 * — one component so both stay in sync rather than drifting apart.
 */
export function GoalLedgerRow({
  goal,
  now,
  forceExpanded,
  renderTasks,
}: {
  goal: RoadmapGoal
  now: number
  forceExpanded?: boolean
  /** Passed straight through to every `DeliverableLedgerRow` — see its own doc. */
  renderTasks?: (deliverable: RoadmapDeliverable, shared: SharedTaskMeta) => ReactNode
}) {
  const [openState, setOpen] = useState(false)
  const open = forceExpanded ?? openState
  const progress = goal.totalCount > 0 ? goal.doneCount / goal.totalCount : 0
  const rows = goal.deliverables.flatMap((d) => d.tasks)
  const overdue = countOverdue(rows, now)
  const dueToday = countDueToday(rows, now)
  const bucket = reportBucketForTasks(rows.map((r) => r.task))

  return (
    // data-search-goal is read by the standalone HTML export's search box.
    <div data-search-goal={goal.name} className="border-t border-surface-border">
      <button
        onClick={() => setOpen((o) => !o)}
        data-toggle
        className="w-full grid gap-2 items-center py-2 text-xs text-left hover:bg-surface-100/40"
        style={{ gridTemplateColumns: LEDGER_GRID_TEMPLATE }}
      >
        <span className="truncate text-gray-200 font-medium hover:text-accent-400 transition-colors" title={goal.name}>
          <span data-caret className="text-gray-600 mr-1">
            {open ? '▾' : '▸'}
          </span>
          {goal.name}
          {bucket && <span className={clsx('ml-2 text-[10px] font-normal', BUCKET_TEXT[bucket])}>{REPORT_STATUS_LABELS[bucket]}</span>}
        </span>
        <span className={clsx('text-right', progress >= 0.4 ? 'text-green-400' : 'text-red-400')}>
          {goal.doneCount}/{goal.totalCount} · {formatPercent(progress)}
        </span>
        <span className="text-right text-gray-400">{formatHours(goal.totalHours)}</span>
        <span className="text-right text-gray-300">{formatCurrency(goal.totalCost)}</span>
        <Flags blocked={goal.blockedCount} onHold={goal.onHoldCount} overdue={overdue} dueToday={dueToday} />
      </button>
      <div data-toggle-body className="pb-1" style={{ display: open ? 'block' : 'none' }}>
        {goal.deliverables.map((deliverable) => (
          <DeliverableLedgerRow
            key={deliverable.name}
            deliverable={deliverable}
            now={now}
            forceExpanded={forceExpanded}
            renderTasks={renderTasks}
          />
        ))}
      </div>
    </div>
  )
}
