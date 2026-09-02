import clsx from 'clsx'
import type { ExecutiveSpilloverMode } from '@/store/roadmapStore'

const SPILLOVER_MODE_LABELS: Record<ExecutiveSpilloverMode, string> = {
  without: 'Without Spill Over',
  with: 'With Spill Over',
  onlySpillover: 'Only Spill Over',
}
const SPILLOVER_MODE_ORDER: ExecutiveSpilloverMode[] = ['without', 'with', 'onlySpillover']

/** Shared Without/With/Only Spill Over tab row — used by both Roadmap Health and
 * Resources, so the two tabs merge spillover data into their base goal set the
 * same way. */
export function SpilloverModeTabs({
  value,
  onChange,
}: {
  value: ExecutiveSpilloverMode
  onChange: (value: ExecutiveSpilloverMode) => void
}) {
  return (
    <div className="flex items-center bg-surface-200 rounded-md p-0.5 text-sm w-fit flex-wrap">
      {SPILLOVER_MODE_ORDER.map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          data-filter="spill"
          data-value={mode}
          className={clsx(
            'px-3 py-1 rounded transition-colors whitespace-nowrap',
            value === mode ? 'bg-surface-50 text-gray-100' : 'text-gray-400 hover:text-gray-200'
          )}
        >
          {SPILLOVER_MODE_LABELS[mode]}
        </button>
      ))}
    </div>
  )
}
