/**
 * Direct ClickUp REST API v2 fallback, used when the MCP server call fails.
 *
 * In practice this is the PRIMARY path today: mcp.clickup.com's CORS policy doesn't
 * allow the MCP SDK's `mcp-protocol-version` request header, so every browser-side
 * MCP call is rejected at the preflight stage before it ever reaches the server (see
 * the circuit breaker in mcpClient.ts). That means all real traffic lands here.
 *
 * Requests run through a concurrency-limited pool rather than one at a time with a
 * fixed delay — folder task fetching alone can mean dozens of paginated per-list
 * calls (see fetchTasksForScope in clickupService.ts), and serializing all of them
 * with a fixed gap turned "open a big folder" into tens of seconds of pure queuing
 * wait, even on workspaces well within their rate limit. A 429 is still retried with
 * backoff, and while a request is backing off it keeps holding its pool slot, which
 * naturally throttles the pool down if the limit is actually being hit.
 */
import { readEnv } from '@/lib/env'

const REST_BASE = readEnv('VITE_CLICKUP_REST_URL', 'https://api.clickup.com/api/v2')

const MAX_CONCURRENT = 6
const MAX_RETRIES = 4

let activeCount = 0
const waiters: Array<() => void> = []

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++
    return Promise.resolve()
  }
  return new Promise((resolve) => waiters.push(() => resolve()))
}

function releaseSlot() {
  activeCount--
  const next = waiters.shift()
  if (next) {
    activeCount++
    next()
  }
}

/** Runs `run` once a concurrency slot is free, capping how many ClickUp requests are
 * in flight at once without adding an artificial delay between them. */
async function throttled<T>(run: () => Promise<T>): Promise<T> {
  await acquireSlot()
  try {
    return await run()
  } finally {
    releaseSlot()
  }
}

export class ClickUpRateLimitError extends Error {
  status = 429 as const
}

/** A non-2xx, non-429 response, carrying the real HTTP status so callers can tell a
 * genuine permission refusal (401/403) apart from an unrelated failure (404, 5xx) —
 * conflating them previously meant any transient server error got reported to the
 * user as "your token isn't an admin token", which is simply false for those. */
export class ClickUpHttpError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

async function rawFetch(url: string, token: string, init?: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { Authorization: token, ...(init?.headers ?? {}) } })
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const retryAfterHeader = Number(res.headers.get('Retry-After'))
    const waitMs = (Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : 2 ** attempt) * 1000
    console.warn(`[clickup] rate limited on ${url}, retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
    await sleep(waitMs)
    return rawFetch(url, token, init, attempt + 1)
  }
  return res
}

type QueryParams = Record<string, string | string[] | undefined>

function buildUrl(path: string, params?: QueryParams): string {
  const url = new URL(`${REST_BASE}${path}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(`${key}[]`, v))
      else url.searchParams.set(key, value)
    }
  }
  return url.toString()
}

async function restFetch<T>(token: string, path: string, params?: QueryParams): Promise<T> {
  return throttled(async () => {
    const res = await rawFetch(buildUrl(path, params), token)
    if (res.status === 429) throw new ClickUpRateLimitError(`ClickUp REST ${path} still rate-limited after ${MAX_RETRIES} retries`)
    if (!res.ok) throw new ClickUpHttpError(`ClickUp REST ${path} failed: ${res.status} ${await res.text()}`, res.status)
    return res.json() as Promise<T>
  })
}

async function restMutate<T>(token: string, path: string, method: 'PUT' | 'POST', body: unknown): Promise<T> {
  return throttled(async () => {
    const res = await rawFetch(buildUrl(path), token, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 429) throw new ClickUpRateLimitError(`ClickUp REST ${path} still rate-limited after ${MAX_RETRIES} retries`)
    if (!res.ok) throw new ClickUpHttpError(`ClickUp REST ${method} ${path} failed: ${res.status} ${await res.text()}`, res.status)
    return res.json() as Promise<T>
  })
}

export const clickupRest = {
  getWorkspaces: (token: string) => restFetch<{ teams: unknown[] }>(token, '/team').then((r) => r.teams),
  getSpaces: (token: string, workspaceId: string) =>
    restFetch<{ spaces: unknown[] }>(token, `/team/${workspaceId}/space`).then((r) => r.spaces),
  getFolders: (token: string, spaceId: string) =>
    restFetch<{ folders: unknown[] }>(token, `/space/${spaceId}/folder`).then((r) => r.folders),
  getLists: (token: string, folderId: string) =>
    restFetch<{ lists: unknown[] }>(token, `/folder/${folderId}/list`).then((r) => r.lists),
  getFolderlessLists: (token: string, spaceId: string) =>
    restFetch<{ lists: unknown[] }>(token, `/space/${spaceId}/list`).then((r) => r.lists),
  getListDetails: (token: string, listId: string) => restFetch<unknown>(token, `/list/${listId}`),

  /**
   * `include_timl=true` ("Tasks in Multiple Lists") is required to get tasks merely
   * shared into this list, not just ones whose home list it is — confirmed via
   * ClickUp's docs. There's no equivalent guarantee for the workspace-wide "Filter
   * Team Tasks" endpoint's folder filter, and in practice it undercounts folders
   * with heavily cross-listed tasks — so folder scope is aggregated per-list
   * instead (see fetchTasksForScope in clickupService.ts), always through this.
   *
   * `includeClosed` controls ClickUp's own `include_closed` flag — completed/
   * discarded/other closed-type statuses are usually the bulk of a sprint's tasks
   * and are excluded by default, fetched only when the caller explicitly asks.
   */
  getTasksForList: (token: string, listId: string, page = 0, updatedAfter?: number, includeClosed = false) =>
    restFetch<{ tasks: unknown[] }>(token, `/list/${listId}/task`, {
      page: String(page),
      include_closed: String(includeClosed),
      include_timl: 'true',
      subtasks: 'true',
      date_updated_gt: updatedAfter ? String(updatedAfter) : undefined,
    }).then((r) => r.tasks),

  getTask: (token: string, taskId: string) => restFetch<unknown>(token, `/task/${taskId}`),
  getTaskTimeInStatus: (token: string, taskId: string) => restFetch<unknown>(token, `/task/${taskId}/time_in_status`),

  /**
   * Same data as `getTaskTimeInStatus`, for up to 100 tasks in one request instead
   * of one call per task — this endpoint takes `task_ids` repeated plainly (not the
   * `task_ids[]=` bracket form most other array params here use), confirmed against
   * the live API, so it's built as its own query string rather than through
   * `buildUrl`'s array handling.
   */
  getBulkTimeInStatus: (token: string, taskIds: string[]) => {
    const query = taskIds.map((id) => `task_ids=${encodeURIComponent(id)}`).join('&')
    return restFetch<Record<string, { current_status?: unknown; status_history?: unknown[] }>>(
      token,
      `/task/bulk_time_in_status/task_ids?${query}`
    )
  },
  getCustomFields: (token: string, listId: string) =>
    restFetch<{ fields: unknown[] }>(token, `/list/${listId}/field`).then((r) => r.fields),
  updateTask: (token: string, taskId: string, patch: Record<string, unknown>) =>
    restMutate(token, `/task/${taskId}`, 'PUT', patch),
  setCustomFieldValue: (token: string, taskId: string, fieldId: string, value: unknown) =>
    restMutate(token, `/task/${taskId}/field/${fieldId}`, 'POST', { value }),

  /** ClickUp's REST v2 has no dedicated "list workspace members" endpoint — members
   * are embedded in each team's own object inside `GET /team`'s response. */
  getWorkspaceMembers: async (token: string, workspaceId: string) => {
    const teams = await restFetch<{ teams: any[] }>(token, '/team').then((r) => r.teams)
    const team = teams.find((t) => String(t.id) === String(workspaceId))
    return (team?.members ?? []).map((m: any) => m.user ?? m)
  },

  /**
   * Real logged time entries for a list or folder, one row per (task, person, work
   * session). Used to compute actual hours spent per task (and per person on that
   * task) for the Roadmap Status report — never estimated or fabricated.
   *
   * ClickUp's endpoint defaults to only the authenticated user's own entries —
   * `assignee` must be explicitly passed (as one comma-separated value, not
   * repeated `assignee[]=` params like other endpoints use for arrays) to get
   * everyone's logged time, and doing so requires a Workspace Owner/Admin token.
   *
   * Critically, ClickUp *also* defaults `start_date`/`end_date` to just the last 30
   * days when they're omitted — confirmed against ClickUp's own API reference. This
   * report has no notion of a calendar window (a task's total hours is the sum of
   * every session ever logged against it), so both bounds are always passed
   * explicitly and as wide as ClickUp allows, or a task's early hours silently
   * vanish the moment they age past 30 days. `startDate` defaults to the Unix
   * epoch; `endDate` to "now" with a day of slack for clock skew.
   */
  getTimeEntriesForScope: (
    token: string,
    workspaceId: string,
    scope: { listId?: string; folderId?: string },
    assigneeIds?: number[],
    startDate = 0,
    endDate = Date.now() + 24 * 60 * 60 * 1000
  ) =>
    restFetch<{ data: unknown[] }>(token, `/team/${workspaceId}/time_entries`, {
      list_id: scope.listId,
      folder_id: scope.folderId,
      assignee: assigneeIds && assigneeIds.length > 0 ? assigneeIds.join(',') : undefined,
      start_date: String(startDate),
      end_date: String(endDate),
    }).then((r) => r.data),
}
