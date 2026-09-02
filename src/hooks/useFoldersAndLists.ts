import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useCacheStore } from '@/store/cacheStore'
import { isStale } from '@/types/cache'
import { fetchFoldersAndFolderlessLists } from '@/lib/mcp/clickupService'
import { folderlessKey } from '@/lib/keys'

/** Fetches a Space's Folders and folderless Lists — only called when that Space's
 * sidebar node is expanded, not eagerly for every space in the workspace. */
export function useFoldersAndLists(spaceId: string | null, enabled: boolean) {
  const token = useAuthStore((s) => s.token)
  const cached = useCacheStore((s) => (spaceId ? s.folders[spaceId] : undefined))
  const setFolders = useCacheStore((s) => s.setFolders)
  const setLists = useCacheStore((s) => s.setLists)

  const fresh = cached && !isStale(cached.fetchedAt)

  const query = useQuery({
    queryKey: ['folders', spaceId],
    queryFn: async () => {
      const { folders, folderlessLists } = await fetchFoldersAndFolderlessLists(token!, spaceId!)
      setFolders(spaceId!, folders)
      setLists(folderlessKey(spaceId!), folderlessLists)
      return folders
    },
    enabled: enabled && !!token && !!spaceId && !fresh,
  })

  return { folders: cached?.data ?? query.data ?? [], isLoading: !fresh && query.isLoading }
}
