# Mr. Doge SDK Protocol

**Status:** v0.1 draft — subject to change before GA.
**Wire format:** JSON-RPC 2.0 over WebSocket.
**Audience:** SDK authors (TypeScript v1, future Python/Go/etc.).

This document is the contract between the Mr. Doge server and any client SDK. An implementer reading only this file should be able to ship a working SDK without reading the server source.

---

## 1. Overview

The Mr. Doge SDK exposes sports data (regions, competitions, teams, matches, AI picks) over a single long-lived WebSocket connection. Every interaction — list, get, subscribe — flows through this connection as JSON-RPC 2.0 messages.

There is no REST surface for SDK consumers. A separate `/public` WebSocket gateway exists for the Mr. Doge mobile/web app; it is not part of this protocol.

### Why one connection
- Multiplexed: many concurrent requests + subscriptions share one socket.
- Stateful: subscriptions stay open, push events arrive without polling.
- Auth happens once per connection, not per request.

---

## 2. Versioning

The protocol version is part of the URL path:

```
wss://api.mrdoge.com/sdk/v1
```

- **Major version bumps** (`/v1` → `/v2`) are breaking changes. Old versions stay live for a deprecation window of at least 12 months.
- **Additive changes** (new methods, new optional params, new push event types) ship within the same major version. Clients MUST ignore unknown fields and unknown push event types.

The server announces its build version in the `welcome` message after auth. SDK telemetry can log this for support.

### Subprotocol tag (defense in depth)
SDKs MUST set the WebSocket subprotocol header to match the URL path:
- `/sdk/v1` → `Sec-WebSocket-Protocol: mrdoge.v1`

The server validates that subprotocol and path agree. This catches misconfigured proxies that rewrite URLs without rewriting subprotocols, and makes the protocol version visible in WS frame analysis tools. The check is in addition to, not a replacement for, path-based versioning.

---

## 3. Connection lifecycle

```
1. Client opens WS: wss://api.mrdoge.com/sdk/v1
2. Server accepts; sends nothing yet.
3. Client sends `auth` request (see §4) within 10s, or server closes.
4. Server validates key. On success → `welcome` push. On failure → error response, then close.
5. Connection is now in `ready` state. Client may call any method.
6. Server sends ping frames every 25s; client responds with pong (handled by WS lib).
7. Either side may close at any time. Codes: see §10.
```

### States
| State | Meaning |
|---|---|
| `connecting` | WS handshake in progress |
| `authenticating` | Waiting for client `auth` request or server response to it |
| `ready` | Authenticated, accepting calls |
| `closing` | Either side initiated close |
| `closed` | Socket closed |

---

## 4. Authentication

The API key is **not** sent in WS handshake headers or query params (browsers can't set custom WS headers, and keys in URLs end up in logs). Instead, the client sends an `auth` request as the first message after the socket opens.

### Client → Server
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "auth",
  "params": { "apiKey": "sk_live_..." }
}
```

### Server → Client (success)
```json
{ "jsonrpc": "2.0", "id": "1", "result": { "ok": true } }
```

Then immediately, as a server push (no `id`):
```json
{
  "jsonrpc": "2.0",
  "method": "welcome",
  "params": {
    "protocolVersion": 1,
    "serverVersion": "2026.05.12-abc1234",
    "tier": "pro",
    "rateLimit": { "requestsPerMinute": 600, "subscriptionsMax": 100 }
  }
}
```

### Server → Client (failure)
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "error": { "code": "unauthorized", "message": "Invalid API key" }
}
```
After sending the error, the server closes the connection with code `4001` (see §10).

### Test key
During v0 development, the server accepts a hardcoded test key for end-to-end testing (mirrors the `MOBILE_PUBLIC_KEY` pattern in the public REST middleware). Any other `sk_live_*` value returns `unauthorized` until `@mrdoge/auth-db` is wired in.

---

## 5. Wire format

All messages are UTF-8 JSON, one message per WS frame. The envelope is JSON-RPC 2.0 with two domain-specific conventions:

1. **Error codes are strings**, not the JSON-RPC integer codes. Clearer for SDK consumers, easier to map to typed error classes. (`-32600`-style codes are not used.)
2. **Server pushes** (subscription events, `welcome`) are JSON-RPC notifications: they have `method` and `params` but no `id`. Clients MUST NOT respond to them.

### Request (client → server)
```json
{ "jsonrpc": "2.0", "id": "<client-id>", "method": "<name>", "params": <object> }
```
- `id` — client-generated, unique per outgoing request within the connection. Strings recommended (UUID, monotonic counter, etc.).
- `method` — see §6.
- `params` — object. Omit if no params.

### Response (server → client)
On success:
```json
{ "jsonrpc": "2.0", "id": "<same>", "result": <any> }
```
On error:
```json
{ "jsonrpc": "2.0", "id": "<same>", "error": { "code": "<string>", "message": "<human>", "data": <optional any> } }
```

### Server push (no `id`)
```json
{ "jsonrpc": "2.0", "method": "<event-name>", "params": <object> }
```
Used for: `welcome`, `subscription.event`, future broadcast events.

### Message size
Single-frame messages up to 1 MiB. Larger payloads (e.g., a `matches.list` page) MUST fit; if you need more, paginate.

### Compression
The server advertises `permessage-deflate` (RFC 7692) at the WebSocket handshake. Clients SHOULD enable it. Specifics:
- `max_window_bits=15` (32 KB window)
- Context maintained across frames (`no_context_takeover` not set)
- Frames smaller than 1 KB are sent uncompressed (overhead exceeds savings)

SDKs MAY expose an opt-out (`compression: false`) for CPU-constrained environments. Default is enabled.

---

## 6. Methods

The v1 surface is 11 methods + 2 protocol methods (`auth`, `subscription.cancel`).

| Method | Kind | Params | Result | Notes |
|---|---|---|---|---|
| `auth` | request | `{ apiKey }` | `{ ok: true }` | Required first message |
| `regions.list` | request | `{ locale? }` | `Region[]` | |
| `competitions.list` | request | `{ regionId?, sportName?, locale? }` | `Competition[]` | |
| `teams.list` | request | `{ sportName?, regionId?, competitionId?, locale? }` | `Team[]` | |
| `matches.list` | request | `{ competitionId?, regionId?, sportName?, date?, startDate?, endDate?, status?, cursor?, limit?, timezone?, locale? }` | `{ data: Match[], pagination: Pagination }` | Cursor-paginated |
| `matches.get` | request | `{ id, locale? }` | `MatchDetail` | |
| `matches.trending` | request | `{ sportName?, status?, timezone?, locale? }` | `Match[]` | |
| `matches.search` | request | `{ query, limit?, locale? }` | `Match[]` | |
| `matches.subscribeLive` | subscription | `{ sportName? }` | `{ sub, snapshot: Match[] }` | Pushes: `match.upd`, `match.del` |
| `matches.subscribe` | subscription | `{ matchId }` | `{ sub, snapshot: MatchDetail }` | Pushes: `stats.upd`, `odds.upd`, `status.upd` |
| `ai.picks.list` | request | `{ date?, startDate?, endDate?, status?, competitionId?, regionId?, cursor?, limit?, locale? }` | `{ data: AiPick[], pagination: Pagination }` | Cursor-paginated |
| `ai.recommendations.list` | request | `{ matchId?, confidence?, minEdge?, limit?, locale? }` | `Recommendation[]` | |
| `subscription.cancel` | request | `{ sub }` | `{ ok: true }` | Stops a specific subscription |

Resource shapes (`Region`, `Match`, etc.) are defined in `@mrdoge/protocol` as Zod schemas; JSON Schema is emitted at build time for non-TS SDKs. Treat them as authoritative.

**Odds format.** All odds in v1 are **decimal format** (e.g., `2.10`). Other formats (American, fractional) are not negotiated in v1; SDKs that need them convert client-side.

Common parameter defaults applied by the server when a field is omitted:
- `locale` → connection default (set at `auth`, see §4) or `"en"`
- `timezone` → connection default or `"UTC"`
- `limit` → 20 (max 100)
- `cursor` → omitted = first page

### Pagination shape
Cursor-paginated methods return:
```json
{
  "data": [ ... ],
  "pagination": {
    "nextCursor": "eyJzdGFydFRpbWUiOiIyMDI2LTA1LTEyVDE0OjAwOjAwWiIsImlkIjoiMzk0In0=",
    "hasMore": true
  }
}
```
- `nextCursor` is **opaque base64**. Clients MUST NOT parse it. Encoding can change without notice.
- When `hasMore` is `false`, `nextCursor` is `null`. Both signals are redundant; clients SHOULD use whichever is more convenient.
- No `total` count is provided. If needed, a separate `*.count` method may be added in a later version.
- Backward iteration is not supported in v1.

---

## 7. Subscriptions

Subscriptions are method calls that return a `sub` id plus an initial `snapshot`, and then continue to push events until cancelled.

### Lifecycle
```
Client → server:  matches.subscribe { matchId: "12345" }
Server → client:  result { sub: "sub_abc", snapshot: { ...MatchDetail } }
Server → client:  push  subscription.event { sub: "sub_abc", event: "stats.upd", data: {...} }
Server → client:  push  subscription.event { sub: "sub_abc", event: "odds.upd",  data: {...} }
...
Client → server:  subscription.cancel { sub: "sub_abc" }
Server → client:  result { ok: true }
```

### Push event envelope
```json
{
  "jsonrpc": "2.0",
  "method": "subscription.event",
  "params": {
    "sub": "sub_abc",
    "event": "stats.upd",
    "data": { ...event-specific shape... }
  }
}
```

### Defined push events
| Subscription | Event | `data` shape |
|---|---|---|
| `matches.subscribeLive` | `match.upd` | `Match` (full latest state) |
| `matches.subscribeLive` | `match.del` | `{ id }` |
| `matches.subscribe` | `stats.upd` | `MatchStats` |
| `matches.subscribe` | `odds.upd` | `{ markets: Market[] }` |
| `matches.subscribe` | `status.upd` | `{ status: MatchStatus }` |

### Ordering and delivery guarantees
- Push events are delivered in the order the server emits them, **per subscription**. No cross-subscription ordering.
- **State-snapshot semantics**: each `*.upd` carries the latest full state, not a diff. A client that misses N events still converges to correctness when the next event arrives, because the next event is the latest truth. This is why reconnection works without replay (see §9).
- The server does not buffer events for disconnected clients. Drop = drop.

### Client state rule: replace, don't merge
When a push event arrives, the client MUST **replace** the relevant local state with `data`, not merge it. Merging is the most common source of subtle bugs (stale fields, ghost values) and breaks the correctness guarantee of state-snapshot semantics. The same rule applies to the snapshot returned by `subscribe`: on reconnect, discard the old state, install the new snapshot.

### Subscription limits
The `welcome` payload includes `subscriptionsMax`. Exceeding it on a `*.subscribe` call returns error code `subscription_limit_exceeded`.

### Server-initiated close
When a subscription dies for reasons other than client cancel (server shutdown, key revoked mid-stream, downstream data source failure, internal error), the server pushes a terminal notification:

```json
{
  "jsonrpc": "2.0",
  "method": "subscription.closed",
  "params": { "sub": "sub_abc", "reason": "key_revoked", "message": "API key was revoked" }
}
```

Defined `reason` values: `server_shutdown`, `key_revoked`, `account_suspended`, `data_unavailable`, `internal_error`. Clients MUST treat this as terminal for the named subscription and surface it to the caller. The `sub` id becomes invalid; sending `subscription.cancel` for a closed subscription is a no-op (returns `{ ok: true }`).

### Idempotent re-subscribe
If a client sends the same subscribe call twice (e.g., due to a flaky reconnect race), the server returns a new `sub` id each time. The previous `sub` becomes unreachable to the client — its events stop flowing — and the server reclaims it without explicit cancel. This guarantees no resource leak from races. Clients SHOULD use the most recent `sub` id and ignore the older one.

### Delivery termination guarantee
After the server has emitted any of:
- the response to `subscription.cancel`
- a `subscription.closed` notification

the server MUST NOT emit any further `subscription.event` notifications for that `sub`. Clients can therefore safely tear down their callbacks the moment they observe a cancel-ack or closed notification, without a race window.

---

## 8. Errors

Error codes are stable strings. SDKs should map them to typed error classes.

| Code | HTTP-ish | Meaning |
|---|---|---|
| `invalid_request` | 400 | Malformed envelope, missing required fields, bad JSON |
| `invalid_params` | 400 | Params failed schema validation; `data` includes details |
| `unauthorized` | 401 | Missing, invalid, or expired API key |
| `forbidden` | 403 | Key valid but lacks permission for this method/tier |
| `not_found` | 404 | Resource (e.g. `matches.get { id }`) does not exist |
| `rate_limited` | 429 | Per-key rate limit hit. `data: { retryAfterMs, limit, remaining, resetAt }` |
| `subscription_limit_exceeded` | 429 | Too many concurrent subscriptions on this connection |
| `unavailable` | 503 | Temporary downstream issue. Client SHOULD retry with backoff |
| `internal_error` | 500 | Server-side fault. `data.requestId` for support |
| `protocol_error` | — | Catch-all for envelope violations the client should fix |

Error response shape:
```json
{
  "jsonrpc": "2.0",
  "id": "<same as request>",
  "error": {
    "code": "rate_limited",
    "message": "Rate limit exceeded (600/min)",
    "data": { "retryAfterMs": 12000, "limit": 600, "remaining": 0, "resetAt": "2026-05-12T14:00:00Z" }
  }
}
```

Errors triggered by server pushes (not in response to a client request) arrive as a push notification with `method: "error"` and no `id` — rare; reserved for catastrophic broadcast failures.

---

## 9. Reconnection

Sports data is **state-snapshot, not event-log**. Clients reconnect by resubscribing; the server replies with fresh snapshots; no replay buffer needed.

### Required client behavior
1. Maintain a local registry of active subscriptions: `Map<sub, { method, params }>`.
2. On disconnect:
   - If close code indicates a non-recoverable error (auth, version mismatch), surface it and stop. See §10.
   - Otherwise, attempt reconnect with exponential backoff (1s → 2s → 4s → ... cap 30s, with jitter ±20%).
3. On reconnect:
   - Re-send `auth` with the stored API key.
   - Re-send every active subscription as a fresh subscribe call.
   - Server returns new `sub` ids and new snapshots. **The client SHOULD replace its in-memory state from the new snapshot, not merge.**
4. Outgoing requests in flight at disconnect time: SDKs SHOULD reject their pending promises with `disconnected` and let the caller retry. Do not silently retry — the operation may not be idempotent from the user's perspective.

### Subscription identity across reconnects
The `sub` id is **per-connection**. A reconnect produces new ids. Clients SHOULD expose subscription handles that are stable across reconnects internally and translate to the live `sub` id under the hood.

---

## 10. Close codes

WebSocket close codes used by the server:

| Code | Meaning | Client should |
|---|---|---|
| 1000 | Normal closure | Stop (user/SDK initiated) |
| 1001 | Going away (server shutdown) | Reconnect with backoff |
| 1008 | Policy violation | Stop — bug in client |
| 1011 | Server error | Reconnect with backoff |
| 4001 | Authentication failed | Stop — surface error to caller |
| 4002 | Protocol version no longer supported | Stop — prompt SDK upgrade |
| 4003 | Account suspended or key revoked | Stop — surface to caller |
| 4008 | Idle timeout (no traffic > 5 min, no subs) | Reconnect on next call |
| 4029 | Per-key connection limit exceeded | Stop — surface to caller |

---

## 11. Rate limits

Per-key, communicated two ways:

1. **At connect**: `welcome.rateLimit` carries `requestsPerMinute` and `subscriptionsMax` for the tier.
2. **On overage**: `rate_limited` error carries `retryAfterMs` and `resetAt`.

The server may also push a `rate_limit.warning` notification when usage exceeds 80% of the window, to let the SDK surface this without forcing the customer to wait for a hard 429.

---

## 12. Keepalive

- WS-level ping/pong: server sends ping every 25s; client's WS library responds. Handled automatically by all major WS libs.
- Application-level: clients MAY send `{ method: "ping" }`; server responds with `{ result: { pong: true, serverTime: "..." } }`. Useful for round-trip latency measurement. Not required.

---

## 13. Deferred to post-v1

Known features intentionally **not** in v1. Listed here so they're recognized as deferred rather than unconsidered. None require a v2 — all are purely additive.

- **Binary encoding (MessagePack)**. Opt-in via `?encoding=msgpack` at connect. Add when a real customer hits a measurable bandwidth ceiling.
- **`oddsFormat` global** (`decimal | american | fractional`). v1 is decimal-only. Add as a connection default + per-call override when first real customer asks.
- **Semantic event subscription** (`matches.subscribeEvents`). A separate event-log feed emitting `goal`, `card`, `substitution`, `kickoff`, etc. Lives alongside the state-snapshot subscriptions; does not replace them.
- **Delta odds events** (`odds.delta`). Opt-in via `matches.subscribe({ matchId, oddsDelta: true })` for bandwidth-sensitive customers on hot markets. Coexists with `odds.upd`.
- **Scoped / restricted sub-keys** (`read:matches` only, etc.). Server-side product feature; protocol hooks (`forbidden` error) already present.
- **Short-lived tokens** for client-side use (Pusher-style). Add when a customer wants browser-direct access without exposing a long-lived key. Protocol hook (`auth` message accepts any credential payload) already present.
- **Backward pagination** (`prevCursor`). Add only if a real use case appears.
- **`*.count` methods** for explicit total counts on paginated lists. Add only if a real use case appears.
- **Async iterator helper** in SDKs (`.listAll()`). Pure SDK convenience over cursor pagination; no protocol change.

---

## Change log

- **v0.1 — 2026-05-12** — Initial draft.
- **v0.2 — 2026-05-12** — Resolved open questions: `permessage-deflate` on by default; v1 is JSON-only and decimal-only; cursor-based pagination (replaces `page`/`limit`); coarse-grained `*.upd` events confirmed; sub-keys deferred (protocol hooks already present). Added subprotocol-tag rule (§2), replace-don't-merge client rule (§7), server-initiated subscription close (§7), idempotent re-subscribe (§7), delivery termination guarantee (§7).
