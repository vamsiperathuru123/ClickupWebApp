import { Avatar, AvatarStack } from '@/components/common/Avatar'
import { PriorityBadge, StatusBadge } from '@/components/common/Badges'
import { formatShortDate } from '@/lib/dates'
import { formatCurrency, formatHours } from '@/lib/roadmap/format'
import type { RoadmapTaskRow } from '@/lib/roadmap/types'

const GRID_TEMPLATE =
  'minmax(200px,1fr) 110px 130px 120px 90px 95px 95px 70px 85px 110px 140px 130px 130px 140px 140px'

export function TaskTable({ rows }: { rows: RoadmapTaskRow[] }) {
  return (
    <div className="overflow-x-auto border border-surface-border rounded-md">
      <div
        className="grid gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wide text-gray-500 bg-surface-300 border-b border-surface-border"
        style={{ gridTemplateColumns: GRID_TEMPLATE }}
      >
        <div>Task</div>
        <div>Assignees</div>
        <div>Dev</div>
        <div>Status</div>
        <div>Priority</div>
        <div>Beta Due</div>
        <div>Due</div>
        <div>Hours</div>
        <div>Cost</div>
        <div>Sprint</div>
        <div>Outcome</div>
        <div>Metric Category</div>
        <div>Impacted Metric</div>
        <div>Impl. Owner</div>
        <div>Delivery Manager</div>
      </div>

      {rows.map((row) => (
        <div
          key={row.task.id}
          // data-search-task is read by the standalone HTML export's search box.
          data-search-task={row.task.name}
          className="grid gap-2 items-center px-3 py-1.5 text-sm border-b border-surface-border/60 last:border-b-0 hover:bg-surface-100/60"
          style={{ gridTemplateColumns: GRID_TEMPLATE }}
        >
          <a
            href={row.task.url}
            target="_blank"
            rel="noreferrer"
            title={row.task.name}
            className="text-left truncate text-gray-100 hover:text-accent-400 hover:underline"
          >
            {row.task.name}
          </a>
          <AvatarStack users={row.task.assignees} size={18} />
          <div className="flex items-center gap-1.5 truncate">
            {row.task.developer ? (
              <>
                <Avatar user={row.task.developer} size={18} />
                <span className="truncate text-gray-300 text-xs">{row.task.developer.username}</span>
              </>
            ) : (
              <span className="text-gray-500 text-xs">—</span>
            )}
          </div>
          <StatusBadge status={row.task.status} statusType={row.task.statusType} statusColor={row.task.statusColor} />
          <PriorityBadge priority={row.task.priority} />
          <div className="text-xs text-gray-400">{formatShortDate(row.task.betaDueDate)}</div>
          <div className="text-xs text-gray-400">{formatShortDate(row.task.dueDate)}</div>
          <div className="text-xs text-gray-300">{row.hoursSpent > 0 ? formatHours(row.hoursSpent) : '—'}</div>
          <div className="text-xs text-gray-300">{row.cost > 0 ? formatCurrency(row.cost) : '—'}</div>
          <div className="text-xs text-gray-400 truncate">{row.task.sprintName ?? '—'}</div>
          <div className="text-xs text-gray-400 truncate">{row.outcome ?? '—'}</div>
          <div className="text-xs text-gray-400 truncate">{row.task.metricCategory ?? '—'}</div>
          <div className="text-xs text-gray-400 truncate">{row.task.impactedMetric ?? '—'}</div>
          <div className="flex items-center gap-1.5 truncate">
            {row.task.implementationOwner ? (
              <>
                <Avatar user={row.task.implementationOwner} size={18} />
                <span className="truncate text-gray-300 text-xs">{row.task.implementationOwner.username}</span>
              </>
            ) : (
              <span className="text-gray-500 text-xs">—</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 truncate">
            {row.task.deliveryManager ? (
              <>
                <Avatar user={row.task.deliveryManager} size={18} />
                <span className="truncate text-gray-300 text-xs">{row.task.deliveryManager.username}</span>
              </>
            ) : (
              <span className="text-gray-500 text-xs">—</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
