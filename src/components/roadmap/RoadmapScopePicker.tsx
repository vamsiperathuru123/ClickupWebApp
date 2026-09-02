import { useEffect, useRef, useState } from 'react'
import { useUiStore } from '@/store/uiStore'
import { useCacheStore } from '@/store/cacheStore'
import { useRoadmapStore, type RoadmapScopeItem } from '@/store/roadmapStore'
import { useWorkspaces } from '@/hooks/useWorkspaces'
import { useSpaces } from '@/hooks/useSpaces'
import { useFoldersAndLists } from '@/hooks/useFoldersAndLists'
import { useListsForFolder } from '@/hooks/useListsForFolder'
import { InlineSpinner } from '@/components/common/Spinner'
import { folderlessKey } from '@/lib/keys'
import type { ClickUpFolder, ClickUpList, ClickUpSpace } from '@/types/clickup'

function isSelected(scope: RoadmapScopeItem[], type: 'list' | 'folder', id: string) {
  return scope.some((i) => i.type === type && i.id === id)
}

function ScopeCheckbox({ checked, onChange, label, icon }: { checked: boolean; onChange: () => void; label: string; icon: string }) {
  return (
    <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-surface-100 cursor-pointer text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="w-3.5 h-3.5 accent-accent-500" />
      <span className="shrink-0">{icon}</span>
      <span className="truncate text-gray-200">{label}</span>
    </label>
  )
}

function FolderScopeRow({ folder }: { folder: ClickUpFolder }) {
  const selectedScope = useRoadmapStore((s) => s.selectedScope)
  const toggleScopeItem = useRoadmapStore((s) => s.toggleScopeItem)
  const [expanded, setExpanded] = useState(false)
  const { lists, isLoading } = useListsForFolder(folder.id, folder.spaceId, expanded)

  return (
    <div>
      <div className="flex items-center">
        <button onClick={() => setExpanded((e) => !e)} className="px-1 text-gray-500 hover:text-gray-300">
          {expanded ? '▾' : '▸'}
        </button>
        <ScopeCheckbox
          checked={isSelected(selectedScope, 'folder', folder.id)}
          onChange={() => toggleScopeItem({ type: 'folder', id: folder.id, name: folder.name })}
          label={folder.name}
          icon="📁"
        />
      </div>
      {expanded && (
        <div className="pl-8">
          {isLoading && lists.length === 0 ? (
            <InlineSpinner />
          ) : (
            lists.map((list) => <ListScopeRow key={list.id} list={list} />)
          )}
        </div>
      )}
    </div>
  )
}

function ListScopeRow({ list }: { list: ClickUpList }) {
  const selectedScope = useRoadmapStore((s) => s.selectedScope)
  const toggleScopeItem = useRoadmapStore((s) => s.toggleScopeItem)
  return (
    <ScopeCheckbox
      checked={isSelected(selectedScope, 'list', list.id)}
      onChange={() => toggleScopeItem({ type: 'list', id: list.id, name: list.name })}
      label={list.name}
      icon="📋"
    />
  )
}

function useFolderlessLists(spaceId: string): ClickUpList[] {
  return useCacheStore((s) => s.lists[folderlessKey(spaceId)]?.data ?? [])
}

function SpaceScopeRow({ space }: { space: ClickUpSpace }) {
  const [expanded, setExpanded] = useState(false)
  const { folders, isLoading } = useFoldersAndLists(space.id, expanded)
  const folderlessLists = useFolderlessLists(space.id)

  return (
    <div>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-2 px-2 py-1 text-sm text-gray-100 font-medium w-full hover:bg-surface-100 rounded"
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: space.color || '#7b68ee' }} />
        <span className="truncate">{space.name}</span>
      </button>
      {expanded && (
        <div className="pl-4">
          {isLoading && folders.length === 0 ? (
            <InlineSpinner />
          ) : (
            <>
              {folders.map((folder) => (
                <FolderScopeRow key={folder.id} folder={folder} />
              ))}
              {folderlessLists.map((list) => (
                <ListScopeRow key={list.id} list={list} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function RoadmapScopePicker() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const { workspaces } = useWorkspaces()
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0]
  const { spaces, isLoading } = useSpaces(workspace?.id ?? null, open)
  const selectedScope = useRoadmapStore((s) => s.selectedScope)
  const clearScope = useRoadmapStore((s) => s.clearScope)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 rounded-md text-sm bg-surface-200 text-gray-200 hover:bg-surface-100 border border-surface-border"
      >
        {selectedScope.length === 0
          ? 'Select sprints / folders…'
          : `${selectedScope.length} scope item${selectedScope.length === 1 ? '' : 's'} selected`}
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-30 w-80 max-h-96 overflow-y-auto rounded-md border border-surface-border bg-surface-200 shadow-panel p-2">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] uppercase tracking-wide text-gray-500">Report scope</span>
            {selectedScope.length > 0 && (
              <button onClick={clearScope} className="text-xs text-gray-400 hover:text-gray-200">
                Clear all
              </button>
            )}
          </div>
          {isLoading && spaces.length === 0 ? (
            <InlineSpinner label="Loading spaces…" />
          ) : (
            spaces.map((space) => <SpaceScopeRow key={space.id} space={space} />)
          )}
        </div>
      )}
    </div>
  )
}
