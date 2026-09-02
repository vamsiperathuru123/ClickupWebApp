import clsx from 'clsx'
import { formatPercent } from '@/lib/roadmap/format'
import { STATUS_GROUP_FILTER_LABELS, STATUS_GROUP_FILTER_ORDER, type StatusGroupFilter, type StatusGroupBreakdown } from '@/lib/roadmap/taskGroups'

function StatRow({ label, count, pct }: { label: string; count: number; pct: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200">
        {count} <span className="text-gray-500">({formatPercent(pct)})</span>
      </span>
    </div>
  )
}

/** Clickable stat cards for "All" plus the four workflow-stage groups — replaces a
 * plain tab row so each option shows its own task/goal/deliverable counts up front
 * instead of only revealing them once selected. Clicking a card still just sets it
 * as the active filter, same as a tab would. */
export function StatusGroupCards({
  value,
  onChange,
  breakdowns,
}: {
  value: StatusGroupFilter
  onChange: (value: StatusGroupFilter) => void
  breakdowns: Record<StatusGroupFilter, StatusGroupBreakdown>
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {STATUS_GROUP_FILTER_ORDER.map((group) => {
        const b = breakdowns[group]
        const active = value === group
        return (
          <button
            key={group}
            onClick={() => onChange(group)}
            data-filter="status"
            data-value={group}
            className={clsx(
              'text-left rounded-lg border p-3 transition-colors',
              active ? 'border-accent-500 bg-accent-500/10' : 'border-surface-border bg-surface-300 hover:bg-surface-200'
            )}
          >
            <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">{STATUS_GROUP_FILTER_LABELS[group]}</div>
            <div className="space-y-1 text-xs">
              <StatRow label="Tasks" count={b.taskCount} pct={b.taskPct} />
              <StatRow label="Goals" count={b.goalCount} pct={b.goalPct} />
              <StatRow label="Deliverables" count={b.deliverableCount} pct={b.deliverablePct} />
            </div>
          </button>
        )
      })}
    </div>
  )
}
