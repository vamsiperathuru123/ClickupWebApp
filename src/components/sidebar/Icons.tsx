export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className={`shrink-0 transition-transform text-gray-500 ${open ? 'rotate-90' : ''}`}
    >
      <path d="M3 1 L7 5 L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function WorkspaceIcon() {
  return <span className="text-sm">🏢</span>
}
export function SpaceIcon({ color }: { color?: string }) {
  return <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color || '#7b68ee' }} />
}
export function FolderIcon() {
  return <span className="text-sm">📁</span>
}
export function ListIcon() {
  return <span className="text-sm">📋</span>
}
