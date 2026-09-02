import clsx from 'clsx'
import { Avatar, AvatarStack } from '@/components/common/Avatar'
import { PriorityBadge, StatusBadge } from '@/components/common/Badges'
import { formatShortDate, isOverdue } from '@/lib/dates'
import { useUiStore } from '@/store/uiStore'
import type { TaskWithSplit } from '@/types/clickup'
import { LIST_GRID_TEMPLATE } from './columns'
import { RowMenu } from './RowMenu'
import { SprintPointsCell } from './SprintPointsCell'

export function TaskRow({ task }: { task: TaskWithSplit }) {
  const isSelected = useUiStore((s) => s.selectedTaskIds.has(task.id))
  const toggleTaskSelection = useUiStore((s) => s.toggleTaskSelection)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)
  const startDate = task.resolvedStartDate ?? task.rawStartDate
  const overdue = isOverdue(task.dueDate, task.statusType === 'done' || task.statusType === 'closed')

  return (
    <div
      className={clsx(
        'grid items-center gap-2 px-3 py-2 border-b border-surface-border/60 text-sm hover:bg-surface-100/60 transition-colors',
        isSelected && 'bg-accent-500/10'
      )}
      style={{ gridTemplateColumns: LIST_GRID_TEMPLATE }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => toggleTaskSelection(task.id)}
        className="w-3.5 h-3.5 accent-accent-500"
      />

      <button onClick={() => setSelectedTaskId(task.id)} className="text-left truncate text-gray-100 hover:text-accent-400 hover:underline">
        {task.name}
      </button>

      <div className="flex items-center gap-1.5 truncate">
        {task.developer ? (
          <>
            <Avatar user={task.developer} size={20} />
            <span className="truncate text-gray-300 text-xs">{task.developer.username}</span>
          </>
        ) : (
          <span className="text-gray-500 text-xs">—</span>
        )}
      </div>

      <AvatarStack users={task.assignees} size={20} />

      <SprintPointsCell task={task} />

      <PriorityBadge priority={task.priority} />

      <div className="text-xs text-gray-400">{formatShortDate(startDate)}</div>

      <div className="text-xs text-gray-400">{formatShortDate(task.betaDueDate)}</div>

      <div className={clsx('text-xs', overdue ? 'text-red-400 font-medium' : 'text-gray-400')}>
        {formatShortDate(task.dueDate)}
      </div>

      <StatusBadge status={task.status} statusType={task.statusType} statusColor={task.statusColor} />

      <RowMenu task={task} />
    </div>
  )
}
