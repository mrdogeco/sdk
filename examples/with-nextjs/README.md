# Mr. Doge SDK — Next.js example

A runnable end-to-end example showing both halves of the Mr. Doge SDK working together:

- **Backend (`@mrdoge/sdk`)** — Next.js API route at `app/api/mrdoge/token/route.ts` holds the `sk_live_...` API key and mints short-lived tokens
- **Frontend (`@mrdoge/client`)** — Next.js client page at `app/page.tsx` calls the token route, then opens a WebSocket to the SDK gateway and fetches today's matches

The API key never leaves the server. The browser receives only short-lived JWTs (10-minute TTL by default).

This example uses **Free-tier methods only** (`matches.list`, `matches.get`) so it runs against any account. Paid tiers unlock live updates, AI picks, and more — see the [pricing](https://mrdoge.ai/pricing) page.

## What you'll see

A page that lists today's matches. Click any row to expand it — the SDK fetches the full `MatchDetail` (markets, odds, stats if available) on demand.

```
Connected — tier "free"

Today's matches (12) — 2026-05-13

  Arsenal vs Chelsea                    upcoming
  Premier League

  Real Madrid vs Barcelona              live
  LaLiga
  ↳ 28 markets available
  ↳ Score: 1 – 0
  ...
```

## Setup

```bash
# 1. Install (run once from the mrdoge-sdk repo root)
pnpm install

# 2. Configure your API key
cd examples/with-nextjs
cp .env.example .env.local
# edit .env.local — set MRDOGE_API_KEY=sk_live_your_key_here

# 3. Run
pnpm dev
```

Open http://localhost:3000.

## What to look at

The whole example is ~150 lines split across two files:

- [`app/api/mrdoge/token/route.ts`](./app/api/mrdoge/token/route.ts) — token mint route (~20 lines). This is the only place the API key exists.
- [`app/page.tsx`](./app/page.tsx) — client component using `@mrdoge/client` (~120 lines). No API key in this file or anywhere reachable from the browser.

The pattern transfers directly to any other frontend framework (Remix, Vite + React, SvelteKit, Nuxt, etc.) — only the route conventions change.

## Token refresh in action

Tokens expire after 10 minutes. The SDK proactively re-fetches a new token ~30 seconds before expiry and soft-reconnects. You'll see one brief `Connecting...` flash in the status indicator every ~9.5 minutes; in-progress requests retry automatically.

## License

Apache 2.0 — same as the rest of the SDK.
