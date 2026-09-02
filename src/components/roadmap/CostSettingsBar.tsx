import { useRoadmapStore } from '@/store/roadmapStore'
import { formatCurrency } from '@/lib/roadmap/format'

export function CostSettingsBar() {
  const avgCostPerHour = useRoadmapStore((s) => s.avgCostPerHour)
  const totalWorkingHours = useRoadmapStore((s) => s.totalWorkingHours)
  const setAvgCostPerHour = useRoadmapStore((s) => s.setAvgCostPerHour)
  const setTotalWorkingHours = useRoadmapStore((s) => s.setTotalWorkingHours)
  const totalBudget = avgCostPerHour * totalWorkingHours

  return (
    <div className="flex items-center gap-4 text-sm">
      <label className="flex items-center gap-1.5 text-gray-400">
        Avg cost/hour
        <input
          type="number"
          min={0}
          step={1}
          value={avgCostPerHour}
          onChange={(e) => setAvgCostPerHour(Number(e.target.value))}
          className="w-20 rounded bg-surface-200 border border-surface-border px-2 py-1 text-gray-100"
        />
      </label>
      <label className="flex items-center gap-1.5 text-gray-400">
        Total working hours
        <input
          type="number"
          min={0}
          step={1}
          value={totalWorkingHours}
          onChange={(e) => setTotalWorkingHours(Number(e.target.value))}
          className="w-24 rounded bg-surface-200 border border-surface-border px-2 py-1 text-gray-100"
        />
      </label>
      <span className="text-gray-500">
        Total budget: <span className="text-gray-200 font-medium">{formatCurrency(totalBudget)}</span>
      </span>
    </div>
  )
}
