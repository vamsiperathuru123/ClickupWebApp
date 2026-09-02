import { createContext, useContext, type ReactNode } from 'react'
import { useRoadmapStore } from '@/store/roadmapStore'
import { useSpilloverData } from '@/hooks/useSpilloverData'

export type SpilloverSnapshot = ReturnType<typeof useSpilloverData>

export interface ReportSettings {
  avgCostPerHour: number
  totalWorkingHours: number
  previousSprintCount: number
  /** Already-fetched spillover result. Only supplied by the export. */
  spillover?: SpilloverSnapshot
}

const ReportSettingsContext = createContext<ReportSettings | null>(null)

/**
 * Supplies the report's global settings — and the resolved spillover result —
 * explicitly, instead of letting each tab read them from a store or refetch them.
 *
 * The HTML export renders tabs with `renderToStaticMarkup`, where zustand hands
 * back its *initial* state rather than the live one. That silently exported every
 * cost/hours figure as 0, and it also broke `useSpilloverData`: its query key is
 * built from the workspace id and selected scope, so with initial state the key
 * didn't match anything in the react-query cache and every tab reported "Spillover
 * Data is empty". Wrapping the export in this provider keeps both correct; the
 * live app leaves it absent and the hooks fall through to their normal sources.
 */
export function ReportSettingsProvider({ value, children }: { value: ReportSettings; children: ReactNode }) {
  return <ReportSettingsContext.Provider value={value}>{children}</ReportSettingsContext.Provider>
}

export function useReportSettings(): ReportSettings {
  const override = useContext(ReportSettingsContext)
  const avgCostPerHour = useRoadmapStore((s) => s.avgCostPerHour)
  const totalWorkingHours = useRoadmapStore((s) => s.totalWorkingHours)
  const previousSprintCount = useRoadmapStore((s) => s.spilloverPreviousSprintCount)
  return override ?? { avgCostPerHour, totalWorkingHours, previousSprintCount }
}

/** Spillover data for whichever context the component is rendering in — the
 * provider's snapshot during an export, a live query otherwise. */
export function useReportSpillover(): SpilloverSnapshot {
  const override = useContext(ReportSettingsContext)
  const { previousSprintCount } = useReportSettings()
  const live = useSpilloverData(previousSprintCount)
  return override?.spillover ?? live
}
