import { useState } from 'react'
import { AvatarStack } from '@/components/common/Avatar'
import { formatCurrency, formatHours, formatPercent } from '@/lib/roadmap/format'
import { formatShortDate } from '@/lib/dates'
import { TaskTable } from './TaskTable'
import type { RoadmapDeliverable } from '@/lib/roadmap/types'

export function DeliverableCard({ deliverable, forceExpanded }: { deliverable: RoadmapDeliverable; forceExpanded?: boolean }) {
  const [expandedState, setExpanded] = useState(true)
  const expanded = forceExpanded ?? expandedState
  const progress = deliverable.totalCount > 0 ? deliverable.doneCount / deliverable.totalCount : 0

  return (
    // data-search-deliverable is read by the standalone HTML export's search box.
    <div
      data-search-deliverable={deliverable.name}
      className="border-t border-surface-border/60 pt-3 mt-3 first:border-t-0 first:mt-0 first:pt-0"
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        data-toggle
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span data-caret className="text-gray-500 text-xs">
            {expanded ? '▾' : '▸'}
          </span>
          <span
            title={deliverable.name}
            className="font-medium text-gray-100 truncate hover:text-accent-400 transition-colors"
          >
            {deliverable.name}
          </span>
          {deliverable.implementationOwners.length > 0 && (
            <span className="shrink-0 flex items-center gap-1" title={`Implementation Owner: ${deliverable.implementationOwners.map((u) => u.username).join(', ')}`}>
              <span className="text-[10px] text-gray-500">Owner</span>
              <AvatarStack users={deliverable.implementationOwners} size={16} />
            </span>
          )}
          {deliverable.deliveryManagers.length > 0 && (
            <span className="shrink-0 flex items-center gap-1" title={`Delivery Manager: ${deliverable.deliveryManagers.map((u) => u.username).join(', ')}`}>
              <span className="text-[10px] text-gray-500">DM</span>
              <AvatarStack users={deliverable.deliveryManagers} size={16} />
            </span>
          )}
          {deliverable.outcome && (
            <span className="shrink-0 rounded bg-accent-500/15 text-accent-400 text-[11px] px-1.5 py-0.5">
              {deliverable.outcome}
            </span>
          )}
          {deliverable.blockedCount > 0 && (
            <span className="shrink-0 rounded bg-red-500/15 text-red-400 text-[11px] px-1.5 py-0.5">
              {deliverable.blockedCount} blocked
            </span>
          )}
          {deliverable.onHoldCount > 0 && (
            <span className="shrink-0 rounded bg-yellow-500/15 text-yellow-400 text-[11px] px-1.5 py-0.5">
              {deliverable.onHoldCount} on hold
            </span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-4 text-xs text-gray-400">
          <span>
            {deliverable.doneCount}/{deliverable.totalCount} · <span className="text-gray-200">{formatPercent(progress)}</span>
          </span>
          <span>{formatHours(deliverable.totalHours)}</span>
          <span>{formatCurrency(deliverable.totalCost)}</span>
          <span>ETA {formatShortDate(deliverable.eta)}</span>
        </div>
      </button>

      <div className="h-1.5 rounded bg-surface-300 mt-2 overflow-hidden">
        <div className="h-full bg-accent-500" style={{ width: `${progress * 100}%` }} />
      </div>

      <div data-toggle-body className="mt-2" style={{ display: expanded ? 'block' : 'none' }}>
        <TaskTable rows={deliverable.tasks} />
      </div>
    </div>
  )
}
