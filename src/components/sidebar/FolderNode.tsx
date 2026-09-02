import clsx from 'clsx'
import { useUiStore } from '@/store/uiStore'
import { useListsForFolder } from '@/hooks/useListsForFolder'
import type { ClickUpFolder } from '@/types/clickup'
import { ChevronIcon, FolderIcon } from './Icons'
import { ListNode } from './ListNode'
import { InlineSpinner } from '@/components/common/Spinner'

export function FolderNode({ folder, spaceId }: { folder: ClickUpFolder; spaceId: string }) {
  const isExpanded = useUiStore((s) => s.isExpanded(folder.id))
  const toggleExpanded = useUiStore((s) => s.toggleExpanded)
  const activeNode = useUiStore((s) => s.activeNode)
  const setActiveNode = useUiStore((s) => s.setActiveNode)
  const { lists, isLoading } = useListsForFolder(folder.id, spaceId, isExpanded)
  const isActive = activeNode?.type === 'folder' && activeNode.id === folder.id

  return (
    <div>
      <button
        onClick={() => {
          toggleExpanded(folder.id)
          setActiveNode({ type: 'folder', id: folder.id, name: folder.name })
        }}
        className={clsx(
          'w-full flex items-center gap-1.5 pl-6 pr-2 py-1.5 rounded text-sm text-left truncate transition-colors',
          isActive ? 'bg-accent-500/20 text-accent-400' : 'text-gray-300 hover:bg-surface-100'
        )}
      >
        <ChevronIcon open={isExpanded} />
        <FolderIcon />
        <span className="truncate flex-1">{folder.name}</span>
      </button>
      {isExpanded && (
        <div>
          {isLoading && lists.length === 0 ? (
            <InlineSpinner />
          ) : (
            lists.map((list) => <ListNode key={list.id} list={list} />)
          )}
        </div>
      )}
    </div>
  )
}
