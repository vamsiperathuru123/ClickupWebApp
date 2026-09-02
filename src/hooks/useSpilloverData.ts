import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { useRoadmapStore } from '@/store/roadmapStore'
import { fetchSpilloverData } from '@/lib/roadmap/spillover'
import { AUTO_REFRESH_MS } from '@/lib/autoRefresh'

/**
 * Real spillover data for the currently selected roadmap scope: tasks that were
 * sitting in the `previousSprintCount` sprints immediately before the selected
 * scope's earliest sprint, classified by what actually happened to them since
 * (completed on time, completed late, still open, or blocked/on hold).
 */
export function useSpilloverData(previousSprintCount: number) {
  const token = useAuthStore((s) => s.token)
  const workspaceId = useUiStore((s) => s.activeWorkspaceId)
  const selectedScope = useRoadmapStore((s) => s.selectedScope)

  const scopeKey = selectedScope.map((s) => `${s.type}:${s.id}`).join(',')

  const query = useQuery({
    queryKey: ['spillover-data', workspaceId, scopeKey, previousSprintCount],
    queryFn: () => fetchSpilloverData(token!, workspaceId!, selectedScope, previousSprintCount),
    enabled: !!token && !!workspaceId && selectedScope.length > 0 && previousSprintCount > 0,
    // Every task here is classified by its *current* live status — a stale cached
    // result would keep showing a task's old status/bucket after it's actually
    // moved on in ClickUp. `refetchOnMount: 'always'` ignores staleTime, so
    // switching back to this view still forces a real pull; the staleTime itself
    // only bounds how old a result a *visibility regain* will accept, which stops
    // flicking between browser tabs from firing a ~20s fetch every time. The
    // previous result stays on screen while a refetch runs, so neither blanks the
    // report.
    staleTime: AUTO_REFRESH_MS,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    // Same 5-minute pulse as the committed data so the two halves of every
    // with-spillover figure are never more than one tick apart. Unfocused ticks
    // are skipped, and the query key dedupes overlapping pulls - which matters
    // here, since a spillover fetch can outlast a single interval.
    refetchInterval: AUTO_REFRESH_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  })

  return {
    rows: query.data?.rows ?? [],
    currentSprintNames: query.data?.currentSprintNames ?? [],
    spilloverSprintNames: query.data?.spilloverSprintNames ?? [],
    timeSummaries: query.data?.timeSummaries ?? new Map(),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    refetch: () => void query.refetch(),
    dataUpdatedAt: query.dataUpdatedAt,
  }
}
