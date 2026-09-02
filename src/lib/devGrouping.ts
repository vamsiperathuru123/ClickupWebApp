import type { ClickUpUser, TaskWithSplit } from '@/types/clickup'

export interface DevGroup {
  dev: ClickUpUser | null
  tasks: TaskWithSplit[]
}

export function groupByDeveloper(tasks: TaskWithSplit[]): DevGroup[] {
  const order: string[] = []
  const groups = new Map<string, DevGroup>()

  for (const task of tasks) {
    const key = task.developer ? String(task.developer.id) : 'unassigned'
    if (!groups.has(key)) {
      order.push(key)
      groups.set(key, { dev: task.developer, tasks: [] })
    }
    groups.get(key)!.tasks.push(task)
  }

  return order.map((key) => groups.get(key)!)
}
