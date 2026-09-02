import { useUiStore } from '@/store/uiStore'
import { useSpaces } from '@/hooks/useSpaces'
import type { ClickUpWorkspace } from '@/types/clickup'
import { ChevronIcon, WorkspaceIcon } from './Icons'
import { SpaceNode } from './SpaceNode'
import { InlineSpinner } from '@/components/common/Spinner'

export function WorkspaceNode({ workspace }: { workspace: ClickUpWorkspace }) {
  const isExpanded = useUiStore((s) => s.isExpanded(workspace.id))
  const toggleExpanded = useUiStore((s) => s.toggleExpanded)
  const { spaces, isLoading } = useSpaces(workspace.id, isExpanded)

  return (
    <div>
      <button
        onClick={() => toggleExpanded(workspace.id)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left truncate text-gray-100 hover:bg-surface-100 transition-colors"
      >
        <ChevronIcon open={isExpanded} />
        <WorkspaceIcon />
        <span className="truncate flex-1 font-semibold">{workspace.name}</span>
      </button>
      {isExpanded && (
        <div>
          {isLoading && spaces.length === 0 ? (
            <InlineSpinner label="Loading spaces…" />
          ) : (
            spaces.map((space) => <SpaceNode key={space.id} space={space} />)
          )}
        </div>
      )}
    </div>
  )
}
