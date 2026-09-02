import type { AppTask, ClickUpUser } from '@/types/clickup'

export interface RoadmapTaskRow {
  task: AppTask
  hoursSpent: number
  hoursByPerson: Array<{ user: ClickUpUser; hours: number }>
  cost: number
  /** null when the same outcome was uniform across the whole deliverable/goal and
   * got hoisted up instead of repeated on every task. */
  outcome: string | null
}

export interface RoadmapGroupTotals {
  totalHours: number
  totalCost: number
  doneCount: number
  totalCount: number
  blockedCount: number
  onHoldCount: number
  /** Latest due date among descendant tasks that have one set. */
  eta: number | null
}

export interface RoadmapDeliverable extends RoadmapGroupTotals {
  name: string
  outcome: string | null
  tasks: RoadmapTaskRow[]
  /** Unique people, deduped by user id, drawn from every task's Implementation
   * Owner / Delivery Manager fields — shown as a rollup beside the deliverable name. */
  implementationOwners: ClickUpUser[]
  deliveryManagers: ClickUpUser[]
}

export interface RoadmapGoal extends RoadmapGroupTotals {
  name: string
  outcome: string | null
  deliverables: RoadmapDeliverable[]
}

export const NO_GOAL_LABEL = '(No Goal)'
export const NO_DELIVERABLE_LABEL = '(No Deliverable)'
