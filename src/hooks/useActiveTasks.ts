import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useCacheStore } from '@/store/cacheStore'
import { useUiStore } from '@/store/uiStore'
import { isStale, STALE_MS } from '@/types/cache'
import { fetchTasksForScope } from '@/lib/mcp/clickupService'
import type { ActiveNodeType } from '@/store/uiStore'
import type { AppTask } from '@/types/clickup'

/** Module-level (not per-hook-instance) so the background closed-tasks fetch is
 * only started once per node even though useActiveTasks is called from several
 * components at once (List view, Topbar's sync indicator, etc.). */
const startedClosedFetchFor = new Set<string>()

/**
 * Resolves tasks for the active sidebar node. A List and a Folder are each fetched
 * via a single scoped call (not one call per list) so tasks merely shared into a
 * list/folder via ClickUp's "Tasks in Multiple Lists" feature are included, not just
 * ones whose home list happens to be inside the active node — see fetchTasksForScope.
 *
 * Active-status tasks are fetched first so the list renders fast. Completed/
 * discarded/other closed-type tasks — usually the bulk of a sprint's tasks — are
 * then fetched automatically in the background (no user action needed) and merged
 * in once ready; the UI just shows them as another (auto-collapsed) status group
 * when they arrive, same as ClickUp's own behavior. `closedTasksLoaded` persists per
 * node so this only happens once.
 */
export function useActiveTasks(activeNode: { type: ActiveNodeType; id: string } | null): {
  tasks: AppTask[]
  isLoading: boolean
  isFetching: boolean
  error: Error | null
  refetch: () => void
  closedTasksLoaded: boolean
} {
  const token = useAuthStore((s) => s.token)
  const workspaceId = useUiStore((s) => s.activeWorkspaceId)
  const mergeTasks = useCacheStore((s) => s.mergeTasks)
  const setClosedTasksLoaded = useCacheStore((s) => s.setClosedTasksLoaded)
  const cacheEntry = useCacheStore((s) => (activeNode ? s.tasks[activeNode.id] : undefined))
  const closedTasksLoaded = useCacheStore((s) => (activeNode ? !!s.closedTasksLoaded[activeNode.id] : false))

  const fresh = cacheEntry && !isStale(cacheEntry.fetchedAt)

  const query = useQuery({
    queryKey: ['tasks', activeNode?.type, activeNode?.id, closedTasksLoaded],
    queryFn: async () => {
      const nodeId = activeNode!.id
      const updatedAfter = cacheEntry?.lastTaskUpdatedAt
      const scope = activeNode!.type === 'folder' ? { folderId: nodeId } : { listId: nodeId }
      const { tasks, lastTaskUpdatedAt } = await fetchTasksForScope(token!, workspaceId!, scope, updatedAfter, closedTasksLoaded)
      mergeTasks(nodeId, tasks, lastTaskUpdatedAt)
      return useCacheStore.getState().tasks[nodeId]?.data ?? tasks
    },
    enabled: !!activeNode && !!token && !!workspaceId && !fresh,
    staleTime: STALE_MS,
    retry: 1,
  })

  useEffect(() => {
    if (!activeNode || !token || !workspaceId || closedTasksLoaded) return
    if (startedClosedFetchFor.has(activeNode.id)) return
    startedClosedFetchFor.add(activeNode.id)

    const nodeId = activeNode.id
    const scope = activeNode.type === 'folder' ? { folderId: nodeId } : { listId: nodeId }
    fetchTasksForScope(token, workspaceId, scope, undefined, true)
      .then(({ tasks, lastTaskUpdatedAt }) => {
        mergeTasks(nodeId, tasks, lastTaskUpdatedAt)
        setClosedTasksLoaded(nodeId)
      })
      .catch((err) => {
        console.warn('[clickup] background fetch of closed tasks failed for', nodeId, err)
        startedClosedFetchFor.delete(nodeId) // allow a retry next time this node becomes active
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNode?.id, token, workspaceId, closedTasksLoaded])

  return {
    tasks: cacheEntry?.data ?? query.data ?? [],
    isLoading: !fresh && query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    refetch: () => void query.refetch(),
    closedTasksLoaded,
  }
}
