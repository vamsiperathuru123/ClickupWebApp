import clsx from 'clsx'
import { Avatar } from '@/components/common/Avatar'
import { formatPoints } from '@/lib/points'
import { colorForDev } from '@/lib/statusColors'
import { isActiveOnDay, type DayColumn } from '@/lib/ganttLayout'
import type { ClickUpUser, TaskWithSplit } from '@/types/clickup'

export function DevHeaderRow({
  dev,
  tasks,
  days,
  labelWidth,
  capacity,
}: {
  dev: ClickUpUser | null
  tasks: TaskWithSplit[]
  days: DayColumn[]
  labelWidth: number
  capacity: number
}) {
  const totalPoints = tasks.reduce((sum, t) => sum + t.splitPoints, 0)
  const color = dev ? colorForDev(dev.id) : '#5a5a63'

  return (
    <div className="flex border-b border-surface-border bg-surface-200/70" style={{ height: 46 }}>
      <div className="shrink-0 border-r border-surface-border flex items-center gap-2 px-2" style={{ width: labelWidth }}>
        {dev ? <Avatar user={dev} size={24} /> : (
          <div className="w-6 h-6 rounded-full bg-surface-100 flex items-center justify-center text-[10px] text-gray-400">
            ?
          </div>
        )}
        <div className="truncate">
          <div className="text-sm text-gray-100 truncate">{dev?.username ?? 'Unassigned'}</div>
          <div className="text-[11px] text-gray-500">
            {formatPoints(totalPoints)} · {tasks.length} tasks
          </div>
        </div>
      </div>
      <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
        {days.map((day) => {
          const dayPoints = tasks
            .filter((t) => isActiveOnDay(day.ts, t.resolvedStartDate ?? t.rawStartDate, t.dueDate))
            .reduce((sum, t) => sum + t.splitPoints, 0)
          const ratio = capacity > 0 ? dayPoints / capacity : dayPoints > 0 ? 1 : 0
          const overCapacity = dayPoints > capacity

          return (
            <div
              key={day.ts}
              className={clsx(
                'relative border-r border-surface-border/40 flex items-end justify-center pb-1',
                day.isWeekend && 'bg-surface-200/40'
              )}
              title={dayPoints > 0 ? `${formatPoints(dayPoints)} / ${capacity}pt capacity` : undefined}
            >
              <div className="absolute inset-x-2 bottom-1 top-1.5 rounded bg-surface-400/60" />
              {dayPoints > 0 && (
                <div
                  className="absolute inset-x-2 bottom-1 rounded"
                  style={{
                    height: `${Math.min(100, ratio * 100)}%`,
                    backgroundColor: overCapacity ? '#e2445c' : color,
                    opacity: 0.85,
                  }}
                />
              )}
              {dayPoints > 0 && <span className="relative text-[10px] text-gray-200 font-medium">{formatPoints(dayPoints)}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
