import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useRoadmapStore } from '@/store/roadmapStore'
import { useBrainStore } from '@/store/brainStore'
import { useRoadmapData } from '@/hooks/useRoadmapData'
import { AUTO_REFRESH_MS, formatRelativeAge } from '@/lib/autoRefresh'
import { InlineSpinner } from '@/components/common/Spinner'
import { EmptyState } from '@/components/common/EmptyState'
import { ErrorBanner, friendlyErrorMessage } from '@/components/common/ErrorBanner'
import { useQueryClient } from '@tanstack/react-query'
import { useSpilloverData } from '@/hooks/useSpilloverData'
import { downloadHtml } from '@/lib/roadmap/exportHtml'
import { buildRoadmapCsv, downloadCsv } from '@/lib/roadmap/exportCsv'
import { buildInteractiveReport } from './buildInteractiveReport'
import { EMPTY_FILTERS, computeFilterOptions, filterRoadmapGoals, hasActiveFilters } from '@/lib/roadmap/filterRoadmap'
import { RoadmapScopePicker } from './RoadmapScopePicker'
import { CostSettingsBar } from './CostSettingsBar'
import { RoadmapFilterBar } from './RoadmapFilterBar'
import { GoalsTab } from './GoalsTab'
import { OverallReportTab } from './OverallReportTab'
import { ExecutiveTab } from './ExecutiveTab'
import { ResourcesTab } from './ResourcesTab'
import { FunctionTagTab } from './FunctionTagTab'
import { SpilloverTab } from './SpilloverTab'

type ReportTab = 'overall' | 'goals' | 'executive' | 'resources' | 'functionTag' | 'spillover'

const TAB_LABELS: Record<ReportTab, string> = {
  overall: 'Overall Report',
  goals: 'Goals',
  executive: 'Roadmap Health',
  resources: 'Resources',
  functionTag: 'Function Tag',
  spillover: 'Spill Over',
}

/**
 * "Auto-refresh 5m · updated 2m ago" — proof the report is live without having to
 * hit Resync to find out. Its own ticker, in its own component, so the twice-a-
 * minute re-render never touches the report tree below it.
 */
function FreshnessBadge({ updatedAt, isFetching }: { updatedAt: number; isFetching: boolean }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30 * 1000)
    return () => clearInterval(timer)
  }, [])

  const minutes = Math.round(AUTO_REFRESH_MS / 60000)

  return (
    <span className="text-[11px] text-gray-500 whitespace-nowrap" title={`Pulls live ClickUp data every ${minutes} minutes while this report is open and its tab is visible`}>
      {isFetching ? (
        <span className="text-accent-400">Refreshing…</span>
      ) : (
        <>
          Auto-refresh {minutes}m
          {updatedAt > 0 && <span className="text-gray-600"> · updated {formatRelativeAge(updatedAt, now)}</span>}
        </>
      )}
    </span>
  )
}

function DownloadMenu({ onDownloadHtml, onDownloadCsv }: { onDownloadHtml: () => void; onDownloadCsv: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-md text-sm bg-surface-200 text-gray-200 hover:bg-surface-100 border border-surface-border"
      >
        Download ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 w-48 rounded-md border border-surface-border bg-surface-200 shadow-panel p-1">
          <button
            onClick={() => {
              onDownloadHtml()
              setOpen(false)
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-100 text-sm text-gray-200"
            title="Downloads the whole report (all tabs) as a self-contained HTML file"
          >
            Download HTML
          </button>
          <button
            onClick={() => {
              onDownloadCsv()
              setOpen(false)
            }}
            className="w-full text-left px-2.5 py-1.5 rounded hover:bg-surface-100 text-sm text-gray-200"
            title="Downloads every goal/deliverable/task with status, time, cost, and all custom fields as a CSV"
          >
            Download CSV
          </button>
        </div>
      )}
    </div>
  )
}

export function RoadmapView() {
  const [tab, setTab] = useState<ReportTab>('overall')
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [exporting, setExporting] = useState(false)
  const selectedScope = useRoadmapStore((s) => s.selectedScope)
  const avgCostPerHour = useRoadmapStore((s) => s.avgCostPerHour)
  const totalWorkingHours = useRoadmapStore((s) => s.totalWorkingHours)
  const previousSprintCount = useRoadmapStore((s) => s.spilloverPreviousSprintCount)
  const queryClient = useQueryClient()
  const { goals, tasks, isLoading, isFetching, error, refetch, dataUpdatedAt, timeRestriction } = useRoadmapData()
  const spillover = useSpilloverData(previousSprintCount)
  const hasReport = goals.length > 0
  const exportRef = useRef<HTMLDivElement>(null)

  // Publishes the active tab so the Brain panel can tell the agent which tab's
  // numbers the user is looking at — the tab lives in local state here, and without
  // this the agent would explain a figure using the wrong filter set.
  const setBrainViewContext = useBrainStore((s) => s.setViewContext)
  useEffect(() => {
    setBrainViewContext({ roadmapTab: tab })
  }, [tab, setBrainViewContext])

  const filterOptions = useMemo(() => computeFilterOptions(goals), [goals])
  const filteredGoals = useMemo(() => filterRoadmapGoals(goals, filters), [goals, filters])
  const showFilterBar = tab === 'goals' || tab === 'resources' || tab === 'functionTag'
  const scopeNames = selectedScope.map((s) => s.name)

  /** Rendering every tab/filter combination patches the shared store once per
   * combination, so the live tab content is torn down first — otherwise the
   * mounted tree re-renders on each patch and the export crawls. */
  async function downloadReportHtml() {
    setExporting(true)
    await new Promise((resolve) => setTimeout(resolve, 50))
    try {
      const html = buildInteractiveReport({
        goals,
        filteredGoals,
        tasks,
        queryClient,
        scopeNames,
        avgCostPerHour,
        totalWorkingHours,
        previousSprintCount,
        spillover,
        activeTab: tab,
        timeRestriction,
      })
      downloadHtml(html, 'roadmap-status-report.html')
    } finally {
      setExporting(false)
    }
  }

  function downloadReportCsv() {
    const csv = buildRoadmapCsv({
      goals,
      avgCostPerHour,
      totalWorkingHours,
      scopeNames,
      spilloverRows: spillover.rows,
      spilloverSprintNames: spillover.spilloverSprintNames,
      previousSprintCount,
    })
    downloadCsv(csv, 'roadmap-status-report.csv')
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="border-b border-surface-border px-4 py-3 space-y-3 shrink-0 print:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="text-lg font-semibold text-gray-100">Roadmap Status</h1>
            {selectedScope.length > 0 && (
              <FreshnessBadge
                updatedAt={Math.max(dataUpdatedAt, spillover.dataUpdatedAt)}
                isFetching={isFetching || spillover.isFetching}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasReport && <DownloadMenu onDownloadHtml={downloadReportHtml} onDownloadCsv={downloadReportCsv} />}
            <RoadmapScopePicker />
          </div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center bg-surface-200 rounded-md p-0.5 text-sm">
            {(Object.keys(TAB_LABELS) as ReportTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'px-3 py-1 rounded transition-colors',
                  tab === t ? 'bg-surface-50 text-gray-100' : 'text-gray-400 hover:text-gray-200'
                )}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
          <CostSettingsBar />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selectedScope.length === 0 ? (
          <EmptyState
            title="Select sprints or folders"
            subtitle="Pick one or more sprint lists or folders above to build the roadmap report from their real ClickUp tasks."
          />
        ) : isLoading && tasks.length === 0 ? (
          <InlineSpinner label="Loading roadmap data…" />
        ) : error && tasks.length === 0 ? (
          <ErrorBanner message={friendlyErrorMessage(error)!} onRetry={refetch} />
        ) : !hasReport ? (
          <EmptyState
            title="No tasks found in the selected scope"
            subtitle="The selected sprints/folders don't have any tasks yet."
          />
        ) : exporting ? (
          <InlineSpinner label="Preparing report — rendering every tab and filter…" />
        ) : (
          <>
            {/* Interactive single-tab view — hidden when printing/exporting to PDF. */}
            <div className="p-4 print:hidden">
              {timeRestriction === 'permission' && (
                <div className="mb-3 rounded-md border border-yellow-600/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
                  Hours may only reflect <strong>your own</strong> logged time for some tasks — ClickUp rejected the
                  request for everyone's time because this token isn't a Workspace Owner/Admin. Ask your workspace
                  admin for an elevated token to see everyone's hours combined.
                </div>
              )}
              {timeRestriction === 'error' && (
                <div className="mb-3 rounded-md border border-yellow-600/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
                  Hours may only reflect <strong>your own</strong> logged time for some tasks — a ClickUp request for
                  everyone's time failed (rate limit or a temporary error), not a permissions issue. Try{' '}
                  <button onClick={refetch} className="underline hover:text-yellow-300">
                    Resync
                  </button>{' '}
                  to retry.
                </div>
              )}
              {isFetching && <div className="text-xs text-gray-500 mb-2">Refreshing…</div>}
              {showFilterBar && (
                <div className="mb-4">
                  <RoadmapFilterBar options={filterOptions} filters={filters} onChange={setFilters} />
                </div>
              )}
              {showFilterBar && filteredGoals.length === 0 && hasActiveFilters(filters) ? (
                <p className="text-sm text-gray-500">No tasks match the current filters.</p>
              ) : (
                <>
                  {tab === 'goals' && <GoalsTab goals={filteredGoals} />}
                  {tab === 'resources' && <ResourcesTab goals={filteredGoals} />}
                  {tab === 'functionTag' && <FunctionTagTab goals={filteredGoals} />}
                </>
              )}
              {tab === 'overall' && <OverallReportTab goals={goals} />}
              {tab === 'executive' && <ExecutiveTab goals={goals} tasks={tasks} />}
              {tab === 'spillover' && <SpilloverTab />}
            </div>

            {/* Hidden export source: every tab stacked in one document, so
                "Download HTML" captures the whole report, not just the visible tab.
                Also shown when printing via the browser's own Ctrl+P. */}
            <div ref={exportRef} className="hidden print:block p-4 space-y-10">
              <div>
                <h1 className="text-xl font-semibold text-gray-100">Roadmap Status Report</h1>
                <p className="text-sm text-gray-400">Generated {new Date().toLocaleString()}</p>
                {timeRestriction === 'permission' && (
                  <p className="text-sm text-yellow-400 mt-1">
                    Note: hours may only reflect the report generator's own logged time for some tasks (ClickUp
                    restricts cross-member time data to Workspace Owner/Admin tokens).
                  </p>
                )}
                {timeRestriction === 'error' && (
                  <p className="text-sm text-yellow-400 mt-1">
                    Note: hours may only reflect the report generator's own logged time for some tasks — a ClickUp
                    request failed temporarily (not a permissions issue).
                  </p>
                )}
              </div>
              <section>
                <h2 className="text-base font-semibold text-gray-100 mb-3">Overall Report</h2>
                <OverallReportTab goals={goals} />
              </section>
              <section>
                <h2 className="text-base font-semibold text-gray-100 mb-3">Goals</h2>
                <GoalsTab goals={goals} forceExpanded />
              </section>
              <section>
                <h2 className="text-base font-semibold text-gray-100 mb-3">Roadmap Health</h2>
                <ExecutiveTab goals={goals} tasks={tasks} />
              </section>
              <section>
                <h2 className="text-base font-semibold text-gray-100 mb-3">Resources</h2>
                <ResourcesTab goals={goals} />
              </section>
              <section>
                <h2 className="text-base font-semibold text-gray-100 mb-3">Function Tag</h2>
                <FunctionTagTab goals={goals} />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
