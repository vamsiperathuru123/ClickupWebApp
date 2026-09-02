/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLICKUP_MCP_URL: string
  readonly VITE_CLICKUP_REST_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
