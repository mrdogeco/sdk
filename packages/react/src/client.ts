import { MrDoge, type MrDogeOptions } from "@mrdoge/client"

let client: MrDoge | null = null
let config: MrDogeOptions = { authEndpoint: "/api/mrdoge/token" }

/**
 * Override the default client config — e.g. a non-default `authEndpoint`,
 * or a custom `fetchToken`. Must run before the first hook call in your
 * app (e.g. at the top of your entry file); once the client is
 * instantiated, later calls are ignored.
 */
export function configureMrDoge(options: MrDogeOptions): void {
  if (client) {
    console.warn(
      "[@mrdoge/react] configureMrDoge() called after the client was already instantiated — ignored. Call it before any hook runs."
    )
    return
  }
  config = options
}

/** Browser-only — every hook in this package calls this internally; you only need it directly for one-off SDK calls with no matching hook. */
export function getMrDogeClient(): MrDoge {
  if (typeof window === "undefined") {
    throw new Error("getMrDogeClient() must be called in the browser")
  }
  if (!client) {
    client = new MrDoge(config)
  }
  return client
}
