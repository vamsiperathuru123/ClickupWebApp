import clsx from 'clsx'
import type { DayColumn } from '@/lib/ganttLayout'

export function DayHeaderRow({ days, labelWidth }: { days: DayColumn[]; labelWidth: number }) {
  return (
    <div className="flex sticky top-0 z-10 bg-surface-300 border-b border-surface-border">
      <div className="shrink-0 border-r border-surface-border" style={{ width: labelWidth }} />
      <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        {days.map((d) => (
          <div
            key={d.ts}
            className={clsx(
              'text-center py-1.5 text-[11px] border-r border-surface-border/60',
              d.isWeekend && 'bg-surface-200/60 text-gray-500',
              d.isToday && 'bg-accent-500/10 text-accent-400 font-semibold',
              !d.isWeekend && !d.isToday && 'text-gray-400'
            )}
          >
            <div>{d.weekday}</div>
            <div>{d.dayNum}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
