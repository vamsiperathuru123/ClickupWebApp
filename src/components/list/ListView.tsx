import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useUiStore } from '@/store/uiStore'
import { useActiveTasks } from '@/hooks/useActiveTasks'
import { useResolveStartDates } from '@/hooks/useResolveStartDates'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { withSplitPoints } from '@/lib/points'
import { groupByStatus, filterBySearch } from '@/lib/taskGrouping'
import { InlineSpinner } from '@/components/common/Spinner'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorBanner, friendlyErrorMessage } from '@/components/common/ErrorBanner'
import { ListHeaderRow } from './ListHeaderRow'
import { GroupHeaderRow } from './GroupHeaderRow'
import { TaskRow } from './TaskRow'
import { BulkToolbar } from './BulkToolbar'

const VIRTUALIZE_THRESHOLD = 50
const ROW_HEIGHT = 41
/** Stages with more tasks than this start collapsed, like ClickUp's own board/list
 * groups — the tasks inside are never mounted until the stage is expanded. Applied
 * the first time each status group appears, since completed/discarded/closed groups
 * typically arrive later (fetched in the background) than the active-status ones. */
const AUTO_COLLAPSE_ABOVE = 20

type Row =
  | { type: 'group'; key: string; group: ReturnType<typeof groupByStatus>[number] }
  | { type: 'task'; key: string; task: ReturnType<typeof groupByStatus>[number]['tasks'][number] }

export function ListView() {
  const activeNode = useUiStore((s) => s.activeNode)
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const searchQuery = useDebouncedValue(useUiStore((s) => s.searchQuery), 300)
  const toggleGroupSelection = useUiStore((s) => s.toggleGroupSelection)
  const { tasks, isLoading, error, refetch, closedTasksLoaded } = useActiveTasks(activeNode)

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const autoDecidedStatuses = useRef<Set<string>>(new Set())
  const autoDecidedForNode = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const splitTasks = useMemo(() => tasks.map(withSplitPoints), [tasks])
  const filtered = useMemo(() => filterBySearch(splitTasks, searchQuery), [splitTasks, searchQuery])
  const groups = useMemo(() => groupByStatus(filtered), [filtered])

  useEffect(() => {
    if (!activeNode) return
    if (autoDecidedForNode.current !== activeNode.id) {
      autoDecidedForNode.current = activeNode.id
      autoDecidedStatuses.current = new Set()
    }
    const newGroups = groups.filter((g) => !autoDecidedStatuses.current.has(g.status))
    if (newGroups.length === 0) return
    newGroups.forEach((g) => autoDecidedStatuses.current.add(g.status))
    const toCollapse = newGroups.filter((g) => g.tasks.length > AUTO_COLLAPSE_ABOVE).map((g) => g.status)
    if (toCollapse.length > 0) {
      setCollapsed((prev) => new Set([...prev, ...toCollapse]))
    }
  }, [activeNode, groups])

  // Only resolve start dates for tasks in expanded (visible) stages — collapsed
  // stages haven't been "opened" by the user yet, so their tasks stay unfetched.
  const visibleTasks = useMemo(
    () => groups.filter((g) => !collapsed.has(g.status)).flatMap((g) => g.tasks),
    [groups, collapsed]
  )
  useResolveStartDates(activeNode?.id ?? null, visibleTasks)

  const rows: Row[] = useMemo(() => {
    const out: Row[] = []
    for (const group of groups) {
      out.push({ type: 'group', key: `g:${group.status}`, group })
      if (!collapsed.has(group.status)) {
        for (const task of group.tasks) out.push({ type: 'task', key: task.id, task })
      }
    }
    return out
  }, [groups, collapsed])

  const shouldVirtualize = filtered.length > VIRTUALIZE_THRESHOLD

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    enabled: shouldVirtualize,
  })

  if (isLoading && tasks.length === 0) return <InlineSpinner label="Loading tasks…" />
  if (error && tasks.length === 0) {
    return <ErrorBanner message={friendlyErrorMessage(error)!} onRetry={refetch} />
  }
  // Closed-type tasks load in the background, so zero *active* tasks doesn't mean
  // the list is empty — only say so once closed tasks have been checked too.
  if (!isLoading && tasks.length === 0 && closedTasksLoaded) {
    return <EmptyState title="No tasks" subtitle="This list doesn't have any tasks yet." />
  }

  function toggleCollapse(status: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const renderRow = (row: Row) =>
    row.type === 'group' ? (
      <GroupHeaderRow
        group={row.group}
        collapsed={collapsed.has(row.group.status)}
        onToggleCollapse={() => toggleCollapse(row.group.status)}
        onToggleSelectAll={(select) => toggleGroupSelection(row.group.tasks.map((t) => t.id), select)}
      />
    ) : (
      <TaskRow task={row.task} />
    )

  return (
    <div className="relative h-full flex flex-col">
      <ListHeaderRow />
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {shouldVirtualize ? (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((vi) => (
              <div
                key={rows[vi.index].key}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${vi.start}px)` }}
              >
                {renderRow(rows[vi.index])}
              </div>
            ))}
          </div>
        ) : (
          rows.map((row) => <div key={row.key}>{renderRow(row)}</div>)
        )}
      </div>
      <BulkToolbar tasks={filtered} statuses={groups.map((g) => g.status)} workspaceId={activeWorkspaceId} />
    </div>
  )
}
