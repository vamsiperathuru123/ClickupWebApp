import { addDays, daysBetween, formatDayLabel, isSameDay, isWeekend, startOfDay } from './dates'

export interface DayColumn {
  ts: number
  weekday: string
  dayNum: number
  isWeekend: boolean
  isToday: boolean
}

export function buildDayColumns(windowStart: number, count: number): DayColumn[] {
  const today = Date.now()
  return Array.from({ length: count }, (_, i) => {
    const ts = addDays(startOfDay(windowStart), i)
    const { weekday, day } = formatDayLabel(ts)
    return { ts, weekday, dayNum: day, isWeekend: isWeekend(ts), isToday: isSameDay(ts, today) }
  })
}

export function isActiveOnDay(dayTs: number, start: number | null, due: number | null): boolean {
  if (!start && !due) return false
  const s = startOfDay(start ?? due!)
  const e = startOfDay(due ?? start!)
  const d = startOfDay(dayTs)
  return d >= s && d <= e
}

export interface BarGeometry {
  leftPct: number
  widthPct: number
  visible: boolean
}

/** Computes a gantt bar's position as a percentage of the visible window, clipping
 * to the window bounds so bars that start/end outside it still render partially. */
export function computeBarGeometry(
  windowStart: number,
  totalDays: number,
  start: number | null,
  due: number | null
): BarGeometry {
  if (!start && !due) return { leftPct: 0, widthPct: 0, visible: false }

  const effectiveStart = start ?? due!
  const effectiveDue = due ?? start!
  const windowEnd = addDays(startOfDay(windowStart), totalDays)

  if (effectiveDue < windowStart || effectiveStart > windowEnd) return { leftPct: 0, widthPct: 0, visible: false }

  const clippedStart = Math.max(effectiveStart, windowStart)
  const clippedEnd = Math.min(effectiveDue, windowEnd)

  const startOffsetDays = daysBetween(startOfDay(windowStart), startOfDay(clippedStart))
  const spanDays = Math.max(1, daysBetween(startOfDay(clippedStart), startOfDay(clippedEnd)) + 1)

  return {
    leftPct: (startOffsetDays / totalDays) * 100,
    widthPct: (spanDays / totalDays) * 100,
    visible: true,
  }
}
