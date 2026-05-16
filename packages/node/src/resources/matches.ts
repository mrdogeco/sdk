import type {
  MethodParams,
  MethodResult,
  SubscriptionEventParams,
  SubscriptionClosedParams,
} from "@mrdoge/protocol"
import type { MrDogeHttpClient } from "@mrdoge/http"
import type { CallOptions, Connection } from "../connection"
import { Subscription, PENDING_SUB_ID } from "../subscription"

interface Defaults {
  locale?: string
  timezone?: string
}

export class Matches {
  constructor(
    private readonly conn: Connection,
    private readonly defaults: Defaults,
    private readonly http: MrDogeHttpClient,
  ) {}

  list(
    params: MethodParams<"matches.list"> = {},
    options?: CallOptions,
  ): Promise<MethodResult<"matches.list">> {
    return this.conn.call(
      "matches.list",
      {
        locale: this.defaults.locale,
        timezone: this.defaults.timezone,
        ...params,
      },
      options,
    )
  }

  get(
    params: MethodParams<"matches.get">,
    options?: CallOptions,
  ): Promise<MethodResult<"matches.get">> {
    return this.conn.call(
      "matches.get",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }

  trending(
    params: MethodParams<"matches.trending"> = {},
    options?: CallOptions,
  ): Promise<MethodResult<"matches.trending">> {
    return this.conn.call(
      "matches.trending",
      {
        locale: this.defaults.locale,
        timezone: this.defaults.timezone,
        ...params,
      },
      options,
    )
  }

  search(
    params: MethodParams<"matches.search">,
    options?: CallOptions,
  ): Promise<MethodResult<"matches.search">> {
    return this.conn.call(
      "matches.search",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }

  async subscribeLive(
    params: MethodParams<"matches.subscribeLive"> = {},
    options?: CallOptions,
  ): Promise<Subscription<"matches.subscribeLive">> {
    const merged = { locale: this.defaults.locale, ...params }

    // Race HTTP `matches.getLive` against the WS subscribe. HTTP returns from
    // the server-side Redis cache in ~50-150ms; the WS path pays the TCP +
    // TLS + auth handshake on cold start (~1.5s). Whichever lands first
    // populates `.snapshot`. The WS path always continues — it's the source
    // of `match.upd` / `match.del` deltas after the initial snapshot.
    let handle: Subscription<"matches.subscribeLive">

    const wsPromise = this.conn.registerSubscription(
      "matches.subscribeLive",
      merged,
      {
        onEvent: (event: SubscriptionEventParams) => handle?._deliverEvent(event),
        onClosed: (p: SubscriptionClosedParams) => handle?._deliverClosed(p.reason, p.message),
        onSnapshot: (newSubId: string, newSnap: unknown) =>
          handle?._deliverSnapshot(newSubId, newSnap as never),
      },
      options,
    )

    const httpPromise = this.http
      .call(
        "matches.getLive",
        merged as MethodParams<"matches.getLive">,
        options,
      )
      .then((snapshot) => ({ kind: "http" as const, snapshot }))

    type Winner =
      | { kind: "http"; snapshot: MethodResult<"matches.getLive"> }
      | { kind: "ws"; subId: string; snapshot: MethodResult<"matches.subscribeLive">["snapshot"] }

    const wsRace: Promise<Winner> = wsPromise.then((r) => ({
      kind: "ws",
      subId: r.subId,
      snapshot: r.snapshot as MethodResult<"matches.subscribeLive">["snapshot"],
    }))

    let winner: Winner
    try {
      winner = await Promise.race<Winner>([httpPromise, wsRace])
    } catch {
      // HTTP rejected before WS resolved. Fall back to WS alone.
      const ws = await wsPromise
      handle = new Subscription<"matches.subscribeLive">(
        this.conn,
        ws.subId,
        ws.snapshot as never,
      )
      return handle
    }

    if (winner.kind === "ws") {
      handle = new Subscription<"matches.subscribeLive">(
        this.conn,
        winner.subId,
        winner.snapshot as never,
      )
      return handle
    }

    // HTTP won — build the Subscription with the HTTP snapshot and a pending
    // subId. The WS subscribe is still in flight; when it resolves, the
    // onSnapshot handler (or our tail handler) delivers the real subId +
    // canonical snapshot. If WS fails outright, deliver `closed` so the
    // caller can react.
    handle = new Subscription<"matches.subscribeLive">(
      this.conn,
      PENDING_SUB_ID,
      winner.snapshot as never,
    )
    wsPromise
      .then((r) => {
        handle._deliverSnapshot(r.subId, r.snapshot as never)
      })
      .catch((err) => {
        handle._deliverClosed(
          "internal_error",
          err instanceof Error ? err.message : String(err),
        )
      })
    return handle
  }

  async subscribe(
    params: MethodParams<"matches.subscribe">,
    options?: CallOptions,
  ): Promise<Subscription<"matches.subscribe">> {
    const merged = { locale: this.defaults.locale, ...params }
    let handle: Subscription<"matches.subscribe">
    const { subId, snapshot } = await this.conn.registerSubscription(
      "matches.subscribe",
      merged,
      {
        onEvent: (event: SubscriptionEventParams) => handle?._deliverEvent(event),
        onClosed: (p: SubscriptionClosedParams) => handle?._deliverClosed(p.reason, p.message),
        onSnapshot: (newSubId: string, newSnap: unknown) =>
          handle?._deliverSnapshot(newSubId, newSnap as never),
      },
      options,
    )
    handle = new Subscription<"matches.subscribe">(this.conn, subId, snapshot as never)
    return handle
  }
}
