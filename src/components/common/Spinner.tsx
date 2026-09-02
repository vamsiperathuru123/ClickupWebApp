import clsx from 'clsx'

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={clsx('animate-spin text-accent-400', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function InlineSpinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-400 text-sm py-2 px-3">
      <Spinner size={14} />
      {label && <span>{label}</span>}
    </div>
  )
}
