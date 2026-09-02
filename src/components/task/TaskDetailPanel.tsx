import { useEffect, type ReactNode } from 'react'
import { useUiStore } from '@/store/uiStore'
import { useTaskById } from '@/hooks/useTaskById'
import { withSplitPoints, formatPoints } from '@/lib/points'
import { formatShortDate } from '@/lib/dates'
import { Avatar, AvatarStack } from '@/components/common/Avatar'
import { PriorityBadge, StatusBadge } from '@/components/common/Badges'

export function TaskDetailPanel() {
  const selectedTaskId = useUiStore((s) => s.selectedTaskId)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)
  const task = useTaskById(selectedTaskId)

  useEffect(() => {
    if (!selectedTaskId) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectedTaskId(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedTaskId, setSelectedTaskId])

  if (!selectedTaskId) return null

  const splitTask = task ? withSplitPoints(task) : null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-30 print:hidden" onClick={() => setSelectedTaskId(null)} />
      <aside className="fixed top-0 right-0 h-full w-[400px] bg-surface-300 border-l border-surface-border shadow-panel z-40 animate-slide-in overflow-y-auto print:hidden">
        {!task || !splitTask ? (
          <div className="p-6 text-gray-500 text-sm">Task not found in cache.</div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-100 leading-snug">{task.name}</h2>
              <button onClick={() => setSelectedTaskId(null)} className="text-gray-500 hover:text-gray-200 shrink-0">
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge status={task.status} statusType={task.statusType} statusColor={task.statusColor} />
              <PriorityBadge priority={task.priority} />
            </div>

            <Field label="Developer">
              {task.developer ? (
                <div className="flex items-center gap-2">
                  <Avatar user={task.developer} size={22} />
                  <span className="text-sm text-gray-200">{task.developer.username}</span>
                </div>
              ) : (
                <span className="text-sm text-gray-500">—</span>
              )}
            </Field>

            <Field label="Assignees">
              <AvatarStack users={task.assignees} size={22} />
            </Field>

            <Field label="Sprint Points">
              {task.assignees.length === 0 ? (
                <span className="text-sm text-gray-500">{task.points != null ? formatPoints(task.points) : '—'}</span>
              ) : (
                <ul className="space-y-1">
                  {task.assignees.map((a) => (
                    <li key={a.id} className="flex items-center gap-2">
                      <Avatar user={a} size={18} />
                      <span className="text-sm text-gray-300">{a.username}</span>
                      <span className="text-xs text-gray-500">{formatPoints(splitTask.splitPoints)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Start">
                <span className="text-sm text-gray-300">{formatShortDate(task.resolvedStartDate ?? task.rawStartDate)}</span>
              </Field>
              <Field label="Beta Due">
                <span className="text-sm text-gray-300">{formatShortDate(task.betaDueDate)}</span>
              </Field>
              <Field label="Due">
                <span className="text-sm text-gray-300">{formatShortDate(task.dueDate)}</span>
              </Field>
            </div>

            <Field label="Description">
              <p className="text-sm text-gray-400 whitespace-pre-wrap">{task.description || '—'}</p>
            </Field>

            <a
              href={task.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-accent-400 hover:text-accent-500 font-medium"
            >
              Open in ClickUp ↗
            </a>
          </div>
        )}
      </aside>
    </>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      {children}
    </div>
  )
}
