export * from "./gen/types.gen.js"

const app = "archon"
import { createClient } from "./gen/client/client.gen.js"
import { type Config } from "./gen/client/types.gen.js"
import { OpencodeClient as ArchonClient } from "./gen/sdk.gen.js"
export { type Config as ArchonClientConfig, ArchonClient }

export function createArchonClient(config?: Config & { directory?: string }) {
  if (!config?.fetch) {
    const customFetch: any = (req: any) => {
      // @ts-ignore
      req.timeout = false
      return fetch(req)
    }
    config = {
      ...config,
      fetch: customFetch,
    }
  }

  if (config?.directory) {
    config.headers = {
      ...config.headers,
      "x-archon-directory": encodeURIComponent(config.directory),
    }
  }

  const client = createClient(config)
  return new ArchonClient({ client })
}
