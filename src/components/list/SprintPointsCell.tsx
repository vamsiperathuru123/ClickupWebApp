import { formatPoints } from '@/lib/points'
import type { TaskWithSplit } from '@/types/clickup'

/**
 * Shows the task's total Sprint Points. ClickUp's API only ever returns this single
 * aggregate value — there's no endpoint for the per-assignee split shown in ClickUp's
 * own UI ("Set Sprint Points per Assignee via API" is still an open, unimplemented
 * feature request on ClickUp's public roadmap) — so no breakdown is shown here.
 */
export function SprintPointsCell({ task }: { task: TaskWithSplit }) {
  if (task.points == null) return <span className="text-gray-500 text-xs">—</span>
  return <span className="text-gray-300 text-xs font-medium">{formatPoints(task.points)}</span>
}
