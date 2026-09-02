import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useCacheStore } from '@/store/cacheStore'
import { isStale } from '@/types/cache'
import { fetchListsForFolder } from '@/lib/mcp/clickupService'

/** Fetches a Folder's Lists — only called when that Folder's sidebar node is
 * expanded, not eagerly for every folder in the space. */
export function useListsForFolder(folderId: string | null, spaceId: string | null, enabled: boolean) {
  const token = useAuthStore((s) => s.token)
  const cached = useCacheStore((s) => (folderId ? s.lists[folderId] : undefined))
  const setLists = useCacheStore((s) => s.setLists)

  const fresh = cached && !isStale(cached.fetchedAt)

  const query = useQuery({
    queryKey: ['lists', folderId],
    queryFn: async () => {
      const lists = await fetchListsForFolder(token!, folderId!, spaceId!)
      setLists(folderId!, lists)
      return lists
    },
    enabled: enabled && !!token && !!folderId && !!spaceId && !fresh,
  })

  return { lists: cached?.data ?? query.data ?? [], isLoading: !fresh && query.isLoading }
}
