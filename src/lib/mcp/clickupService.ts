import { callMcpTool } from './mcpClient'
import { clickupRest, ClickUpHttpError, ClickUpRateLimitError } from './clickupRest'
import { TOOLS } from './toolNames'
import { mapRawTasksToAppTasks } from './mapTask'
import { normalizeFolder, normalizeList, normalizeSpace, normalizeWorkspace } from './normalize'
import type {
  AppTask,
  ClickUpFolder,
  ClickUpList,
  ClickUpSpace,
  ClickUpUser,
  ClickUpWorkspace,
  StatusHistoryEntry,
  TimeEntry,
} from '@/types/clickup'

/**
 * Despite the name (kept to avoid touching every call site), this now tries REST
 * *first* and MCP only as a backup — the reverse of the original design.
 *
 * REST is the only path that's been thoroughly validated across every field and
 * every view in this app. MCP was consistently CORS-blocked in every test during
 * this build, so it never actually served real data — until it unexpectedly
 * started succeeding, at which point it turned out to return task data shaped
 * differently than REST (status/priority/custom fields came back empty/wrong),
 * because `mapTask.ts` was written against REST's response shape. Rather than
 * reverse-engineer and support a second, less-trusted shape for every field on
 * every operation (not just tasks — spaces/members/time-entries were never
 * verified against MCP's shape either), REST stays primary and MCP is only used
 * if REST itself fails.
 */
async function viaMcpThenRest<T>(mcpCall: () => Promise<T>, restCall: () => Promise<T>): Promise<T> {
  try {
    return await restCall()
  } catch (restError) {
    console.warn('[clickup] REST call failed, falling back to MCP', restError)
    try {
      return await mcpCall()
    } catch (mcpError) {
      console.warn('[clickup] MCP fallback also failed', mcpError)
      // Report the REST failure, not the MCP one. REST is the path that actually
      // serves this app, so its error is the one that describes what went wrong
      // ("still rate-limited after 4 retries", "401"). The MCP server simply
      // doesn't implement most of these tools, so its "Unknown tool: …" message
      // is a constant that tells the user nothing about the real cause — and it
      // was being surfaced in place of it.
      throw restError
    }
  }
}

export async function fetchWorkspaces(token: string): Promise<ClickUpWorkspace[]> {
  const raw = await viaMcpThenRest(
    () => callMcpTool(token, TOOLS.getWorkspaces, {}) as Promise<any>,
    () => clickupRest.getWorkspaces(token)
  )
  const list = Array.isArray(raw) ? raw : (raw as any).teams ?? (raw as any).workspaces ?? []
  return list.map(normalizeWorkspace)
}

/**
 * Hierarchy levels are fetched lazily, one at a time, only for the node the user
 * actually expands — NOT as one eager cascade down to every list in every space.
 * A workspace can have dozens of spaces with dozens of folders each; eagerly
 * fetching folders+lists for all of them on initial load was turning "open the
 * sidebar" into a hundred-plus serialized REST calls (REST carries all traffic
 * since MCP is CORS-blocked — see mcpClient.ts — so those calls are also
 * throttled with spacing, compounding the delay). Fetching one level per expand
 * keeps the initial load down to a single spaces call.
 */
export async function fetchSpaces(token: string, workspaceId: string): Promise<ClickUpSpace[]> {
  const raw = await viaMcpThenRest(
    () => callMcpTool(token, TOOLS.getSpaces, { workspace_id: workspaceId, team_id: workspaceId }) as Promise<any>,
    () => clickupRest.getSpaces(token, workspaceId)
  )
  const list = Array.isArray(raw) ? raw : (raw as any).spaces ?? []
  return list.map((s: any) => normalizeSpace(s, workspaceId))
}

export async function fetchFoldersAndFolderlessLists(
  token: string,
  spaceId: string
): Promise<{ folders: ClickUpFolder[]; folderlessLists: ClickUpList[] }> {
  const [rawFolders, rawLists] = await Promise.all([
    viaMcpThenRest(
      () => callMcpTool(token, TOOLS.getFolders, { space_id: spaceId }) as Promise<any>,
      () => clickupRest.getFolders(token, spaceId)
    ),
    viaMcpThenRest(
      () => callMcpTool(token, TOOLS.getFolderlessLists, { space_id: spaceId }) as Promise<any>,
      () => clickupRest.getFolderlessLists(token, spaceId)
    ),
  ])
  const folders = (Array.isArray(rawFolders) ? rawFolders : (rawFolders as any).folders ?? []).map((f: any) =>
    normalizeFolder(f, spaceId)
  )
  const folderlessLists = (Array.isArray(rawLists) ? rawLists : (rawLists as any).lists ?? []).map((l: any) =>
    normalizeList(l, spaceId, null)
  )
  return { folders, folderlessLists }
}

export async function fetchListsForFolder(token: string, folderId: string, spaceId: string): Promise<ClickUpList[]> {
  const raw = await viaMcpThenRest(
    () => callMcpTool(token, TOOLS.getLists, { folder_id: folderId }) as Promise<any>,
    () => clickupRest.getLists(token, folderId)
  )
  const list = Array.isArray(raw) ? raw : (raw as any).lists ?? []
  return list.map((l: any) => normalizeList(l, spaceId, folderId))
}

export interface FetchTasksResult {
  tasks: AppTask[]
  lastTaskUpdatedAt: number
  /** For folder scope, the list-id → list-name map already resolved while fetching
   * (empty for list scope, where the caller already knows the single list's name).
   * Exposed so callers needing list/sprint names (e.g. the Roadmap report) don't
   * have to issue the exact same "get this folder's lists" call a second time. */
  listNameById: Map<string, string>
}

export interface TaskScope {
  listId?: string
  folderId?: string
}

/** Paginates page-size-100 through a single list's tasks, optionally as a delta fetch
 * (only tasks updated after `updatedAfter`). Includes `include_timl` (Tasks in
 * Multiple Lists) so tasks merely shared into the list — not just ones whose home
 * list it is — are counted. `includeClosed` is off by default: completed/discarded/
 * other closed-type statuses are usually the bulk of a sprint's tasks and are only
 * worth the round trip once the user actually asks to see them. Returns raw
 * (unmapped) task JSON for internal reuse. */
async function fetchRawTasksForList(
  token: string,
  workspaceId: string,
  listId: string,
  updatedAfter?: number,
  includeClosed = false
): Promise<any[]> {
  const allRaw: any[] = []
  let page = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const raw = await viaMcpThenRest(
      () =>
        callMcpTool(token, TOOLS.getTasks, {
          list_ids: [listId],
          workspace_id: workspaceId,
          team_id: workspaceId,
          page,
          include_closed: includeClosed,
          subtasks: true,
          include_timl: true,
          ...(updatedAfter ? { date_updated_gt: updatedAfter } : {}),
        }) as Promise<any>,
      () => clickupRest.getTasksForList(token, listId, page, updatedAfter, includeClosed)
    )
    const pageTasks = Array.isArray(raw) ? raw : (raw as any).tasks ?? []
    allRaw.push(...pageTasks)
    if (pageTasks.length < 100) break
    page += 1
  }
  return allRaw
}

export interface ListDetails {
  id: string
  name: string
  orderindex: number
  folderId: string | null
  folderName: string | null
  spaceId: string
  /** Real sprint window when the Sprints ClickApp is enabled on this list's folder —
   * null for a plain (non-sprint) list. */
  startDate: number | null
  dueDate: number | null
}

/** A single list's own metadata (name, position among its siblings, parent folder/
 * space, and — for Sprint lists — its real date window) — used by the Spill Over
 * feature to walk "N sprints before this one" without assuming anything about list
 * naming conventions, and to double-check task classification by date when list
 * membership alone doesn't resolve it. */
export async function fetchListDetails(token: string, listId: string): Promise<ListDetails> {
  const raw = (await viaMcpThenRest(
    () => callMcpTool(token, TOOLS.getListDetails, { list_id: listId }) as Promise<any>,
    () => clickupRest.getListDetails(token, listId)
  )) as any
  const toMsOrNull = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return {
    id: String(raw.id ?? listId),
    name: raw.name,
    orderindex: Number(raw.orderindex ?? 0),
    folderId: raw.folder?.id ? String(raw.folder.id) : null,
    folderName: raw.folder?.name ? String(raw.folder.name) : null,
    spaceId: String(raw.space?.id ?? ''),
    startDate: toMsOrNull(raw.start_date),
    dueDate: toMsOrNull(raw.due_date),
  }
}

export async function fetchListSummariesForFolder(token: string, folderId: string): Promise<Array<{ id: string; name: string }>> {
  const raw = await viaMcpThenRest(
    () => callMcpTool(token, TOOLS.getLists, { folder_id: folderId }) as Promise<any>,
    () => clickupRest.getLists(token, folderId)
  )
  const list = Array.isArray(raw) ? raw : (raw as any).lists ?? []
  return list.map((l: any) => ({ id: String(l.id ?? l.list_id), name: l.name }))
}

/**
 * A folder has no direct "list its tasks" endpoint, and the workspace-wide "Filter
 * Team Tasks" endpoint's folder filter (`project_ids[]`) turns out to undercount
 * folders with heavily cross-listed tasks — ClickUp's own UI clearly aggregates
 * every list's tasks (including ones only shared in via "Tasks in Multiple Lists"),
 * but that endpoint doesn't reliably reproduce it. So folder scope is fetched by
 * pulling each of the folder's lists individually (which IS documented to include
 * TIML tasks via `include_timl=true`) and merging the results, deduping by task id
 * since a cross-listed task appears once per list it belongs to.
 */
export async function fetchTasksForScope(
  token: string,
  workspaceId: string,
  scope: TaskScope,
  updatedAfter?: number,
  includeClosed = false
): Promise<FetchTasksResult> {
  let allRaw: any[]
  let listNameById = new Map<string, string>()

  if (scope.listId) {
    allRaw = await fetchRawTasksForList(token, workspaceId, scope.listId, updatedAfter, includeClosed)
  } else {
    const lists = await fetchListSummariesForFolder(token, scope.folderId!)
    listNameById = new Map(lists.map((l) => [l.id, l.name]))
    const rawPerList = await Promise.all(
      lists.map((l) => fetchRawTasksForList(token, workspaceId, l.id, updatedAfter, includeClosed))
    )
    const byId = new Map<string, any>()
    for (const raw of rawPerList.flat()) byId.set(raw.id, raw)
    allRaw = Array.from(byId.values())
  }

  const tasks = mapRawTasksToAppTasks(allRaw)
  const lastTaskUpdatedAt = tasks.reduce((max, t) => Math.max(max, t.dateUpdated), updatedAfter ?? 0)
  return { tasks, lastTaskUpdatedAt, listNameById }
}

export async function fetchTask(token: string, taskId: string): Promise<AppTask> {
  const raw = await viaMcpThenRest(
    () => callMcpTool(token, TOOLS.getTask, { task_id: taskId }) as Promise<any>,
    () => clickupRest.getTask(token, taskId)
  )
  return mapRawTasksToAppTasks([raw])[0]
}

function parseStatusHistory(raw: any): StatusHistoryEntry[] {
  if (!raw) return []

  const history: StatusHistoryEntry[] = (raw.status_history ?? []).map((h: any) => ({
    status: h.status,
    type: h.type,
    enteredAt: Number(h.total_time?.since ?? h.since ?? 0),
    orderindex: h.orderindex,
  }))

  if (raw.current_status) {
    history.push({
      status: raw.current_status.status,
      type: raw.current_status.type,
      enteredAt: Number(raw.current_status.total_time?.since ?? Date.now()),
    })
  }

  return history.filter((h) => h.enteredAt > 0)
}

export async function fetchStatusHistory(token: string, taskId: string): Promise<StatusHistoryEntry[]> {
  const raw = await viaMcpThenRest(
    () => callMcpTool(token, TOOLS.getTaskTimeInStatus, { task_id: taskId }) as Promise<any>,
    () => clickupRest.getTaskTimeInStatus(token, taskId)
  ).catch((err) => {
    console.warn('[clickup] time-in-status unavailable for task, falling back to start_date', taskId, err)
    return null
  })

  return parseStatusHistory(raw)
}

const BULK_TIME_IN_STATUS_BATCH_SIZE = 100

/**
 * Same real status-history data as `fetchStatusHistory`, for many tasks in a handful
 * of requests instead of one per task — ClickUp's bulk endpoint accepts up to 100
 * ids per call. Used wherever a view needs status history for a whole batch of
 * tasks at once (e.g. the Spill Over report), where firing one request per task was
 * the dominant cost. Falls back to the per-task endpoint, only for the ids in a
 * batch that failed, so a single bad batch can't blank out everything else.
 *
 * The returned map only contains a key for a task id if ClickUp's bulk endpoint
 * actually returned data for it. A task id that's missing from the response (the
 * endpoint returns `{}` for it, confirmed against the live API) means ClickUp no
 * longer considers that task to exist — a real, observed case being a task that
 * was deleted but still briefly shows up in a list's own task listing (an
 * indexing-lag inconsistency on ClickUp's side, not something this app can avoid at
 * the source). Callers should treat a missing id as "drop this task", not as "it
 * has no history".
 */
export async function fetchStatusHistoryBulk(token: string, taskIds: string[]): Promise<Map<string, StatusHistoryEntry[]>> {
  const result = new Map<string, StatusHistoryEntry[]>()
  const uniqueIds = Array.from(new Set(taskIds))

  for (let i = 0; i < uniqueIds.length; i += BULK_TIME_IN_STATUS_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BULK_TIME_IN_STATUS_BATCH_SIZE)
    try {
      const raw = await clickupRest.getBulkTimeInStatus(token, batch)
      for (const id of batch) {
        if (raw[id] !== undefined) result.set(id, parseStatusHistory(raw[id]))
      }
    } catch (err) {
      console.warn('[clickup] bulk time-in-status failed for a batch, falling back to per-task fetches', err)
      const perTask = await Promise.all(
        batch.map(async (id) => {
          try {
            return await clickupRest.getTaskTimeInStatus(token, id)
          } catch {
            return undefined
          }
        })
      )
      batch.forEach((id, idx) => {
        if (perTask[idx] !== undefined) result.set(id, parseStatusHistory(perTask[idx]))
      })
    }
  }

  return result
}

export interface TaskUpdatePatch {
  status?: string
  priority?: number | null
  due_date?: number | null
  assignees?: { add?: number[]; rem?: number[] }
}

export async function updateTask(token: string, taskId: string, patch: TaskUpdatePatch): Promise<AppTask> {
  const raw = await viaMcpThenRest(
    () => callMcpTool(token, TOOLS.updateTask, { task_id: taskId, ...patch }) as Promise<any>,
    () => clickupRest.updateTask(token, taskId, patch as Record<string, unknown>)
  )
  return mapRawTasksToAppTasks([raw])[0]
}

export async function fetchListCustomFields(token: string, listId: string): Promise<Array<{ id: string; name: string }>> {
  const raw = await viaMcpThenRest(
    () => callMcpTool(token, TOOLS.getCustomFields, { list_id: listId }) as Promise<any>,
    () => clickupRest.getCustomFields(token, listId)
  )
  const list = Array.isArray(raw) ? raw : (raw as any).fields ?? []
  return list.map((f: any) => ({ id: f.id, name: f.name }))
}

/** "Developer" is a single-user custom field, not a native task field — resolves its
 * field id from the task's own custom_fields (all tasks in a list share field defs). */
export async function updateDeveloper(token: string, taskId: string, developerUserId: number, fieldId: string) {
  await viaMcpThenRest(
    () =>
      callMcpTool(token, TOOLS.setCustomFieldValue, {
        task_id: taskId,
        field_id: fieldId,
        value: developerUserId,
      }) as Promise<any>,
    () => clickupRest.setCustomFieldValue(token, taskId, fieldId, developerUserId)
  )
}

/** Shared across every caller for a short window. The member roster is only used to
 * ask ClickUp for everyone's time entries, it barely changes, and both the roadmap
 * query and the spillover query need it at the same moment — without this they each
 * hit `/team` on every refetch, doubling requests against the rate limit for a list
 * that's identical both times. */
const membersCache = new Map<string, { at: number; promise: Promise<ClickUpUser[]> }>()
// Deliberately longer than the report's 5-minute auto-refresh: a TTL equal to the
// refresh interval expires just in time for every tick to miss it, so each pulse
// would pay for a `/team` call it could have skipped. The roster changes far more
// slowly than that, and an explicit Resync clears this anyway.
const MEMBERS_CACHE_TTL_MS = 30 * 60 * 1000

async function fetchWorkspaceMembersUncached(token: string, workspaceId: string): Promise<ClickUpUser[]> {
  const raw = await viaMcpThenRest(
    () => callMcpTool(token, TOOLS.getWorkspaceMembers, { workspace_id: workspaceId, team_id: workspaceId }) as Promise<any>,
    () => clickupRest.getWorkspaceMembers(token, workspaceId)
  )
  const list = Array.isArray(raw) ? raw : (raw as any).members ?? []
  return list.map((m: any) => {
    const user = m.user ?? m
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      color: user.color,
      profilePicture: user.profilePicture ?? null,
    }
  })
}

/** Drops the memoized roster so an explicit Resync really re-asks ClickUp. */
export function clearWorkspaceMembersCache() {
  membersCache.clear()
}

export function fetchWorkspaceMembers(token: string, workspaceId: string): Promise<ClickUpUser[]> {
  const key = `${token}:${workspaceId}`
  const cached = membersCache.get(key)
  if (cached && Date.now() - cached.at < MEMBERS_CACHE_TTL_MS) return cached.promise

  const promise = fetchWorkspaceMembersUncached(token, workspaceId).catch((error) => {
    // Don't cache a failure — a rate-limited attempt shouldn't poison the next
    // five minutes of lookups.
    membersCache.delete(key)
    throw error
  })
  membersCache.set(key, { at: Date.now(), promise })
  return promise
}

export type TimeEntriesRestriction = 'permission' | 'error' | null

export interface TimeEntriesResult {
  entries: TimeEntry[]
  /** Set when the all-members request failed and this fell back to the caller's
   * own logged time only, so callers can warn the user instead of silently
   * showing an incomplete total:
   *  - 'permission' — ClickUp actually refused the assignee filter (401/403):
   *    the token genuinely isn't a Workspace Owner/Admin.
   *  - 'error' — some other failure (rate limit, 5xx, network): the token may
   *    well be fine, ClickUp just didn't answer this particular request. Telling
   *    the user to ask for a different token would be wrong here.
   */
  restriction: TimeEntriesRestriction
}

/** True for the specific failure ClickUp uses to say "this token can't see other
 * members' time" — a 401/403 on the all-members request. Any other status (429
 * rate limits, 5xx, network errors) means the request simply didn't succeed this
 * time, which says nothing about the token's permissions. */
function isPermissionError(err: unknown): boolean {
  return err instanceof ClickUpHttpError && (err.status === 401 || err.status === 403)
}

/**
 * Real logged time entries for every task in a list or folder — the Roadmap Status
 * report's only source for "hours spent" (never estimated). One row per work
 * session, so a task with several contributors yields several rows sharing the
 * same taskId.
 *
 * ClickUp's endpoint only returns the *authenticated user's own* entries unless
 * `assigneeIds` (every workspace member) is passed explicitly — and that requires
 * a Workspace Owner/Admin token. If the token lacks that permission, ClickUp
 * rejects the assignee filter with a 401/403; this falls back to the unfiltered
 * (own-time-only) call so the report still loads rather than erroring out
 * entirely, and flags that it did so via `restriction`. A rate limit or other
 * transient failure gets the same fallback (still shows *something*), but is
 * reported as `'error'`, not `'permission'` — those calls never actually reached
 * the point of ClickUp evaluating the token's permissions.
 */
export async function fetchTimeEntriesForScope(
  token: string,
  workspaceId: string,
  scope: TaskScope,
  assigneeIds?: number[],
  /** Restricts real logged-time entries to sessions that *started* within this
   * window (inclusive) — from the report's "Select Range" picker. Omit for "all
   * time", the report's default.
   *
   * Deliberately NOT sent to ClickUp's own `start_date`/`end_date` query params:
   * confirmed live that ClickUp excludes an entry whose *end* timestamp falls
   * outside the queried range even when its *start* is well inside it — a manual
   * entry logged with an hours-long duration starting late on the last selected
   * day (spilling past midnight) was silently dropped entirely, even though it
   * genuinely started within the range. So this always fetches the full,
   * unrestricted range from ClickUp and applies the range here instead, against
   * each entry's own start time — the one timestamp the user's date picker
   * actually means to bound. */
  dateRange?: { start: number; end: number }
): Promise<TimeEntriesResult> {
  let restriction: TimeEntriesRestriction = null

  const raw = await viaMcpThenRest(
    () =>
      callMcpTool(token, TOOLS.getTimeEntries, {
        workspace_id: workspaceId,
        team_id: workspaceId,
        list_id: scope.listId,
        folder_id: scope.folderId,
        assignee: assigneeIds,
      }) as Promise<any>,
    () =>
      clickupRest
        .getTimeEntriesForScope(token, workspaceId, scope, assigneeIds)
        .catch((err) => {
          if (!assigneeIds?.length) throw err
          if (isPermissionError(err)) {
            console.warn(
              '[clickup] fetching all members\' time entries failed (needs Workspace Owner/Admin permissions) — falling back to your own logged time only',
              err
            )
            restriction = 'permission'
          } else {
            const reason = err instanceof ClickUpRateLimitError ? 'rate limited' : 'request failed'
            console.warn(
              `[clickup] fetching all members' time entries ${reason} — falling back to your own logged time only for this list; this does not necessarily mean the token lacks permission`,
              err
            )
            restriction = 'error'
          }
          return clickupRest.getTimeEntriesForScope(token, workspaceId, scope)
        })
  )
  const list = Array.isArray(raw) ? raw : (raw as any).data ?? []
  const entries = list
    .filter((e: any) => e?.task?.id && e?.user?.id)
    .filter((e: any) => {
      if (!dateRange) return true
      const startMs = Number(e.start) || 0
      return startMs >= dateRange.start && startMs <= dateRange.end
    })
    .map((e: any) => ({
      id: String(e.id),
      taskId: String(e.task.id),
      user: {
        id: e.user.id,
        username: e.user.username ?? `User ${e.user.id}`,
        email: e.user.email,
        color: e.user.color,
        profilePicture: e.user.profilePicture ?? null,
        initials: e.user.initials,
      },
      durationMs: Number(e.duration) || 0,
      startMs: Number(e.start) || 0,
    }))
  return { entries, restriction }
}
