/**
 * Mr. Doge SDK — HTTP-only example
 *
 * Demonstrates `@mrdoge/http` as a standalone install — no WebSocket, no
 * persistent connection, just `fetch` under the hood. Works in:
 *
 *   - Node cron jobs
 *   - AWS Lambda / Cloudflare Workers / Vercel Edge
 *   - Anywhere `globalThis.fetch` exists
 *
 * This script simulates a "daily aggregator" — the kind of job you'd run on
 * cron to pull a day's worth of data into a downstream store (warehouse,
 * cache, webhook target, search index, etc).
 *
 * Setup:
 *   export MRDOGE_API_KEY=sk_live_your_key_here
 *   npm install && npx tsx index.ts
 */

import {
  AbortError,
  createHttpClient,
  RateLimitError,
  UnauthorizedError,
} from "@mrdoge/http"

const apiKey = process.env.MRDOGE_API_KEY
if (!apiKey) {
  console.error("Set MRDOGE_API_KEY in your environment. Get a key at https://mrdoge.ai")
  process.exit(1)
}

// Stateless client. Reuses fetch's underlying connection pool, so multiple
// concurrent calls share TCP + TLS over HTTP/2 multiplexing.
const http = createHttpClient({
  apiKey,
  locale: "en",
  // Per-request timeout. Aborting via `options.signal` (below) composes
  // with this — whichever fires first wins.
  requestTimeoutMs: 30_000,
})

async function main() {
  const today = new Date().toISOString().slice(0, 10)

  // Watchdog signal — if the whole job runs longer than 60s, abort.
  // Useful for cron / Lambda where you want a hard ceiling on duration.
  const watchdog = new AbortController()
  const watchdogTimer = setTimeout(() => watchdog.abort(), 60_000)

  try {
    // ─── Concurrent reads (HTTP/2 multiplexing) ────────────────────────
    // Two reads fired in parallel land over the same TLS connection.
    // The first request pays the handshake; the second piggy-backs.
    console.log("→ regions.list + competitions.list (parallel)")
    const [regions, competitions] = await Promise.all([
      http.call(
        "regions.list",
        { date: today, sports: ["soccer"] },
        { signal: watchdog.signal },
      ),
      http.call(
        "competitions.list",
        { date: today, sports: ["soccer"], limit: 20 },
        { signal: watchdog.signal },
      ),
    ])
    console.log(`   ${regions.length} regions · ${competitions.length} competitions`)

    // ─── Walk every page of today's matches ────────────────────────────
    // `@mrdoge/http` doesn't ship a `listAll` helper (that lives in the
    // higher-level `@mrdoge/client` / `@mrdoge/node` packages). Cursor
    // walking by hand is ~10 lines and gives you full control over
    // per-page processing — natural fit for the cron persona where each
    // page might be streamed to a downstream sink.
    console.log("→ matches.list — walking all pages")
    let cursor: string | undefined
    let total = 0
    do {
      const page = await http.call(
        "matches.list",
        {
          date: today,
          sports: ["soccer"],
          status: ["upcoming", "live", "completed"],
          cursor,
          limit: 100,
        },
        { signal: watchdog.signal },
      )
      total += page.data.length
      // → Here's where a real cron would batch-write `page.data` to its
      //   sink (Postgres COPY, BigQuery insert, SQS message, etc).
      console.log(`   page +${page.data.length} → ${total} total`)
      cursor = page.pagination.nextCursor ?? undefined
    } while (cursor)

    console.log(`done — ${total} soccer matches on ${today}`)
  } finally {
    clearTimeout(watchdogTimer)
  }
}

// Errors are typed classes. Discriminate by `instanceof` (works because
// only one copy of @mrdoge/http exists in the install tree) or by `.code`.
main().catch((err) => {
  if (err instanceof UnauthorizedError) {
    console.error("Invalid API key. Check your MRDOGE_API_KEY.")
  } else if (err instanceof RateLimitError) {
    console.error(`Rate limited — retry after ${err.data ? JSON.stringify(err.data) : "?"}`)
  } else if (err instanceof AbortError) {
    console.error("Job exceeded watchdog timeout and was aborted.")
  } else {
    console.error("Unexpected error:", err)
  }
  process.exit(1)
})
