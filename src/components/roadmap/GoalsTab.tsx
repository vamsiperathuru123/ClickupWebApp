import { useMemo, useState } from 'react'
import { GoalCard } from './GoalCard'
import { AudienceTabs } from './AudienceTabs'
import { StatusGroupTabs } from './StatusGroupTabs'
import { useRoadmapStore } from '@/store/roadmapStore'
import {
  filterRoadmapGoalsByAudience,
  filterRoadmapGoalsByAudienceAndGoalStatusGroup,
  filterRoadmapGoalsByText,
} from '@/lib/roadmap/filterRoadmap'
import {
  computeStatusGroupFilterBreakdowns,
  STATUS_GROUP_FILTER_ORDER,
  type AudienceFilter,
  type StatusGroupFilter,
} from '@/lib/roadmap/taskGroups'
import type { RoadmapGoal } from '@/lib/roadmap/types'

export function GoalsTab({
  goals,
  forceExpanded,
  audienceOverride,
  statusOverride,
}: {
  goals: RoadmapGoal[]
  forceExpanded?: boolean
  /** Static-render overrides used by the HTML export, which renders one copy per
   * filter combination and so can't rely on the single shared store value. */
  audienceOverride?: AudienceFilter
  statusOverride?: StatusGroupFilter
}) {
  const storeAudience = useRoadmapStore((s) => s.goalsAudience)
  const setAudience = useRoadmapStore((s) => s.setGoalsAudience)
  const storeStatusGroup = useRoadmapStore((s) => s.goalsStatusGroup)
  const setStatusGroup = useRoadmapStore((s) => s.setGoalsStatusGroup)
  const audience = audienceOverride ?? storeAudience
  const statusGroup = statusOverride ?? storeStatusGroup

  const audienceGoals = useMemo(() => filterRoadmapGoalsByAudience(goals, audience), [goals, audience])
  const breakdowns = useMemo(() => computeStatusGroupFilterBreakdowns(audienceGoals), [audienceGoals])

  // Goal counts (not task counts) — since a tab now shows whole goals rolled up to
  // that one status, "N goals" is what actually matches what's listed below.
  const counts = useMemo(
    () =>
      Object.fromEntries(STATUS_GROUP_FILTER_ORDER.map((g) => [g, breakdowns[g].goalCount])) as Record<
        StatusGroupFilter,
        number
      >,
    [breakdowns]
  )

  const filteredGoals = useMemo(
    () => filterRoadmapGoalsByAudienceAndGoalStatusGroup(goals, audience, statusGroup),
    [goals, audience, statusGroup]
  )

  const [search, setSearch] = useState('')
  const searchedGoals = useMemo(() => filterRoadmapGoalsByText(filteredGoals, search), [filteredGoals, search])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <AudienceTabs value={audience} onChange={setAudience} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search goal, deliverable or task..."
          // Read by the standalone HTML export's script to wire this box up
          // without React - see buildInteractiveReport's applyTreeSearch.
          data-search-input="tree"
          className="w-64 rounded border border-surface-border bg-surface-200 px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
        />
      </div>
      <StatusGroupTabs value={statusGroup} onChange={setStatusGroup} counts={counts} />
      {filteredGoals.length === 0 ? (
        <p className="text-sm text-gray-500">No tasks match this selection.</p>
      ) : (
        <div className="space-y-4">
          {searchedGoals.length === 0 && <p className="text-sm text-gray-500">Nothing matches the search.</p>}
          {searchedGoals.map((goal) => (
            <GoalCard key={goal.name} goal={goal} forceExpanded={forceExpanded} />
          ))}
          {/* Always rendered and hidden by default (the export always starts with an
              empty search) so the standalone HTML export's script can reveal it - the
              live-only check above never mounts in a static file, since React re-renders
              on typing but a static export never does. */}
          <p data-search-empty className="text-sm text-gray-500" style={{ display: 'none' }}>
            Nothing matches the search.
          </p>
        </div>
      )}
    </div>
  )
}
