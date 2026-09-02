export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16 text-gray-500">
      <div className="text-4xl mb-3">🗂️</div>
      <div className="text-gray-300 font-medium">{title}</div>
      {subtitle && <div className="text-sm mt-1 max-w-sm">{subtitle}</div>}
    </div>
  )
}
