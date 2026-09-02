import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { fetchWorkspaceMembers } from '@/lib/mcp/clickupService'

export function useWorkspaceMembers(workspaceId: string | null) {
  const token = useAuthStore((s) => s.token)

  const query = useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => fetchWorkspaceMembers(token!, workspaceId!),
    enabled: !!token && !!workspaceId,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  })

  return {
    members: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: () => void query.refetch(),
  }
}
