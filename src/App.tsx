import { useAuthStore } from '@/store/authStore'
import { ConnectClickUp } from '@/components/auth/ConnectClickUp'
import { Shell } from '@/components/layout/Shell'

export default function App() {
  const token = useAuthStore((s) => s.token)

  if (!token) return <ConnectClickUp />
  return <Shell />
}
