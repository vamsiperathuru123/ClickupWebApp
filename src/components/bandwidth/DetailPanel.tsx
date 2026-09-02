import { Avatar } from '@/components/common/Avatar'
import { formatPoints } from '@/lib/points'
import { useUiStore } from '@/store/uiStore'
import type { DevBandwidth } from '@/lib/bandwidth'
import type { BarKey } from './OverallBarChart'

export function DetailPanel({ selected, rows }: { selected: BarKey; rows: DevBandwidth[] }) {
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)

  if (selected === 'capacity') {
    const maxCapacity = Math.max(1, ...rows.map((r) => r.capacity))
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-200 mb-2">Capacity by developer</h3>
        {rows.map((r) => (
          <div key={r.dev.id} className="flex items-center gap-3">
            <Avatar user={r.dev} size={20} />
            <span className="w-28 text-sm text-gray-300 truncate">{r.dev.username}</span>
            <div className="flex-1 h-3 bg-surface-300 rounded overflow-hidden">
              <div className="h-full bg-accent-500 rounded" style={{ width: `${(r.capacity / maxCapacity) * 100}%` }} />
            </div>
            <span className="w-14 text-right text-xs text-gray-400">{formatPoints(r.capacity)}</span>
          </div>
        ))}
      </div>
    )
  }

  if (selected === 'target') {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-200 mb-2">Target &amp; assigned tasks by developer</h3>
        {rows
          .filter((r) => r.tasks.length > 0)
          .map((r) => (
            <div key={r.dev.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <Avatar user={r.dev} size={20} />
                <span className="text-sm text-gray-200">{r.dev.username}</span>
                <span className="text-xs text-gray-500">{formatPoints(r.target)}</span>
              </div>
              <ul className="space-y-1 pl-7">
                {r.tasks.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelectedTaskId(t.id)}
                      className="flex items-center gap-2 text-xs text-gray-400 hover:text-accent-400"
                    >
                      <span className="truncate max-w-[240px]">{t.name}</span>
                      <span className="text-gray-500">{formatPoints(t.splitPoints)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    )
  }

  const freeDevs = rows.filter((r) => r.available > 0)
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-200 mb-2">Developers with free bandwidth</h3>
      {freeDevs.length === 0 ? (
        <p className="text-sm text-gray-500">No one has free bandwidth right now.</p>
      ) : (
        freeDevs.map((r) => (
          <div key={r.dev.id} className="flex items-center gap-3">
            <Avatar user={r.dev} size={20} />
            <span className="flex-1 text-sm text-gray-300 truncate">{r.dev.username}</span>
            <span className="text-sm font-medium text-green-400">{formatPoints(r.available)} free</span>
          </div>
        ))
      )}
    </div>
  )
}
