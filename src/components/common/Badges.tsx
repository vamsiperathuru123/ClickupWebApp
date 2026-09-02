import { priorityStyle, colorForStatus } from '@/lib/statusColors'
import type { AppTask } from '@/types/clickup'

export function PriorityBadge({ priority }: { priority: AppTask['priority'] }) {
  const style = priorityStyle(priority)
  if (!style) return <span className="text-gray-500 text-sm">—</span>
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.fg }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
        <path d="M5 0 10 10 0 10Z" />
      </svg>
      {style.label}
    </span>
  )
}

export function StatusBadge({ status, statusType, statusColor }: { status: string; statusType?: string; statusColor?: string }) {
  const color = colorForStatus(statusType as any, statusColor)
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-white truncate max-w-[140px]"
      style={{ backgroundColor: color }}
    >
      <span className="truncate">{status}</span>
    </span>
  )
}
