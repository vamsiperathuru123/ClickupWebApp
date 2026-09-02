import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useCacheStore } from '@/store/cacheStore'
import { updateTask, updateDeveloper, fetchListCustomFields } from '@/lib/mcp/clickupService'
import type { AppTask } from '@/types/clickup'

export function useBulkUpdate() {
  const token = useAuthStore((s) => s.token)
  const mergeTasks = useCacheStore((s) => s.mergeTasks)
  const [isUpdating, setIsUpdating] = useState(false)

  async function applyToTasks(tasks: AppTask[], run: (task: AppTask) => Promise<AppTask>) {
    setIsUpdating(true)
    try {
      const byList = new Map<string, AppTask[]>()
      const results = await Promise.allSettled(tasks.map(run))
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') {
          console.warn('[bulk-update] failed for task', tasks[i].id, r.reason)
          return
        }
        const listId = tasks[i].listId
        byList.set(listId, [...(byList.get(listId) ?? []), r.value])
      })
      byList.forEach((updated, listId) => mergeTasks(listId, updated, Date.now()))
    } finally {
      setIsUpdating(false)
    }
  }

  return {
    isUpdating,
    setStatus: (tasks: AppTask[], status: string) =>
      applyToTasks(tasks, (t) => updateTask(token!, t.id, { status })),
    setPriority: (tasks: AppTask[], priorityRank: number) =>
      applyToTasks(tasks, (t) => updateTask(token!, t.id, { priority: priorityRank })),
    setDueDate: (tasks: AppTask[], dueDate: number) =>
      applyToTasks(tasks, (t) => updateTask(token!, t.id, { due_date: dueDate })),
    setDeveloper: async (tasks: AppTask[], developerUserId: number) => {
      setIsUpdating(true)
      try {
        const fieldsByList = new Map<string, string | undefined>()
        for (const task of tasks) {
          if (!fieldsByList.has(task.listId)) {
            const fields = await fetchListCustomFields(token!, task.listId)
            fieldsByList.set(task.listId, fields.find((f) => f.name.toLowerCase() === 'developer')?.id)
          }
          const fieldId = fieldsByList.get(task.listId)
          if (!fieldId) continue
          await updateDeveloper(token!, task.id, developerUserId, fieldId)
        }
      } finally {
        setIsUpdating(false)
      }
    },
  }
}
