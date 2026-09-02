import { useState } from 'react'
import { formatCurrency, formatHours, formatPercent } from '@/lib/roadmap/format'
import { formatShortDate } from '@/lib/dates'
import { DeliverableCard } from './DeliverableCard'
import type { RoadmapGoal } from '@/lib/roadmap/types'

export function GoalCard({ goal, forceExpanded }: { goal: RoadmapGoal; forceExpanded?: boolean }) {
  const [expandedState, setExpanded] = useState(false)
  const expanded = forceExpanded ?? expandedState
  const progress = goal.totalCount > 0 ? goal.doneCount / goal.totalCount : 0

  return (
    // data-search-goal lets the standalone HTML export's search box find and
    // show/hide this card without React — see buildInteractiveReport's applyTreeSearch.
    <div data-search-goal={goal.name} className="rounded-lg border border-surface-border bg-surface-300 p-4">
      <button
        onClick={() => setExpanded((e) => !e)}
        data-toggle
        className="w-full flex items-start justify-between gap-4 text-left"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-xs font-semibold text-gray-100"
            style={{
              background: `conic-gradient(#7b68ee ${progress * 360}deg, #33333a 0deg)`,
            }}
          >
            <div className="w-8 h-8 rounded-full bg-surface-300 flex items-center justify-center text-[11px]">
              {formatPercent(progress)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span data-caret className="text-gray-500 text-xs">
                {expanded ? '▾' : '▸'}
              </span>
              <h2
                title={goal.name}
                className="font-semibold text-gray-100 truncate hover:text-accent-400 transition-colors"
              >
                {goal.name}
              </h2>
            </div>
            {goal.outcome && <p className="text-xs text-accent-400 mt-0.5">{goal.outcome}</p>}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-5 text-xs text-gray-400">
          <div className="text-center">
            <div className="text-gray-200 font-medium">{goal.deliverables.length}</div>
            <div>Deliverables</div>
          </div>
          <div className="text-center">
            <div className="text-gray-200 font-medium">{goal.totalCount}</div>
            <div>Tasks</div>
          </div>
          <div className="text-center">
            <div className="text-gray-200 font-medium">{formatHours(goal.totalHours)}</div>
            <div>Hours</div>
          </div>
          <div className="text-center">
            <div className="text-gray-200 font-medium">{formatCurrency(goal.totalCost)}</div>
            <div>Budget</div>
          </div>
          <div className="text-center">
            <div className="text-gray-200 font-medium">{formatShortDate(goal.eta)}</div>
            <div>ETA</div>
          </div>
          {goal.blockedCount > 0 && (
            <span className="rounded bg-red-500/15 text-red-400 px-2 py-0.5 font-medium">{goal.blockedCount} blocked</span>
          )}
          {goal.onHoldCount > 0 && (
            <span className="rounded bg-yellow-500/15 text-yellow-400 px-2 py-0.5 font-medium">{goal.onHoldCount} on hold</span>
          )}
        </div>
      </button>

      {/* Rendered always and hidden with a style rather than conditionally mounted,
          so the standalone HTML export's script can toggle it without React. */}
      <div data-toggle-body className="mt-3 pl-14" style={{ display: expanded ? 'block' : 'none' }}>
        {goal.deliverables.map((deliverable) => (
          <DeliverableCard key={deliverable.name} deliverable={deliverable} forceExpanded={forceExpanded} />
        ))}
      </div>
    </div>
  )
}
