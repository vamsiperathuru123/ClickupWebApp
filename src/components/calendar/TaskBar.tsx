import { formatPoints } from '@/lib/points'
import { colorForDev } from '@/lib/statusColors'
import { useUiStore } from '@/store/uiStore'
import type { TaskWithSplit } from '@/types/clickup'
import type { BarGeometry } from '@/lib/ganttLayout'

export function TaskBar({ task, geometry }: { task: TaskWithSplit; geometry: BarGeometry }) {
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)
  if (!geometry.visible) return null

  const color = task.developer ? colorForDev(task.developer.id) : '#5a5a63'

  return (
    <button
      onClick={() => setSelectedTaskId(task.id)}
      title={task.name}
      className="absolute top-1.5 bottom-1.5 rounded-md px-2 flex items-center text-[11px] font-medium text-white truncate shadow-sm hover:brightness-110 transition-[filter]"
      style={{
        left: `${geometry.leftPct}%`,
        width: `${geometry.widthPct}%`,
        backgroundColor: color,
        minWidth: 24,
      }}
    >
      <span className="truncate">
        {task.name}
        {task.points != null && <span className="opacity-80"> · {formatPoints(task.splitPoints)}</span>}
      </span>
    </button>
  )
}
