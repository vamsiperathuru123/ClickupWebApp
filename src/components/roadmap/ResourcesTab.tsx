import { useMemo, useState, type ReactNode } from 'react'
import { Avatar } from '@/components/common/Avatar'
import { useRoadmapStore, type ExecutiveSpilloverMode } from '@/store/roadmapStore'

import { InlineSpinner } from '@/components/common/Spinner'
import { ErrorBanner, friendlyErrorMessage } from '@/components/common/ErrorBanner'
import { flattenTaskRows, computeContributionByPerson } from '@/lib/roadmap/resourceStats'
import { buildRoadmapFromTaskRows, dedupeTaskRowsById } from '@/lib/roadmap/aggregate'
import { filterRoadmapGoalsByAudienceAndGoalStatusGroup } from '@/lib/roadmap/filterRoadmap'
import { computeStatusGroupFilterBreakdowns, STATUS_GROUP_FILTER_ORDER, type StatusGroupFilter } from '@/lib/roadmap/taskGroups'
import { formatCurrency, formatHours, formatPercent } from '@/lib/roadmap/format'
import { SpilloverModeTabs } from './SpilloverModeTabs'
import { StatusGroupTabs } from './StatusGroupTabs'
import { useReportSettings, useReportSpillover } from './ReportSettingsContext'
import type { RoadmapGoal } from '@/lib/roadmap/types'

function SectionCard({
  title,
  right,
  children,
}: {
  title: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-300 p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-[11px] uppercase tracking-wide text-gray-500">{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

export function ResourcesTab({
  goals: allGoals,
  statusOverride,
  spilloverModeOverride,
}: {
  goals: RoadmapGoal[]
  /** Static-render overrides used by the HTML export — see GoalsTab. */
  statusOverride?: StatusGroupFilter
  spilloverModeOverride?: ExecutiveSpilloverMode
}) {
  const { avgCostPerHour, previousSprintCount } = useReportSettings()
  const storeStatusGroup = useRoadmapStore((s) => s.resourcesStatusGroup)
  const setStatusGroup = useRoadmapStore((s) => s.setResourcesStatusGroup)
  const storeSpilloverMode = useRoadmapStore((s) => s.resourcesSpilloverMode)
  const setSpilloverMode = useRoadmapStore((s) => s.setResourcesSpilloverMode)
  const statusGroup = statusOverride ?? storeStatusGroup
  const spilloverMode = spilloverModeOverride ?? storeSpilloverMode

  const {
    rows: spilloverRows,
    timeSummaries: spilloverTimeSummaries,
    isLoading: spilloverLoading,
    isFetching: spilloverFetching,
    error: spilloverError,
    refetch: refetchSpillover,
  } = useReportSpillover()

  const withoutRows = useMemo(
    () => flattenTaskRows(allGoals).map((r) => ({ task: r.task, hoursSpent: r.hoursSpent, hoursByPerson: r.hoursByPerson })),
    [allGoals]
  )
  const onlySpilloverRows = useMemo(
    () =>
      spilloverRows.map((r) => ({
        task: r.task,
        hoursSpent: r.hoursSpent,
        hoursByPerson: spilloverTimeSummaries.get(r.task.id)?.byPerson ?? [],
      })),
    [spilloverRows, spilloverTimeSummaries]
  )

  const baseGoals = useMemo(() => {
    if (spilloverMode === 'onlySpillover') return buildRoadmapFromTaskRows(onlySpilloverRows, avgCostPerHour)
    if (spilloverMode === 'with') return buildRoadmapFromTaskRows(dedupeTaskRowsById([...withoutRows, ...onlySpilloverRows]), avgCostPerHour)
    return allGoals
  }, [spilloverMode, withoutRows, onlySpilloverRows, allGoals, avgCostPerHour])

  const breakdowns = useMemo(() => computeStatusGroupFilterBreakdowns(baseGoals), [baseGoals])
  const counts = useMemo(
    () =>
      Object.fromEntries(STATUS_GROUP_FILTER_ORDER.map((g) => [g, breakdowns[g].goalCount])) as Record<
        StatusGroupFilter,
        number
      >,
    [breakdowns]
  )

  const goals = useMemo(
    () => filterRoadmapGoalsByAudienceAndGoalStatusGroup(baseGoals, 'all', statusGroup),
    [baseGoals, statusGroup]
  )

  const rows = useMemo(() => flattenTaskRows(goals), [goals])
  const contributors = useMemo(() => computeContributionByPerson(rows, avgCostPerHour), [rows, avgCostPerHour])
  const maxHours = Math.max(1, ...contributors.map((c) => c.hours))

  const totalEffort = contributors.reduce((sum, c) => sum + c.hours, 0)
  const totalPayroll = contributors.reduce((sum, c) => sum + c.cost, 0)

  const [personSearch, setPersonSearch] = useState('')
  // Bars and Team Snapshot/Cost per Goal keep reading from the full `contributors`
  // list above, so typing a search narrows who's shown without the bar widths or
  // the totals cards rescaling underneath the reader.
  const visibleContributors = useMemo(() => {
    const needle = personSearch.trim().toLowerCase()
    return needle ? contributors.filter((c) => c.user.username.toLowerCase().includes(needle)) : contributors
  }, [contributors, personSearch])

  const onlySpilloverBlocked = spilloverMode === 'onlySpillover' && previousSprintCount === 0
  const onlySpilloverEmpty =
    spilloverMode === 'onlySpillover' && previousSprintCount > 0 && !spilloverLoading && spilloverRows.length === 0

  return (
    <div className="space-y-4">
      <SpilloverModeTabs value={spilloverMode} onChange={setSpilloverMode} />
      <StatusGroupTabs value={statusGroup} onChange={setStatusGroup} counts={counts} />

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
          {spilloverMode !== 'without' && spilloverFetching && (
            <div className="text-xs text-gray-500">Refreshing spillover data…</div>
          )}

          <SectionCard
            title="Contribution by Person"
            right={
              <input
                type="text"
                value={personSearch}
                onChange={(e) => setPersonSearch(e.target.value)}
                placeholder="Search people..."
                // Read by the standalone HTML export's script to wire this box up
                // without React — see buildInteractiveReport's applyPersonSearch.
                data-search-input="person"
                className="w-40 rounded border border-surface-border bg-surface-200 px-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            }
          >
            <div className="space-y-2.5">
              {visibleContributors.map(({ user, taskCount, hours, cost }) => (
                // data-search-person is read by the standalone HTML export's search box.
                <div key={user.id} data-search-person={user.username} className="flex items-center gap-3">
                  <Avatar user={user} size={26} />
                  <span className="w-24 shrink-0 truncate text-sm text-gray-200">{user.username}</span>
                  <div className="flex-1 h-2.5 rounded bg-surface-100 overflow-hidden">
                    <div className="h-full bg-teal-500" style={{ width: `${(hours / maxHours) * 100}%` }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs text-gray-400">{taskCount} tasks</span>
                  <span className="w-14 shrink-0 text-right text-xs text-gray-400">{formatHours(hours)}</span>
                  <span className="w-16 shrink-0 text-right text-xs text-gray-300">{formatCurrency(cost)}</span>
                </div>
              ))}
              {contributors.length === 0 ? (
                <p className="text-sm text-gray-500">No assignees or logged time in this scope.</p>
              ) : (
                <>
                  {visibleContributors.length === 0 && <p className="text-sm text-gray-500">Nothing matches the search.</p>}
                  {/* Always rendered and hidden by default (the export always starts with an
                      empty search) so the standalone HTML export's script can reveal it — the
                      branch above this only ever mounts live, since React re-renders on typing
                      but a static export never does. */}
                  <p data-search-empty className="text-sm text-gray-500" style={{ display: 'none' }}>
                    Nothing matches the search.
                  </p>
                </>
              )}
            </div>
          </SectionCard>

          <div className="grid grid-cols-2 gap-4">
            <SectionCard title="Team Snapshot">
              <div className="space-y-3">
                <div className="rounded bg-surface-200 p-3">
                  <div className="text-xs text-gray-500">People active</div>
                  <div className="text-2xl font-semibold text-gray-100">{contributors.length}</div>
                </div>
                <div className="rounded bg-surface-200 p-3">
                  <div className="text-xs text-gray-500">Total effort logged</div>
                  <div className="text-2xl font-semibold text-gray-100">{formatHours(totalEffort)}</div>
                </div>
                <div className="rounded bg-surface-200 p-3">
                  <div className="text-xs text-gray-500">Payroll cost attributed</div>
                  <div className="text-2xl font-semibold text-gray-100">{formatCurrency(totalPayroll)}</div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Cost per Goal">
              <div
                className="grid gap-2 pb-1 text-[10px] uppercase tracking-wide text-gray-500 border-b border-surface-border"
                style={{ gridTemplateColumns: '1fr 56px 34px 76px 34px' }}
              >
                <div>Goal</div>
                <div className="text-right">Hours</div>
                <div className="text-right">%</div>
                <div className="text-right">Cost</div>
                <div className="text-right">%</div>
              </div>
              <div>
                {goals.map((goal) => (
                  <div
                    key={goal.name}
                    className="grid gap-2 items-center py-1 text-xs border-b border-surface-border/40 last:border-b-0"
                    style={{ gridTemplateColumns: '1fr 56px 34px 76px 34px' }}
                  >
                    <span
                      className="min-w-0 truncate text-gray-400 hover:text-accent-400 transition-colors"
                      title={goal.name}
                    >
                      {goal.name}
                    </span>
                    <span className="text-right text-gray-400">{formatHours(goal.totalHours)}</span>
                    <span className="text-right text-gray-500">
                      {formatPercent(totalEffort > 0 ? goal.totalHours / totalEffort : 0)}
                    </span>
                    <span className="text-right text-gray-300">{formatCurrency(goal.totalCost)}</span>
                    <span className="text-right text-gray-500">
                      {formatPercent(totalPayroll > 0 ? goal.totalCost / totalPayroll : 0)}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}
