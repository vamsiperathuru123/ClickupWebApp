import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { readEnv } from '@/lib/env'

const MCP_URL = readEnv('VITE_CLICKUP_MCP_URL', 'https://mcp.clickup.com/mcp')

let clientPromise: Promise<Client> | null = null
let connectedToken: string | null = null

/**
 * Lazily creates and connects a single shared MCP client. Reconnects automatically
 * if the auth token changes (e.g. user re-enters their ClickUp API token).
 */
export function getMcpClient(token: string): Promise<Client> {
  if (clientPromise && connectedToken === token) return clientPromise

  connectedToken = token
  clientPromise = (async () => {
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })
    const client = new Client({ name: 'dev-bandwidth-tracker', version: '1.0.0' }, { capabilities: {} })
    await client.connect(transport)
    return client
  })()

  clientPromise.catch(() => {
    clientPromise = null
    connectedToken = null
  })

  return clientPromise
}

export class McpToolError extends Error {
  constructor(public toolName: string, cause: unknown) {
    super(`MCP tool "${toolName}" failed: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
}

/**
 * Some MCP server deployments (mcp.clickup.com among them, as of this writing) run a
 * CORS policy that rejects the SDK's own `mcp-protocol-version` header at the
 * preflight stage — every call fails before it ever reaches the server, regardless of
 * token or tool name. That failure is deterministic per browser session, so once it's
 * been observed we stop retrying MCP for a cooldown window instead of paying a doomed
 * CORS round-trip (and console spam) on every single operation; REST carries the load
 * in the meantime. A successful connect resets the breaker.
 */
const MCP_COOLDOWN_MS = 2 * 60 * 1000
let mcpUnavailableUntil = 0

function isConnectionLevelFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true
  const message = err instanceof Error ? err.message : String(err)
  return /failed to fetch|cors|network|ECONNREFUSED/i.test(message)
}

/**
 * Calls the first tool name (from a list of known/likely candidates) that the connected
 * MCP server actually exposes. Different ClickUp MCP server builds/versions have used
 * slightly different tool names, so we probe rather than hard-coding a single name.
 */
export async function callMcpTool(
  token: string,
  candidateNames: readonly string[],
  args: Record<string, unknown>
): Promise<unknown> {
  if (Date.now() < mcpUnavailableUntil) {
    throw new McpToolError(candidateNames.join(' | '), new Error('MCP marked unavailable after a recent connection failure'))
  }

  let client: Client
  try {
    client = await getMcpClient(token)
  } catch (err) {
    if (isConnectionLevelFailure(err)) mcpUnavailableUntil = Date.now() + MCP_COOLDOWN_MS
    throw new McpToolError(candidateNames.join(' | '), err)
  }

  let lastError: unknown = null

  for (const name of candidateNames) {
    try {
      const result = (await client.callTool({ name, arguments: args })) as {
        isError?: boolean
        content?: Array<{ type: string; text?: string }>
      }
      if (result.isError) {
        lastError = new McpToolError(name, JSON.stringify(result.content))
        continue
      }
      mcpUnavailableUntil = 0
      return extractToolPayload(result)
    } catch (err) {
      lastError = err
      if (isConnectionLevelFailure(err)) {
        mcpUnavailableUntil = Date.now() + MCP_COOLDOWN_MS
        break // every other candidate name would fail the same CORS/network way
      }
    }
  }

  throw new McpToolError(candidateNames.join(' | '), lastError)
}

function extractToolPayload(result: { content?: Array<{ type: string; text?: string }> }): unknown {
  const textPart = result.content?.find((c) => c.type === 'text')
  if (!textPart?.text) return result
  try {
    return JSON.parse(textPart.text)
  } catch {
    return textPart.text
  }
}
