import { LIST_GRID_TEMPLATE } from './columns'

export function ListHeaderRow() {
  return (
    <div
      className="grid items-center gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 border-b border-surface-border bg-surface-300 sticky top-0 z-10"
      style={{ gridTemplateColumns: LIST_GRID_TEMPLATE }}
    >
      <div />
      <div>Task</div>
      <div>Dev</div>
      <div>Assignees</div>
      <div>Points</div>
      <div>Priority</div>
      <div>Start</div>
      <div>Beta Due</div>
      <div>Due</div>
      <div>Status</div>
      <div />
    </div>
  )
}
