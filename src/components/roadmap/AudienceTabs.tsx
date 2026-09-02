import clsx from 'clsx'
import { AUDIENCE_LABELS, AUDIENCE_ORDER, type AudienceFilter } from '@/lib/roadmap/taskGroups'

export function AudienceTabs({ value, onChange }: { value: AudienceFilter; onChange: (value: AudienceFilter) => void }) {
  return (
    <div className="flex items-center bg-surface-200 rounded-md p-0.5 text-sm w-fit flex-wrap">
      {AUDIENCE_ORDER.map((a) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          // Read by the standalone HTML export to re-wire this control without React.
          data-filter="audience"
          data-value={a}
          className={clsx('px-3 py-1 rounded transition-colors', value === a ? 'bg-surface-50 text-gray-100' : 'text-gray-400 hover:text-gray-200')}
        >
          {AUDIENCE_LABELS[a]}
        </button>
      ))}
    </div>
  )
}
