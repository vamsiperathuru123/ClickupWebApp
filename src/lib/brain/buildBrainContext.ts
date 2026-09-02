import { useUiStore } from '@/store/uiStore'
import { useRoadmapStore } from '@/store/roadmapStore'
import { useBrainStore } from '@/store/brainStore'
import type { BrainUiContext } from './types'

/**
 * Assembles the descriptor of where the user is standing.
 *
 * A few hundred bytes rather than the data itself: the agent service rebuilds the
 * report from these ids using the same functions the UI uses, so what Brain reads and
 * what the screen shows cannot drift apart. The filter values matter as much as the
 * scope — "why is this number what it is?" is unanswerable without knowing which tab
 * and which spillover mode produced it.
 */
export function useBrainContext(): BrainUiContext {
  const view = useUiStore((s) => s.mainView)
  const activeNode = useUiStore((s) => s.activeNode)
  const selectedTaskIds = useUiStore((s) => s.selectedTaskIds)
  const scope = useRoadmapStore((s) => s.selectedScope)
  const avgCostPerHour = useRoadmapStore((s) => s.avgCostPerHour)
  const totalWorkingHours = useRoadmapStore((s) => s.totalWorkingHours)
  const previousSprintCount = useRoadmapStore((s) => s.spilloverPreviousSprintCount)
  const goalsAudience = useRoadmapStore((s) => s.goalsAudience)
  const goalsStatusGroup = useRoadmapStore((s) => s.goalsStatusGroup)
  const executiveSpilloverMode = useRoadmapStore((s) => s.executiveSpilloverMode)
  const resourcesStatusGroup = useRoadmapStore((s) => s.resourcesStatusGroup)
  const resourcesSpilloverMode = useRoadmapStore((s) => s.resourcesSpilloverMode)
  const functionTagSpilloverMode = useRoadmapStore((s) => s.functionTagSpilloverMode)
  const overallAudience = useRoadmapStore((s) => s.overallAudience)
  const viewContext = useBrainStore((s) => s.viewContext)

  const tab = viewContext.roadmapTab

  // Only the filters that belong to the tab actually on screen — sending all of them
  // would invite the model to explain a number using a filter that isn't applied.
  const filters: Record<string, string> = { ...viewContext.filters }
  if (tab === 'goals') {
    filters.audience = goalsAudience
    filters.statusGroup = goalsStatusGroup
  } else if (tab === 'executive') {
    filters.spilloverMode = executiveSpilloverMode
  } else if (tab === 'resources') {
    filters.statusGroup = resourcesStatusGroup
    filters.spilloverMode = resourcesSpilloverMode
  } else if (tab === 'functionTag') {
    filters.spilloverMode = functionTagSpilloverMode
  } else if (tab === 'overall') {
    filters.audience = overallAudience
  }

  return {
    view,
    roadmapTab: tab,
    scope,
    activeNode,
    selectedTaskIds: selectedTaskIds.size > 0 ? Array.from(selectedTaskIds) : undefined,
    filters,
    settings: { avgCostPerHour, totalWorkingHours, previousSprintCount },
  }
}

/** One-line summary of the same thing, for the panel's context chip. */
export function describeBrainContext(context: BrainUiContext): string {
  const parts: string[] = []
  if (context.view === 'roadmap') {
    parts.push(context.roadmapTab ? `Roadmap Status › ${context.roadmapTab}` : 'Roadmap Status')
    parts.push(`${context.scope.length} sprint${context.scope.length === 1 ? '' : 's'}`)
  } else {
    parts.push(context.view)
    if (context.activeNode) parts.push(context.activeNode.name)
  }
  const spill = context.filters?.spilloverMode
  if (spill) parts.push(spill === 'without' ? 'without spill over' : spill === 'with' ? 'with spill over' : 'only spill over')
  return parts.join(' · ')
}
