import { resolveStartDateFromHistory } from '@/lib/dates'
import {
  fetchListDetails,
  fetchListsForFolder,
  fetchStatusHistoryBulk,
  fetchTasksForScope,
  fetchTimeEntriesForScope,
  fetchWorkspaceMembers,
} from '@/lib/mcp/clickupService'
import { aggregateTimeEntries } from './timeAggregation'
import type { RoadmapScopeItem } from '@/store/roadmapStore'
import type { AppTask, StatusHistoryEntry, TaskTimeSummary } from '@/types/clickup'
import { audienceForTask, type TeamAudience } from './taskGroups'

export type SpilloverBucket = 'completed' | 'open' | 'blocked' | 'completedUpcoming'
export type SpilloverAudience = TeamAudience

/**
 * Every "Not started" / "Active" (non-blocked) status name in this workspace's
 * actual task workflow — a task only counts as "Open" when its live status is one
 * of these, an explicit whitelist rather than inferring it from whatever ClickUp's
 * generic status type happens to be (that missed "under release"/"tracking" as
 * resolved, and would silently default any future/unrecognized status to Open).
 * Blocked/On Hold are handled separately by `isBlockedOrOnHoldTask` even though
 * they're part of the same "Active" workflow group.
 */
const SPILLOVER_OPEN_STATUSES = new Set([
  'backlog',
  'in progress by pm',
  'design',
  'pm review',
  'approved',
  'todo',
  'in progress',
  'in review',
  'testing by dev',
  'testing by pjm',
  'testing by pm',
  'to deploy',
  'deploy to prod',
  'testing',
])

function isSpilloverOpenStatus(task: AppTask): boolean {
  return SPILLOVER_OPEN_STATUSES.has(task.status.trim().toLowerCase())
}

export interface SpilloverTaskRow {
  task: AppTask
  audience: SpilloverAudience
  bucket: SpilloverBucket
  /** The old ("spillover") sprint list the task was found under. */
  spilloverSprintName: string
  /** Task's own last-updated timestamp, shown alongside the spillover sprint name —
   * the most recent real signal available for "as of when" without inventing a
   * list-entry timestamp ClickUp doesn't expose. */
  spilloverSprintAsOf: number
  /** Name of the sprint the task now lives in, once it's done (null while still open/blocked). */
  currentSprintName: string | null
  /** When the task's current status began — real if status history was fetched. */
  completedAt: number | null
  /** When the task first left the "open" status group — from real status history,
   * falling back to the task's own Start Date field if history wasn't available. */
  inProgressAt: number | null
  /** completedAt - inProgressAt for finished tasks, or now - inProgressAt otherwise. */
  tatMs: number | null
  /** Real logged hours for this task, from time-tracking entries — same source as
   * the Goals tab's Hours column. */
  hoursSpent: number
}

export function isBlockedOrOnHoldTask(task: AppTask): boolean {
  const s = task.status.trim().toLowerCase()
  return s === 'blocked' || s.includes('on hold') || s === 'onhold' || s === 'hold'
}

/** "Resolved" for Spill Over bucket purposes: not sitting in a Blocked/On Hold
 * status and not one of the workflow's Open-stage statuses either — i.e. actually
 * completed/discarded/tracking/under release/closed, whatever that status is
 * named. Anything not explicitly recognized as Open or Blocked/On Hold falls here
 * rather than silently defaulting to Open. */
function isSpilloverResolvedTask(task: AppTask): boolean {
  return !isBlockedOrOnHoldTask(task) && !isSpilloverOpenStatus(task)
}

/** Every list a task actually belongs to right now — its home list plus every list
 * it's been added to via Tasks in Multiple Lists. A task can spill into a current
 * sprint via TIML while its *home* list stays the old sprint, so checking `listId`
 * alone misses that; this is the full membership `locations` alone doesn't
 * guarantee includes the home list, so both are unioned defensively. */
function taskListIds(task: AppTask): Set<string> {
  return new Set([task.listId, ...task.locations.map((l) => l.id)].filter(Boolean))
}


interface ListRef {
  id: string
  name: string
  orderindex: number
}

async function siblingsForFolder(token: string, folderId: string): Promise<ListRef[]> {
  const lists = await fetchListsForFolder(token, folderId, '')
  return lists.map((l) => ({ id: l.id, name: l.name, orderindex: l.orderindex ?? 0 })).sort((a, b) => a.orderindex - b.orderindex)
}

/**
 * The one folder whose lists are real sprints, so "the N sprints before this one"
 * has a meaning. Selected lists outside it — another team's folder, or a list
 * sitting loose in a space — have no sprint siblings worth walking back through,
 * and treating a space's folderless lists as sprints pulled unrelated lists into
 * the report.
 */
export const SPILLOVER_SPRINT_FOLDER = 'Content & Learning Outcomes_Sprint Folder'

function isSprintFolder(name: string | null | undefined): boolean {
  return (name ?? '').trim().toLowerCase() === SPILLOVER_SPRINT_FOLDER.toLowerCase()
}

interface SprintGroup {
  id: string
  currentIds: Set<string>
}

export interface SpilloverScope {
  currentListIds: Set<string>
  currentListNames: Map<string, string>
  spilloverListIds: string[]
  spilloverListNames: Map<string, string>
}

/**
 * Figures out which lists are the "current sprints" (the user's selected scope) and
 * which are the "spillover sprints" (the N sprints immediately before the earliest
 * current sprint) — using ClickUp's own list `orderindex` within each list's parent
 * folder (or, for folderless lists, its space), never by parsing sprint numbers out
 * of list names. Selected scope spanning multiple folders/spaces is handled by
 * resolving each parent group independently and unioning the results.
 */
export async function resolveSpilloverScope(
  token: string,
  selectedScope: RoadmapScopeItem[],
  previousSprintCount: number
): Promise<SpilloverScope> {
  const currentListNames = new Map<string, string>()
  const currentListIds = new Set<string>()
  // Only sprint-folder lists become groups — those are the ones with siblings to
  // walk back through. Everything selected still counts as a "current" list for
  // the completion-window checks below, whether or not it lives in that folder.
  const groups = new Map<string, SprintGroup>()

  for (const item of selectedScope) {
    if (item.type === 'list') {
      currentListNames.set(item.id, item.name)
      currentListIds.add(item.id)
      const details = await fetchListDetails(token, item.id)
      if (!details.folderId || !isSprintFolder(details.folderName)) continue
      const key = `folder:${details.folderId}`
      if (!groups.has(key)) groups.set(key, { id: details.folderId, currentIds: new Set() })
      groups.get(key)!.currentIds.add(item.id)
    } else {
      const siblings = await siblingsForFolder(token, item.id)
      for (const s of siblings) {
        currentListNames.set(s.id, s.name)
        currentListIds.add(s.id)
      }
      if (!isSprintFolder(item.name)) continue
      groups.set(`folder:${item.id}`, { id: item.id, currentIds: new Set(siblings.map((s) => s.id)) })
    }
  }

  const spilloverListIds = new Set<string>()
  const spilloverListNames = new Map<string, string>()

  for (const group of groups.values()) {
    if (group.currentIds.size === 0) continue
    const siblings = await siblingsForFolder(token, group.id)
    const currentIndexes = siblings.map((s, idx) => (group.currentIds.has(s.id) ? idx : -1)).filter((idx) => idx >= 0)
    if (currentIndexes.length === 0) continue
    const startIndex = Math.min(...currentIndexes)
    const from = Math.max(0, startIndex - previousSprintCount)
    for (let i = from; i < startIndex; i++) {
      spilloverListIds.add(siblings[i].id)
      spilloverListNames.set(siblings[i].id, siblings[i].name)
    }
  }

  return { currentListIds, currentListNames, spilloverListIds: Array.from(spilloverListIds), spilloverListNames }
}

export interface SpilloverResult {
  rows: SpilloverTaskRow[]
  currentSprintNames: string[]
  spilloverSprintNames: string[]
  /** Real per-task logged-time summaries for every spillover task — exposed so
   * callers (e.g. Roadmap Health's "With/Only Spill Over" modes) can build the same
   * Goal → Deliverable → Task hierarchy the rest of the report uses. */
  timeSummaries: Map<string, TaskTimeSummary>
}

/** Latest `enteredAt` in a status history — i.e. when the task's *current* status began. */
function currentStatusEnteredAt(history: StatusHistoryEntry[], fallback: number): number {
  if (history.length === 0) return fallback
  return history.reduce((max, h) => Math.max(max, h.enteredAt), 0) || fallback
}

export interface DateWindow {
  start: number | null
  end: number | null
}

interface ListWindow extends DateWindow {
  id: string
  name: string
}

function isWithinWindow(timestamp: number, window: DateWindow): boolean {
  if (window.start == null && window.end == null) return false
  if (window.start != null && timestamp < window.start) return false
  if (window.end != null && timestamp > window.end) return false
  return true
}

/** Real per-list sprint date windows (only Sprint-ClickApp lists carry `start_date`/
 * `due_date` — a plain list just comes back with both null). Fetched per list, not
 * assumed, so a task's completion date can be checked against each sprint's actual
 * window rather than a name-parsed guess. */
async function windowsForLists(token: string, listIds: string[]): Promise<Array<ListWindow | null>> {
  const details = await Promise.all(listIds.map((id) => fetchListDetails(token, id).catch(() => null)))
  return details.map((d) => (d == null ? null : { id: d.id, name: d.name, start: d.startDate, end: d.dueDate }))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * These sprint windows are small in number (a handful of lists) but decide the
 * bucket for every done task, so a fetch failure here is far more costly than one
 * missing name elsewhere — this retries only the lists that failed, a few times
 * with a short backoff, before finally giving up on those specific ones.
 */
async function windowsForListsWithRetry(token: string, listIds: string[], maxAttempts = 3): Promise<ListWindow[]> {
  const resolved = new Map<string, ListWindow>()
  let pending = listIds
  for (let attempt = 0; attempt < maxAttempts && pending.length > 0; attempt++) {
    if (attempt > 0) await sleep(500 * attempt)
    const results = await windowsForLists(token, pending)
    const stillPending: string[] = []
    pending.forEach((id, i) => {
      const result = results[i]
      if (result) resolved.set(id, result)
      else stillPending.push(id)
    })
    pending = stillPending
  }
  return Array.from(resolved.values())
}

function combinedWindow(windows: ListWindow[]): DateWindow {
  const starts = windows.map((w) => w.start).filter((s): s is number => s != null)
  const ends = windows.map((w) => w.end).filter((e): e is number => e != null)
  return {
    start: starts.length > 0 ? Math.min(...starts) : null,
    end: ends.length > 0 ? Math.max(...ends) : null,
  }
}

function findWindowContaining(windows: ListWindow[], timestamp: number): ListWindow | null {
  return windows.find((w) => isWithinWindow(timestamp, w)) ?? null
}

/**
 * Pulls real tasks from the spillover sprints and classifies each one from its
 * current (live) status plus real ClickUp data — no assumptions, no estimates. A
 * done task counts as resolved "on time" (bucket `completed`) when its completion
 * timestamp falls anywhere inside the combined spillover-through-current sprint
 * date window (real Sprint-ClickApp `start_date`/`due_date`, not parsed from
 * names); otherwise it's `completedUpcoming`. List membership across every list a
 * task belongs to (not just its home list) is only consulted as a fallback for
 * workspaces that don't have Sprint dates set at all.
 *
 * Only tasks ClickUp still surfaces under the old sprint list (its true home, or
 * shared in via Tasks-in-Multiple-Lists) can be found this way; a task that was
 * hard-moved off the old list with TIML off leaves no trace there for any API to
 * recover, so it can't appear here — callers should surface that caveat to the user.
 */
export async function fetchSpilloverData(
  token: string,
  workspaceId: string,
  selectedScope: RoadmapScopeItem[],
  previousSprintCount: number,
  /** Same "Select Range" window the main report applies to logged hours — passed
   * through so a spillover task's hours reflect the same restriction rather than
   * always showing all-time totals. Omit for "all time". */
  dateRange?: { start: number; end: number }
): Promise<SpilloverResult> {
  const scope = await resolveSpilloverScope(token, selectedScope, previousSprintCount)

  if (scope.spilloverListIds.length === 0) {
    return { rows: [], currentSprintNames: Array.from(currentNameSet(scope)), spilloverSprintNames: [], timeSummaries: new Map() }
  }

  const spilloverSprintNameByTaskId = new Map<string, string>()
  const taskById = new Map<string, AppTask>()
  const perList = await Promise.all(
    scope.spilloverListIds.map((listId) => fetchTasksForScope(token, workspaceId, { listId }, undefined, true))
  )
  scope.spilloverListIds.forEach((listId, i) => {
    const name = scope.spilloverListNames.get(listId)!
    for (const task of perList[i].tasks) {
      if (!spilloverSprintNameByTaskId.has(task.id)) spilloverSprintNameByTaskId.set(task.id, name)
      taskById.set(task.id, task)
    }
  })

  const candidates = Array.from(taskById.values())

  // Real per-sprint date windows — the primary signal for whether a done task
  // resolved during the *current* sprints or not. Fetched (and, on any failure,
  // retried) BEFORE the potentially much larger per-task status-history fan-out
  // below — with a bigger previousSprintCount there can be dozens/hundreds of
  // candidate tasks, and letting a handful of small, correctness-critical list
  // lookups queue behind that whole wave on the shared REST connection pool (see
  // clickupRest.ts) was exactly what made classification degrade as the sprint
  // count grew. A task that finished while still inside one of the old spillover
  // sprints' own window resolved before the current sprints even started, so that
  // does NOT count as "completed" here; only the combined current-sprints window
  // does. List membership is only consulted as a fallback when a workspace doesn't
  // have Sprint-ClickApp dates set on these lists at all. Spillover windows are
  // still fetched — they're used below purely to *label* which sprint a task
  // completed in, not to decide the bucket.
  const [currentWindows, spilloverWindows] = await Promise.all([
    windowsForListsWithRetry(token, Array.from(scope.currentListIds)),
    windowsForListsWithRetry(token, scope.spilloverListIds),
  ])
  const onTimeWindow = combinedWindow(currentWindows)

  // Status history for every candidate in a handful of bulk requests (ClickUp
  // accepts up to 100 task ids per call) instead of one request per task — with a
  // few dozen to a few hundred candidates, that's the difference between 1-2
  // requests and hundreds of them competing for the same connection pool, which
  // was the main reason this tab was slow to load.
  const historyByTaskId = await fetchStatusHistoryBulk(
    token,
    candidates.map((t) => t.id)
  )

  // A task id ClickUp's bulk endpoint doesn't recognize at all means the task no
  // longer really exists — confirmed live: a task can be deleted yet still show up
  // briefly in a list's own task listing (ClickUp-side indexing lag), which is
  // exactly what surfaced real, live "ghost" tasks in this report. Drop them here
  // rather than reporting stats for tasks that aren't actually there.
  const liveCandidates = candidates.filter((t) => historyByTaskId.has(t.id))

  // Real logged hours for every spillover task — same source (time-tracking
  // entries) as the Goals tab's Hours/Cost columns, fetched per task's actual home
  // list so it works the same way TIML-shared tasks are handled elsewhere.
  const members = await fetchWorkspaceMembers(token, workspaceId)
  const memberIds = members.map((m) => m.id)
  const homeListIds = Array.from(new Set(liveCandidates.map((t) => t.listId).filter(Boolean)))
  const timeEntryResults = await Promise.all(
    homeListIds.map((listId) => fetchTimeEntriesForScope(token, workspaceId, { listId }, memberIds, dateRange))
  )
  const timeSummaries = aggregateTimeEntries(timeEntryResults.flatMap((r) => r.entries))

  // "Completed in Upcoming Sprints" excludes anything that resolved during the
  // spillover sprints' own window too — that's a task that finished on schedule in
  // its original (old) sprint, not a genuinely late one, so it's neither "completed"
  // (not within current) nor "completed in upcoming" (it didn't take longer than the
  // spillover+current window) — it's just not relevant to this tab.
  const spilloverWindow = combinedWindow(spilloverWindows)

  // Only look up names for lists that are neither a known spillover sprint nor a
  // selected current sprint — i.e. the task rolled forward further than the
  // selected window. Scans every list each done task belongs to, not just its home
  // list, since that's exactly the membership TIML can hide. Usually a handful of
  // tasks at most.
  const unknownListIds = Array.from(
    new Set(
      liveCandidates
        .filter(isSpilloverResolvedTask)
        .flatMap((t) => Array.from(taskListIds(t)))
        .filter((id) => !scope.currentListIds.has(id) && !scope.spilloverListNames.has(id))
    )
  )
  const unknownListNames = new Map<string, string>()
  await Promise.all(
    unknownListIds.map(async (listId) => {
      try {
        const details = await fetchListDetails(token, listId)
        unknownListNames.set(listId, details.name)
      } catch {
        // Left unnamed rather than guessed — the row still appears, just without a sprint label.
      }
    })
  )

  const rows: SpilloverTaskRow[] = []
  for (const task of liveCandidates) {
    const history = historyByTaskId.get(task.id) ?? []
    const inProgressAt = resolveStartDateFromHistory(history) ?? task.rawStartDate ?? null
    const done = isSpilloverResolvedTask(task)
    const listIds = taskListIds(task)
    const listIdArray = Array.from(listIds)

    // Completed without ever spilling anywhere — every list it's ever been added to
    // is one of the old spillover sprints, so it isn't a spillover task at all.
    const neverLeftSpillover = done && listIdArray.every((id) => scope.spilloverListNames.has(id))
    if (neverLeftSpillover) continue

    let bucket: SpilloverBucket
    let completedAt: number | null = null
    let matchedWindow: ListWindow | null = null
    if (done) {
      // The "Delivery Date" custom field, when the team sets it, is their own record
      // of when the work actually shipped — more authoritative than inferring a
      // completion moment from a raw status-change timestamp. Only falls back to
      // status history for tasks that don't have it set.
      completedAt = task.deliveryDate ?? currentStatusEnteredAt(history, task.dateUpdated)
      const hasCurrentDateData = onTimeWindow.start != null || onTimeWindow.end != null
      const completedInCurrent = hasCurrentDateData
        ? isWithinWindow(completedAt, onTimeWindow)
        : listIdArray.some((id) => scope.currentListIds.has(id)) // no Sprint dates at all — fall back to list membership

      if (completedInCurrent) {
        bucket = 'completed'
      } else {
        const hasSpilloverDateData = spilloverWindow.start != null || spilloverWindow.end != null
        const completedInSpillover = hasSpilloverDateData && isWithinWindow(completedAt, spilloverWindow)
        // Resolved on schedule in its original sprint — not relevant to either
        // "completed" (didn't happen during current sprints) or "completed in
        // upcoming sprints" (didn't happen later than expected either).
        if (completedInSpillover) continue
        bucket = 'completedUpcoming'
      }
      matchedWindow = findWindowContaining(currentWindows, completedAt) ?? findWindowContaining(spilloverWindows, completedAt)
    } else {
      bucket = isBlockedOrOnHoldTask(task) ? 'blocked' : 'open'
    }

    const currentSprintName = done
      ? (matchedWindow?.name ??
        listIdArray.map((id) => scope.currentListNames.get(id)).find(Boolean) ??
        listIdArray.map((id) => unknownListNames.get(id)).find(Boolean) ??
        listIdArray.map((id) => scope.spilloverListNames.get(id)).find(Boolean) ??
        null)
      : null

    // A negative value here means the "in progress" timestamp and the completion
    // timestamp (often the Delivery Date field) disagree about ordering — e.g. a
    // Delivery Date set earlier than when the task's status history shows it first
    // moving out of an open status. Rather than show a nonsensical negative
    // duration, this is left unset (— in the UI) since there's no coherent TAT to
    // report for that case.
    const rawTatMs = inProgressAt == null ? null : (done ? completedAt! : Date.now()) - inProgressAt
    const tatMs = rawTatMs != null && rawTatMs < 0 ? null : rawTatMs

    rows.push({
      task,
      audience: audienceForTask(task),
      bucket,
      spilloverSprintName: spilloverSprintNameByTaskId.get(task.id)!,
      spilloverSprintAsOf: task.dateUpdated,
      currentSprintName,
      completedAt,
      inProgressAt,
      tatMs,
      hoursSpent: timeSummaries.get(task.id)?.totalHours ?? 0,
    })
  }

  return {
    rows,
    currentSprintNames: Array.from(currentNameSet(scope)),
    spilloverSprintNames: Array.from(scope.spilloverListNames.values()),
    timeSummaries,
  }
}

function currentNameSet(scope: SpilloverScope): Set<string> {
  return new Set(scope.currentListNames.values())
}

export interface SpilloverGroup {
  goal: string
  deliverable: string
  rows: SpilloverTaskRow[]
}

/** Rows with both Goal and Deliverable set are grouped Goal → Deliverable for
 * display; anything missing either field is left flat, per the report's convention
 * of never hiding data behind a hierarchy it doesn't actually have. */
export function groupSpilloverRows(rows: SpilloverTaskRow[]): { groups: SpilloverGroup[]; ungrouped: SpilloverTaskRow[] } {
  const groups = new Map<string, SpilloverGroup>()
  const ungrouped: SpilloverTaskRow[] = []

  for (const row of rows) {
    const goal = row.task.goal?.trim()
    const deliverable = row.task.deliverable?.trim()
    if (!goal || !deliverable) {
      ungrouped.push(row)
      continue
    }
    const key = `${goal}\0${deliverable}`
    if (!groups.has(key)) groups.set(key, { goal, deliverable, rows: [] })
    groups.get(key)!.rows.push(row)
  }

  return {
    groups: Array.from(groups.values()).sort((a, b) => a.goal.localeCompare(b.goal) || a.deliverable.localeCompare(b.deliverable)),
    ungrouped,
  }
}
