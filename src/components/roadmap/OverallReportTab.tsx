import { Fragment, useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Avatar } from '@/components/common/Avatar'
import { StatusBadge } from '@/components/common/Badges'
import { InlineSpinner } from '@/components/common/Spinner'
import { ErrorBanner, friendlyErrorMessage } from '@/components/common/ErrorBanner'
import { useRoadmapStore } from '@/store/roadmapStore'

import { formatShortDate } from '@/lib/dates'
import { formatCurrency, formatHours, formatPercent } from '@/lib/roadmap/format'
import { filterRoadmapGoalsByAudience } from '@/lib/roadmap/filterRoadmap'
import { flattenTaskRows, computeContributionByPerson } from '@/lib/roadmap/resourceStats'
import { buildRoadmapFromTaskRows, dedupeTaskRowsById } from '@/lib/roadmap/aggregate'
import { NO_FUNCTION_TAG_LABEL } from '@/lib/roadmap/functionTagStats'
import type { AudienceFilter } from '@/lib/roadmap/taskGroups'
import type { AppTask, ClickUpUser } from '@/types/clickup'
import {
  REPORT_STATUS_LABELS,
  REPORT_STATUS_ORDER,
  ATTENTION_FILTER_LABELS,
  ATTENTION_FLAG_ORDER,
  attentionFlagsForTask,
  taskMatchesAttentionFilter,
  type AttentionFilter,
  computeAttentionGoals,
  type AttentionGoal,
  computeDueToday,
  computeOverdue,
  computeSpendByStatus,
  computeStatusMatrix,
  daysOverdue,
  groupRowsByField,
  isDueTodayTask,
  isOverdueTask,
} from '@/lib/roadmap/overallReport'
import { AudienceTabs } from './AudienceTabs'
import { BUCKET_TEXT, Flags, GoalLedgerHeader, GoalLedgerRow } from './GoalLedger'
import { useReportSettings, useReportSpillover } from './ReportSettingsContext'
import type { SpilloverBucket, SpilloverTaskRow } from '@/lib/roadmap/spillover'
import { NO_DELIVERABLE_LABEL, NO_GOAL_LABEL, type RoadmapGoal, type RoadmapTaskRow } from '@/lib/roadmap/types'

const NO_IMPACTED_METRIC_LABEL = '(No Impacted Metric)'
const NO_METRIC_CATEGORY_LABEL = '(No Metric Category)'

/** The four spillover outcomes, in the order the Spill Over tab lists them. */
const SPILL_STAGES: Array<{ key: SpilloverBucket; label: string; tone: string }> = [
  { key: 'completed', label: 'Completed', tone: 'text-green-400' },
  { key: 'open', label: 'Still open', tone: 'text-accent-400' },
  { key: 'blocked', label: 'Blocked / on hold', tone: 'text-red-400' },
  { key: 'completedUpcoming', label: 'Completed in upcoming sprints', tone: 'text-gray-300' },
]

function SectionCard({
  title,
  right,
  subheader,
  className,
  children,
}: {
  title: string
  right?: ReactNode
  /** Full-width strip under the title — for controls that don't fit beside it
   * without wrapping the title or stacking themselves three deep. */
  subheader?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={clsx('rounded-lg border border-surface-border bg-surface-300 p-4 flex flex-col', className)}>
      <div className={clsx('flex items-center justify-between', subheader ? 'mb-2' : 'mb-3')}>
        <div className="text-[11px] uppercase tracking-wide text-gray-500 whitespace-nowrap">{title}</div>
        {right}
      </div>
      {subheader && <div className="shrink-0 mb-2">{subheader}</div>}
      {children}
    </div>
  )
}

/** Every breakdown panel gets the same fixed body height and scrolls internally,
 * so a tag list of 3 and one of 30 still produce identically sized cards. */
function BreakdownCard({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <SectionCard title={title} className={className}>
      <div className="h-52 overflow-y-auto pr-0.5">{children}</div>
    </SectionCard>
  )
}

/**
 * Headline figure is the total (committed + spill over); the card then splits that
 * total into its two halves with a proportion bar and both sides labelled. The
 * split only renders when there's spillover to show — all six cards share that
 * state, so they stay the same height as each other either way.
 */
function KpiCard({
  label,
  value,
  sub,
  tone,
  split,
}: {
  label: string
  value: string
  sub?: string
  tone?: string
  split?: {
    committedLabel: string
    committedWeight: number
    spillLabel: string
    spillWeight: number
    /** Currency and hours are long enough that prefixing each half with its name
     * truncates them; there the bar and the caption below the grid carry the
     * meaning instead. */
    showWords: boolean
  }
}) {
  const totalWeight = split ? split.committedWeight + split.spillWeight : 0
  return (
    <div className="rounded-lg border border-surface-border bg-surface-300 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 truncate" title={label}>
        {label}
      </div>
      <div className={clsx('text-lg font-semibold leading-tight', tone ?? 'text-gray-100')}>
        {value}
        {sub && <span className="text-[10px] font-normal text-gray-500 ml-1">{sub}</span>}
      </div>
      {split && (
        <>
          <div className="flex h-0.5 rounded overflow-hidden mt-1.5 bg-surface-100">
            <div className="bg-gray-500" style={{ flexGrow: totalWeight > 0 ? split.committedWeight : 1 }} />
            <div className="bg-accent-500" style={{ flexGrow: totalWeight > 0 ? split.spillWeight : 0 }} />
          </div>
          <div className="flex items-center justify-between gap-1.5 text-[10px] text-gray-500 mt-1">
            <span className="truncate">
              {split.showWords && 'Committed '}
              <span className="text-gray-300">{split.committedLabel}</span>
            </span>
            <span className="truncate">
              {split.showWords && 'Spill '}
              <span className="text-accent-400">{split.spillLabel}</span>
            </span>
          </div>
        </>
      )}
    </div>
  )
}

/** Name · hours · cost (+ share of total cost) — the shape every breakdown panel
 * uses, so Function Tag / Impacted Metric / Person / Status all read the same way. */
function BreakdownRow({
  name,
  avatar,
  hours,
  cost,
  costShare,
  meta,
}: {
  name: string
  avatar?: ReactNode
  hours: number
  cost: number
  costShare: number
  meta?: string
}) {
  return (
    <div className="flex items-center gap-2 text-xs py-1 border-b border-surface-border/50 last:border-b-0">
      {avatar}
      <span className="flex-1 min-w-0 truncate text-gray-300" title={name}>
        {name}
        {meta && <span className="text-gray-500 ml-1.5">{meta}</span>}
      </span>
      <span className="w-14 shrink-0 text-right text-gray-400">{formatHours(hours)}</span>
      <span className="w-20 shrink-0 text-right text-gray-300">{formatCurrency(cost)}</span>
      <span className="w-9 shrink-0 text-right text-gray-500">{formatPercent(costShare)}</span>
    </div>
  )
}

/** One labelled detail on a task row — either a text value or a person. Renders
 * nothing when unset, so a task missing half these fields doesn't leave a row of
 * empty dashes. */
function MetaField({ label, value, user }: { label: string; value?: string | null; user?: ClickUpUser | null }) {
  if (user) {
    return (
      <span className="inline-flex items-center gap-1 shrink-0 text-[10px] min-w-0">
        <span className="text-gray-600">{label}</span>
        <Avatar user={user} size={13} />
        <span className="truncate text-gray-400">{user.username}</span>
      </span>
    )
  }
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] min-w-0 max-w-[240px]">
      <span className="shrink-0 text-gray-600">{label}</span>
      <span className="truncate text-gray-400" title={value}>
        {value}
      </span>
    </span>
  )
}

function PersonChip({ user }: { user: ClickUpUser }) {
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <Avatar user={user} size={14} />
      <span className="text-gray-400">{user.username}</span>
    </span>
  )
}

/** One flagged task inside an expanded Needs-attention goal: what it is, who's on
 * it, and why it's flagged. */
function AttentionTaskRow({ row, now }: { row: RoadmapTaskRow; now: number }) {
  const task = row.task
  const overdue = isOverdueTask(task, now)
  const dueToday = isDueTodayTask(task, now)
  return (
    // data-attn lets the standalone HTML export's script apply the same flag
    // filter without React.
    <div
      data-attn={attentionFlagsForTask(task, now).join(' ')}
      className="py-1 pl-5 border-b border-surface-border/40 last:border-b-0"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-[11px] text-gray-300 hover:text-accent-400 transition-colors" title={task.name}>
          {task.name}
        </span>
        <span className="shrink-0">
          <StatusBadge status={task.status} statusType={task.statusType} statusColor={task.statusColor} />
        </span>
        <span
          className={clsx(
            'shrink-0 text-[10px] w-20 text-right',
            overdue ? 'text-orange-400' : dueToday ? 'text-blue-400' : 'text-gray-600'
          )}
        >
          {overdue
            ? `${daysOverdue(task, now)}d over`
            : dueToday
              ? 'due today'
              : task.dueDate
                ? formatShortDate(task.dueDate)
                : '—'}
        </span>
      </div>
      <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5 text-[10px] text-gray-600">
        <span className="inline-flex items-center gap-1.5">
          Assignee
          {task.assignees.length > 0 ? (
            task.assignees.map((user) => <PersonChip key={user.id} user={user} />)
          ) : (
            <span className="text-gray-600">—</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5">
          Dev
          {task.developer ? <PersonChip user={task.developer} /> : <span className="text-gray-600">—</span>}
        </span>
      </div>
    </div>
  )
}

/** A goal in the Needs-attention list. Collapsed it names who's involved; expanded
 * it drills into the specific flagged tasks, the same way the goal ledger does. */
function AttentionRow({
  item,
  now,
  rows,
  forceExpanded,
}: {
  item: AttentionGoal
  now: number
  /** Already narrowed to the active flag filter. */
  rows: RoadmapTaskRow[]
  forceExpanded?: boolean
}) {
  const [openState, setOpen] = useState(false)
  const open = forceExpanded ?? openState
  const goalFlags = Array.from(new Set(rows.flatMap((r) => attentionFlagsForTask(r.task, now))))

  return (
    <div data-attn={goalFlags.join(' ')} className="border-b border-surface-border/50 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        data-toggle
        className="w-full text-left py-1 hover:bg-surface-100/40"
      >
        <div className="flex items-start gap-2">
          <span className="flex-1 min-w-0 truncate text-xs text-gray-300 hover:text-accent-400 transition-colors" title={item.name}>
            <span data-caret className="text-gray-600 mr-1">
              {open ? '▾' : '▸'}
            </span>
            {item.name}
          </span>
          {/* Capped so the flags can't squeeze the goal name down to nothing —
              they wrap within their own half of the row instead. */}
          <span className="shrink-0 max-w-[55%]">
            <Flags
              blocked={item.blockedCount}
              onHold={item.onHoldCount}
              overdue={item.overdueCount}
              dueToday={item.dueTodayCount}
              notStarted={item.notStartedCount}
              maxDays={item.maxDaysOverdue}
            />
          </span>
        </div>
        {item.people.length > 0 && (
          <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap pl-4 mt-0.5 text-[10px] text-gray-600">
            {item.people.map((user) => (
              <PersonChip key={user.id} user={user} />
            ))}
          </div>
        )}
      </button>
      <div data-toggle-body className="pb-1" style={{ display: open ? 'block' : 'none' }}>
        {rows.map((row) => (
          <AttentionTaskRow key={row.task.id} row={row} now={now} />
        ))}
      </div>
    </div>
  )
}

/** One spillover task inside an expanded stage: which deliverable it belongs to,
 * who is on it, what it cost, and which sprint it slipped from. */
function SpillTaskRow({ row }: { row: SpilloverTaskRow }) {
  const { avgCostPerHour } = useReportSettings()
  const task = row.task
  return (
    <div className="py-1 pl-5 border-b border-surface-border/40 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-[11px] text-gray-300 hover:text-accent-400 transition-colors" title={task.name}>
          {task.name}
        </span>
        <span className="shrink-0">
          <StatusBadge status={task.status} statusType={task.statusType} statusColor={task.statusColor} />
        </span>
        <span className="shrink-0 w-24 text-right text-[10px] text-gray-400">
          {row.hoursSpent > 0 ? `${formatHours(row.hoursSpent)} · ${formatCurrency(row.hoursSpent * avgCostPerHour)}` : '—'}
        </span>
      </div>
      <div className="flex items-center gap-x-3 gap-y-0.5 flex-wrap mt-0.5 min-w-0">
        <MetaField label="Deliverable" value={task.deliverable?.trim() || NO_DELIVERABLE_LABEL} />
        <MetaField label="From" value={row.spilloverSprintName} />
        {task.assignees.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[10px] text-gray-600">
            Assignee
            {task.assignees.map((user) => (
              <PersonChip key={user.id} user={user} />
            ))}
          </span>
        )}
        <MetaField label="Dev" user={task.developer} />
      </div>
    </div>
  )
}

/** A goal within a selected spillover stage — collapsed it shows the task count
 * and carried effort, expanded it lists the tasks. Mirrors the Needs-attention
 * rows, including the export-friendly toggle attributes. */
function SpillGoalRow({
  goal,
  rows,
  forceExpanded,
}: {
  goal: string
  rows: SpilloverTaskRow[]
  forceExpanded?: boolean
}) {
  const { avgCostPerHour } = useReportSettings()
  const [openState, setOpen] = useState(false)
  const open = forceExpanded ?? openState
  const hours = rows.reduce((sum, r) => sum + r.hoursSpent, 0)
  const deliverables = new Set(rows.map((r) => r.task.deliverable?.trim() || NO_DELIVERABLE_LABEL)).size

  return (
    <div className="border-b border-surface-border/50 last:border-b-0">
      <button onClick={() => setOpen((o) => !o)} data-toggle className="w-full text-left py-1 hover:bg-surface-100/40">
        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0 truncate text-[11px] text-gray-300 hover:text-accent-400 transition-colors" title={goal}>
            <span data-caret className="text-gray-600 mr-1">
              {open ? '▾' : '▸'}
            </span>
            {goal}
          </span>
          <span className="shrink-0 text-[10px] text-gray-500">
            {deliverables} deliv · {rows.length} task{rows.length === 1 ? '' : 's'}
          </span>
          <span className="shrink-0 w-24 text-right text-[10px] text-gray-400">
            {formatHours(hours)} · {formatCurrency(hours * avgCostPerHour)}
          </span>
        </div>
      </button>
      <div data-toggle-body className="pb-1" style={{ display: open ? 'block' : 'none' }}>
        {rows.map((row) => (
          <SpillTaskRow key={row.task.id} row={row} />
        ))}
      </div>
    </div>
  )
}

export function OverallReportTab({
  goals: allGoals,
  forceExpanded,
  audienceOverride,
}: {
  goals: RoadmapGoal[]
  forceExpanded?: boolean
  /** Static-render override used by the HTML export — see GoalsTab. */
  audienceOverride?: AudienceFilter
}) {
  const { avgCostPerHour, totalWorkingHours, previousSprintCount } = useReportSettings()
  const storeAudience = useRoadmapStore((s) => s.overallAudience)
  const setAudience = useRoadmapStore((s) => s.setOverallAudience)
  const audience = audienceOverride ?? storeAudience

  const spillover = useReportSpillover()

  // Re-stamped whenever the data itself refreshes, rather than read on every
  // render (which would invalidate every memo below on each paint) or pinned at
  // mount (which left "overdue" and "due today" judged against the clock as of
  // page load — wrong for a tab left open past midnight, and not corrected by a
  // Resync either).
  const now = useMemo(() => Date.now(), [allGoals, spillover.rows])

  const goals = useMemo(() => filterRoadmapGoalsByAudience(allGoals, audience), [allGoals, audience])
  const rows = useMemo(() => flattenTaskRows(goals), [goals])

  const spilloverRows = useMemo(
    () => spillover.rows.filter((r) => audience === 'all' || r.audience === audience),
    [spillover.rows, audience]
  )

  /**
   * Committed task rows plus the spillover tasks that aren't already in a current
   * sprint. Only the By-person card uses this — a person's workload is what they
   * actually spent time on this sprint, carried-over work included. Every other
   * breakdown stays on the committed scope (`rows`) so it lines up with the Status
   * matrix and the goal ledger. Per-person splits for the spillover half come from
   * the spillover query's own time summaries; without them a person's spillover
   * hours would land in the total but not against their name.
   */
  const personRows = useMemo(() => {
    const baseTaskIds = new Set(rows.map((r) => r.task.id))
    const extra: RoadmapTaskRow[] = spilloverRows
      .filter((r) => !baseTaskIds.has(r.task.id))
      .map((r) => ({
        task: r.task,
        hoursSpent: r.hoursSpent,
        hoursByPerson: spillover.timeSummaries.get(r.task.id)?.byPerson ?? [],
        cost: r.hoursSpent * avgCostPerHour,
        outcome: r.task.outcome,
      }))
    return extra.length === 0 ? rows : [...rows, ...extra]
  }, [rows, spilloverRows, spillover.timeSummaries, avgCostPerHour])

  const matrix = useMemo(() => computeStatusMatrix(goals), [goals])
  const overdue = useMemo(() => computeOverdue(goals, now), [goals, now])
  const dueToday = useMemo(() => computeDueToday(goals, now), [goals, now])
  const attention = useMemo(() => computeAttentionGoals(goals, now), [goals, now])
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('all')

  /** Task totals per flag, shown on the chips. A task can carry more than one flag,
   * so these deliberately overlap and don't sum to the "All" count. */
  const attentionCounts = useMemo(() => {
    const counts: Record<AttentionFilter, number> = {
      all: 0,
      blocked: 0,
      onHold: 0,
      overdue: 0,
      dueToday: 0,
      notStarted: 0,
    }
    for (const item of attention) {
      for (const row of item.rows) {
        counts.all += 1
        for (const flag of attentionFlagsForTask(row.task, now)) counts[flag] += 1
      }
    }
    return counts
  }, [attention, now])

  const filteredAttention = useMemo(
    () =>
      attention
        .map((item) => ({ item, rows: item.rows.filter((r) => taskMatchesAttentionFilter(r.task, now, attentionFilter)) }))
        .filter((entry) => entry.rows.length > 0),
    [attention, attentionFilter, now]
  )
  const byFunctionTag = useMemo(
    () => groupRowsByField(rows, (t) => t.functionTag, NO_FUNCTION_TAG_LABEL, now),
    [rows, now]
  )
  const byImpactedMetric = useMemo(
    () => groupRowsByField(rows, (t) => t.impactedMetric, NO_IMPACTED_METRIC_LABEL, now),
    [rows, now]
  )
  const byMetricCategory = useMemo(
    () => groupRowsByField(rows, (t) => t.metricCategory, NO_METRIC_CATEGORY_LABEL, now),
    [rows, now]
  )
  const byPerson = useMemo(
    () => computeContributionByPerson(personRows, avgCostPerHour),
    [personRows, avgCostPerHour]
  )
  const byStatus = useMemo(() => computeSpendByStatus(rows), [rows])

  const totalCost = goals.reduce((sum, g) => sum + g.totalCost, 0)
  const totalHours = goals.reduce((sum, g) => sum + g.totalHours, 0)
  const totalBudget = avgCostPerHour * totalWorkingHours
  const deliverableCount = goals.reduce((sum, g) => sum + g.deliverables.length, 0)
  const taskCount = goals.reduce((sum, g) => sum + g.totalCount, 0)
  const blockedTasks = goals.reduce((sum, g) => sum + g.blockedCount, 0)
  const onHoldTasks = goals.reduce((sum, g) => sum + g.onHoldCount, 0)

  const spilloverStats = useMemo(() => {
    const counts = { completed: 0, open: 0, blocked: 0, completedUpcoming: 0 }
    let cost = 0
    let hours = 0
    for (const row of spilloverRows) {
      counts[row.bucket] += 1
      hours += row.hoursSpent
      cost += row.hoursSpent * avgCostPerHour
    }
    return { counts, cost, hours }
  }, [spilloverRows, avgCostPerHour])

  const [spillStage, setSpillStage] = useState<SpilloverBucket | null>(null)

  /** Spillover tasks grouped goal-by-goal within each stage, so picking a stage can
   * drill into the same Goal -> task shape the Needs-attention card uses. */
  const spillByStage = useMemo(() => {
    const empty = () => [] as Array<{ goal: string; rows: SpilloverTaskRow[] }>
    const result: Record<SpilloverBucket, Array<{ goal: string; rows: SpilloverTaskRow[] }>> = {
      completed: empty(),
      open: empty(),
      blocked: empty(),
      completedUpcoming: empty(),
    }
    for (const stage of SPILL_STAGES) {
      const byGoal = new Map<string, SpilloverTaskRow[]>()
      for (const row of spilloverRows) {
        if (row.bucket !== stage.key) continue
        const goal = row.task.goal?.trim() || NO_GOAL_LABEL
        if (!byGoal.has(goal)) byGoal.set(goal, [])
        byGoal.get(goal)!.push(row)
      }
      result[stage.key] = Array.from(byGoal.entries())
        .map(([goal, rows]) => ({ goal, rows }))
        .sort((a, b) => (a.goal === NO_GOAL_LABEL ? 1 : b.goal === NO_GOAL_LABEL ? -1 : a.goal.localeCompare(b.goal)))
    }
    return result
  }, [spilloverRows])

  /**
   * The spillover half of each headline figure, computed so committed + spill
   * always equals the headline.
   *
   * Every value counts only what spillover adds that the committed scope doesn't
   * already have: tasks not already in a current sprint (one task can be shared
   * into both via Tasks in Multiple Lists), and goals or deliverables that don't
   * already exist there. A goal worked on in both halves belongs to the committed
   * side and isn't counted twice — so a spillover goal that is also committed
   * contributes 0 here, by design.
   */
  const spilloverExtra = useMemo(() => {
    const baseTaskIds = new Set(rows.map((r) => r.task.id))
    const extraRows = spilloverRows.filter((r) => !baseTaskIds.has(r.task.id))
    const extraHours = extraRows.reduce((sum, r) => sum + r.hoursSpent, 0)

    const goalKey = (task: AppTask) => task.goal?.trim() || NO_GOAL_LABEL
    const deliverableKey = (task: AppTask) => `${goalKey(task)} ${task.deliverable?.trim() || NO_DELIVERABLE_LABEL}`
    const committedGoals = new Set(rows.map((r) => goalKey(r.task)))
    const committedDeliverables = new Set(rows.map((r) => deliverableKey(r.task)))

    const newGoals = new Set<string>()
    const newDeliverables = new Set<string>()
    for (const row of extraRows) {
      if (!committedGoals.has(goalKey(row.task))) newGoals.add(goalKey(row.task))
      if (!committedDeliverables.has(deliverableKey(row.task))) newDeliverables.add(deliverableKey(row.task))
    }

    return {
      spillGoals: newGoals.size,
      spillDeliverables: newDeliverables.size,
      spillTasks: extraRows.length,
      spillHours: extraHours,
      spillCost: extraHours * avgCostPerHour,
      spillOverdue: extraRows.filter((r) => isOverdueTask(r.task, now)).length,
    }
  }, [rows, spilloverRows, avgCostPerHour, now])

  /**
   * Spillover resolves several seconds after the committed data (it walks five
   * sprint lists plus their status history and time entries). Until it lands the
   * headline figures cover committed work only, which looks like plainly wrong
   * numbers that later jump — so say so rather than presenting them as final.
   */
  const spilloverPending =
    previousSprintCount > 0 && spilloverRows.length === 0 && (spillover.isLoading || spillover.isFetching)

  const hasSpilloverSplit = spilloverExtra.spillTasks > 0
  /** Builds the committed/spill-over halves for a KPI card, or nothing at all when
   * there's no spillover in scope. */
  const splitOf = (committed: number, spill: number, format?: (value: number) => string) =>
    hasSpilloverSplit
      ? {
          committedLabel: (format ?? String)(committed),
          committedWeight: committed,
          spillLabel: (format ?? String)(spill),
          spillWeight: spill,
          showWords: format === undefined,
        }
      : undefined

  const totalCostWithSpill = totalCost + spilloverExtra.spillCost
  const totalHoursWithSpill = totalHours + spilloverExtra.spillHours

  return (
    <div className="space-y-4">
      <AudienceTabs value={audience} onChange={setAudience} />

      {/* One row on a wide screen, folding to three-up only when the columns would
          get too narrow for the committed/spill figures. */}
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-2">
        <KpiCard
          label="Goals"
          value={String(goals.length + spilloverExtra.spillGoals)}
          split={splitOf(goals.length, spilloverExtra.spillGoals)}
        />
        <KpiCard
          label="Deliverables"
          value={String(deliverableCount + spilloverExtra.spillDeliverables)}
          split={splitOf(deliverableCount, spilloverExtra.spillDeliverables)}
        />
        <KpiCard
          label="Tasks"
          value={String(taskCount + spilloverExtra.spillTasks)}
          split={splitOf(taskCount, spilloverExtra.spillTasks)}
        />
        <KpiCard
          label="Cost used"
          value={formatPercent(totalBudget > 0 ? totalCostWithSpill / totalBudget : 0)}
          sub={formatCurrency(totalCostWithSpill)}
          split={splitOf(totalCost, spilloverExtra.spillCost, formatCurrency)}
        />
        <KpiCard
          label="Hours used"
          value={formatPercent(totalWorkingHours > 0 ? totalHoursWithSpill / totalWorkingHours : 0)}
          sub={formatHours(totalHoursWithSpill)}
          split={splitOf(totalHours, spilloverExtra.spillHours, formatHours)}
        />
        <KpiCard
          label="Overdue"
          value={String(overdue.tasks + spilloverExtra.spillOverdue)}
          sub={`${overdue.goals} goals`}
          split={splitOf(overdue.tasks, spilloverExtra.spillOverdue)}
          tone={overdue.tasks + spilloverExtra.spillOverdue > 0 ? 'text-orange-400' : 'text-gray-100'}
        />
      </div>

      {spilloverPending && (
        <div className="-mt-2 flex items-center gap-2 rounded-md border border-accent-500/40 bg-accent-500/10 px-3 py-1.5 text-[11px] text-accent-400">
          <span className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-accent-400 border-t-transparent animate-spin" />
          Figures below cover the selected sprints only — spill over from the previous {previousSprintCount} sprint
          {previousSprintCount === 1 ? '' : 's'} is still loading and will be added in.
        </div>
      )}

      {hasSpilloverSplit && (
        <div className="-mt-2 text-[11px] text-gray-500">
          Committed covers the selected sprints; spill over is what the {spillover.spilloverSprintNames.length} previous
          sprint{spillover.spilloverSprintNames.length === 1 ? '' : 's'} add on top. Work already counted as committed
          isn't counted again, so the two halves always add up to the total.
        </div>
      )}

      <SectionCard title="Status matrix">
        <div
          className="grid gap-2 pb-1.5 text-[11px] uppercase tracking-wide text-gray-500 border-b border-surface-border"
          style={{ gridTemplateColumns: '130px repeat(5, 1fr) 90px' }}
        >
          <div />
          {REPORT_STATUS_ORDER.map((bucket) => (
            <div key={bucket} className="text-right">
              {REPORT_STATUS_LABELS[bucket]}
            </div>
          ))}
          <div className="text-right">Overdue</div>
        </div>
        {matrix.map((row) => (
          <div
            key={row.label}
            className="grid gap-2 items-center py-2 text-sm border-b border-surface-border/50 last:border-b-0"
            style={{ gridTemplateColumns: '130px repeat(5, 1fr) 90px' }}
          >
            <div className="text-gray-200">
              {row.label} <span className="text-gray-500 text-xs">({row.total})</span>
            </div>
            {REPORT_STATUS_ORDER.map((bucket) => {
              const count = row.counts[bucket]
              return (
                <div key={bucket} className="text-right text-gray-200">
                  {count}
                  <span className={clsx('ml-1.5 text-xs', BUCKET_TEXT[bucket])}>
                    {formatPercent(row.total > 0 ? count / row.total : 0)}
                  </span>
                </div>
              )
            })}
            <div className="text-right text-orange-400">
              {row.label === 'Goals' ? overdue.goals : row.label === 'Deliverables' ? overdue.deliverables : overdue.tasks}
            </div>
          </div>
        ))}
      </SectionCard>

      {/* Fixed row height so each card's flex-1 scroll region has something to
          size against — otherwise expanding a drill-down grows the card instead
          of scrolling inside it. grid-rows-1 is required as well as the height:
          an implicit auto row sizes to its content and overflows the container
          however tall the container is declared. */}
      <div className="grid grid-cols-2 grid-rows-1 gap-4 h-[26rem]">
        <SectionCard
          title="Needs attention"
          subheader={
            <span className="flex items-center gap-1 flex-wrap">
              {(['all', ...ATTENTION_FLAG_ORDER] as AttentionFilter[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setAttentionFilter(key)}
                  data-attnfilter={key}
                  className={clsx(
                    'rounded px-2 py-0.5 text-[11px] transition-colors',
                    attentionFilter === key
                      ? 'bg-surface-50 text-gray-100'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-surface-200'
                  )}
                >
                  {ATTENTION_FILTER_LABELS[key]}{' '}
                  <span className={attentionFilter === key ? 'text-gray-400' : 'text-gray-600'}>
                    {attentionCounts[key]}
                  </span>
                </button>
              ))}
            </span>
          }
        >
          {filteredAttention.length === 0 ? (
            <p className="text-sm text-gray-500">
              {attentionFilter === 'all'
                ? 'Nothing blocked, on hold, overdue, due today, or not started.'
                : attentionFilter === 'notStarted'
                  ? 'Every task has been started.'
                  : `Nothing ${ATTENTION_FILTER_LABELS[attentionFilter].toLowerCase()}.`}
            </p>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
              {filteredAttention.map(({ item, rows }) => (
                <AttentionRow key={item.name} item={item} rows={rows} now={now} forceExpanded={forceExpanded} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Spill over">
          {previousSprintCount === 0 ? (
            <p className="text-sm text-gray-500">
              No. of Previous Sprints is not entered — set it in the Spill Over tab to include spillover here.
            </p>
          ) : spillover.isLoading ? (
            <InlineSpinner label="Loading spillover data…" />
          ) : spillover.error ? (
            <ErrorBanner message={friendlyErrorMessage(spillover.error)!} onRetry={spillover.refetch} />
          ) : spilloverRows.length === 0 ? (
            <p className="text-sm text-gray-500">Spillover Data is empty.</p>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="shrink-0">
                {SPILL_STAGES.map((stage) => (
                  <button
                    key={stage.key}
                    onClick={() => setSpillStage((s) => (s === stage.key ? null : stage.key))}
                    data-stagepick={stage.key}
                    data-active={spillStage === stage.key ? '1' : undefined}
                    className={clsx(
                      'w-full flex items-center justify-between gap-2 text-xs py-1 px-1 -mx-1 rounded border-b border-surface-border/50 text-left hover:bg-surface-100/40',
                      spillStage === stage.key && 'bg-surface-100/60'
                    )}
                  >
                    <span className="text-gray-400">
                      <span data-caret className="text-gray-600 mr-1">
                        {spillStage === stage.key ? '▾' : '▸'}
                      </span>
                      {stage.label}
                    </span>
                    <span className={stage.tone}>{spilloverStats.counts[stage.key]}</span>
                  </button>
                ))}
                <div className="flex items-center justify-between text-xs py-1">
                  <span className="text-gray-400">Carried hours / cost</span>
                  <span className="text-gray-300">
                    {formatHours(spilloverStats.hours)} · {formatCurrency(spilloverStats.cost)}
                  </span>
                </div>
                <div className="text-[11px] text-gray-500 pt-1">
                  {spilloverRows.length} spillover tasks from {spillover.spilloverSprintNames.length} previous sprint
                  {spillover.spilloverSprintNames.length === 1 ? '' : 's'}
                </div>
              </div>

              {/* The gap under the stages: whichever stage is picked renders its
                  goal breakdown here and scrolls on its own, so the card keeps the
                  height the grid row gives it however deep the drill-down goes.
                  All four are rendered and hidden with a style so the standalone
                  HTML export's script can reveal them without React. */}
              <div className="flex-1 min-h-0 overflow-y-auto border-t border-surface-border/60 mt-2 pt-2 pr-0.5">
                <p
                  data-stage-empty
                  className="text-[11px] text-gray-600"
                  style={{ display: spillStage === null ? 'block' : 'none' }}
                >
                  Pick a stage above to see its goals, deliverables and tasks.
                </p>
                {SPILL_STAGES.map((stage) => (
                  <div
                    key={stage.key}
                    data-stage={stage.key}
                    style={{ display: spillStage === stage.key ? 'block' : 'none' }}
                  >
                    {spillByStage[stage.key].length === 0 ? (
                      <p className="text-[11px] text-gray-600">No tasks in this stage.</p>
                    ) : (
                      spillByStage[stage.key].map((group) => (
                        <SpillGoalRow key={group.goal} goal={group.goal} rows={group.rows} forceExpanded={forceExpanded} />
                      ))
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <BreakdownCard title="By function tag">
          {byFunctionTag.map((group) => (
            <BreakdownRow
              key={group.key}
              name={group.key}
              meta={`${group.doneCount}/${group.taskCount}`}
              hours={group.totalHours}
              cost={group.totalCost}
              costShare={totalCost > 0 ? group.totalCost / totalCost : 0}
            />
          ))}
          {byFunctionTag.length === 0 && <p className="text-sm text-gray-500">No tasks in this selection.</p>}
        </BreakdownCard>

        <BreakdownCard title="By impacted metric">
          {byImpactedMetric.map((group) => (
            <BreakdownRow
              key={group.key}
              name={group.key}
              meta={`${group.doneCount}/${group.taskCount}`}
              hours={group.totalHours}
              cost={group.totalCost}
              costShare={totalCost > 0 ? group.totalCost / totalCost : 0}
            />
          ))}
          {byImpactedMetric.length === 0 && <p className="text-sm text-gray-500">No tasks in this selection.</p>}
        </BreakdownCard>

        <BreakdownCard title="By metric category">
          {byMetricCategory.map((group) => (
            <BreakdownRow
              key={group.key}
              name={group.key}
              meta={`${group.doneCount}/${group.taskCount}`}
              hours={group.totalHours}
              cost={group.totalCost}
              costShare={totalCost > 0 ? group.totalCost / totalCost : 0}
            />
          ))}
          {byMetricCategory.length === 0 && <p className="text-sm text-gray-500">No tasks in this selection.</p>}
        </BreakdownCard>

        {/* The one card whose scope includes spill over — labelled, since its
            hours deliberately exceed the committed totals beside it. */}
        <BreakdownCard title="By person (incl. spill over)">
          {byPerson.map((person) => (
            <BreakdownRow
              key={person.user.id}
              name={person.user.username}
              avatar={<Avatar user={person.user} size={18} />}
              meta={`${person.taskCount} tasks`}
              hours={person.hours}
              cost={person.cost}
              costShare={totalCostWithSpill > 0 ? person.cost / totalCostWithSpill : 0}
            />
          ))}
          {byPerson.length === 0 && <p className="text-sm text-gray-500">No assignees or logged time.</p>}
        </BreakdownCard>

        <BreakdownCard title="By status" className="col-span-2">
          {byStatus.map((entry) => (
            <BreakdownRow
              key={entry.bucket}
              name={REPORT_STATUS_LABELS[entry.bucket]}
              meta={`${entry.taskCount} tasks`}
              hours={entry.totalHours}
              cost={entry.totalCost}
              costShare={totalCost > 0 ? entry.totalCost / totalCost : 0}
            />
          ))}
        </BreakdownCard>
      </div>

      <SectionCard title="Goal ledger" right={<span className="text-[11px] text-gray-500">Click a row to expand</span>}>
        <GoalLedgerHeader />
        {goals.map((goal) => (
          <GoalLedgerRow key={goal.name} goal={goal} now={now} forceExpanded={forceExpanded} />
        ))}
        {goals.length === 0 && <p className="text-sm text-gray-500">No goals in this selection.</p>}
      </SectionCard>
    </div>
  )
}
