import type { ScopeSelection } from '@/lib/roadmap/loadRoadmap'

/**
 * What the browser tells the agent about where the user is standing.
 *
 * Deliberately a *descriptor*, not a data dump: a few hundred bytes naming the scope
 * and the active view, which the service then expands by rebuilding the report with
 * the same functions the UI uses. Sending the data itself would mean ~100KB a turn
 * and would still leave the agent unable to look past whatever was sent.
 */
export interface BrainUiContext {
  view: 'list' | 'calendar' | 'bandwidth' | 'roadmap'
  /** Which Roadmap Status tab is open, when view === 'roadmap'. */
  roadmapTab?: string
  /** Sprint lists / sprint folders the report is built from. */
  scope: ScopeSelection[]
  /** The list or folder selected in the sidebar, for the non-roadmap views. */
  activeNode?: { type: 'folder' | 'list'; id: string; name: string } | null
  /** Tasks the user has ticked in the List view. */
  selectedTaskIds?: string[]
  /** Filter state of the active tab, so "why is this number what it is?" is answerable. */
  filters?: Record<string, string>
  settings: {
    avgCostPerHour: number
    totalWorkingHours: number
    previousSprintCount: number
  }
}

export interface BrainRequest {
  /** The user's own ClickUp token. Held for the request only — never stored or logged. */
  token: string
  workspaceId: string
  /** Conversation id, so follow-ups keep their history server-side. */
  threadId: string
  message: string
  context: BrainUiContext
}

export type BrainCitationKind = 'task' | 'goal' | 'deliverable' | 'person'

export interface BrainCitation {
  kind: BrainCitationKind
  /** ClickUp task id for 'task', otherwise the name. */
  id: string
  label: string
}

/** Server → client SSE frames. */
export type BrainStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'token'; text: string }
  | { type: 'tool'; name: string; summary: string }
  | { type: 'citations'; citations: BrainCitation[] }
  | { type: 'done'; traceId?: string }
  | { type: 'error'; message: string }
