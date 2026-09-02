import { useMemo } from 'react'
import clsx from 'clsx'
import { useUiStore } from '@/store/uiStore'
import { useActiveTasks } from '@/hooks/useActiveTasks'
import { useResolveStartDates } from '@/hooks/useResolveStartDates'
import { withSplitPoints } from '@/lib/points'
import { addDays } from '@/lib/dates'
import { InlineSpinner } from '@/components/common/Spinner'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorBanner, friendlyErrorMessage } from '@/components/common/ErrorBanner'
import { DateRangeControls } from './DateRangeControls'
import { TaskGanttView } from './TaskGanttView'
import { DevGanttView } from './DevGanttView'

// Tasks whose due date falls outside this buffer around the visible window can't
// show a bar anyway, so there's no point spending a status-history REST call
// resolving their start date until the user navigates near them.
const RESOLVE_WINDOW_BUFFER_DAYS = 45

export function CalendarView() {
  const activeNode = useUiStore((s) => s.activeNode)
  const subView = useUiStore((s) => s.calendarSubView)
  const setCalendarSubView = useUiStore((s) => s.setCalendarSubView)
  const windowStart = useUiStore((s) => s.calendarWindowStart)
  const { tasks, isLoading, error, refetch } = useActiveTasks(activeNode)

  const splitTasks = useMemo(() => tasks.map(withSplitPoints), [tasks])

  const tasksNearWindow = useMemo(() => {
    const rangeStart = addDays(windowStart, -RESOLVE_WINDOW_BUFFER_DAYS)
    const rangeEnd = addDays(windowStart, RESOLVE_WINDOW_BUFFER_DAYS)
    return splitTasks.filter((t) => !t.dueDate || (t.dueDate >= rangeStart && t.dueDate <= rangeEnd))
  }, [splitTasks, windowStart])
  useResolveStartDates(activeNode?.id ?? null, tasksNearWindow)

  if (isLoading && tasks.length === 0) return <InlineSpinner label="Loading tasks…" />
  if (error && tasks.length === 0) {
    return <ErrorBanner message={friendlyErrorMessage(error)!} onRetry={refetch} />
  }
  if (!isLoading && tasks.length === 0) {
    return <EmptyState title="No tasks" subtitle="This list doesn't have any tasks yet." />
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border">
        <div className="flex items-center bg-surface-200 rounded-md p-0.5 text-sm">
          {(['task', 'dev'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setCalendarSubView(v)}
              className={clsx(
                'px-3 py-1 rounded capitalize transition-colors',
                subView === v ? 'bg-surface-50 text-gray-100' : 'text-gray-400 hover:text-gray-200'
              )}
            >
              {v} view
            </button>
          ))}
        </div>
        <DateRangeControls />
      </div>
      <div className="flex-1 overflow-hidden">
        {subView === 'task' ? (
          <TaskGanttView tasks={splitTasks} />
        ) : (
          <DevGanttView tasks={splitTasks} listId={activeNode?.id ?? null} />
        )}
      </div>
    </div>
  )
}
