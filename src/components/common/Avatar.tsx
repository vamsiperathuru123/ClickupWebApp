import type { ClickUpUser } from '@/types/clickup'
import { colorForDev } from '@/lib/statusColors'

function initialsFor(user: ClickUpUser): string {
  if (user.initials) return user.initials
  const parts = user.username.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return user.username.slice(0, 2).toUpperCase()
}

export function Avatar({ user, size = 22, ringed = false }: { user: ClickUpUser; size?: number; ringed?: boolean }) {
  const bg = user.color ?? colorForDev(user.id)

  if (user.profilePicture) {
    return (
      <img
        src={user.profilePicture}
        alt={user.username}
        title={user.username}
        width={size}
        height={size}
        className={`rounded-full object-cover ${ringed ? 'ring-2 ring-surface-400' : ''}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      title={user.username}
      className={`flex items-center justify-center rounded-full text-white font-medium shrink-0 ${
        ringed ? 'ring-2 ring-surface-400' : ''
      }`}
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.42 }}
    >
      {initialsFor(user)}
    </div>
  )
}

export function AvatarStack({ users, size = 22, max = 4 }: { users: ClickUpUser[]; size?: number; max?: number }) {
  if (!users.length) return <span className="text-gray-500 text-sm">—</span>
  const shown = users.slice(0, max)
  const overflow = users.length - shown.length

  return (
    <div className="flex items-center">
      {shown.map((u, i) => (
        <div key={u.id} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <Avatar user={u} size={size} ringed />
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="flex items-center justify-center rounded-full bg-surface-100 text-gray-300 text-[11px] font-medium ring-2 ring-surface-400 shrink-0"
          style={{ width: size, height: size, marginLeft: -6 }}
        >
          +{overflow}
        </div>
      )}
    </div>
  )
}
