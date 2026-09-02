import clsx from 'clsx'
import { formatPoints } from '@/lib/points'

export type BarKey = 'capacity' | 'target' | 'available'

const BAR_META: Record<BarKey, { label: string; color: string }> = {
  capacity: { label: 'Total Capacity', color: '#4592f8' },
  target: { label: 'Total Target', color: '#f2994a' },
  available: { label: 'Total Available', color: '#6bc950' },
}

export function OverallBarChart({
  capacity,
  target,
  available,
  selected,
  onSelect,
}: {
  capacity: number
  target: number
  available: number
  selected: BarKey | null
  onSelect: (key: BarKey | null) => void
}) {
  const values: Record<BarKey, number> = { capacity, target, available }
  const maxValue = Math.max(1, capacity, target, Math.abs(available))

  return (
    <div className="flex items-end justify-center gap-10 h-48 px-6">
      {(Object.keys(BAR_META) as BarKey[]).map((key) => {
        const value = values[key]
        const isNegative = value < 0
        const heightPct = (Math.abs(value) / maxValue) * 100
        const color = key === 'available' && isNegative ? '#e2445c' : BAR_META[key].color

        return (
          <button
            key={key}
            onClick={() => onSelect(selected === key ? null : key)}
            className="flex flex-col items-center gap-2 group"
          >
            <span className="text-sm font-semibold text-gray-100">{formatPoints(value)}</span>
            <div className="w-16 h-32 flex items-end bg-surface-300/40 rounded">
              <div
                className={clsx(
                  'w-full rounded transition-all',
                  selected === key ? 'ring-2 ring-white/60' : 'group-hover:brightness-110'
                )}
                style={{ height: `${Math.max(4, heightPct)}%`, backgroundColor: color }}
              />
            </div>
            <span className="text-xs text-gray-400">{BAR_META[key].label}</span>
          </button>
        )
      })}
    </div>
  )
}
