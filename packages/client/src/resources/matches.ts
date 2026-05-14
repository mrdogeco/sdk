import type {
  MethodParams,
  MethodResult,
  MatchSelect,
  MatchDetailSelect,
  SubscriptionEventParams,
  SubscriptionClosedParams,
} from "@mrdoge/protocol"
import type { Connection } from "../connection"
import { Subscription } from "../subscription"

interface Defaults {
  locale?: string
  timezone?: string
}

/**
 * Typed param overrides — replace the protocol's permissive runtime
 * `select` schema with the type-safe `MatchSelect` / `MatchDetailSelect`.
 * Customers get full autocomplete for selectable field names.
 */
type MatchesListParams = Omit<MethodParams<"matches.list">, "select"> & {
  select?: MatchSelect
}
type MatchesGetParams = Omit<MethodParams<"matches.get">, "select"> & {
  select?: MatchDetailSelect
}
type MatchesTrendingParams = Omit<MethodParams<"matches.trending">, "select"> & {
  select?: MatchSelect
}
type MatchesSearchParams = Omit<MethodParams<"matches.search">, "select"> & {
  select?: MatchSelect
}
type MatchesSubscribeLiveParams = Omit<
  MethodParams<"matches.subscribeLive">,
  "select"
> & {
  select?: MatchSelect
}
type MatchesSubscribeParams = Omit<MethodParams<"matches.subscribe">, "select"> & {
  select?: MatchDetailSelect
}

export class Matches {
  constructor(private readonly conn: Connection, private readonly defaults: Defaults) {}

  list(params: MatchesListParams = {}): Promise<MethodResult<"matches.list">> {
    return this.conn.call("matches.list", {
      locale: this.defaults.locale,
      timezone: this.defaults.timezone,
      ...params,
    })
  }

  get(params: MatchesGetParams): Promise<MethodResult<"matches.get">> {
    return this.conn.call("matches.get", { locale: this.defaults.locale, ...params })
  }

  trending(
    params: MatchesTrendingParams = {},
  ): Promise<MethodResult<"matches.trending">> {
    return this.conn.call("matches.trending", {
      locale: this.defaults.locale,
      timezone: this.defaults.timezone,
      ...params,
    })
  }

  search(params: MatchesSearchParams): Promise<MethodResult<"matches.search">> {
    return this.conn.call("matches.search", { locale: this.defaults.locale, ...params })
  }

  async subscribeLive(
    params: MatchesSubscribeLiveParams = {},
  ): Promise<Subscription<"matches.subscribeLive">> {
    const merged = { locale: this.defaults.locale, ...params }
    return this.registerSubscription("matches.subscribeLive", merged as MethodParams<"matches.subscribeLive">)
  }

  async subscribe(
    params: MatchesSubscribeParams,
  ): Promise<Subscription<"matches.subscribe">> {
    const merged = { locale: this.defaults.locale, ...params }
    return this.registerSubscription("matches.subscribe", merged as MethodParams<"matches.subscribe">)
  }

  private async registerSubscription<M extends "matches.subscribe" | "matches.subscribeLive">(
    method: M,
    params: MethodParams<M>,
  ): Promise<Subscription<M>> {
    let handle: Subscription<M>
    const { subId, snapshot } = await this.conn.registerSubscription(method, params, {
      onEvent: (event: SubscriptionEventParams) => handle?._deliverEvent(event),
      onClosed: (p: SubscriptionClosedParams) => handle?._deliverClosed(p.reason, p.message),
      onSnapshot: (newSubId: string, newSnap: unknown) =>
        handle?._deliverSnapshot(newSubId, newSnap as never),
    })
    handle = new Subscription<M>(this.conn, subId, snapshot as never)
    return handle
  }
}
