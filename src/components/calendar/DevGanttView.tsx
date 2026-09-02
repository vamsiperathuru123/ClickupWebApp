import { useMemo } from 'react'
import { useUiStore } from '@/store/uiStore'
import { useCacheStore } from '@/store/cacheStore'
import { buildDayColumns, computeBarGeometry } from '@/lib/ganttLayout'
import { groupByDeveloper } from '@/lib/devGrouping'
import { DayHeaderRow } from './DayHeaderRow'
import { DevHeaderRow } from './DevHeaderRow'
import { GanttRowShell } from './GanttRowShell'
import { TaskBar } from './TaskBar'
import type { TaskWithSplit } from '@/types/clickup'

const LABEL_WIDTH = 240
const WINDOW_DAYS = 14

export function DevGanttView({ tasks, listId }: { tasks: TaskWithSplit[]; listId: string | null }) {
  const windowStart = useUiStore((s) => s.calendarWindowStart)
  const capacities = useCacheStore((s) => (listId ? s.capacities[listId] : undefined))
  const days = useMemo(() => buildDayColumns(windowStart, WINDOW_DAYS), [windowStart])
  const groups = useMemo(() => groupByDeveloper(tasks), [tasks])

  return (
    <div className="h-full overflow-auto">
      <DayHeaderRow days={days} labelWidth={LABEL_WIDTH} />
      {groups.map((group) => {
        const key = group.dev ? String(group.dev.id) : 'unassigned'
        const capacity = group.dev ? capacities?.[key] ?? 5 : 0
        return (
          <div key={key}>
            <DevHeaderRow dev={group.dev} tasks={group.tasks} days={days} labelWidth={LABEL_WIDTH} capacity={capacity} />
            {group.tasks.map((task) => {
              const start = task.resolvedStartDate ?? task.rawStartDate
              const geometry = computeBarGeometry(windowStart, WINDOW_DAYS, start, task.dueDate)
              return (
                <GanttRowShell
                  key={task.id}
                  label={<span className="truncate text-xs text-gray-300 pl-6">{task.name}</span>}
                  labelWidth={LABEL_WIDTH}
                  days={days}
                  height={34}
                >
                  <TaskBar task={task} geometry={geometry} />
                </GanttRowShell>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
