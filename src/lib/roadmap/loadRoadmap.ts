import { fetchTasksForScope, fetchTimeEntriesForScope, fetchWorkspaceMembers } from '@/lib/mcp/clickupService'
import type { TimeEntriesRestriction } from '@/lib/mcp/clickupService'
import type { AppTask, TimeEntry } from '@/types/clickup'

/** A sprint list or a folder of sprint lists, as picked in the scope picker. Typed
 * structurally so this module stays free of any store/React import — the agent
 * service runs it under Node. */
export interface ScopeSelection {
  type: 'folder' | 'list'
  id: string
  name: string
}

export interface RoadmapFetchResult {
  tasks: AppTask[]
  timeEntries: TimeEntry[]
  /** Set when ClickUp refused the all-members time filter for at least one scope
   * item and some hours may only reflect the caller's own logged time —
   * 'permission' if that was a genuine 401/403 (token isn't Owner/Admin), 'error'
   * if it was some other failure (rate limit, 5xx, network) unrelated to
   * permissions. 'permission' takes priority when scopes disagree. */
  timeRestriction: TimeEntriesRestriction
}

/**
 * Fetches the raw tasks + time entries behind a roadmap scope.
 *
 * Extracted from `useRoadmapData` so the agent service can rebuild exactly what the
 * report is showing rather than reimplementing it — if this and the UI ever diverge,
 * Brain starts quoting numbers that aren't on screen, which is the one failure mode
 * that would make the feature untrustworthy.
 */
export async function fetchRoadmapData(
  token: string,
  workspaceId: string,
  selectedScope: ScopeSelection[]
): Promise<RoadmapFetchResult> {
  // ClickUp's time-entries endpoint only returns the authenticated user's own
  // entries unless every member's user id is passed explicitly — fetched once up
  // front and reused for every scope item's time-entries call below.
  const members = await fetchWorkspaceMembers(token, workspaceId)
  const memberIds = members.map((m) => m.id)

  const perScope = await Promise.all(
    selectedScope.map(async (item) => {
      const scope = item.type === 'folder' ? { folderId: item.id } : { listId: item.id }
      // fetchTasksForScope already resolves the folder's list names internally while
      // paginating tasks — reuse that instead of fetching them again.
      const taskResult = await fetchTasksForScope(token, workspaceId, scope, undefined, true)
      const tasks = taskResult.tasks.map((task) => ({
        ...task,
        sprintName: item.type === 'list' ? item.name : taskResult.listNameById.get(task.listId) ?? null,
      }))

      // Time entries are fetched per the tasks' *actual home lists*, not the scope
      // container the user picked. A task pulled in via ClickUp's "Tasks in Multiple
      // Lists" feature has its logged time attributed to that home list, so filtering
      // time entries by the selected container alone silently misses it.
      const homeListIds = Array.from(new Set(tasks.map((t) => t.listId).filter(Boolean)))
      const timeEntryResults = await Promise.all(
        homeListIds.map((listId) => fetchTimeEntriesForScope(token, workspaceId, { listId }, memberIds))
      )
      const timeRestriction: TimeEntriesRestriction = timeEntryResults.some((r) => r.restriction === 'permission')
        ? 'permission'
        : timeEntryResults.some((r) => r.restriction === 'error')
          ? 'error'
          : null
      return {
        tasks,
        timeEntries: timeEntryResults.flatMap((r) => r.entries),
        timeRestriction,
      }
    })
  )

  const taskById = new Map<string, AppTask>()
  const allTimeEntries: TimeEntry[] = []
  let timeRestriction: TimeEntriesRestriction = null
  for (const { tasks, timeEntries, timeRestriction: restriction } of perScope) {
    for (const task of tasks) taskById.set(task.id, task)
    allTimeEntries.push(...timeEntries)
    if (restriction === 'permission') timeRestriction = 'permission'
    else if (restriction === 'error' && timeRestriction !== 'permission') timeRestriction = 'error'
  }

  return { tasks: Array.from(taskById.values()), timeEntries: allTimeEntries, timeRestriction }
}
