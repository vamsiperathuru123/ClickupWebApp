import type { StatusHistoryEntry } from '@/types/clickup'

const DAY_MS = 24 * 60 * 60 * 1000

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function addDays(ts: number, days: number): number {
  return ts + days * DAY_MS
}

export function isWeekend(ts: number): boolean {
  const day = new Date(ts).getDay()
  return day === 0 || day === 6
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b)
}

export function daysBetween(a: number, b: number): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS)
}

/** Monday of the current week, used as the default sprint window anchor. */
export function currentSprintStart(now: number = Date.now()): number {
  const d = new Date(startOfDay(now))
  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  return addDays(d.getTime(), diffToMonday)
}

export function formatShortDate(ts: number | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function formatDayLabel(ts: number): { weekday: string; day: number } {
  const d = new Date(ts)
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: d.getDate(),
  }
}

/**
 * Start date = first time a task's status moved into an "in progress or above" group
 * (i.e. no longer in the initial open/backlog/todo group). Falls back to null when
 * status history has no such transition, so callers can fall back to task.start_date.
 */
export function resolveStartDateFromHistory(history: StatusHistoryEntry[]): number | null {
  const sorted = [...history].sort((a, b) => a.enteredAt - b.enteredAt)
  const firstAdvanced = sorted.find((entry) => entry.type !== 'open')
  return firstAdvanced ? firstAdvanced.enteredAt : null
}

export function isOverdue(dueDate: number | null, isDone: boolean): boolean {
  if (!dueDate || isDone) return false
  return dueDate < Date.now()
}

/**
 * Turns the Roadmap report's "Select Range" from/to date-input strings
 * ('YYYY-MM-DD', local time — the browser date input's own value format) into an
 * inclusive epoch-ms window: midnight of `from` through the last millisecond of
 * `to`. Returns null when either bound is missing, so callers can treat that as
 * "no range selected" (report defaults to all-time).
 */
export function dateRangeFromInputs(from: string | null, to: string | null): { start: number; end: number } | null {
  if (!from || !to) return null
  const start = new Date(`${from}T00:00:00`).getTime()
  const end = new Date(`${to}T23:59:59.999`).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return { start, end }
}
