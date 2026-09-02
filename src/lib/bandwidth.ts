import type { ClickUpUser, TaskWithSplit } from '@/types/clickup'
import { DEFAULT_CAPACITY } from '@/store/cacheStore'

export interface DevBandwidth {
  dev: ClickUpUser
  capacity: number
  target: number
  available: number
  tasks: TaskWithSplit[]
}

/** Devs excluded from the Bandwidth tab's roster regardless of Developer field data. */
const EXCLUDED_DEV_NAMES = ['hrithik choudhary']

/**
 * The dev roster is scoped to whoever is actually set as "Developer" on a task in
 * the active list/folder — not the whole workspace's member list, which spans every
 * team (sales, marketing, etc.) and would swamp a single sprint folder's real roster.
 */
export function computeDevBandwidth(tasks: TaskWithSplit[], capacities: Record<string, number> | undefined): DevBandwidth[] {
  const devsById = new Map<number, ClickUpUser>()
  const tasksByDev = new Map<number, TaskWithSplit[]>()

  for (const task of tasks) {
    if (!task.developer) continue
    if (EXCLUDED_DEV_NAMES.includes(task.developer.username.trim().toLowerCase())) continue
    devsById.set(task.developer.id, task.developer)
    const list = tasksByDev.get(task.developer.id) ?? []
    list.push(task)
    tasksByDev.set(task.developer.id, list)
  }

  return Array.from(devsById.values())
    .sort((a, b) => a.username.localeCompare(b.username))
    .map((dev) => {
      const devTasks = tasksByDev.get(dev.id) ?? []
      const capacity = capacities?.[String(dev.id)] ?? DEFAULT_CAPACITY
      const target = devTasks.reduce((sum, t) => sum + t.splitPoints, 0)
      return { dev, capacity, target, available: capacity - target, tasks: devTasks }
    })
}
