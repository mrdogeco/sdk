import type {
  SubscriptionEventParams,
  SubscriptionClosedReason,
  MethodResult,
  SubscriptionMethodName,
  PushEventsOf,
} from "@mrdoge/protocol"
import type { Connection } from "./connection"
import { Emitter } from "./internal/emitter"

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
 * Sentinel subId used when the Subscription was constructed from an HTTP
 * cold-start snapshot before the WS subscribe response arrived. The real
 * subId replaces it via `_deliverSnapshot` once WS resolves.
 */
export const PENDING_SUB_ID = "__pending_ws__"

export class Subscription<M extends SubscriptionMethodName> {
  private readonly emitter = new Emitter<SubEventMap<M>>()
  private readonly connection: Connection
  private internalSubId: string
  private currentSnapshot: SnapshotOf<M>
  private cancelled = false
  /**
   * True when `cancel()` was called before the WS subscribe arrived (subId
   * still pending). Once WS resolves, `_deliverSnapshot` issues the
   * server-side cancel so we don't leak a registered subscription.
   */
  private pendingCancel = false

  /** @internal */
  constructor(connection: Connection, subId: string, initialSnapshot: SnapshotOf<M>) {
    this.connection = connection
    this.internalSubId = subId
    this.currentSnapshot = initialSnapshot
  }

  get snapshot(): SnapshotOf<M> {
    return this.currentSnapshot
  }

  get id(): string {
    return this.internalSubId
  }

  on<E extends keyof SubEventMap<M>>(
    event: E,
    fn: (payload: SubEventMap<M>[E]) => void,
  ): () => void {
    return this.emitter.on(event, fn)
  }

  async cancel(): Promise<void> {
    if (this.cancelled) return
    this.cancelled = true
    if (this.internalSubId === PENDING_SUB_ID) {
      // WS hasn't delivered the real subId yet — flag for cancellation when
      // it arrives. Don't await; `cancel()` returns immediately.
      this.pendingCancel = true
      this.emitter.clear()
      return
    }
    await this.connection.cancelSubscription(this.internalSubId)
    this.emitter.clear()
  }

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
    this.internalSubId = newSubId
    // Customer cancelled while we were still waiting for WS. The server
    // registered the subscription anyway — release it now.
    if (this.pendingCancel) {
      this.pendingCancel = false
      this.connection.cancelSubscription(newSubId).catch(() => undefined)
      return
    }
    if (this.cancelled) return
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
