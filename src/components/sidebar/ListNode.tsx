import clsx from 'clsx'
import { useUiStore } from '@/store/uiStore'
import type { ClickUpList } from '@/types/clickup'
import { ListIcon } from './Icons'

export function ListNode({ list }: { list: ClickUpList }) {
  const activeNode = useUiStore((s) => s.activeNode)
  const setActiveNode = useUiStore((s) => s.setActiveNode)
  const isActive = activeNode?.type === 'list' && activeNode.id === list.id

  return (
    <button
      onClick={() => setActiveNode({ type: 'list', id: list.id, name: list.name })}
      className={clsx(
        'w-full flex items-center gap-2 pl-9 pr-2 py-1.5 rounded text-sm text-left truncate transition-colors',
        isActive ? 'bg-accent-500/20 text-accent-400' : 'text-gray-300 hover:bg-surface-100'
      )}
    >
      <ListIcon />
      <span className="truncate flex-1">{list.name}</span>
      {typeof list.taskCount === 'number' && <span className="text-[11px] text-gray-500">{list.taskCount}</span>}
    </button>
  )
}
