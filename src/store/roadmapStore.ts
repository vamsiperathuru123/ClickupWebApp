import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AudienceFilter, StatusGroupFilter } from '@/lib/roadmap/taskGroups'

export interface RoadmapScopeItem {
  type: 'list' | 'folder'
  id: string
  name: string
}

export type SpilloverBucketFilter = 'completed' | 'open' | 'blocked' | 'completedUpcoming'
export type ExecutiveSpilloverMode = 'without' | 'with' | 'onlySpillover'

interface RoadmapState {
  /** Sprint lists / folders feeding the Roadmap Status report — user-selected, not
   * tied to the sidebar's single active node. */
  selectedScope: RoadmapScopeItem[]
  /** Editable cost inputs — Total Budget = avgCostPerHour * totalWorkingHours; each
   * task's cost = that task's real logged hours * avgCostPerHour. */
  avgCostPerHour: number
  totalWorkingHours: number
  /** Spill Over tab's own settings — persisted so switching tabs or reloading the
   * page doesn't lose the sprint count and force a full data refetch. */
  spilloverPreviousSprintCount: number
  spilloverAudience: AudienceFilter
  spilloverBucket: SpilloverBucketFilter
  /** Goals and Roadmap Health tabs' own Audience/Status-group tab selections —
   * persisted the same way, and kept independent of each other and of Spill Over's. */
  goalsAudience: AudienceFilter
  goalsStatusGroup: StatusGroupFilter
  executiveAudience: AudienceFilter
  executiveStatusGroup: StatusGroupFilter
  executiveSpilloverMode: ExecutiveSpilloverMode
  /** Resources tab's own Spillover-mode/Status-group tab selections — same shape as
   * Roadmap Health's, no Audience tabs since Resources never had those. */
  resourcesStatusGroup: StatusGroupFilter
  resourcesSpilloverMode: ExecutiveSpilloverMode
  /** Function Tag tab's own Audience/Spillover-mode selections — no status-group
   * tabs there, just Audience above Without/With/Only Spill Over. */
  functionTagAudience: AudienceFilter
  functionTagSpilloverMode: ExecutiveSpilloverMode
  /** Overall Report's Audience selection — the whole report re-scopes to it. */
  overallAudience: AudienceFilter

  toggleScopeItem: (item: RoadmapScopeItem) => void
  clearScope: () => void
  setAvgCostPerHour: (value: number) => void
  setTotalWorkingHours: (value: number) => void
  setSpilloverPreviousSprintCount: (value: number) => void
  setSpilloverAudience: (value: AudienceFilter) => void
  setSpilloverBucket: (value: SpilloverBucketFilter) => void
  setGoalsAudience: (value: AudienceFilter) => void
  setGoalsStatusGroup: (value: StatusGroupFilter) => void
  setExecutiveAudience: (value: AudienceFilter) => void
  setExecutiveStatusGroup: (value: StatusGroupFilter) => void
  setExecutiveSpilloverMode: (value: ExecutiveSpilloverMode) => void
  setResourcesStatusGroup: (value: StatusGroupFilter) => void
  setResourcesSpilloverMode: (value: ExecutiveSpilloverMode) => void
  setFunctionTagAudience: (value: AudienceFilter) => void
  setFunctionTagSpilloverMode: (value: ExecutiveSpilloverMode) => void
  setOverallAudience: (value: AudienceFilter) => void
}

export const useRoadmapStore = create<RoadmapState>()(
  persist(
    (set) => ({
      selectedScope: [],
      avgCostPerHour: 0,
      totalWorkingHours: 0,
      spilloverPreviousSprintCount: 0,
      spilloverAudience: 'all',
      spilloverBucket: 'completed',
      goalsAudience: 'all',
      goalsStatusGroup: 'all',
      executiveAudience: 'all',
      executiveStatusGroup: 'completed',
      executiveSpilloverMode: 'without',
      resourcesStatusGroup: 'all',
      resourcesSpilloverMode: 'without',
      functionTagAudience: 'all',
      functionTagSpilloverMode: 'without',
      overallAudience: 'all',

      toggleScopeItem: (item) =>
        set((s) => {
          const exists = s.selectedScope.some((i) => i.type === item.type && i.id === item.id)
          return {
            selectedScope: exists
              ? s.selectedScope.filter((i) => !(i.type === item.type && i.id === item.id))
              : [...s.selectedScope, item],
          }
        }),

      clearScope: () => set({ selectedScope: [] }),
      setAvgCostPerHour: (value) => set({ avgCostPerHour: Math.max(0, value) }),
      setTotalWorkingHours: (value) => set({ totalWorkingHours: Math.max(0, value) }),
      setSpilloverPreviousSprintCount: (value) => set({ spilloverPreviousSprintCount: Math.max(0, value) }),
      setSpilloverAudience: (value) => set({ spilloverAudience: value }),
      setSpilloverBucket: (value) => set({ spilloverBucket: value }),
      setGoalsAudience: (value) => set({ goalsAudience: value }),
      setGoalsStatusGroup: (value) => set({ goalsStatusGroup: value }),
      setExecutiveAudience: (value) => set({ executiveAudience: value }),
      setExecutiveStatusGroup: (value) => set({ executiveStatusGroup: value }),
      setExecutiveSpilloverMode: (value) => set({ executiveSpilloverMode: value }),
      setResourcesStatusGroup: (value) => set({ resourcesStatusGroup: value }),
      setResourcesSpilloverMode: (value) => set({ resourcesSpilloverMode: value }),
      setFunctionTagAudience: (value) => set({ functionTagAudience: value }),
      setFunctionTagSpilloverMode: (value) => set({ functionTagSpilloverMode: value }),
      setOverallAudience: (value) => set({ overallAudience: value }),
    }),
    { name: 'dev-bandwidth-tracker-roadmap' }
  )
)
