import { config as loadDotenv } from 'dotenv'

loadDotenv()

function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing ${key}. Copy server/.env.example to server/.env and fill it in.`)
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
  get anthropicApiKey() {
    return required('ANTHROPIC_API_KEY')
  },
  model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
  /** Tracing is optional — the agent runs fine without Langfuse configured. */
  langfuse:
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
      ? {
          publicKey: process.env.LANGFUSE_PUBLIC_KEY,
          secretKey: process.env.LANGFUSE_SECRET_KEY,
          baseUrl: process.env.LANGFUSE_BASE_URL ?? 'https://cloud.langfuse.com',
        }
      : null,
  /** Hard ceiling on tool round-trips per question, so one query can't run away. */
  maxToolIterations: Number(process.env.MAX_TOOL_ITERATIONS ?? 8),
  digestCacheMs: Number(process.env.DIGEST_CACHE_MS ?? 5 * 60 * 1000),
}

export function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}
