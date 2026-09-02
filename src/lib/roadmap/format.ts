/** Exact amount with Indian-style thousands grouping — no K/L abbreviation, so the
 * real computed cost is never rounded off. */
export function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return '₹0'
  const sign = amount < 0 ? '-' : ''
  const formatted = Math.abs(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })
  return `${sign}₹${formatted}`
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours === 0) return '0h'
  const rounded = Math.round(hours * 10) / 10
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)}h`
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

/** Turn-around time as "Xd Yh" — always derived from real timestamps, never estimated. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  const totalHours = ms / (1000 * 60 * 60)
  const days = Math.floor(totalHours / 24)
  const hours = Math.round(totalHours % 24)
  if (days === 0) return `${hours}h`
  return `${days}d ${hours}h`
}
