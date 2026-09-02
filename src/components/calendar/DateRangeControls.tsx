import { useUiStore } from '@/store/uiStore'
import { formatShortDate } from '@/lib/dates'
import { addDays } from '@/lib/dates'

const WINDOW_DAYS = 14

export function DateRangeControls() {
  const windowStart = useUiStore((s) => s.calendarWindowStart)
  const navigateCalendarWindow = useUiStore((s) => s.navigateCalendarWindow)
  const resetCalendarWindowToToday = useUiStore((s) => s.resetCalendarWindowToToday)

  const windowEnd = addDays(windowStart, WINDOW_DAYS - 1)

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => navigateCalendarWindow(-WINDOW_DAYS)}
        className="w-7 h-7 flex items-center justify-center rounded bg-surface-200 hover:bg-surface-100 text-gray-300"
      >
        ‹
      </button>
      <span className="text-xs text-gray-400 w-32 text-center">
        {formatShortDate(windowStart)} – {formatShortDate(windowEnd)}
      </span>
      <button
        onClick={() => navigateCalendarWindow(WINDOW_DAYS)}
        className="w-7 h-7 flex items-center justify-center rounded bg-surface-200 hover:bg-surface-100 text-gray-300"
      >
        ›
      </button>
      <button
        onClick={resetCalendarWindowToToday}
        className="px-2.5 py-1 rounded bg-surface-200 hover:bg-surface-100 text-xs text-gray-300"
      >
        Today
      </button>
    </div>
  )
}
