import type { MethodParams, MethodResult } from "@mrdoge/protocol"
import type { Connection } from "../connection"

/**
 * Server-side resource for minting short-lived auth tokens for client-side use.
 *
 * Typical use: customer's backend has the `sk_live_...` key and exposes an
 * HTTP route that mints tokens for their frontend (browser / React Native):
 *
 * ```ts
 * app.post("/api/mrdoge/token", async (req, res) => {
 *   const { token, expiresAt } = await mrdoge.tokens.create({ ttl: 600 })
 *   res.json({ token, expiresAt })
 * })
 * ```
 *
 * The frontend uses these tokens with `@mrdoge/client` — the sk_live_... key
 * never leaves the backend.
 */
export class Tokens {
  constructor(private readonly conn: Connection) {}

  /**
   * Mint a short-lived JWT auth token.
   *
   * @param params.ttl  Token lifetime in seconds. Default 600 (10 min).
   *                    Server-enforced bounds: min 60, max 86400 (24h).
   * @returns { token, expiresAt } — `token` is opaque to the customer; pass
   *          it to `@mrdoge/client`. `expiresAt` is ISO-8601.
   */
  create(
    params: MethodParams<"tokens.create"> = {},
  ): Promise<MethodResult<"tokens.create">> {
    return this.conn.call("tokens.create", params)
  }
}
