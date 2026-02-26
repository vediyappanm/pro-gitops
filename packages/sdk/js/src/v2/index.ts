export * from "./client.js"
export * from "./server.js"

import { createArchonClient } from "./client.js"
import { createArchonServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export async function createArchon(options?: ServerOptions) {
  const server = await createArchonServer({
    ...options,
  })

  const client = createArchonClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
