import { create } from 'zustand'
import { currentSprintStart } from '@/lib/dates'

export type MainView = 'list' | 'calendar' | 'bandwidth' | 'roadmap'
export type CalendarSubView = 'task' | 'dev'
export type ActiveNodeType = 'folder' | 'list'

interface UiState {
  activeWorkspaceId: string | null
  expandedNodes: Set<string>
  activeNode: { type: ActiveNodeType; id: string; name: string } | null
  mainView: MainView
  calendarSubView: CalendarSubView
  calendarWindowStart: number
  selectedTaskId: string | null
  selectedTaskIds: Set<string>
  searchQuery: string

  setActiveWorkspaceId: (id: string) => void
  toggleExpanded: (nodeId: string) => void
  isExpanded: (nodeId: string) => boolean
  setActiveNode: (node: UiState['activeNode']) => void
  setMainView: (view: MainView) => void
  setCalendarSubView: (view: CalendarSubView) => void
  setCalendarWindowStart: (ts: number) => void
  navigateCalendarWindow: (deltaDays: number) => void
  resetCalendarWindowToToday: () => void
  setSelectedTaskId: (id: string | null) => void
  toggleTaskSelection: (id: string) => void
  toggleGroupSelection: (ids: string[], select: boolean) => void
  clearTaskSelection: () => void
  setSearchQuery: (q: string) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  activeWorkspaceId: null,
  expandedNodes: new Set(),
  activeNode: null,
  mainView: 'list',
  calendarSubView: 'task',
  calendarWindowStart: currentSprintStart(),
  selectedTaskId: null,
  selectedTaskIds: new Set(),
  searchQuery: '',

  setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),

  toggleExpanded: (nodeId) =>
    set((s) => {
      const next = new Set(s.expandedNodes)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return { expandedNodes: next }
    }),

  isExpanded: (nodeId) => get().expandedNodes.has(nodeId),

  setActiveNode: (node) => set({ activeNode: node, selectedTaskIds: new Set() }),

  setMainView: (view) => set({ mainView: view }),
  setCalendarSubView: (view) => set({ calendarSubView: view }),
  setCalendarWindowStart: (ts) => set({ calendarWindowStart: ts }),
  navigateCalendarWindow: (deltaDays) => set((s) => ({ calendarWindowStart: s.calendarWindowStart + deltaDays * 86400000 })),
  resetCalendarWindowToToday: () => set({ calendarWindowStart: currentSprintStart() }),

  setSelectedTaskId: (id) => set({ selectedTaskId: id }),

  toggleTaskSelection: (id) =>
    set((s) => {
      const next = new Set(s.selectedTaskIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedTaskIds: next }
    }),

  toggleGroupSelection: (ids, select) =>
    set((s) => {
      const next = new Set(s.selectedTaskIds)
      for (const id of ids) {
        if (select) next.add(id)
        else next.delete(id)
      }
      return { selectedTaskIds: next }
    }),

  clearTaskSelection: () => set({ selectedTaskIds: new Set() }),

  setSearchQuery: (q) => set({ searchQuery: q }),
}))
