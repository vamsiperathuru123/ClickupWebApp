import clsx from 'clsx'
import { STATUS_GROUP_FILTER_LABELS, STATUS_GROUP_FILTER_ORDER, type StatusGroupFilter } from '@/lib/roadmap/taskGroups'

export function StatusGroupTabs({
  value,
  onChange,
  counts,
}: {
  value: StatusGroupFilter
  onChange: (value: StatusGroupFilter) => void
  counts?: Record<StatusGroupFilter, number>
}) {
  return (
    <div className="flex items-center bg-surface-200 rounded-md p-0.5 text-sm w-fit flex-wrap">
      {STATUS_GROUP_FILTER_ORDER.map((g) => (
        <button
          key={g}
          onClick={() => onChange(g)}
          data-filter="status"
          data-value={g}
          className={clsx(
            'px-3 py-1 rounded transition-colors whitespace-nowrap',
            value === g ? 'bg-surface-50 text-gray-100' : 'text-gray-400 hover:text-gray-200'
          )}
        >
          {STATUS_GROUP_FILTER_LABELS[g]} {counts && <span className="text-gray-500">({counts[g]})</span>}
        </button>
      ))}
    </div>
  )
}
