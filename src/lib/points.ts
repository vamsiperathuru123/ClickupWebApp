import type { AppTask, TaskWithSplit } from '@/types/clickup'

const DA_TAG = 'da'
const PM_TAG = 'pm task'

function isDaTask(tags: string[]): boolean {
  return tags.includes(DA_TAG)
}

function isPmTask(tags: string[]): boolean {
  return tags.includes(PM_TAG)
}

/**
 * Sprint points attribution: a DA-tagged task belongs to DA work, a "PM task"-tagged
 * task belongs to PM work — neither counts toward a developer's sprint points. Any
 * other task is dev work, and its whole point value goes to the Developer field's
 * person, not divided across assignees (ClickUp itself doesn't expose a per-assignee
 * point split via its API, and this workspace doesn't want an even split guessed).
 */
export function withSplitPoints(task: AppTask): TaskWithSplit {
  const total = task.points ?? 0
  const isDevTask = !isDaTask(task.tags) && !isPmTask(task.tags)
  return {
    ...task,
    splitPoints: isDevTask ? total : 0,
  }
}

export function formatPoints(points: number): string {
  const rounded = Math.round(points * 10) / 10
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)}pt`
}
