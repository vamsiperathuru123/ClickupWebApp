import clsx from 'clsx'
import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { useUiStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { useCacheStore } from '@/store/cacheStore'
import { useActiveTasks } from '@/hooks/useActiveTasks'
import { clearWorkspaceMembersCache } from '@/lib/mcp/clickupService'
import { useBrainStore } from '@/store/brainStore'

export function Topbar() {
  const activeNode = useUiStore((s) => s.activeNode)
  const mainView = useUiStore((s) => s.mainView)
  const setMainView = useUiStore((s) => s.setMainView)
  const searchQuery = useUiStore((s) => s.searchQuery)
  const setSearchQuery = useUiStore((s) => s.setSearchQuery)
  const clearToken = useAuthStore((s) => s.clearToken)
  const clearFetchedData = useCacheStore((s) => s.clearFetchedData)
  const queryClient = useQueryClient()
  const toggleBrain = useBrainStore((s) => s.toggle)
  const brainOpen = useBrainStore((s) => s.open)
  const inFlight = useIsFetching()
  const { isFetching } = useActiveTasks(activeNode)

  /** Forces every view to re-read from ClickUp now rather than waiting out the
   * cache windows: the persisted task/list cache is dropped first (it gates its
   * own query), then every react-query entry is invalidated so anything mounted
   * refetches immediately. */
  function resync() {
    clearWorkspaceMembersCache()
    clearFetchedData()
    void queryClient.invalidateQueries()
  }

  return (
    <header className="h-14 shrink-0 border-b border-surface-border bg-surface-300 flex items-center gap-4 px-4 print:hidden">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-100 truncate max-w-[280px]">
          {activeNode?.name ?? 'Select a list'}
        </div>
        {isFetching && <div className="text-[11px] text-gray-500">Syncing…</div>}
      </div>

      <div className="flex items-center bg-surface-200 rounded-md p-0.5 text-sm">
        {(['list', 'calendar'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setMainView(v)}
            className={clsx(
              'px-3 py-1 rounded capitalize transition-colors',
              mainView === v ? 'bg-surface-50 text-gray-100' : 'text-gray-400 hover:text-gray-200'
            )}
          >
            {v}
          </button>
        ))}
      </div>

      <button
        onClick={() => setMainView('bandwidth')}
        className={clsx(
          'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          mainView === 'bandwidth' ? 'bg-accent-500 text-white' : 'bg-surface-200 text-gray-300 hover:bg-surface-100'
        )}
      >
        Bandwidth
      </button>

      <button
        onClick={() => setMainView('roadmap')}
        className={clsx(
          'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          mainView === 'roadmap' ? 'bg-accent-500 text-white' : 'bg-surface-200 text-gray-300 hover:bg-surface-100'
        )}
      >
        Roadmap Status
      </button>

      <div className="flex-1" />

      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search tasks…"
        className="w-56 rounded-md bg-surface-200 border border-surface-border px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
      />

      <button
        onClick={toggleBrain}
        className={clsx(
          'px-2.5 py-1 rounded-md text-xs border transition-colors',
          brainOpen
            ? 'bg-accent-500 text-white border-accent-500'
            : 'bg-surface-200 text-gray-300 border-surface-border hover:bg-surface-100 hover:text-gray-100'
        )}
        title="Ask Brain about what you are looking at (Ctrl+K)"
      >
        Brain
      </button>

      <button
        onClick={resync}
        disabled={inFlight > 0}
        className="px-2.5 py-1 rounded-md text-xs bg-surface-200 text-gray-300 border border-surface-border hover:bg-surface-100 hover:text-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Refetch everything from ClickUp now, ignoring cached data"
      >
        {inFlight > 0 ? 'Resyncing…' : 'Resync'}
      </button>

      <button
        onClick={() => clearToken()}
        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        title="Disconnect ClickUp"
      >
        Disconnect
      </button>
    </header>
  )
}
