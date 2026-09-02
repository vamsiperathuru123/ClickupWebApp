import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { useRoadmapStore, type ExecutiveSpilloverMode } from '@/store/roadmapStore'
import type { AudienceFilter } from '@/lib/roadmap/taskGroups'

import { InlineSpinner } from '@/components/common/Spinner'
import { ErrorBanner, friendlyErrorMessage } from '@/components/common/ErrorBanner'
import { flattenTaskRows } from '@/lib/roadmap/resourceStats'
import { buildRoadmapFromTaskRows, dedupeTaskRowsById } from '@/lib/roadmap/aggregate'
import { filterRoadmapGoalsByAudience, filterRoadmapGoalsByText } from '@/lib/roadmap/filterRoadmap'
import {
  computeFunctionTagGoalBreakdowns,
  groupByFunctionTag,
  NO_FUNCTION_TAG_LABEL,
} from '@/lib/roadmap/functionTagStats'
import { formatCurrency, formatHours, formatPercent } from '@/lib/roadmap/format'
import { AudienceTabs } from './AudienceTabs'
import { GoalLedgerHeader, GoalLedgerRow } from './GoalLedger'
import { TaskTable } from './TaskTable'
import { SpilloverModeTabs } from './SpilloverModeTabs'
import { useReportSettings, useReportSpillover } from './ReportSettingsContext'
import type { RoadmapGoal } from '@/lib/roadmap/types'

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-300 p-4">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-3">{title}</div>
      {children}
    </div>
  )
}

export function FunctionTagTab({
  goals: allGoals,
  audienceOverride,
  spilloverModeOverride,
}: {
  goals: RoadmapGoal[]
  /** Static-render overrides used by the HTML export — see GoalsTab. */
  audienceOverride?: AudienceFilter
  spilloverModeOverride?: ExecutiveSpilloverMode
}) {
  const { avgCostPerHour, previousSprintCount } = useReportSettings()
  const storeAudience = useRoadmapStore((s) => s.functionTagAudience)
  const setAudience = useRoadmapStore((s) => s.setFunctionTagAudience)
  const storeSpilloverMode = useRoadmapStore((s) => s.functionTagSpilloverMode)
  const setSpilloverMode = useRoadmapStore((s) => s.setFunctionTagSpilloverMode)
  const audience = audienceOverride ?? storeAudience
  const spilloverMode = spilloverModeOverride ?? storeSpilloverMode

  const {
    rows: spilloverRows,
    isLoading: spilloverLoading,
    isFetching: spilloverFetching,
    error: spilloverError,
    refetch: refetchSpillover,
  } = useReportSpillover()

  const withoutRows = useMemo(
    () => flattenTaskRows(allGoals).map((r) => ({ task: r.task, hoursSpent: r.hoursSpent })),
    [allGoals]
  )
  const onlySpilloverRows = useMemo(
    () => spilloverRows.map((r) => ({ task: r.task, hoursSpent: r.hoursSpent })),
    [spilloverRows]
  )

  const baseGoals = useMemo(() => {
    if (spilloverMode === 'onlySpillover') return buildRoadmapFromTaskRows(onlySpilloverRows, avgCostPerHour)
    if (spilloverMode === 'with') return buildRoadmapFromTaskRows(dedupeTaskRowsById([...withoutRows, ...onlySpilloverRows]), avgCostPerHour)
    return allGoals
  }, [spilloverMode, withoutRows, onlySpilloverRows, allGoals, avgCostPerHour])

  const goals = useMemo(() => filterRoadmapGoalsByAudience(baseGoals, audience), [baseGoals, audience])

  const rows = useMemo(() => flattenTaskRows(goals), [goals])
  const tags = useMemo(() => groupByFunctionTag(rows), [rows])
  const goalBreakdowns = useMemo(() => computeFunctionTagGoalBreakdowns(goals), [goals])

  // Lazy initializer rather than an effect-driven default: `renderToStaticMarkup`
  // never runs effects, so an effect-only default left every exported pane stuck
  // on "pick a tag above" with nothing shown. This runs synchronously on the very
  // first render in both the live app and the static export.
  const [selectedTag, setSelectedTag] = useState<string | null>(() => tags[0]?.name ?? null)
  const [search, setSearch] = useState('')
  const now = useMemo(() => Date.now(), [rows])

  /** The goal -> deliverable -> task tree behind each tag, narrowed to that tag's
   * own tasks. Built for every tag rather than only the selected one so the
   * standalone HTML export can reveal any of them without React. */
  const goalsByTag = useMemo(() => {
    const map = new Map<string, RoadmapGoal[]>()
    for (const tag of tags) {
      const tagRows = rows
        .filter((r) => (r.task.functionTag?.trim() || NO_FUNCTION_TAG_LABEL) === tag.name)
        .map((r) => ({ task: r.task, hoursSpent: r.hoursSpent, hoursByPerson: r.hoursByPerson }))
      map.set(tag.name, buildRoadmapFromTaskRows(tagRows, avgCostPerHour))
    }
    return map
  }, [tags, rows, avgCostPerHour])

  const pickTag = (name: string) => setSelectedTag((current) => (current === name ? null : name))

  // Complements the lazy initializer above for changes *after* mount: re-settles on
  // the new first tag whenever the tag set itself changes (a different audience or
  // spillover mode, say). A tag the user closed by hand stays closed until that
  // happens, since closing doesn't change `tags` and so doesn't re-trigger this.
  useEffect(() => {
    setSelectedTag((current) => {
      if (tags.length === 0) return null
      if (current && tags.some((t) => t.name === current)) return current
      return tags[0].name
    })
  }, [tags])

  // Picking a tag drills into a card further down the pane — scroll it into view so
  // the newly revealed detail is actually where the user is looking, rather than
  // leaving them to notice it appeared below the fold.
  const detailsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selectedTag) detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [selectedTag])

  const totalHoursAllTags = tags.reduce((sum, t) => sum + t.totalHours, 0)
  const totalCostAllTags = tags.reduce((sum, t) => sum + t.totalCost, 0)

  const onlySpilloverBlocked = spilloverMode === 'onlySpillover' && previousSprintCount === 0
  const onlySpilloverEmpty =
    spilloverMode === 'onlySpillover' && previousSprintCount > 0 && !spilloverLoading && spilloverRows.length === 0

  return (
    <div className="space-y-4">
      <AudienceTabs value={audience} onChange={setAudience} />
      <SpilloverModeTabs value={spilloverMode} onChange={setSpilloverMode} />

      {onlySpilloverBlocked ? (
        <p className="text-sm text-gray-500">No. of Previous Sprints is not selected — set it in the Spill Over tab.</p>
      ) : spilloverMode === 'onlySpillover' && spilloverLoading ? (
        <InlineSpinner label="Loading spillover data…" />
      ) : spilloverMode === 'onlySpillover' && spilloverError ? (
        <ErrorBanner message={friendlyErrorMessage(spilloverError)!} onRetry={refetchSpillover} />
      ) : onlySpilloverEmpty ? (
        <p className="text-sm text-gray-500">Spillover Data is empty.</p>
      ) : (
        <>
          {spilloverMode !== 'without' && spilloverFetching && (
            <div className="text-xs text-gray-500">Refreshing spillover data…</div>
          )}

          <SectionCard title="Health by Function Tag">
            <div className="space-y-3">
              {goalBreakdowns.map((tag) => {
                const progress = tag.goalCount > 0 ? tag.goalDoneCount / tag.goalCount : 0
                return (
                  // Picking a tag only reveals its details below the Cost/Hours
                  // cards - the three breakdowns above stay on the full tag set.
                  <button
                    key={tag.name}
                    onClick={() => pickTag(tag.name)}
                    data-tagpick={tag.name}
                    data-active={selectedTag === tag.name ? '1' : undefined}
                    className={clsx(
                      'w-full text-left rounded px-1.5 -mx-1.5 py-1 border transition-colors',
                      selectedTag === tag.name
                        ? 'bg-accent-500/10 border-accent-500/50'
                        : 'border-transparent hover:bg-surface-100/40'
                    )}
                  >
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>
                        <span data-caret className="text-gray-600 mr-1 text-xs">
                          {selectedTag === tag.name ? '\u25be' : '\u25b8'}
                        </span>
                        <span
                          data-tagname
                          data-inactive-class="text-gray-200"
                          className={selectedTag === tag.name ? 'text-accent-400 font-medium' : 'text-gray-200'}
                        >
                          {tag.name}
                        </span>
                      </span>
                      <span className={progress >= 0.4 ? 'text-green-400' : 'text-red-400'}>{formatPercent(progress)}</span>
                    </div>
                    <div className="h-2 rounded bg-surface-100 overflow-hidden">
                      <div
                        className={progress >= 0.4 ? 'h-full bg-green-500' : 'h-full bg-red-500'}
                        style={{ width: `${progress * 100}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-gray-500 mt-1">
                      {tag.goalDoneCount}/{tag.goalCount} goals
                      {tag.goalBlockedCount > 0 && ` · ${tag.goalBlockedCount} blocked`}
                      {tag.goalOnHoldCount > 0 && ` · ${tag.goalOnHoldCount} on hold`}
                    </div>
                  </button>
                )
              })}
            </div>
          </SectionCard>

          <div className="grid grid-cols-2 gap-4">
            <SectionCard title="Cost by Function Tag">
              <div className="space-y-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag.name}
                    onClick={() => pickTag(tag.name)}
                    data-tagpick={tag.name}
                    data-active={selectedTag === tag.name ? '1' : undefined}
                    className={clsx(
                      'w-full flex items-center gap-2 text-xs rounded px-1 -mx-1 py-0.5 text-left border transition-colors',
                      selectedTag === tag.name
                        ? 'bg-accent-500/10 border-accent-500/50'
                        : 'border-transparent hover:bg-surface-100/40'
                    )}
                  >
                    <span
                      data-tagname
                      data-inactive-class="text-gray-400"
                      title={tag.name}
                      className={clsx('flex-1 min-w-0 truncate', selectedTag === tag.name ? 'text-accent-400 font-medium' : 'text-gray-400')}
                    >
                      {tag.name}
                    </span>
                    <span className="w-20 text-right text-gray-300">{formatCurrency(tag.totalCost)}</span>
                    <span className="w-10 text-right text-gray-500">
                      {formatPercent(totalCostAllTags > 0 ? tag.totalCost / totalCostAllTags : 0)}
                    </span>
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Hours by Function Tag">
              <div className="space-y-1.5">
                {tags.map((tag) => (
                  <button
                    key={tag.name}
                    onClick={() => pickTag(tag.name)}
                    data-tagpick={tag.name}
                    data-active={selectedTag === tag.name ? '1' : undefined}
                    className={clsx(
                      'w-full flex items-center gap-2 text-xs rounded px-1 -mx-1 py-0.5 text-left border transition-colors',
                      selectedTag === tag.name
                        ? 'bg-accent-500/10 border-accent-500/50'
                        : 'border-transparent hover:bg-surface-100/40'
                    )}
                  >
                    <span
                      data-tagname
                      data-inactive-class="text-gray-400"
                      title={tag.name}
                      className={clsx('flex-1 min-w-0 truncate', selectedTag === tag.name ? 'text-accent-400 font-medium' : 'text-gray-400')}
                    >
                      {tag.name}
                    </span>
                    <span className="w-20 text-right text-gray-300">{formatHours(tag.totalHours)}</span>
                    <span className="w-10 text-right text-gray-500">
                      {formatPercent(totalHoursAllTags > 0 ? tag.totalHours / totalHoursAllTags : 0)}
                    </span>
                  </button>
                ))}
              </div>
            </SectionCard>
          </div>

          {/* Fixed-height card under the Cost/Hours pair: whichever tag is picked
              above drills down here and scrolls on its own, so selecting a tag
              never moves or rescales the three breakdowns. Every tag's block is
              rendered and hidden with a style so the standalone HTML export's
              script can reveal them without React. */}
          <div ref={detailsRef} className="rounded-lg border border-surface-border bg-surface-300 p-4 flex flex-col h-[32rem] scroll-mt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 shrink-0">Task Details by Function Tag</div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search goal, deliverable or task..."
                // Read by the standalone HTML export's script to wire this box up
                // without React - see buildInteractiveReport's applyTreeSearch.
                data-search-input="tree"
                className="w-56 rounded border border-surface-border bg-surface-200 px-2 py-1 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto border-t border-surface-border/60 mt-2 pt-3 pr-0.5">
              <p
                data-tag-empty
                className="text-xs text-gray-600"
                style={{ display: selectedTag === null ? 'block' : 'none' }}
              >
                Pick a function tag above to see its goals, deliverables and tasks.
              </p>
              {tags.map((tag) => {
                const tagGoals = goalsByTag.get(tag.name) ?? []
                const filteredGoals = filterRoadmapGoalsByText(tagGoals, search)
                return (
                  <div
                    key={tag.name}
                    data-tag={tag.name}
                    style={{ display: selectedTag === tag.name ? 'block' : 'none' }}
                  >
                    <div className="flex items-center justify-between gap-3 text-xs mb-3">
                      <span className="font-medium text-gray-200">{tag.name}</span>
                      <span className="text-gray-500">
                        {search.trim()
                          ? `${filteredGoals.length} of ${tagGoals.length} goals match`
                          : `${tagGoals.length} goals · ${tag.totalCount} tasks · ${tag.doneCount} done · ${formatHours(tag.totalHours)} · ${formatCurrency(tag.totalCost)}`}
                      </span>
                    </div>
                    {tagGoals.length === 0 ? (
                      <p className="text-xs text-gray-600">No tasks carry this function tag.</p>
                    ) : (
                      <>
                        {filteredGoals.length === 0 && <p className="text-xs text-gray-600">Nothing matches the search.</p>}
                        <GoalLedgerHeader />
                        {filteredGoals.map((goal) => (
                          <GoalLedgerRow
                            key={goal.name}
                            goal={goal}
                            now={now}
                            // Goal/deliverable rows use the new compact ledger look,
                            // but task level stays the existing wide TaskTable —
                            // unchanged from before this tab adopted GoalLedgerRow.
                            renderTasks={(deliverable) => <TaskTable rows={deliverable.tasks} />}
                          />
                        ))}
                        {/* Always rendered and hidden by default (the export always starts
                            with an empty search) so the standalone HTML export's script can
                            reveal it per-tag - the live-only check above never mounts in a
                            static file, since React re-renders on typing but a static export
                            never does. */}
                        <p data-search-empty className="text-xs text-gray-600" style={{ display: 'none' }}>
                          Nothing matches the search.
                        </p>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
