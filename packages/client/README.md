# @mrdoge/client

Mr. Doge SDK for **browsers, React Native, and edge runtimes**. Authenticates via short-lived JWT tokens your own backend mints — your API key never leaves your server.

```bash
npm install @mrdoge/client
```

## Two-package model

| Where you run code | Use | Why |
|---|---|---|
| Server (Node, Bun, Deno, etc.) | [`@mrdoge/node`](../node) | Holds the long-lived `sk_live_...` API key. Mints tokens. Makes data calls directly. |
| Client (Browser, React Native, Cloudflare Workers, etc.) | `@mrdoge/client` | Holds no key. Calls your backend for short-lived tokens. Makes data calls with those. |

## Setup

### 1. Expose a token-mint route on your backend

```ts
// Your backend (Next.js API route, Express, NestJS, anything)
import { MrDoge } from "@mrdoge/node"

const mrdoge = new MrDoge({ apiKey: process.env.MRDOGE_API_KEY! })

// e.g. Next.js App Router
export async function POST() {
  const { token, expiresAt } = await mrdoge.tokens.create({ ttl: 600 })
  return Response.json({ token, expiresAt })
}
```

`ttl` is in seconds (default 600, min 60, max 86400). You choose what works for your app: short for paranoid, long for fewer refreshes.

### 2. Use `@mrdoge/client` on your frontend

```ts
// Your frontend (React component, RN screen, Vue, etc.)
import { MrDoge } from "@mrdoge/client"

const mrdoge = new MrDoge({
  authEndpoint: "/api/mrdoge/token",
})

const matches = await mrdoge.matches.list({ date: "2026-05-13" })
```

That's the whole integration. Same method names, params, and return types as `@mrdoge/node` — the only difference is the constructor.

## Method surface

Identical to `@mrdoge/node` (minus `tokens.create`, which is server-only):

| Resource | Methods |
|---|---|
| `mrdoge.regions` | `list` |
| `mrdoge.competitions` | `list` |
| `mrdoge.teams` | `list` |
| `mrdoge.matches` | `list`, `get`, `trending`, `search`, `subscribeLive`, `subscribe` |
| `mrdoge.ai.picks` | `list` |
| `mrdoge.ai.recommendations` | `list` |

Available methods depend on your subscription tier. Free has discovery + static reads only; live data and AI features require paid tiers. Calling a tier-locked method returns a `ForbiddenError` with the upgrade URL in the message.

## Subscriptions

```ts
const sub = await mrdoge.matches.subscribeLive({})

// Initial snapshot — replace your local state with this
console.log(sub.snapshot)

// Live updates — each push carries full latest state. Replace, don't merge.
sub.on("match.upd", (match) => updateUI(match))
sub.on("match.del", ({ id }) => removeFromUI(id))

// Fired when the SDK reconnects (token refresh, network drop, etc.).
// Server sends a fresh snapshot; replace your local state.
sub.on("snapshot", (newSnap) => replaceState(newSnap))

// Clean up
await sub.cancel()
```

## Token refresh — automatic

The SDK proactively fetches a new token from `authEndpoint` ~30 seconds before the current one expires, then transparently reconnects with the new token. Your subscriptions persist; you'll see one `disconnected` → `reconnecting` → `connected` lifecycle event, but `sub.on(...)` listeners stay attached and a fresh snapshot fires automatically.

## Custom token fetcher

If you need custom headers, signed requests, or a non-HTTP transport, use `fetchToken` instead of `authEndpoint`:

```ts
const mrdoge = new MrDoge({
  fetchToken: async () => {
    const res = await fetch("/api/mrdoge/token", {
      headers: { "x-csrf-token": getCsrfToken() },
    })
    return res.json()  // must return { token, expiresAt }
  },
})
```

## Errors

Every error is a typed class. Use `instanceof` to discriminate.

```ts
import {
  UnauthorizedError,
  ForbiddenError,
  RateLimitError,
  ConnectionLimitError,
  AuthEndpointError,
} from "@mrdoge/client"

try {
  await mrdoge.ai.picks.list({})
} catch (err) {
  if (err instanceof ForbiddenError) {
    // tier doesn't include AI; show upgrade prompt
    console.log(err.data) // { method: "ai.picks.list", tier: "growth" }
  } else if (err instanceof RateLimitError) {
    await sleep(err.retryAfterMs)
  } else if (err instanceof AuthEndpointError) {
    // your authEndpoint is broken/down
  }
}
```

## Connection lifecycle

```ts
mrdoge.on("connected",     ({ welcome })            => console.log("up", welcome.tier))
mrdoge.on("disconnected",  ({ code, reason })       => console.log("down"))
mrdoge.on("reconnecting",  ({ attempt, delayMs })   => console.log("retrying"))

await mrdoge.close()
```

## React Native notes

Works out of the box in modern RN (0.60+). For best behavior across app backgrounding:

```ts
import { AppState } from "react-native"
import { MrDoge } from "@mrdoge/client"

const mrdoge = new MrDoge({ authEndpoint: "..." })

// Optional: nudge the connection awake when the app foregrounds
AppState.addEventListener("change", (state) => {
  if (state === "active") mrdoge.connect()
})
```

The SDK auto-reconnects on the next call regardless; the explicit `connect()` just makes the data ready when the user opens the app rather than after their first interaction.

## License

Apache 2.0 — same as the rest of the SDK.
