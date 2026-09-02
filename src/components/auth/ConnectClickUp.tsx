import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'

export function ConnectClickUp() {
  const setToken = useAuthStore((s) => s.setToken)
  const [value, setValue] = useState('')

  return (
    <div className="h-full w-full flex items-center justify-center bg-surface-400">
      <div className="w-full max-w-md rounded-lg border border-surface-border bg-surface-300 p-8 shadow-panel">
        <div className="text-2xl mb-1">📊</div>
        <h1 className="text-lg font-semibold text-gray-100">Connect to ClickUp</h1>
        <p className="text-sm text-gray-400 mt-1 mb-5">
          Enter your ClickUp personal API token. It's stored only in this browser's local storage and used to
          authenticate directly with the ClickUp MCP server at{' '}
          <code className="text-accent-400">{import.meta.env.VITE_CLICKUP_MCP_URL || 'https://mcp.clickup.com/mcp'}</code>.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim()) setToken(value.trim())
          }}
          className="space-y-3"
        >
          <input
            type="password"
            autoFocus
            placeholder="pk_xxxxxxxx_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-md bg-surface-200 border border-surface-border px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="w-full rounded-md bg-accent-500 hover:bg-accent-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2 transition-colors"
          >
            Connect
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-4">
          Find your token under ClickUp → Settings → Apps → API Token.
        </p>
      </div>
    </div>
  )
}
