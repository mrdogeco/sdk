# @mrdoge/http

Zero-dependency HTTP-only SDK for the Mr. Doge protocol. Works anywhere `fetch` exists — **Node, browsers, React Native, Cloudflare Workers, Vercel Edge, AWS Lambda, Bun, Deno**.

```bash
npm install @mrdoge/http
```

## When to reach for this

- **Edge runtimes** (Workers, Vercel Edge, Lambda) where you can't keep a WebSocket open.
- **Cron jobs / batch pipelines** that pull a day of data and exit.
- **Codepaths that don't need live updates** — paginated reads, AI picks, search.

For long-lived live subscriptions (`matches.subscribeLive`, `matches.subscribe`), use [`@mrdoge/node`](../node) on the server or [`@mrdoge/client`](../client) in the browser. Both wrap `@mrdoge/http` under the hood and add a WebSocket layer.

## Quick start

```ts
import { createHttpClient } from "@mrdoge/http"

const mrdoge = createHttpClient({
  apiKey: process.env.MRDOGE_API_KEY!,
})

const matches = await mrdoge.call("matches.list", {
  sports: ["soccer"],
  limit: 10,
})

console.log(matches.data.length, "matches")
```

Every method on the wire is reachable via `call(methodName, params, options?)`. The method name is a string literal, so TypeScript can still infer the param and result types from `@mrdoge/protocol`.

## Cloudflare Workers

```ts
import { createHttpClient } from "@mrdoge/http"

export default {
  async fetch(req: Request, env: { MRDOGE_API_KEY: string }) {
    const mrdoge = createHttpClient({ apiKey: env.MRDOGE_API_KEY })
    const trending = await mrdoge.call("matches.trending", { limit: 5 })
    return Response.json(trending)
  },
}
```

## Pagination

`@mrdoge/http` is intentionally low-level — there's no `listAll` helper. Walk cursors by hand:

```ts
let cursor: string | undefined
do {
  const page = await mrdoge.call("matches.list", {
    date: "2026-05-12",
    sports: ["soccer"],
    cursor,
    limit: 100,
  })
  for (const m of page.data) await sink.write(m)
  cursor = page.pagination.nextCursor ?? undefined
} while (cursor)
```

That's the same shape `listAll` runs internally in the other packages — a natural fit for cron where each page streams to a downstream sink.

## Abort signals

Every call accepts `options.signal`:

```ts
const controller = new AbortController()
setTimeout(() => controller.abort(), 5000)

try {
  await mrdoge.call("matches.list", { sports: ["soccer"] }, { signal: controller.signal })
} catch (err) {
  if (err instanceof AbortError) {
    console.log("Aborted")
  }
}
```

Compose with `AbortSignal.timeout(ms)` for per-call deadlines, or with a watchdog timer for a hard ceiling on whole-job duration.

## What HTTP can't do

Subscription methods throw `method_not_found` over HTTP — there's no way to deliver server-side push frames over a request-response transport:

- `matches.subscribeLive`
- `matches.subscribe`
- `auth` / `subscription.cancel` (WebSocket protocol methods)

For one-shot live snapshots without a subscription, use `matches.getLive`.

## Errors

```ts
import {
  AbortError,
  RateLimitError,
  UnauthorizedError,
  createHttpClient,
} from "@mrdoge/http"

try {
  await mrdoge.call("matches.list", { sports: ["soccer"] })
} catch (err) {
  if (err instanceof UnauthorizedError) {
    // invalid / revoked API key
  } else if (err instanceof RateLimitError) {
    // err.data carries server-supplied retry metadata
  } else if (err instanceof AbortError) {
    // request cancelled via signal
  }
}
```

The error class hierarchy mirrors `@mrdoge/node` — see the [error reference](https://mrdoge.ai/docs/concepts/errors).

## License

Apache 2.0 — same as the rest of the SDK.
