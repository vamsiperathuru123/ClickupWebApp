import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AppTask, ClickUpFolder, ClickUpList, ClickUpSpace, ClickUpWorkspace, StatusHistoryEntry } from '@/types/clickup'
import type { CacheState } from '@/types/cache'

interface CacheActions {
  setWorkspaces: (data: ClickUpWorkspace[]) => void
  setSpaces: (workspaceId: string, data: ClickUpSpace[]) => void
  setFolders: (spaceId: string, data: ClickUpFolder[]) => void
  setLists: (folderId: string, data: ClickUpList[]) => void
  mergeTasks: (listId: string, incoming: AppTask[], lastTaskUpdatedAt: number) => void
  setTaskDetail: (taskId: string, startDate: number | null, statusHistory: StatusHistoryEntry[]) => void
  setResolvedStartDate: (listId: string, taskId: string, startDate: number | null) => void
  setCapacity: (listId: string, devId: string, value: number) => void
  getCapacity: (listId: string, devId: string) => number
  setClosedTasksLoaded: (nodeId: string) => void
  clearAll: () => void
  clearFetchedData: () => void
}

const initialState: CacheState = {
  workspaces: null,
  spaces: {},
  folders: {},
  lists: {},
  tasks: {},
  taskDetails: {},
  capacities: {},
  closedTasksLoaded: {},
}

export const DEFAULT_CAPACITY = 5

export const useCacheStore = create<CacheState & CacheActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setWorkspaces: (data) => set({ workspaces: { data, fetchedAt: Date.now() } }),

      setSpaces: (workspaceId, data) =>
        set((s) => ({ spaces: { ...s.spaces, [workspaceId]: { data, fetchedAt: Date.now() } } })),

      setFolders: (spaceId, data) =>
        set((s) => ({ folders: { ...s.folders, [spaceId]: { data, fetchedAt: Date.now() } } })),

      setLists: (folderId, data) =>
        set((s) => ({ lists: { ...s.lists, [folderId]: { data, fetchedAt: Date.now() } } })),

      mergeTasks: (listId, incoming, lastTaskUpdatedAt) =>
        set((s) => {
          const existing = s.tasks[listId]
          const byId = new Map((existing?.data ?? []).map((t) => [t.id, t]))
          for (const task of incoming) {
            const prior = byId.get(task.id)
            byId.set(task.id, prior ? { ...prior, ...task, resolvedStartDate: task.resolvedStartDate ?? prior.resolvedStartDate } : task)
          }
          return {
            tasks: {
              ...s.tasks,
              [listId]: {
                data: Array.from(byId.values()),
                fetchedAt: Date.now(),
                lastTaskUpdatedAt: Math.max(existing?.lastTaskUpdatedAt ?? 0, lastTaskUpdatedAt),
              },
            },
          }
        }),

      setTaskDetail: (taskId, startDate, statusHistory) =>
        set((s) => ({
          taskDetails: {
            ...s.taskDetails,
            [taskId]: { startDate, statusHistory, fetchedAt: Date.now() },
          },
        })),

      setResolvedStartDate: (listId, taskId, startDate) =>
        set((s) => {
          const existing = s.tasks[listId]
          if (!existing) return {}
          return {
            tasks: {
              ...s.tasks,
              [listId]: {
                ...existing,
                data: existing.data.map((t) => (t.id === taskId ? { ...t, resolvedStartDate: startDate } : t)),
              },
            },
          }
        }),

      setCapacity: (listId, devId, value) =>
        set((s) => ({
          capacities: {
            ...s.capacities,
            [listId]: { ...(s.capacities[listId] ?? {}), [devId]: value },
          },
        })),

      getCapacity: (listId, devId) => get().capacities[listId]?.[devId] ?? DEFAULT_CAPACITY,

      setClosedTasksLoaded: (nodeId) => set((s) => ({ closedTasksLoaded: { ...s.closedTasksLoaded, [nodeId]: true } })),

      clearAll: () => set(initialState),

      /**
       * Drops everything fetched from ClickUp so the next render refetches it from
       * scratch, while keeping what the user typed in (per-dev capacities) and
       * which nodes have had their closed tasks pulled. Backs the Resync button:
       * `useActiveTasks` disables its query while its cache entry is still fresh,
       * so clearing react-query alone wouldn't actually re-hit the API. Task
       * entries go entirely rather than just having `fetchedAt` aged, because
       * `lastTaskUpdatedAt` would otherwise make the refetch incremental — and an
       * incremental fetch can't notice a task that was deleted in ClickUp.
       */
      clearFetchedData: () =>
        set({
          workspaces: null,
          spaces: {},
          folders: {},
          lists: {},
          tasks: {},
          taskDetails: {},
        }),
    }),
    {
      name: 'dev-bandwidth-tracker-cache',
      version: 1,
    }
  )
)
