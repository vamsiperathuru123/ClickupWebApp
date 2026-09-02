export type StatusGroup = 'open' | 'custom' | 'closed' | 'done'

const GROUP_COLORS: Record<StatusGroup, string> = {
  open: '#87909e',
  custom: '#4592f8',
  done: '#6bc950',
  closed: '#008844',
}

export function colorForStatus(statusType: StatusGroup | undefined, fallback?: string): string {
  if (fallback) return fallback
  return GROUP_COLORS[statusType ?? 'open']
}

const PRIORITY_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  urgent: { bg: '#f5000022', fg: '#ff5c5c', label: 'Urgent' },
  high: { bg: '#ffcc0022', fg: '#ffcc00', label: 'High' },
  normal: { bg: '#6fddff22', fg: '#6fddff', label: 'Normal' },
  low: { bg: '#d8d8d822', fg: '#d8d8d8', label: 'Low' },
}

export const PRIORITY_RANK: Record<'urgent' | 'high' | 'normal' | 'low', number> = {
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4,
}

export function priorityStyle(priority: string | null) {
  if (!priority) return null
  return PRIORITY_STYLES[priority] ?? null
}

/** Stable color per user id, for dev-colored gantt bars / avatars without an explicit color. */
const DEV_PALETTE = [
  '#7b68ee',
  '#45c4b0',
  '#f2994a',
  '#e2445c',
  '#4592f8',
  '#a25ddc',
  '#6bc950',
  '#eb5757',
  '#f5a623',
  '#56ccf2',
]

export function colorForDev(userId: number | string): string {
  const id = typeof userId === 'string' ? hashString(userId) : userId
  return DEV_PALETTE[Math.abs(id) % DEV_PALETTE.length]
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return h
}
