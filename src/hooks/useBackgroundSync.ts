import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useUiStore } from '@/store/uiStore'

const SYNC_INTERVAL_MS = 5 * 60 * 1000

/** Silently re-syncs the active list every 5 minutes via a delta refetch. */
export function useBackgroundSync() {
  const queryClient = useQueryClient()
  const activeNode = useUiStore((s) => s.activeNode)

  useEffect(() => {
    if (!activeNode || activeNode.type !== 'list') return

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['tasks', activeNode.id], refetchType: 'active' })
    }, SYNC_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [activeNode, queryClient])
}
