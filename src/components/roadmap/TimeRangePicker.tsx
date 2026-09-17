import { useEffect, useRef, useState } from 'react'
import { useRoadmapStore } from '@/store/roadmapStore'
import { formatShortDate } from '@/lib/dates'

/**
 * Restricts every hours/cost figure in the report to real ClickUp time entries
 * logged within a chosen window (inclusive of both dates) — tasks themselves stay
 * unfiltered, only how many of their logged hours count. Lives next to the
 * Download button so it's visible wherever the report is being read or exported.
 */
export function TimeRangePicker() {
  const timeRangeFrom = useRoadmapStore((s) => s.timeRangeFrom)
  const timeRangeTo = useRoadmapStore((s) => s.timeRangeTo)
  const setTimeRange = useRoadmapStore((s) => s.setTimeRange)
  const clearTimeRange = useRoadmapStore((s) => s.clearTimeRange)

  const [open, setOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(timeRangeFrom ?? '')
  const [draftTo, setDraftTo] = useState(timeRangeTo ?? '')
  const ref = useRef<HTMLDivElement>(null)

  const isActive = !!(timeRangeFrom && timeRangeTo)

  useEffect(() => {
    if (!open) return
    setDraftFrom(timeRangeFrom ?? '')
    setDraftTo(timeRangeTo ?? '')
  }, [open, timeRangeFrom, timeRangeTo])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const canApply = !!draftFrom && !!draftTo && draftFrom <= draftTo

  function apply() {
    if (!canApply) return
    setTimeRange(draftFrom, draftTo)
    setOpen(false)
  }

  function clear() {
    clearTimeRange()
    setOpen(false)
  }

  const label = isActive
    ? `${formatShortDate(new Date(`${timeRangeFrom}T00:00:00`).getTime())} – ${formatShortDate(new Date(`${timeRangeTo}T00:00:00`).getTime())}`
    : 'Select Range'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`px-3 py-1.5 rounded-md text-sm border flex items-center gap-1.5 ${
          isActive
            ? 'bg-accent-500/10 border-accent-500/50 text-accent-400'
            : 'bg-surface-200 text-gray-200 hover:bg-surface-100 border-surface-border'
        }`}
        title="Restrict every hours/cost figure to time logged within a chosen date range"
      >
        {label}
        {isActive && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              clear()
            }}
            className="text-gray-500 hover:text-gray-300"
            title="Clear date range"
          >
            ×
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-md border border-surface-border bg-surface-200 shadow-panel p-3 space-y-3">
          <div className="space-y-1.5">
            <label className="block text-[11px] text-gray-500">From</label>
            <input
              type="date"
              value={draftFrom}
              max={draftTo || undefined}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="w-full rounded border border-surface-border bg-surface-100 px-2 py-1 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[11px] text-gray-500">To</label>
            <input
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              onChange={(e) => setDraftTo(e.target.value)}
              className="w-full rounded border border-surface-border bg-surface-100 px-2 py-1 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={clear}
              disabled={!isActive && !draftFrom && !draftTo}
              className="text-xs text-gray-400 hover:text-gray-200 disabled:opacity-40 disabled:hover:text-gray-400"
            >
              Clear
            </button>
            <button
              onClick={apply}
              disabled={!canApply}
              className="px-3 py-1 rounded text-xs bg-accent-500 text-white hover:bg-accent-400 disabled:opacity-40 disabled:hover:bg-accent-500"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
