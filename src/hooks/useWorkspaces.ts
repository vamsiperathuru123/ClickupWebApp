import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useCacheStore } from '@/store/cacheStore'
import { useUiStore } from '@/store/uiStore'
import { isStale } from '@/types/cache'
import { fetchWorkspaces } from '@/lib/mcp/clickupService'

export function useWorkspaces() {
  const token = useAuthStore((s) => s.token)
  const cached = useCacheStore((s) => s.workspaces)
  const setWorkspaces = useCacheStore((s) => s.setWorkspaces)
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useUiStore((s) => s.setActiveWorkspaceId)
  const toggleExpanded = useUiStore((s) => s.toggleExpanded)
  const isExpanded = useUiStore((s) => s.isExpanded)

  const fresh = cached && !isStale(cached.fetchedAt)

  const query = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const workspaces = await fetchWorkspaces(token!)
      setWorkspaces(workspaces)
      return workspaces
    },
    enabled: !!token && !fresh,
  })

  const workspaces = cached?.data ?? query.data ?? []

  useEffect(() => {
    if (workspaces.length && !activeWorkspaceId) {
      const firstId = workspaces[0].id
      setActiveWorkspaceId(firstId)
      if (!isExpanded(firstId)) toggleExpanded(firstId)
    }
  }, [workspaces, activeWorkspaceId])

  return { workspaces, isLoading: !fresh && query.isLoading, error: query.error }
}
