import { useUiStore } from '@/store/uiStore'
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers'
import { useBulkUpdate } from '@/hooks/useBulkUpdate'
import { PRIORITY_RANK } from '@/lib/statusColors'
import type { TaskWithSplit } from '@/types/clickup'

export function BulkToolbar({ tasks, statuses, workspaceId }: { tasks: TaskWithSplit[]; statuses: string[]; workspaceId: string | null }) {
  const selectedIds = useUiStore((s) => s.selectedTaskIds)
  const clearTaskSelection = useUiStore((s) => s.clearTaskSelection)
  const { members } = useWorkspaceMembers(workspaceId)
  const bulk = useBulkUpdate()

  if (selectedIds.size === 0) return null

  const selectedTasks = tasks.filter((t) => selectedIds.has(t.id))

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-lg border border-surface-border bg-surface-100 px-4 py-2.5 shadow-panel">
      <span className="text-sm font-medium text-gray-100">{selectedIds.size} selected</span>
      <div className="w-px h-5 bg-surface-border" />

      <select
        defaultValue=""
        onChange={(e) => e.target.value && bulk.setStatus(selectedTasks, e.target.value)}
        className="bg-surface-200 border border-surface-border rounded px-2 py-1 text-xs text-gray-200"
      >
        <option value="" disabled>
          Set status…
        </option>
        {statuses.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        defaultValue=""
        onChange={(e) => e.target.value && bulk.setPriority(selectedTasks, Number(e.target.value))}
        className="bg-surface-200 border border-surface-border rounded px-2 py-1 text-xs text-gray-200"
      >
        <option value="" disabled>
          Set priority…
        </option>
        {Object.entries(PRIORITY_RANK).map(([name, rank]) => (
          <option key={name} value={rank}>
            {name}
          </option>
        ))}
      </select>

      <select
        defaultValue=""
        onChange={(e) => e.target.value && bulk.setDeveloper(selectedTasks, Number(e.target.value))}
        className="bg-surface-200 border border-surface-border rounded px-2 py-1 text-xs text-gray-200"
      >
        <option value="" disabled>
          Set dev…
        </option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.username}
          </option>
        ))}
      </select>

      <input
        type="date"
        onChange={(e) => e.target.value && bulk.setDueDate(selectedTasks, new Date(e.target.value).getTime())}
        className="bg-surface-200 border border-surface-border rounded px-2 py-1 text-xs text-gray-200"
      />

      {bulk.isUpdating && <span className="text-xs text-accent-400">Updating…</span>}

      <div className="w-px h-5 bg-surface-border" />
      <button onClick={clearTaskSelection} className="text-xs text-gray-400 hover:text-gray-200">
        Clear
      </button>
    </div>
  )
}
