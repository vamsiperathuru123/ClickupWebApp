import { useMemo, type ReactNode } from 'react'
import { useRoadmapStore, type ExecutiveSpilloverMode } from '@/store/roadmapStore'
import type { AudienceFilter, StatusGroupFilter } from '@/lib/roadmap/taskGroups'

import { InlineSpinner } from '@/components/common/Spinner'
import { ErrorBanner, friendlyErrorMessage } from '@/components/common/ErrorBanner'
import { computePriorityDistribution } from '@/lib/roadmap/executiveStats'
import { formatCurrency, formatHours, formatPercent } from '@/lib/roadmap/format'
import { filterRoadmapGoalsByAudience, filterRoadmapGoalsByAudienceAndGoalStatusGroup } from '@/lib/roadmap/filterRoadmap'
import { flattenTaskRows } from '@/lib/roadmap/resourceStats'
import { buildRoadmapFromTaskRows, dedupeTaskRowsById } from '@/lib/roadmap/aggregate'
import { computeStatusGroupFilterBreakdowns } from '@/lib/roadmap/taskGroups'
import { AudienceTabs } from './AudienceTabs'
import { StatusGroupCards } from './StatusGroupCards'
import { SpilloverModeTabs } from './SpilloverModeTabs'
import { useReportSettings, useReportSpillover } from './ReportSettingsContext'
import type { AppTask } from '@/types/clickup'
import type { RoadmapGoal } from '@/lib/roadmap/types'

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#f50000',
  high: '#ffcc00',
  normal: '#6fddff',
  low: '#d8d8d8',
  none: '#5a5a63',
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-300 p-4">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-3">{title}</div>
      {children}
    </div>
  )
}

export function ExecutiveTab({
  goals: allGoals,
  audienceOverride,
  statusOverride,
  spilloverModeOverride,
}: {
  goals: RoadmapGoal[]
  tasks: AppTask[]
  /** Static-render overrides used by the HTML export — see GoalsTab. */
  audienceOverride?: AudienceFilter
  statusOverride?: StatusGroupFilter
  spilloverModeOverride?: ExecutiveSpilloverMode
}) {
  const { avgCostPerHour, totalWorkingHours, previousSprintCount } = useReportSettings()
  const storeAudience = useRoadmapStore((s) => s.executiveAudience)
  const setAudience = useRoadmapStore((s) => s.setExecutiveAudience)
  const storeStatusGroup = useRoadmapStore((s) => s.executiveStatusGroup)
  const setStatusGroup = useRoadmapStore((s) => s.setExecutiveStatusGroup)
  const storeSpilloverMode = useRoadmapStore((s) => s.executiveSpilloverMode)
  const setSpilloverMode = useRoadmapStore((s) => s.setExecutiveSpilloverMode)
  const audience = audienceOverride ?? storeAudience
  const statusGroup = statusOverride ?? storeStatusGroup
  const spilloverMode = spilloverModeOverride ?? storeSpilloverMode

  const needsSpillover = spilloverMode !== 'without'
  const {
    rows: spilloverRows,
    isLoading: spilloverLoading,
    isFetching: spilloverFetching,
    error: spilloverError,
    refetch: refetchSpillover,
  } = useReportSpillover()

  const withoutRows = useMemo(
    () => flattenTaskRows(allGoals).map((r) => ({ task: r.task, hoursSpent: r.hoursSpent })),
    [allGoals]
  )
  const onlySpilloverRows = useMemo(
    () => spilloverRows.map((r) => ({ task: r.task, hoursSpent: r.hoursSpent })),
    [spilloverRows]
  )

  const baseGoals = useMemo(() => {
    if (spilloverMode === 'onlySpillover') return buildRoadmapFromTaskRows(onlySpilloverRows, avgCostPerHour)
    if (spilloverMode === 'with') return buildRoadmapFromTaskRows(dedupeTaskRowsById([...withoutRows, ...onlySpilloverRows]), avgCostPerHour)
    return allGoals
  }, [spilloverMode, withoutRows, onlySpilloverRows, allGoals, avgCostPerHour])

  const audienceGoals = useMemo(() => filterRoadmapGoalsByAudience(baseGoals, audience), [baseGoals, audience])
  const breakdowns = useMemo(() => computeStatusGroupFilterBreakdowns(audienceGoals), [audienceGoals])

  const goals = useMemo(
    () => filterRoadmapGoalsByAudienceAndGoalStatusGroup(baseGoals, audience, statusGroup),
    [baseGoals, audience, statusGroup]
  )
  const tasks = useMemo(() => flattenTaskRows(goals).map((r) => r.task), [goals])

  const priorities = useMemo(() => computePriorityDistribution(tasks), [tasks])
  const totalBudget = avgCostPerHour * totalWorkingHours
  const totalUsed = goals.reduce((sum, g) => sum + g.totalCost, 0)
  const totalHoursUsed = goals.reduce((sum, g) => sum + g.totalHours, 0)

  const onlySpilloverBlocked = spilloverMode === 'onlySpillover' && previousSprintCount === 0
  const onlySpilloverEmpty =
    spilloverMode === 'onlySpillover' && previousSprintCount > 0 && !spilloverLoading && spilloverRows.length === 0

  return (
    <div className="space-y-4">
      <AudienceTabs value={audience} onChange={setAudience} />
      <SpilloverModeTabs value={spilloverMode} onChange={setSpilloverMode} />

      {onlySpilloverBlocked ? (
        <p className="text-sm text-gray-500">No. of Previous Sprints is not selected — set it in the Spill Over tab.</p>
      ) : spilloverMode === 'onlySpillover' && spilloverLoading ? (
        <InlineSpinner label="Loading spillover data…" />
      ) : spilloverMode === 'onlySpillover' && spilloverError ? (
        <ErrorBanner message={friendlyErrorMessage(spilloverError)!} onRetry={refetchSpillover} />
      ) : onlySpilloverEmpty ? (
        <p className="text-sm text-gray-500">Spillover Data is empty.</p>
      ) : (
        <>
          {needsSpillover && spilloverFetching && <div className="text-xs text-gray-500">Refreshing spillover data…</div>}
          <div className="grid grid-cols-2 gap-4 items-start">
            <div className="sticky top-4 self-start space-y-4">
              <SectionCard title="Overall Health">
                <StatusGroupCards value={statusGroup} onChange={setStatusGroup} breakdowns={breakdowns} />
              </SectionCard>

              <SectionCard title="Priority Distribution">
                <div className="space-y-2">
                  {priorities.map(({ priority, count }) => (
                    <div key={priority} className="flex items-center gap-2 text-xs">
                      <span
                        className="w-16 shrink-0 rounded px-1.5 py-0.5 text-white text-center"
                        style={{ backgroundColor: PRIORITY_COLORS[priority] }}
                      >
                        {priority === 'none' ? 'None' : priority[0].toUpperCase() + priority.slice(1)}
                      </span>
                      <div className="flex-1 h-3 rounded bg-surface-100 overflow-hidden">
                        <div
                          className="h-full"
                          style={{
                            width: `${(count / Math.max(1, ...priorities.map((p) => p.count))) * 100}%`,
                            backgroundColor: PRIORITY_COLORS[priority],
                          }}
                        />
                      </div>
                      <span className="w-16 text-right text-gray-300">{count} tasks</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>

            <SectionCard title="Budget Utilisation">
              <div className="space-y-3 mb-4 pb-4 border-b border-surface-border">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Cost</div>
                  <div className="text-xl font-semibold text-gray-100">
                    {formatCurrency(totalUsed)} <span className="text-sm text-gray-500 font-normal">/ {formatCurrency(totalBudget)}</span>
                  </div>
                  <div className="h-2 rounded bg-surface-100 mt-2 overflow-hidden">
                    <div
                      className="h-full bg-accent-500"
                      style={{ width: `${totalBudget > 0 ? Math.min(100, (totalUsed / totalBudget) * 100) : 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Hours</div>
                  <div className="text-xl font-semibold text-gray-100">
                    {formatHours(totalHoursUsed)} <span className="text-sm text-gray-500 font-normal">/ {formatHours(totalWorkingHours)}</span>
                  </div>
                  <div className="h-2 rounded bg-surface-100 mt-2 overflow-hidden">
                    <div
                      className="h-full bg-teal-500"
                      style={{ width: `${totalWorkingHours > 0 ? Math.min(100, (totalHoursUsed / totalWorkingHours) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {goals.map((goal) => {
                  const progress = goal.totalCount > 0 ? goal.doneCount / goal.totalCount : 0
                  const costShare = totalUsed > 0 ? goal.totalCost / totalUsed : 0
                  const hoursShare = totalHoursUsed > 0 ? goal.totalHours / totalHoursUsed : 0
                  return (
                    <div key={goal.name} className="pb-3 border-b border-surface-border/60 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span title={goal.name} className="text-gray-200 truncate hover:text-accent-400 transition-colors">
                          {goal.name}
                        </span>
                        <span className={progress >= 0.4 ? 'text-green-400' : 'text-red-400'}>{formatPercent(progress)}</span>
                      </div>
                      <div className="h-1.5 rounded bg-surface-100 overflow-hidden mb-1">
                        <div
                          className={progress >= 0.4 ? 'h-full bg-green-500' : 'h-full bg-red-500'}
                          style={{ width: `${progress * 100}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-gray-500 mb-1.5">
                        {goal.doneCount}/{goal.totalCount} tasks{goal.blockedCount > 0 && ` · ${goal.blockedCount} blocked`}
                        {goal.onHoldCount > 0 && ` · ${goal.onHoldCount} on hold`}
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Cost</span>
                        <span className="text-gray-300">
                          {formatCurrency(goal.totalCost)} <span className="text-gray-500">({formatPercent(costShare)})</span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Hours</span>
                        <span className="text-gray-300">
                          {formatHours(goal.totalHours)} <span className="text-gray-500">({formatPercent(hoursShare)})</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}
