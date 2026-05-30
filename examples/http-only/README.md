# HTTP-only example

Minimal example using `@mrdoge/http` as a standalone install — no WebSocket, no persistent connection, no extra dependencies. Works anywhere `fetch` exists.

## Who this is for

- **Node cron jobs** that pull daily data into a warehouse / cache / search index
- **AWS Lambda** functions triggered on schedule or by S3/SQS events
- **Cloudflare Workers** / **Vercel Edge** functions doing real-time edge serving
- **Any runtime** where opening a long-lived WebSocket is impractical or impossible

For real-time live updates over a persistent connection, use [`@mrdoge/node`](../../packages/node) (server-side) or [`@mrdoge/client`](../../packages/client) (browser / React Native) instead — they wrap `@mrdoge/http` internally and add a WebSocket layer for push events.

## Run it

```bash
# 1. Sign up at https://mrdoge.ai/developers, then mint a key at https://mrdoge.ai/dashboard/keys
cp .env.example .env
# edit .env — set MRDOGE_API_KEY=sk_live_your_key_here
export $(cat .env | xargs)

# 2. From this directory
npm install
npx tsx index.ts
```

## What you'll see

```
→ regions.list + competitions.list (parallel)
   213 regions · 20 competitions
→ matches.list — walking all pages
   page +100 → 100 total
   page +100 → 200 total
   page +100 → 300 total
   page +25  → 325 total
done — 325 soccer matches on 2026-05-16
```

## Patterns demonstrated

- **`createHttpClient` with API key** — stateless, no construction-time round-trip.
- **HTTP/2 multiplexing** — concurrent `Promise.all` reads share one TLS connection.
- **Manual cursor pagination** — explicit `do/while` walk with per-page processing. A natural fit for cron where each page streams to a downstream sink. (`@mrdoge/client` and `@mrdoge/node` ship a `listAll()` helper that does the loop for you if you'd rather not write it.)
- **Watchdog `AbortController`** — hard ceiling on total job duration. Composes with the per-request timeout (whichever fires first wins).
- **Typed error discrimination** — `instanceof UnauthorizedError` / `RateLimitError` / `AbortError` for control flow.

## License

Apache 2.0 — same as the rest of the SDK.
