export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
      <div className="text-3xl mb-3">⚠️</div>
      <div className="text-red-400 font-medium max-w-md">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-3 py-1.5 rounded-md bg-surface-200 hover:bg-surface-100 text-sm text-gray-200"
        >
          Retry
        </button>
      )}
    </div>
  )
}

export function friendlyErrorMessage(error: Error | null): string | null {
  if (!error) return null
  if (/rate.?limit/i.test(error.message)) {
    return "ClickUp's API rate limit was hit while loading this data. It'll retry automatically — try again in a moment."
  }
  return `Couldn't load data from ClickUp: ${error.message}`
}
