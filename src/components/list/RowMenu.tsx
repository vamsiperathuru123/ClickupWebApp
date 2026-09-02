import { useEffect, useRef, useState } from 'react'
import type { TaskWithSplit } from '@/types/clickup'
import { useUiStore } from '@/store/uiStore'

export function RowMenu({ task }: { task: TaskWithSplit }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="w-full text-gray-500 hover:text-gray-200 text-center"
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-20 w-40 rounded-md border border-surface-border bg-surface-200 shadow-panel py-1 text-sm">
          <button
            onClick={() => {
              setSelectedTaskId(task.id)
              setOpen(false)
            }}
            className="w-full text-left px-3 py-1.5 text-gray-200 hover:bg-surface-100"
          >
            Open details
          </button>
          <a
            href={task.url}
            target="_blank"
            rel="noreferrer"
            className="block px-3 py-1.5 text-gray-200 hover:bg-surface-100"
          >
            Open in ClickUp
          </a>
        </div>
      )}
    </div>
  )
}
