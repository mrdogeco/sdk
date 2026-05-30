import type {
  MethodParams,
  MethodResult,
  SubscriptionEventParams,
  SubscriptionClosedParams,
} from "@mrdoge/protocol"
import type { CallOptions, Connection } from "../connection"
import { Subscription } from "../subscription"

interface Defaults {
  locale?: string
}

/**
 * Live odds resource. Business tier.
 *
 *   - `odds.list({ matchId })`       — one-shot snapshot of every live
 *                                      market on a match
 *   - `odds.subscribe({ matchId })`  — WS subscription pushing the full
 *                                      latest markets array on every change
 *                                      (state-snapshot semantics)
 *
 * Replaces the legacy `match.stats.liveBetItems` field. Markets are no
 * longer carried on the `Match` shape — see `odds.list` instead.
 */
export class Odds {
  constructor(
    private readonly conn: Connection,
    private readonly defaults: Defaults,
  ) {}

  list(
    params: MethodParams<"odds.list">,
    options?: CallOptions,
  ): Promise<MethodResult<"odds.list">> {
    return this.conn.call(
      "odds.list",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }

  async subscribe(
    params: MethodParams<"odds.subscribe">,
    options?: CallOptions,
  ): Promise<Subscription<"odds.subscribe">> {
    const merged = { locale: this.defaults.locale, ...params }
    let handle: Subscription<"odds.subscribe">
    const { subId, snapshot } = await this.conn.registerSubscription(
      "odds.subscribe",
      merged,
      {
        onEvent: (event: SubscriptionEventParams) => handle?._deliverEvent(event),
        onClosed: (p: SubscriptionClosedParams) => handle?._deliverClosed(p.reason, p.message),
        onSnapshot: (newSubId: string, newSnap: unknown) =>
          handle?._deliverSnapshot(newSubId, newSnap as never),
      },
      options,
    )
    handle = new Subscription<"odds.subscribe">(this.conn, subId, snapshot as never)
    return handle
  }
}
