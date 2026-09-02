import type { TaskWithSplit } from '@/types/clickup'

export interface StatusGroup {
  status: string
  statusType?: string
  statusColor?: string
  statusOrderIndex?: number
  tasks: TaskWithSplit[]
  totalPoints: number
}

/** Groups are ordered by the status's configured position in the list's workflow
 * (statusOrderIndex), matching ClickUp's own stage order — not by whichever status
 * happened to appear first among the fetched tasks. ClickUp displays statuses in
 * *descending* orderindex order, confirmed against a real workspace (ascending
 * order rendered the exact mirror image of ClickUp's own stage order). Statuses
 * without an order index (shouldn't normally happen) sort last. */
export function groupByStatus(tasks: TaskWithSplit[]): StatusGroup[] {
  const groups = new Map<string, StatusGroup>()

  for (const task of tasks) {
    if (!groups.has(task.status)) {
      groups.set(task.status, {
        status: task.status,
        statusType: task.statusType,
        statusColor: task.statusColor,
        statusOrderIndex: task.statusOrderIndex,
        tasks: [],
        totalPoints: 0,
      })
    }
    const group = groups.get(task.status)!
    group.tasks.push(task)
    group.totalPoints += task.splitPoints
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.statusOrderIndex == null && b.statusOrderIndex == null) return 0
    if (a.statusOrderIndex == null) return 1
    if (b.statusOrderIndex == null) return -1
    return b.statusOrderIndex - a.statusOrderIndex
  })
}

export function filterBySearch(tasks: TaskWithSplit[], query: string): TaskWithSplit[] {
  if (!query.trim()) return tasks
  const q = query.trim().toLowerCase()
  return tasks.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.developer?.username.toLowerCase().includes(q) ||
      t.assignees.some((a) => a.username.toLowerCase().includes(q))
  )
}
