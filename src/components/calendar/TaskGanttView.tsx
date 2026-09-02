import { useMemo } from 'react'
import { useUiStore } from '@/store/uiStore'
import { buildDayColumns, computeBarGeometry } from '@/lib/ganttLayout'
import { DayHeaderRow } from './DayHeaderRow'
import { GanttRowShell } from './GanttRowShell'
import { TaskBar } from './TaskBar'
import type { TaskWithSplit } from '@/types/clickup'

const LABEL_WIDTH = 240
const WINDOW_DAYS = 14

export function TaskGanttView({ tasks }: { tasks: TaskWithSplit[] }) {
  const windowStart = useUiStore((s) => s.calendarWindowStart)
  const days = useMemo(() => buildDayColumns(windowStart, WINDOW_DAYS), [windowStart])

  return (
    <div className="h-full overflow-auto">
      <DayHeaderRow days={days} labelWidth={LABEL_WIDTH} />
      {tasks.map((task) => {
        const start = task.resolvedStartDate ?? task.rawStartDate
        const geometry = computeBarGeometry(windowStart, WINDOW_DAYS, start, task.dueDate)
        return (
          <GanttRowShell key={task.id} label={<span className="truncate text-sm text-gray-200">{task.name}</span>} labelWidth={LABEL_WIDTH} days={days}>
            <TaskBar task={task} geometry={geometry} />
          </GanttRowShell>
        )
      })}
    </div>
  )
}
