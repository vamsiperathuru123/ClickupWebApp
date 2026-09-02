import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { useRoadmapStore } from '@/store/roadmapStore'
import { fetchRoadmapData } from '@/lib/roadmap/loadRoadmap'
import { aggregateTimeEntries } from '@/lib/roadmap/timeAggregation'
import { buildRoadmap } from '@/lib/roadmap/aggregate'
import { AUTO_REFRESH_MS } from '@/lib/autoRefresh'

/**
 * Fetches real tasks + real time-tracking entries for every list/folder the user has
 * picked for the Roadmap Status report, merges them (deduping tasks that appear in
 * more than one selected scope), and builds the Goal → Deliverable → Task hierarchy.
 * Always includes closed-type tasks — unlike the sidebar List view, this report
 * needs the full completion picture to compute progress.
 */
export function useRoadmapData() {
  const token = useAuthStore((s) => s.token)
  const workspaceId = useUiStore((s) => s.activeWorkspaceId)
  const selectedScope = useRoadmapStore((s) => s.selectedScope)
  const avgCostPerHour = useRoadmapStore((s) => s.avgCostPerHour)

  const scopeKey = selectedScope.map((s) => `${s.type}:${s.id}`).join(',')

  const query = useQuery({
    queryKey: ['roadmap-data', workspaceId, scopeKey],
    queryFn: () => fetchRoadmapData(token!, workspaceId!, selectedScope),
    enabled: !!token && !!workspaceId && selectedScope.length > 0,
    staleTime: AUTO_REFRESH_MS,
    // Keeps the open report current without any user action. Ticks are skipped
    // while the tab is hidden (refetchIntervalInBackground stays off), so a report
    // left open in a background tab costs nothing until it's looked at — and
    // coming back to it refetches straight away rather than waiting out the rest
    // of the interval. The staleTime above gates that, so flicking between tabs
    // can't turn into a pull per switch.
    refetchInterval: AUTO_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  })

  const timeSummaries = useMemo(() => aggregateTimeEntries(query.data?.timeEntries ?? []), [query.data])
  const goals = useMemo(
    () => buildRoadmap(query.data?.tasks ?? [], timeSummaries, avgCostPerHour),
    [query.data, timeSummaries, avgCostPerHour]
  )

  return {
    goals,
    tasks: query.data?.tasks ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    refetch: () => void query.refetch(),
    /** When this data last landed — drives the report's freshness indicator. */
    dataUpdatedAt: query.dataUpdatedAt,
    /** Set when ClickUp rejected the "everyone's time" request and hours shown may
     * only reflect your own logged time for some tasks — 'permission' when that
     * was a genuine 401/403 (token isn't a Workspace Owner/Admin), 'error' when it
     * was some other failure (rate limit, 5xx, network) that says nothing about
     * the token's permissions. */
    timeRestriction: query.data?.timeRestriction ?? null,
  }
}
