import clsx from 'clsx'
import { Avatar } from '@/components/common/Avatar'
import { formatPoints } from '@/lib/points'
import { useCacheStore } from '@/store/cacheStore'
import type { DevBandwidth } from '@/lib/bandwidth'

export function CapacityTable({ rows, listId }: { rows: DevBandwidth[]; listId: string }) {
  const setCapacity = useCacheStore((s) => s.setCapacity)

  const totals = rows.reduce(
    (acc, r) => ({ capacity: acc.capacity + r.capacity, target: acc.target + r.target, available: acc.available + r.available }),
    { capacity: 0, target: 0, available: 0 }
  )

  return (
    <div className="rounded-lg border border-surface-border overflow-hidden">
      <div className="grid grid-cols-[1fr_90px_90px_90px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 bg-surface-300 border-b border-surface-border">
        <div>Dev</div>
        <div>Capacity</div>
        <div>Target</div>
        <div>Available</div>
      </div>
      {rows.map((row) => (
        <div key={row.dev.id} className="grid grid-cols-[1fr_90px_90px_90px] gap-2 px-3 py-2 items-center border-b border-surface-border/60 text-sm">
          <div className="flex items-center gap-2 truncate">
            <Avatar user={row.dev} size={22} />
            <span className="truncate text-gray-200">{row.dev.username}</span>
          </div>
          <input
            type="number"
            min={0}
            step={0.5}
            value={row.capacity}
            onChange={(e) => setCapacity(listId, String(row.dev.id), Number(e.target.value))}
            className="w-16 rounded bg-surface-200 border border-surface-border px-2 py-1 text-xs text-gray-100"
          />
          <div className="text-gray-300">{formatPoints(row.target)}</div>
          <div className={clsx('font-medium', row.available >= 0 ? 'text-green-400' : 'text-red-400')}>
            {formatPoints(row.available)}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_90px_90px_90px] gap-2 px-3 py-2 items-center bg-surface-300 text-sm font-medium">
        <div className="text-gray-300">Total</div>
        <div className="text-gray-100">{formatPoints(totals.capacity)}</div>
        <div className="text-gray-100">{formatPoints(totals.target)}</div>
        <div className={totals.available >= 0 ? 'text-green-400' : 'text-red-400'}>{formatPoints(totals.available)}</div>
      </div>
    </div>
  )
}
