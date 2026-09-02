import { useUiStore } from '@/store/uiStore'
import { useCacheStore } from '@/store/cacheStore'
import { useFoldersAndLists } from '@/hooks/useFoldersAndLists'
import type { ClickUpSpace } from '@/types/clickup'
import { ChevronIcon, SpaceIcon } from './Icons'
import { FolderNode } from './FolderNode'
import { ListNode } from './ListNode'
import { InlineSpinner } from '@/components/common/Spinner'
import { folderlessKey } from '@/lib/keys'

export function SpaceNode({ space }: { space: ClickUpSpace }) {
  const isExpanded = useUiStore((s) => s.isExpanded(space.id))
  const toggleExpanded = useUiStore((s) => s.toggleExpanded)
  const { folders, isLoading } = useFoldersAndLists(space.id, isExpanded)
  const folderlessLists = useCacheStore((s) => s.lists[folderlessKey(space.id)]?.data ?? [])

  return (
    <div>
      <button
        onClick={() => toggleExpanded(space.id)}
        className="w-full flex items-center gap-2 pl-3 pr-2 py-1.5 rounded text-sm text-left truncate text-gray-200 hover:bg-surface-100 transition-colors"
      >
        <ChevronIcon open={isExpanded} />
        <SpaceIcon color={space.color} />
        <span className="truncate flex-1 font-medium">{space.name}</span>
      </button>
      {isExpanded && (
        <div>
          {isLoading && folders.length === 0 && folderlessLists.length === 0 ? (
            <InlineSpinner />
          ) : (
            <>
              {folders.map((folder) => (
                <FolderNode key={folder.id} folder={folder} spaceId={space.id} />
              ))}
              {folderlessLists.map((list) => (
                <ListNode key={list.id} list={list} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
