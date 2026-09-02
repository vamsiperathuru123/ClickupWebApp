import type { TaskTimeSummary, TimeEntry } from '@/types/clickup'

const MS_PER_HOUR = 1000 * 60 * 60

/** Sums real logged time entries into one summary per task: total hours plus a
 * per-person split (both derived purely from the raw entries, nothing estimated). */
export function aggregateTimeEntries(entries: TimeEntry[]): Map<string, TaskTimeSummary> {
  const byTask = new Map<string, Map<number, { user: TimeEntry['user']; ms: number }>>()
  const seenEntryIds = new Set<string>()

  for (const entry of entries) {
    // Overlapping scope selections (e.g. a folder and one of its own lists) can
    // surface the same time entry twice — skip repeats rather than double-count.
    if (seenEntryIds.has(entry.id)) continue
    seenEntryIds.add(entry.id)

    if (!byTask.has(entry.taskId)) byTask.set(entry.taskId, new Map())
    const byPerson = byTask.get(entry.taskId)!
    const existing = byPerson.get(entry.user.id)
    byPerson.set(entry.user.id, { user: entry.user, ms: (existing?.ms ?? 0) + entry.durationMs })
  }

  const summaries = new Map<string, TaskTimeSummary>()
  for (const [taskId, byPerson] of byTask) {
    const people = Array.from(byPerson.values())
    const totalMs = people.reduce((sum, p) => sum + p.ms, 0)
    summaries.set(taskId, {
      totalHours: totalMs / MS_PER_HOUR,
      byPerson: people
        .map((p) => ({ user: p.user, hours: p.ms / MS_PER_HOUR }))
        .sort((a, b) => b.hours - a.hours),
    })
  }
  return summaries
}
