/**
 * How often the Roadmap Status report re-pulls live ClickUp data while it's open.
 *
 * The refresh is deliberately cheap rather than aggressive:
 * - TanStack Query skips interval ticks while the tab is hidden (its focusManager
 *   treats `visibilityState !== 'hidden'` as focused), so a report left open on a
 *   background tab makes no API calls at all until it's looked at. Ticks are
 *   skipped, not queued, so coming back never triggers a backlog of pulls.
 * - Coming back to a hidden tab refetches immediately instead of waiting out the
 *   rest of the interval, but only if the data is already this old — that's what
 *   pairing `refetchOnWindowFocus` with a matching `staleTime` buys.
 * - The queries only poll while the Roadmap view is mounted — switching to List or
 *   Calendar unsubscribes the observers and stops the timers.
 * - A tick reuses the query cache and keeps the previous data on screen, so the
 *   report never blanks or reflows mid-read; only `isFetching` changes.
 * - Concurrent ticks are deduped by the query key, so a slow pull (spillover can
 *   take ~20s) can't stack up behind itself.
 */
export const AUTO_REFRESH_MS = 5 * 60 * 1000

/** "just now" / "3m ago" / "1h 5m ago" — for the report's freshness indicator. */
export function formatRelativeAge(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h ago` : `${hours}h ${rest}m ago`
}
