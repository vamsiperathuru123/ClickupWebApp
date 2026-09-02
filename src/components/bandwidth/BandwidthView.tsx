import { useMemo, useState } from 'react'
import { useUiStore } from '@/store/uiStore'
import { useActiveTasks } from '@/hooks/useActiveTasks'
import { useCacheStore } from '@/store/cacheStore'
import { withSplitPoints } from '@/lib/points'
import { computeDevBandwidth } from '@/lib/bandwidth'
import { InlineSpinner } from '@/components/common/Spinner'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorBanner, friendlyErrorMessage } from '@/components/common/ErrorBanner'
import { CapacityTable } from './CapacityTable'
import { OverallBarChart, type BarKey } from './OverallBarChart'
import { DetailPanel } from './DetailPanel'

export function BandwidthView() {
  const activeNode = useUiStore((s) => s.activeNode)
  const { tasks, isLoading, error, refetch } = useActiveTasks(activeNode)
  const capacities = useCacheStore((s) => (activeNode ? s.capacities[activeNode.id] : undefined))
  const [selectedBar, setSelectedBar] = useState<BarKey | null>(null)

  const splitTasks = useMemo(() => tasks.map(withSplitPoints), [tasks])
  const rows = useMemo(() => computeDevBandwidth(splitTasks, capacities), [splitTasks, capacities])

  const totals = rows.reduce(
    (acc, r) => ({ capacity: acc.capacity + r.capacity, target: acc.target + r.target, available: acc.available + r.available }),
    { capacity: 0, target: 0, available: 0 }
  )

  if (!activeNode) return <EmptyState title="Select a Folder or List" />
  if (isLoading && tasks.length === 0) return <InlineSpinner label="Loading bandwidth…" />
  if (error && tasks.length === 0) return <ErrorBanner message={friendlyErrorMessage(error)!} onRetry={refetch} />
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No developers found"
        subtitle="No task in this list/folder has its Developer field set yet."
      />
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 grid grid-cols-2 gap-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-200 mb-2">Dev capacity</h2>
        <CapacityTable rows={rows} listId={activeNode.id} />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-gray-200 mb-2">Overview</h2>
        <div className="rounded-lg border border-surface-border p-4">
          <OverallBarChart
            capacity={totals.capacity}
            target={totals.target}
            available={totals.available}
            selected={selectedBar}
            onSelect={setSelectedBar}
          />
          {selectedBar && (
            <div className="mt-4 pt-4 border-t border-surface-border">
              <DetailPanel selected={selectedBar} rows={rows} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
