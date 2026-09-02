/**
 * Reads a build/runtime config value in whichever runtime is asking.
 *
 * The browser bundle gets these from Vite's `import.meta.env`; the agent service
 * runs the very same modules under Node, where `import.meta.env` doesn't exist and
 * touching `.VITE_x` on it throws. Everything shared between the two therefore has
 * to come through here rather than reading `import.meta.env` directly.
 *
 * Vite emits `import.meta.env` as a real object, so the dynamic key lookup below is
 * replaced/populated at build time just like literal member access would be.
 */
function fromVite(key: string): string | undefined {
  try {
    const meta = import.meta as unknown as { env?: Record<string, string | undefined> }
    return meta.env?.[key]
  } catch {
    return undefined
  }
}

function fromNode(key: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return proc?.env?.[key]
}

export function readEnv(key: string, fallback: string): string {
  const value = fromVite(key) ?? fromNode(key)
  return value && value.length > 0 ? value : fallback
}
