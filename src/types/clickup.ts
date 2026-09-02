export interface ClickUpUser {
  id: number
  username: string
  email?: string
  color?: string
  profilePicture?: string | null
  initials?: string
}

export interface ClickUpWorkspace {
  id: string
  name: string
  color?: string
  avatar?: string | null
}

export interface ClickUpSpace {
  id: string
  name: string
  workspaceId: string
  color?: string
  private?: boolean
}

export interface ClickUpFolder {
  id: string
  name: string
  spaceId: string
  hidden?: boolean
}

export interface ClickUpList {
  id: string
  name: string
  folderId: string | null
  spaceId: string
  taskCount?: number
  /** Position among sibling lists in the same folder/space, as ClickUp itself orders
   * them — used to figure out "the N sprints before this one" without guessing from
   * list names. */
  orderindex?: number
}

export interface StatusHistoryEntry {
  status: string
  type?: 'open' | 'custom' | 'closed' | 'done'
  enteredAt: number
  orderindex?: number
}

/** Canonical shape the app renders. Populated from whichever transport (MCP tool / REST) answered. */
export interface AppTask {
  id: string
  name: string
  status: string
  statusColor?: string
  statusType?: 'open' | 'custom' | 'closed' | 'done'
  /** The status's position in the list's configured workflow — used to order status
   * groups the way ClickUp itself does, not by whichever status a task happened to
   * be fetched in first. */
  statusOrderIndex?: number
  assignees: ClickUpUser[]
  priority: 'urgent' | 'high' | 'normal' | 'low' | null
  dueDate: number | null
  rawStartDate: number | null
  betaDueDate: number | null
  /** "Delivery Date" custom field — when a task actually got delivered, if the team
   * tracks that explicitly. More authoritative than inferring completion from status
   * history when it's set, since it's the team's own record of the delivery moment. */
  deliveryDate: number | null
  developer: ClickUpUser | null
  points: number | null
  tags: string[]
  /** Text custom fields used to build the Roadmap Status report's hierarchy. */
  goal: string | null
  deliverable: string | null
  outcome: string | null
  /** "Function Tag" custom field — categorizes a task by function/team. Can be a
   * dropdown or label-type field in ClickUp, not just plain text. */
  functionTag: string | null
  /** "Metric Category" / "Impacted Metric" text or dropdown custom fields. */
  metricCategory: string | null
  impactedMetric: string | null
  /** "Implementation Owner" / "Delivery Manager" people custom fields. */
  implementationOwner: ClickUpUser | null
  deliveryManager: ClickUpUser | null
  /** Name of the list (sprint) this task's home list is — shown as "Sprint" in the
   * Roadmap report. Populated by the caller from the list cache, not from the raw
   * task payload (ClickUp tasks only carry the list id, not its name). */
  sprintName?: string | null
  listId: string
  folderId: string | null
  spaceId: string
  /** Every list this task has been added to (Tasks in Multiple Lists) — `listId` is
   * only its home list, so checking list membership for a task should union this in. */
  locations: Array<{ id: string; name: string }>
  url: string
  description?: string
  dateUpdated: number
  /** resolved once status history is fetched; falls back to rawStartDate until then */
  resolvedStartDate?: number | null
}

export interface TaskWithSplit extends AppTask {
  /** points / assignees.length, or points if no assignees */
  splitPoints: number
}

/** One real logged work session on a task, from ClickUp's time tracking. */
export interface TimeEntry {
  id: string
  taskId: string
  user: ClickUpUser
  durationMs: number
}

/** Aggregated real hours for one task: total plus a per-person split, both derived
 * purely from summing that task's TimeEntry rows — never estimated. */
export interface TaskTimeSummary {
  totalHours: number
  byPerson: Array<{ user: ClickUpUser; hours: number }>
}
