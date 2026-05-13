import type {
  MethodParams,
  MethodResult,
  SubscriptionEventParams,
  SubscriptionClosedParams,
} from "@mrdoge/protocol"
import type { Connection } from "../connection"
import { Subscription } from "../subscription"

interface Defaults {
  locale?: string
  timezone?: string
}

export class Matches {
  constructor(private readonly conn: Connection, private readonly defaults: Defaults) {}

  list(params: MethodParams<"matches.list"> = {}): Promise<MethodResult<"matches.list">> {
    return this.conn.call("matches.list", {
      locale: this.defaults.locale,
      timezone: this.defaults.timezone,
      ...params,
    })
  }

  get(params: MethodParams<"matches.get">): Promise<MethodResult<"matches.get">> {
    return this.conn.call("matches.get", { locale: this.defaults.locale, ...params })
  }

  trending(
    params: MethodParams<"matches.trending"> = {},
  ): Promise<MethodResult<"matches.trending">> {
    return this.conn.call("matches.trending", {
      locale: this.defaults.locale,
      timezone: this.defaults.timezone,
      ...params,
    })
  }

  search(params: MethodParams<"matches.search">): Promise<MethodResult<"matches.search">> {
    return this.conn.call("matches.search", { locale: this.defaults.locale, ...params })
  }

  async subscribeLive(
    params: MethodParams<"matches.subscribeLive"> = {},
  ): Promise<Subscription<"matches.subscribeLive">> {
    const merged = { locale: this.defaults.locale, ...params }
    return this.registerSubscription("matches.subscribeLive", merged)
  }

  async subscribe(
    params: MethodParams<"matches.subscribe">,
  ): Promise<Subscription<"matches.subscribe">> {
    const merged = { locale: this.defaults.locale, ...params }
    return this.registerSubscription("matches.subscribe", merged)
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
