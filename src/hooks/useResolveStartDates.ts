import { useEffect, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useCacheStore } from '@/store/cacheStore'
import { fetchStatusHistory } from '@/lib/mcp/clickupService'
import { resolveStartDateFromHistory } from '@/lib/dates'
import type { AppTask } from '@/types/clickup'

const CONCURRENCY = 6

/**
 * For tasks whose status has advanced past the initial open group and that don't yet
 * have a cached resolved start date, fetches status history in the background and
 * caches the resolved "first entered in-progress-or-above" date per task id.
 *
 * Callers should pass only the tasks currently visible on screen (e.g. tasks in
 * expanded stage groups, or tasks near the visible calendar window) rather than an
 * entire list/folder's tasks — each resolution is its own REST call. The underlying
 * REST client caps real concurrency and retries on rate limits, so this just needs
 * to keep call volume proportional to what the user is actually looking at.
 */
export function useResolveStartDates(nodeId: string | null, tasks: AppTask[]) {
  const token = useAuthStore((s) => s.token)
  const taskDetails = useCacheStore((s) => s.taskDetails)
  const setTaskDetail = useCacheStore((s) => s.setTaskDetail)
  const setResolvedStartDate = useCacheStore((s) => s.setResolvedStartDate)
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    if (!nodeId || !token) return

    const pending = tasks.filter(
      (t) => t.statusType !== 'open' && t.resolvedStartDate == null && !taskDetails[t.id] && !inFlight.current.has(t.id)
    )
    if (!pending.length) return

    const activeNodeId = nodeId
    const activeToken = token
    let cancelled = false
    let cursor = 0

    async function worker() {
      while (!cancelled && cursor < pending.length) {
        const task = pending[cursor++]
        inFlight.current.add(task.id)
        try {
          const history = await fetchStatusHistory(activeToken, task.id)
          const startDate = resolveStartDateFromHistory(history) ?? task.rawStartDate
          if (!cancelled) {
            setTaskDetail(task.id, startDate, history)
            setResolvedStartDate(activeNodeId, task.id, startDate)
          }
        } catch (err) {
          console.warn('[clickup] failed to resolve start date for task', task.id, err)
        } finally {
          inFlight.current.delete(task.id)
        }
      }
    }

    const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker)
    Promise.all(workers)

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, token, tasks])
}
