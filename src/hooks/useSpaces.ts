import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useCacheStore } from '@/store/cacheStore'
import { isStale } from '@/types/cache'
import { fetchSpaces } from '@/lib/mcp/clickupService'

/** Fetches only a workspace's Spaces — Folders/Lists are fetched separately, one
 * level at a time, as each node is actually expanded (see useFoldersAndLists,
 * useListsForFolder). */
export function useSpaces(workspaceId: string | null, enabled: boolean) {
  const token = useAuthStore((s) => s.token)
  const cached = useCacheStore((s) => (workspaceId ? s.spaces[workspaceId] : undefined))
  const setSpaces = useCacheStore((s) => s.setSpaces)

  const fresh = cached && !isStale(cached.fetchedAt)

  const query = useQuery({
    queryKey: ['spaces', workspaceId],
    queryFn: async () => {
      const spaces = await fetchSpaces(token!, workspaceId!)
      setSpaces(workspaceId!, spaces)
      return spaces
    },
    enabled: enabled && !!token && !!workspaceId && !fresh,
  })

  return { spaces: cached?.data ?? query.data ?? [], isLoading: !fresh && query.isLoading }
}
