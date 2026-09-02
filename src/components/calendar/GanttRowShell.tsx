import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { DayColumn } from '@/lib/ganttLayout'

export function DayGridBackground({ days }: { days: DayColumn[] }) {
  return (
    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
      {days.map((d) => (
        <div
          key={d.ts}
          className={clsx(
            'border-r border-surface-border/40 h-full',
            d.isWeekend && 'bg-surface-200/40',
            d.isToday && 'bg-accent-500/[0.06]'
          )}
        />
      ))}
    </div>
  )
}

export function GanttRowShell({
  label,
  labelWidth,
  days,
  height = 40,
  children,
}: {
  label: ReactNode
  labelWidth: number
  days: DayColumn[]
  height?: number
  children?: ReactNode
}) {
  return (
    <div className="flex border-b border-surface-border/60" style={{ height }}>
      <div className="shrink-0 border-r border-surface-border flex items-center px-2 overflow-hidden" style={{ width: labelWidth }}>
        {label}
      </div>
      <div className="flex-1 relative">
        <DayGridBackground days={days} />
        {children}
      </div>
    </div>
  )
}
