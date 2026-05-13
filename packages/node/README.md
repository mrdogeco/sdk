# Mr. Doge SDK — Node / TypeScript

Realtime sports data. One connection, typed everything, no polling.

```bash
npm install @mrdoge/sdk
```

## Quick start

```ts
import { MrDoge } from "@mrdoge/sdk"

const mrdoge = new MrDoge({ apiKey: process.env.MRDOGE_API_KEY })

const today = await mrdoge.matches.list({ date: "2026-05-12" })
console.log(`${today.data.length} matches today`)
```

That's it. The connection opens lazily on the first call and stays open. No `connect()`, no `await ready`, no event-loop dance.

---

## What it does

- **Live sports state** — matches, odds, stats, scores, AI picks
- **One persistent WebSocket** under the hood, multiplexed across every call
- **Typed everywhere** — TS types ship with the package, generated from the same schema the server validates against
- **Subscriptions just work** — subscribe to a match, get a callback when anything changes
- **Reconnects silently** — drop your wifi, walk back into range, your subscriptions resume with fresh snapshots

If you want the wire-level details, see [PROTOCOL.md](../protocol/PROTOCOL.md). You don't need to.

---

## Examples

### 1. List today's matches

```ts
const today = await mrdoge.matches.list({ date: "2026-05-12" })
for (const m of today.data) {
  console.log(`${m.homeTeam.name} vs ${m.awayTeam.name} @ ${m.startTime}`)
}
```

### 2. Filter by competition and status

```ts
const liveSerieA = await mrdoge.matches.list({
  competitionId: "serie-a",
  status: ["live"],
})
```

### 3. Get one match's full detail

```ts
const match = await mrdoge.matches.get({ id: "12345" })

console.log(match.score)                  // { home: 2, away: 1 }
console.log(match.markets.length)         // 28 betting markets
console.log(match.stats.possession)       // { home: 0.55, away: 0.45 }
```

### 4. Subscribe to one match — get updates as they happen

```ts
const sub = await mrdoge.matches.subscribe({ matchId: "12345" })

// Initial state arrives with the subscription
console.log(sub.snapshot.score)

// Listen for whatever you care about
sub.on("stats", (stats) => console.log("stats updated:", stats))
sub.on("odds",  (odds)  => console.log("odds updated:", odds.markets.length, "markets"))
sub.on("status", (status) => console.log("status:", status))

// When you're done
await sub.cancel()
```

Updates carry the **full latest state**, not a diff. You replace your local copy and you're current. No merge logic, no sequence numbers, no reconciliation.

### 5. Subscribe to every live match globally

```ts
const live = await mrdoge.matches.subscribeLive({ sportName: "soccer" })

console.log(`${live.snapshot.length} matches live right now`)

live.on("match", (match) => {
  // a match was updated (could be score, status, anything)
  updateUI(match)
})

live.on("removed", ({ id }) => {
  // match dropped off the live list (ended)
  removeFromUI(id)
})
```

### 6. Paginate through a busy day

```ts
let cursor: string | undefined
do {
  const page = await mrdoge.matches.list({ date: "2026-05-12", cursor, limit: 100 })
  for (const m of page.data) process(m)
  cursor = page.pagination.nextCursor ?? undefined
} while (cursor)
```

Cursors are opaque base64 — don't parse them, just pass them back.

### 7. Search

```ts
const results = await mrdoge.matches.search({ query: "Real Madrid" })
```

### 8. Get AI-driven picks

```ts
const picks = await mrdoge.ai.picks.list({
  date: "2026-05-12",
  status: ["upcoming"],
  limit: 10,
})

for (const pick of picks.data) {
  console.log(`${pick.match.homeTeam.name} vs ${pick.match.awayTeam.name}`)
  console.log(`Mr. Doge says: ${pick.outcome} — confidence ${pick.confidence}`)
}
```

### 9. Get betting recommendations for a specific match

```ts
const recs = await mrdoge.ai.recommendations.list({
  matchId: "12345",
  confidence: "High",
  minEdge: 0.05,
})
```

### 10. Configure the client

```ts
const mrdoge = new MrDoge({
  apiKey: process.env.MRDOGE_API_KEY,

  // These become defaults for every call; override per-call if needed
  locale: "pt-BR",
  timezone: "America/Sao_Paulo",

  // Connection knobs (optional, sensible defaults)
  requestTimeoutMs: 10_000,
  maxReconnectAttempts: Infinity,
  reconnectBackoff: { minMs: 1000, maxMs: 30_000, jitter: 0.2 },

  // Disable WS compression (rare; useful for CPU-constrained environments)
  compression: true,
})
```

Per-call override when you need it:

```ts
await mrdoge.matches.list({ date: "2026-05-12", locale: "en" })  // English just this once
```

---

## Errors

Every error is a typed class. Use `instanceof` to discriminate.

```ts
import {
  MrDogeError,
  UnauthorizedError,
  RateLimitError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConnectionError,
} from "@mrdoge/sdk"

try {
  const match = await mrdoge.matches.get({ id: "12345" })
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`Slow down — retry in ${err.retryAfterMs}ms`)
    await sleep(err.retryAfterMs)
    // retry
  } else if (err instanceof NotFoundError) {
    console.log("Match doesn't exist")
  } else if (err instanceof UnauthorizedError) {
    console.log("API key is bad")
  } else {
    throw err
  }
}
```

All error classes inherit from `MrDogeError`. Every one carries `.code` (stable string), `.message`, and `.data` (structured details, varies by error type).

---

## Connection lifecycle

The SDK manages its own connection. Most code never touches it. For the rare case you need to observe:

```ts
mrdoge.on("connected",     ()                => console.log("up"))
mrdoge.on("disconnected",  (reason)          => console.log("down:", reason))
mrdoge.on("reconnecting",  ({ attempt, ms }) => console.log(`retrying in ${ms}ms`))

// Force-close everything (rare; SDK does this on process exit anyway)
await mrdoge.close()
```

On reconnect, every active subscription is automatically resubscribed and replays a fresh snapshot. You'll see one `snap` event per subscription with current state — **replace, don't merge**.

---

## TypeScript

Everything is typed. Hover any param to see what it accepts, hover any return value to see its shape.

```ts
const m = await mrdoge.matches.get({ id: "12345" })
//    ^? MatchDetail

m.markets.forEach(market => {
//        ^? Market[]
  market.betItems
//        ^? BetItem[]
})
```

Types are generated from the same Zod schemas the server validates against. If a server response shape changes, the SDK types change in lockstep.

---

## What we deliberately don't do

- **No REST mode.** Everything is WebSocket. You get one connection, you reuse it. If you want one-shot REST, `await` a single method call — the connection opens, services it, stays warm for the next call.
- **No polling helpers.** If you find yourself polling, you want `subscribe`. That's the whole point.
- **No callback hell.** Every method returns a Promise. Subscriptions return a handle with named `on(event, fn)` listeners — not a god-callback that switches on event types.
- **No event reconciliation.** Updates are full-state. Replace and you're current.

---

## API reference

| Method | What it does |
|---|---|
| `regions.list` | List regions |
| `competitions.list` | List competitions, filterable by region/sport |
| `teams.list` | List teams, filterable |
| `matches.list` | Paginated matches with filters |
| `matches.get` | Full match detail |
| `matches.trending` | Trending matches |
| `matches.search` | Text search |
| `matches.subscribeLive` | Stream live updates across all matches |
| `matches.subscribe` | Stream updates for one match |
| `ai.picks.list` | Mr. Doge's AI picks |
| `ai.recommendations.list` | Betting recommendations with edge & confidence |

Full param/result types in [PROTOCOL.md §6](../protocol/PROTOCOL.md#6-methods).

---

## Support

- API issues, account, billing: support@mrdoge.co
- SDK bugs and feature requests: file an issue
- Wire-level protocol: [PROTOCOL.md](../protocol/PROTOCOL.md)
