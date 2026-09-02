import { useMemo } from 'react'
import clsx from 'clsx'
import { Avatar, AvatarStack } from '@/components/common/Avatar'
import { PriorityBadge, StatusBadge } from '@/components/common/Badges'
import { InlineSpinner } from '@/components/common/Spinner'
import { ErrorBanner, friendlyErrorMessage } from '@/components/common/ErrorBanner'
import { formatDateTime, formatShortDate } from '@/lib/dates'
import { formatCurrency, formatDuration, formatHours } from '@/lib/roadmap/format'

import { groupSpilloverRows, type SpilloverBucket, type SpilloverTaskRow } from '@/lib/roadmap/spillover'
import { useRoadmapStore } from '@/store/roadmapStore'
import type { AudienceFilter } from '@/lib/roadmap/taskGroups'
import { AudienceTabs } from './AudienceTabs'
import { useReportSettings, useReportSpillover } from './ReportSettingsContext'

const BUCKET_LABELS: Record<SpilloverBucket, string> = {
  completed: 'Completed',
  open: 'Open',
  blocked: 'Blocked/On Hold',
  completedUpcoming: 'Completed in Upcoming Sprints',
}
const BUCKET_ORDER: SpilloverBucket[] = ['completed', 'open', 'blocked', 'completedUpcoming']

const GRID_TEMPLATE =
  'minmax(200px,1fr) 110px 130px 120px 90px 95px 95px 70px 85px 110px 140px 130px 130px 140px 140px 160px 150px 110px 100px'

function SpilloverRowDetails({ row }: { row: SpilloverTaskRow }) {
  const { avgCostPerHour } = useReportSettings()
  const isCompletedBucket = row.bucket === 'completed' || row.bucket === 'completedUpcoming'
  const cost = row.hoursSpent * avgCostPerHour
  return (
    <div
      className="grid gap-2 items-center px-3 py-1.5 text-sm border-b border-surface-border/60 last:border-b-0 hover:bg-surface-100/60"
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      <a
        href={row.task.url}
        target="_blank"
        rel="noreferrer"
        className="text-left truncate text-gray-100 hover:text-accent-400 hover:underline"
      >
        {row.task.name}
      </a>
      <AvatarStack users={row.task.assignees} size={18} />
      <div className="flex items-center gap-1.5 truncate">
        {row.task.developer ? (
          <>
            <Avatar user={row.task.developer} size={18} />
            <span className="truncate text-gray-300 text-xs">{row.task.developer.username}</span>
          </>
        ) : (
          <span className="text-gray-500 text-xs">—</span>
        )}
      </div>
      <StatusBadge status={row.task.status} statusType={row.task.statusType} statusColor={row.task.statusColor} />
      <PriorityBadge priority={row.task.priority} />
      <div className="text-xs text-gray-400">{formatShortDate(row.task.betaDueDate)}</div>
      <div className="text-xs text-gray-400">{formatShortDate(row.task.dueDate)}</div>
      <div className="text-xs text-gray-300">{row.hoursSpent > 0 ? formatHours(row.hoursSpent) : '—'}</div>
      <div className="text-xs text-gray-300">{cost > 0 ? formatCurrency(cost) : '—'}</div>
      <div className="text-xs text-gray-400 truncate">{row.task.sprintName ?? '—'}</div>
      <div className="text-xs text-gray-400 truncate">{row.task.outcome ?? '—'}</div>
      <div className="text-xs text-gray-400 truncate">{row.task.metricCategory ?? '—'}</div>
      <div className="text-xs text-gray-400 truncate">{row.task.impactedMetric ?? '—'}</div>
      <div className="flex items-center gap-1.5 truncate">
        {row.task.implementationOwner ? (
          <>
            <Avatar user={row.task.implementationOwner} size={18} />
            <span className="truncate text-gray-300 text-xs">{row.task.implementationOwner.username}</span>
          </>
        ) : (
          <span className="text-gray-500 text-xs">—</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 truncate">
        {row.task.deliveryManager ? (
          <>
            <Avatar user={row.task.deliveryManager} size={18} />
            <span className="truncate text-gray-300 text-xs">{row.task.deliveryManager.username}</span>
          </>
        ) : (
          <span className="text-gray-500 text-xs">—</span>
        )}
      </div>
      <div className="text-xs text-gray-400 truncate" title={formatDateTime(row.spilloverSprintAsOf)}>
        {row.spilloverSprintName} <span className="text-gray-600">· {formatDateTime(row.spilloverSprintAsOf)}</span>
      </div>
      <div className="text-xs text-gray-400 truncate">{isCompletedBucket ? row.currentSprintName ?? '—' : '—'}</div>
      <div className="text-xs text-gray-400">{isCompletedBucket ? formatShortDate(row.completedAt) : '—'}</div>
      <div className="text-xs text-gray-300">{formatDuration(row.tatMs)}</div>
    </div>
  )
}

function SpilloverColumnHeader() {
  return (
    <div
      className="grid gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wide text-gray-500 bg-surface-300 border-b border-surface-border"
      style={{ gridTemplateColumns: GRID_TEMPLATE }}
    >
      <div>Task</div>
      <div>Assignees</div>
      <div>Dev</div>
      <div>Status</div>
      <div>Priority</div>
      <div>Beta Due</div>
      <div>Due</div>
      <div>Hours</div>
      <div>Cost</div>
      <div>Sprint</div>
      <div>Outcome</div>
      <div>Metric Category</div>
      <div>Impacted Metric</div>
      <div>Impl. Owner</div>
      <div>Delivery Manager</div>
      <div>Spillover Sprint</div>
      <div>Completed Sprint</div>
      <div>Completion Date</div>
      <div>TAT</div>
    </div>
  )
}

function SpilloverTable({ rows }: { rows: SpilloverTaskRow[] }) {
  const { groups, ungrouped } = useMemo(() => groupSpilloverRows(rows), [rows])

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 px-1">No tasks in this bucket.</p>
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={`${group.goal} ${group.deliverable}`}>
          <div className="text-xs text-gray-400 mb-1">
            <span title={group.goal} className="text-gray-200 font-medium hover:text-accent-400 transition-colors">
              {group.goal}
            </span>
            <span className="text-gray-600"> · </span>
            <span title={group.deliverable} className="hover:text-accent-400 transition-colors">
              {group.deliverable}
            </span>
          </div>
          <div className="overflow-x-auto border border-surface-border rounded-md">
            <SpilloverColumnHeader />
            {group.rows.map((row) => (
              <SpilloverRowDetails key={row.task.id} row={row} />
            ))}
          </div>
        </div>
      ))}

      {ungrouped.length > 0 && (
        <div>
          {groups.length > 0 && <div className="text-xs text-gray-500 mb-1">Tasks without a Goal/Deliverable</div>}
          <div className="overflow-x-auto border border-surface-border rounded-md">
            <SpilloverColumnHeader />
            {ungrouped.map((row) => (
              <SpilloverRowDetails key={row.task.id} row={row} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function SpilloverTab({
  audienceOverride,
  bucketOverride,
}: {
  /** Static-render overrides used by the HTML export — see GoalsTab. */
  audienceOverride?: AudienceFilter
  bucketOverride?: SpilloverBucket
} = {}) {
  const { previousSprintCount } = useReportSettings()
  const setPreviousSprintCount = useRoadmapStore((s) => s.setSpilloverPreviousSprintCount)
  const storeAudience = useRoadmapStore((s) => s.spilloverAudience)
  const setAudience = useRoadmapStore((s) => s.setSpilloverAudience)
  const storeBucket = useRoadmapStore((s) => s.spilloverBucket) as SpilloverBucket
  const setBucket = useRoadmapStore((s) => s.setSpilloverBucket)
  const audience = audienceOverride ?? storeAudience
  const bucket = bucketOverride ?? storeBucket

  const { rows, currentSprintNames, spilloverSprintNames, isLoading, isFetching, error, refetch } =
    useReportSpillover()

  const filteredRows = useMemo(
    () => rows.filter((r) => (audience === 'all' ? true : r.audience === audience) && r.bucket === bucket),
    [rows, audience, bucket]
  )

  const countsByBucket = useMemo(() => {
    const scoped = rows.filter((r) => (audience === 'all' ? true : r.audience === audience))
    const counts: Record<SpilloverBucket, number> = { completed: 0, open: 0, blocked: 0, completedUpcoming: 0 }
    for (const r of scoped) counts[r.bucket] += 1
    return counts
  }, [rows, audience])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <AudienceTabs value={audience} onChange={setAudience} />
        <label className="flex items-center gap-1.5 text-sm text-gray-400">
          No. of previous sprints
          <input
            type="number"
            min={0}
            step={1}
            value={previousSprintCount}
            onChange={(e) => setPreviousSprintCount(Math.max(0, Number(e.target.value)))}
            className="w-16 rounded bg-surface-200 border border-surface-border px-2 py-1 text-gray-100"
          />
        </label>
      </div>

      <div className="flex items-center bg-surface-200 rounded-md p-0.5 text-sm w-fit flex-wrap">
        {BUCKET_ORDER.map((b) => (
          <button
            key={b}
            onClick={() => setBucket(b)}
            data-filter="bucket"
            data-value={b}
            className={clsx('px-3 py-1 rounded transition-colors whitespace-nowrap', bucket === b ? 'bg-surface-50 text-gray-100' : 'text-gray-400 hover:text-gray-200')}
          >
            {BUCKET_LABELS[b]} {rows.length > 0 && <span className="text-gray-500">({countsByBucket[b]})</span>}
          </button>
        ))}
      </div>

      {previousSprintCount === 0 ? (
        <p className="text-sm text-gray-500">Enter how many previous sprints to check for spillover tasks.</p>
      ) : isLoading ? (
        <InlineSpinner label="Loading spillover data…" />
      ) : error ? (
        <ErrorBanner message={friendlyErrorMessage(error)!} onRetry={refetch} />
      ) : (
        <>
          <div className="rounded-md border border-surface-border bg-surface-300 px-3 py-2 text-xs text-gray-400 space-y-1">
            <div>
              <span className="text-gray-500">Current sprints:</span> {currentSprintNames.join(', ') || '—'}
            </div>
            <div>
              <span className="text-gray-500">Spillover sprints checked:</span> {spilloverSprintNames.join(', ') || 'none found'}
            </div>
            <div className="text-gray-500">
              Only tasks ClickUp still shows under those spillover sprints (their original list, or shared into it) can be
              found — a task moved off a sprint list entirely, with no trace left there, can't be recovered by any API call.
            </div>
          </div>
          {isFetching && <div className="text-xs text-gray-500">Refreshing…</div>}
          <SpilloverTable rows={filteredRows} />
        </>
      )}
    </div>
  )
}
