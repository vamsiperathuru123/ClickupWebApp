import type { AppTask, ClickUpFolder, ClickUpList, ClickUpSpace, ClickUpWorkspace, StatusHistoryEntry } from './clickup'

export interface CacheEntry<T> {
  data: T
  fetchedAt: number
}

export interface TaskCacheEntry {
  data: AppTask[]
  fetchedAt: number
  lastTaskUpdatedAt: number
}

export interface TaskDetailCacheEntry {
  startDate: number | null
  statusHistory: StatusHistoryEntry[]
  fetchedAt: number
}

export interface CacheState {
  workspaces: CacheEntry<ClickUpWorkspace[]> | null
  spaces: Record<string, CacheEntry<ClickUpSpace[]>>
  folders: Record<string, CacheEntry<ClickUpFolder[]>>
  lists: Record<string, CacheEntry<ClickUpList[]>>
  tasks: Record<string, TaskCacheEntry>
  taskDetails: Record<string, TaskDetailCacheEntry>
  capacities: Record<string, Record<string, number>>
  /** Whether completed/discarded/closed-type tasks have been loaded for a node —
   * they're excluded from the default fetch (usually the bulk of a sprint folder's
   * tasks) until the user explicitly asks to see them. */
  closedTasksLoaded: Record<string, boolean>
}

export const STALE_MS = 5 * 60 * 1000

export function isStale(fetchedAt: number | undefined | null): boolean {
  if (!fetchedAt) return true
  return Date.now() - fetchedAt > STALE_MS
}
