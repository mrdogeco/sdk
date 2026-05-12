import type {
  SubscriptionEventParams,
  SubscriptionClosedReason,
  MethodResult,
  SubscriptionMethodName,
  PushEventsOf,
} from "@mrdoge/protocol"
import type { Connection } from "./connection"
import { Emitter } from "./internal/emitter"

/**
 * Maps each push event name to the typed `data` payload it carries.
 * Derived from the discriminated union in `@mrdoge/protocol`.
 */
type EventDataMap = {
  [E in SubscriptionEventParams as E["event"]]: E["data"]
}

type SnapshotOf<M extends SubscriptionMethodName> = MethodResult<M> extends {
  snapshot: infer S
}
  ? S
  : never

type SubEventMap<M extends SubscriptionMethodName> = {
  [E in PushEventsOf<M> & keyof EventDataMap]: EventDataMap[E]
} & {
  snapshot: SnapshotOf<M>
  closed: { reason: SubscriptionClosedReason; message?: string }
}

/**
 * Handle returned by `mrdoge.matches.subscribe(...)` and `subscribeLive(...)`.
 *
 * Stable across reconnects: the underlying server-issued `sub` id may change,
 * but this handle and its listeners persist. On reconnect, the SDK refreshes
 * `snapshot` and emits a `snapshot` event so callers can replace their local
 * state.
 */
export class Subscription<M extends SubscriptionMethodName> {
  private readonly emitter = new Emitter<SubEventMap<M>>()
  private readonly connection: Connection
  private internalSubId: string
  private currentSnapshot: SnapshotOf<M>
  private cancelled = false

  /** @internal — constructed by the SDK, not by user code. */
  constructor(connection: Connection, subId: string, initialSnapshot: SnapshotOf<M>) {
    this.connection = connection
    this.internalSubId = subId
    this.currentSnapshot = initialSnapshot
  }

  /** The latest snapshot the server has emitted (initial, or post-reconnect). */
  get snapshot(): SnapshotOf<M> {
    return this.currentSnapshot
  }

  /** Current server-issued subscription id. Changes on reconnect. */
  get id(): string {
    return this.internalSubId
  }

  /**
   * Listen for a push event from this subscription. Returns an unsubscribe
   * function that removes only this listener.
   *
   * In addition to protocol push events, two synthetic events fire:
   * - `snapshot` — when a reconnect produced a fresh snapshot
   * - `closed`   — when the server terminates the subscription (or cancel)
   */
  on<E extends keyof SubEventMap<M>>(
    event: E,
    fn: (payload: SubEventMap<M>[E]) => void,
  ): () => void {
    return this.emitter.on(event, fn)
  }

  /**
   * Cancel the subscription server-side. Idempotent — calling twice is safe.
   */
  async cancel(): Promise<void> {
    if (this.cancelled) return
    this.cancelled = true
    await this.connection.cancelSubscription(this.internalSubId)
    this.emitter.clear()
  }

  // ---------------------------------------------------------------------
  // Internal — invoked by Connection's routing layer.
  // ---------------------------------------------------------------------

  /** @internal */
  _deliverEvent(params: SubscriptionEventParams): void {
    if (this.cancelled) return
    this.emitter.emit(
      params.event as keyof SubEventMap<M>,
      params.data as SubEventMap<M>[keyof SubEventMap<M>],
    )
  }

  /** @internal */
  _deliverSnapshot(newSubId: string, snapshot: SnapshotOf<M>): void {
    if (this.cancelled) return
    this.internalSubId = newSubId
    this.currentSnapshot = snapshot
    this.emitter.emit("snapshot" as keyof SubEventMap<M>, snapshot as never)
  }

  /** @internal */
  _deliverClosed(reason: SubscriptionClosedReason, message?: string): void {
    if (this.cancelled) return
    this.cancelled = true
    this.emitter.emit(
      "closed" as keyof SubEventMap<M>,
      { reason, message } as never,
    )
    this.emitter.clear()
  }
}
