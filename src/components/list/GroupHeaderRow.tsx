import { colorForStatus } from '@/lib/statusColors'
import { formatPoints } from '@/lib/points'
import { ChevronIcon } from '@/components/sidebar/Icons'
import { useUiStore } from '@/store/uiStore'
import type { StatusGroup } from '@/lib/taskGrouping'

export function GroupHeaderRow({
  group,
  collapsed,
  onToggleCollapse,
  onToggleSelectAll,
}: {
  group: StatusGroup
  collapsed: boolean
  onToggleCollapse: () => void
  onToggleSelectAll: (select: boolean) => void
}) {
  const color = colorForStatus(group.statusType as any, group.statusColor)
  const taskIds = group.tasks.map((t) => t.id)
  const allSelected = useUiStore((s) => taskIds.length > 0 && taskIds.every((id) => s.selectedTaskIds.has(id)))

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-surface-200 border-b border-surface-border sticky top-[33px] z-[5]">
      <input
        type="checkbox"
        checked={allSelected}
        onChange={(e) => onToggleSelectAll(e.target.checked)}
        className="w-3.5 h-3.5 accent-accent-500"
      />
      <button onClick={onToggleCollapse} className="flex items-center gap-2">
        <ChevronIcon open={!collapsed} />
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: color }}
        >
          {group.status}
        </span>
      </button>
      <span className="text-xs text-gray-500">{group.tasks.length} tasks</span>
      <span className="text-xs text-gray-500">· {formatPoints(group.totalPoints)}</span>
    </div>
  )
}
