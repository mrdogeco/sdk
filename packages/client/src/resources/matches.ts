import type {
  Match,
  MethodParams,
  MethodResult,
  MatchSelect,
  MatchDetailSelect,
  SubscriptionEventParams,
  SubscriptionClosedParams,
} from "@mrdoge/protocol"
import type { MrDogeHttpClient } from "@mrdoge/http"
import type { CallOptions, Connection, ListAllOptions } from "../connection"
import { Subscription, PENDING_SUB_ID } from "../subscription"

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
  constructor(
    private readonly conn: Connection,
    private readonly defaults: Defaults,
    private readonly http: MrDogeHttpClient,
  ) {}

  list(
    params: MatchesListParams = {},
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

  /**
   * Walk every page of `matches.list` and return one combined array. The
   * helper drives the cursor for you — pass everything except `cursor`,
   * including `limit` for page size. AbortSignal in `options` aborts the
   * whole walk (the in-flight page rejects, `listAll` rethrows). `onPage`
   * fires after each page so callers can render progressively.
   *
   * The server uses keyset cursor pagination, so the walk is drift-safe —
   * rows added/removed/reordered during the walk don't cause duplicates or
   * skips across page boundaries.
   */
  async listAll(
    params: Omit<MatchesListParams, "cursor"> = {},
    options?: ListAllOptions<Match>,
  ): Promise<Match[]> {
    const { onPage, ...callOptions } = options ?? {}
    const result: Match[] = []
    let cursor: string | undefined
    do {
      const page = await this.list({ ...params, cursor }, callOptions)
      const pageData = page.data as Match[]
      result.push(...pageData)
      onPage?.(pageData, result)
      cursor = page.pagination.nextCursor ?? undefined
    } while (cursor)
    return result
  }

  get(
    params: MatchesGetParams,
    options?: CallOptions,
  ): Promise<MethodResult<"matches.get">> {
    return this.conn.call(
      "matches.get",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }

  trending(
    params: MatchesTrendingParams = {},
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
    params: MatchesSearchParams,
    options?: CallOptions,
  ): Promise<MethodResult<"matches.search">> {
    return this.conn.call(
      "matches.search",
      { locale: this.defaults.locale, ...params },
      options,
    )
  }

  async subscribeLive(
    params: MatchesSubscribeLiveParams = {},
    options?: CallOptions,
  ): Promise<Subscription<"matches.subscribeLive">> {
    const merged = { locale: this.defaults.locale, ...params }

    // Race HTTP `matches.getLive` against the WS subscribe. HTTP returns from
    // the server-side Redis cache in ~50-150ms; the WS path pays the TCP +
    // TLS + auth handshake on cold start (~1.5s). Whichever lands first
    // populates `.snapshot`. The WS path always continues — it's the source
    // of `match.upd` / `match.del` deltas after the initial snapshot.
    //
    // `options.signal` aborts BOTH the in-flight HTTP getLive and the WS
    // subscribe. Once the subscription is established, customer uses
    // `sub.cancel()` for teardown.
    let handle: Subscription<"matches.subscribeLive">

    const wsPromise = this.conn.registerSubscription(
      "matches.subscribeLive",
      merged as MethodParams<"matches.subscribeLive">,
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

    const wsRace = wsPromise.then(
      (r) => ({ kind: "ws" as const, subId: r.subId, snapshot: r.snapshot as MethodResult<"matches.subscribeLive">["snapshot"] }),
    )

    let winner: Winner
    try {
      winner = await Promise.race<Winner>([httpPromise, wsRace])
    } catch {
      // HTTP rejected before WS resolved. Fall back to WS alone — wait it out.
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
    // customer can react.
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
    params: MatchesSubscribeParams,
    options?: CallOptions,
  ): Promise<Subscription<"matches.subscribe">> {
    const merged = { locale: this.defaults.locale, ...params }
    return this.registerSubscription(
      "matches.subscribe",
      merged as MethodParams<"matches.subscribe">,
      options,
    )
  }

  private async registerSubscription<M extends "matches.subscribe" | "matches.subscribeLive">(
    method: M,
    params: MethodParams<M>,
    options?: CallOptions,
  ): Promise<Subscription<M>> {
    let handle: Subscription<M>
    const { subId, snapshot } = await this.conn.registerSubscription(
      method,
      params,
      {
        onEvent: (event: SubscriptionEventParams) => handle?._deliverEvent(event),
        onClosed: (p: SubscriptionClosedParams) => handle?._deliverClosed(p.reason, p.message),
        onSnapshot: (newSubId: string, newSnap: unknown) =>
          handle?._deliverSnapshot(newSubId, newSnap as never),
      },
      options,
    )
    handle = new Subscription<M>(this.conn, subId, snapshot as never)
    return handle
  }
}
