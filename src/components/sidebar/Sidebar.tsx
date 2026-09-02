import { useWorkspaces } from '@/hooks/useWorkspaces'
import { WorkspaceNode } from './WorkspaceNode'
import { InlineSpinner } from '@/components/common/Spinner'

export function Sidebar() {
  const { workspaces, isLoading } = useWorkspaces()

  return (
    <aside className="w-64 shrink-0 h-full bg-surface-300 border-r border-surface-border flex flex-col print:hidden">
      <div className="px-3 py-3 border-b border-surface-border flex items-center gap-2">
        <span className="text-lg">📊</span>
        <span className="font-semibold text-gray-100 text-sm">Dev Bandwidth</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {isLoading && workspaces.length === 0 ? (
          <InlineSpinner label="Loading workspaces…" />
        ) : (
          workspaces.map((ws) => <WorkspaceNode key={ws.id} workspace={ws} />)
        )}
      </nav>
    </aside>
  )
}
